// Electron main process — IMAP/SMTP bridge
// CommonJS module so __dirname works without ESM gymnastics.
const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const Imap = require("imap");
const { simpleParser } = require("mailparser");
const nodemailer = require("nodemailer");
require("./updater.cjs");
const cache = require("./mailCache.cjs");

const userDataDir = () => app.getPath("userData");
const storeFile = (name) => path.join(userDataDir(), `${name}.json`);

function readStore(name, fallback) {
  try {
    const raw = fs.readFileSync(storeFile(name), "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function writeStore(name, data) {
  fs.mkdirSync(userDataDir(), { recursive: true });
  fs.writeFileSync(storeFile(name), JSON.stringify(data, null, 2));
}

function encryptPassword(plain) {
  if (safeStorage.isEncryptionAvailable()) {
    return { enc: true, value: safeStorage.encryptString(plain).toString("base64") };
  }
  return { enc: false, value: plain };
}
function decryptPassword(stored) {
  if (!stored) return "";
  if (stored.enc) return safeStorage.decryptString(Buffer.from(stored.value, "base64"));
  return stored.value;
}

function loadAccounts() {
  return readStore("accounts", []);
}
function saveAccounts(accounts) {
  writeStore("accounts", accounts);
}

// IPC: accounts
ipcMain.handle("accounts:list", () => {
  return loadAccounts().map((a) => ({ ...a, password: undefined, smtpPassword: undefined }));
});

ipcMain.handle("accounts:save", (_e, account) => {
  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => a.id === account.id);
  const existing = idx >= 0 ? accounts[idx] : null;
  const stored = {
    ...account,
    password: account.password
      ? encryptPassword(account.password)
      : existing?.password,
    smtpPassword: account.smtpPassword
      ? encryptPassword(account.smtpPassword)
      : existing?.smtpPassword,
  };
  if (idx >= 0) accounts[idx] = { ...accounts[idx], ...stored };
  else accounts.push(stored);
  saveAccounts(accounts);
  mailboxResolveCache.delete(account.id);
  return { ok: true };
});

ipcMain.handle("accounts:delete", (_e, id) => {
  const accounts = loadAccounts().filter((a) => a.id !== id);
  saveAccounts(accounts);
  mailboxResolveCache.delete(id);
  try { cache.wipeAccount(id); } catch { /* ignore */ }
  return { ok: true };
});

// IPC: templates
ipcMain.handle("templates:list", () => readStore("templates", []));
ipcMain.handle("templates:save", (_e, tpl) => {
  const list = readStore("templates", []);
  const idx = list.findIndex((t) => t.id === tpl.id);
  if (idx >= 0) list[idx] = tpl;
  else list.push(tpl);
  writeStore("templates", list);
  return { ok: true };
});
ipcMain.handle("templates:delete", (_e, id) => {
  writeStore("templates", readStore("templates", []).filter((t) => t.id !== id));
  return { ok: true };
});

// IPC: IMAP
function imapConfigFor(account) {
  return new Imap({
    user: account.authUser || account.user,
    password: decryptPassword(account.password),
    host: account.imapHost,
    port: account.imapPort || 993,
    tls: account.imapTls !== false,
    authTimeout: 15000,
    connTimeout: 15000,
    socketTimeout: 30000,
    keepalive: false,
    tlsOptions: { rejectUnauthorized: false },
  });
}

function openInbox(imap, mailbox) {
  return new Promise((resolve, reject) => {
    imap.openBox(mailbox || "INBOX", true, (err, box) => (err ? reject(err) : resolve(box)));
  });
}

function verifyImapConnection(account, { timeoutMs = 12000 } = {}) {
  const imap = imapConfigFor(account);
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (imap.state !== "disconnected") imap.end();
      } catch {
        /* ignore close errors */
      }
      if (err) reject(err);
      else resolve(result);
    };

    const timer = setTimeout(() => {
      finish(new Error(`Időtúllépés (${Math.ceil(timeoutMs / 1000)}s) — az IMAP szerver nem válaszol.`));
    }, timeoutMs);

    imap.once("ready", () => finish(null, { ok: true }));
    imap.once("error", (err) => finish(err));

    try {
      imap.connect();
    } catch (err) {
      finish(err);
    }
  });
}

// Walk the box tree and produce a flat list of { name, attribs, delimiter }.
function flattenBoxes(boxes, prefix = "", delimiter = "/") {
  const out = [];
  for (const [name, val] of Object.entries(boxes || {})) {
    const d = val.delimiter || delimiter;
    const full = prefix ? `${prefix}${d}${name}` : name;
    out.push({ name: full, attribs: val.attribs || [], delimiter: d });
    if (val.children) out.push(...flattenBoxes(val.children, full, d));
  }
  return out;
}

// Pick the first mailbox that matches a SPECIAL-USE attribute (e.g. \Sent),
// otherwise fall back to a list of common name patterns (case-insensitive).
function pickMailbox(boxes, specialUse, namePatterns) {
  const bySpecial = boxes.find((b) =>
    (b.attribs || []).some((a) => String(a).toLowerCase() === specialUse.toLowerCase()),
  );
  if (bySpecial) return bySpecial.name;
  const lowered = boxes.map((b) => ({ ...b, lower: b.name.toLowerCase() }));
  for (const pat of namePatterns) {
    const p = pat.toLowerCase();
    const exact = lowered.find((b) => b.lower === p);
    if (exact) return exact.name;
    const ends = lowered.find((b) => b.lower.endsWith(`.${p}`) || b.lower.endsWith(`/${p}`));
    if (ends) return ends.name;
  }
  return null;
}

function getBoxesAsync(imap) {
  return new Promise((resolve, reject) => {
    imap.getBoxes((err, boxes) => (err ? reject(err) : resolve(boxes)));
  });
}

ipcMain.handle("imap:listMailboxes", async (_e, accountId) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("Account not found");
  const imap = imapConfigFor(account);
  return new Promise((resolve, reject) => {
    imap.once("ready", async () => {
      try {
        const boxes = await getBoxesAsync(imap);
        imap.end();
        resolve(flattenBoxes(boxes).map((b) => b.name));
      } catch (e) {
        imap.end();
        reject(e);
      }
    });
    imap.once("error", reject);
    imap.connect();
  });
});

ipcMain.handle("imap:testConnection", async (_e, { accountId, timeoutMs = 12000 } = {}) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("Account not found");
  await verifyImapConnection(account, { timeoutMs });
  return { ok: true };
});

// Resolve the actual mailbox names (Inbox / Sent / Drafts) for an account.
// Caches the result on the account object once per process run.
const mailboxResolveCache = new Map(); // accountId -> { inbox, sent, drafts }
async function resolveAccountMailboxes(account) {
  if (mailboxResolveCache.has(account.id)) return mailboxResolveCache.get(account.id);
  const imap = imapConfigFor(account);
  const result = await new Promise((resolve, reject) => {
    imap.once("ready", async () => {
      try {
        const raw = await getBoxesAsync(imap);
        imap.end();
        const flat = flattenBoxes(raw);
        const inbox = pickMailbox(flat, "\\Inbox", ["INBOX", "Inbox"]) || "INBOX";
        const sent = pickMailbox(flat, "\\Sent", ["Sent", "Sent Items", "Sent Messages", "Elküldött"]);
        const drafts = pickMailbox(flat, "\\Drafts", ["Drafts", "Draft", "Piszkozatok"]);
        resolve({ inbox, sent, drafts });
      } catch (e) {
        imap.end();
        reject(e);
      }
    });
    imap.once("error", reject);
    imap.connect();
  });
  mailboxResolveCache.set(account.id, result);
  return result;
}

// Open a mailbox in READ-ONLY mode and return the box object.
function openMailbox(imap, mailbox) {
  return new Promise((resolve, reject) => {
    imap.openBox(mailbox || "INBOX", true, (err, box) => (err ? reject(err) : resolve(box)));
  });
}

// Fetch a UID range from the currently open mailbox and parse each message.
function fetchUidRange(imap, uidRange) {
  return new Promise((resolve, reject) => {
    const out = [];
    const f = imap.fetch(uidRange, { bodies: "", struct: true });
    f.on("message", (msg, seqno) => {
      let raw = "";
      let attrs = null;
      msg.on("body", (stream) => {
        stream.on("data", (chunk) => (raw += chunk.toString("utf8")));
      });
      msg.once("attributes", (a) => { attrs = a; });
      msg.once("end", async () => {
        try {
          const parsed = await simpleParser(raw);
          out.push({
            uid: attrs?.uid,
            seqno,
            messageId: parsed.messageId || null,
            from: parsed.from?.text || "",
            to: parsed.to?.text || "",
            subject: parsed.subject || "(no subject)",
            date: parsed.date?.toISOString() || null,
            text: parsed.text || "",
            html: parsed.html || "",
            snippet: (parsed.text || "").slice(0, 140),
          });
        } catch { /* ignore parse failures */ }
      });
    });
    f.once("error", reject);
    f.once("end", () => resolve(out));
  });
}

// Synchronize a single mailbox: pulls only messages with UID > last_uid.
async function syncMailbox(account, mailbox, { batchSize = 200 } = {}) {
  const imap = imapConfigFor(account);
  return new Promise((resolve, reject) => {
    imap.once("ready", async () => {
      try {
        const box = await openMailbox(imap, mailbox);
        const meta = cache.getMeta(account.id, mailbox) || { last_uid: 0, uidvalidity: null };

        // UIDVALIDITY changed → wipe cache for this mailbox and start fresh.
        if (box.uidvalidity && meta.uidvalidity && box.uidvalidity !== meta.uidvalidity) {
          cache.wipeMailbox(account.id, mailbox);
          meta.last_uid = 0;
        }

        if (!box.uidnext || box.messages.total === 0) {
          cache.setMeta(account.id, mailbox, {
            uidvalidity: box.uidvalidity,
            last_uid: meta.last_uid || 0,
          });
          imap.end();
          return resolve(0);
        }

        const fromUid = (meta.last_uid || 0) + 1;
        const toUid = box.uidnext - 1;
        if (fromUid > toUid) {
          cache.setMeta(account.id, mailbox, {
            uidvalidity: box.uidvalidity,
            last_uid: meta.last_uid,
          });
          imap.end();
          return resolve(0);
        }

        let cursor = fromUid;
        let totalNew = 0;
        let highestSeen = meta.last_uid || 0;
        while (cursor <= toUid) {
          const batchEnd = Math.min(cursor + batchSize - 1, toUid);
          const range = `${cursor}:${batchEnd}`;
          const messages = await fetchUidRange(imap, range);
          if (messages.length) {
            cache.insertMessages(account.id, mailbox, messages);
            totalNew += messages.length;
            for (const m of messages) {
              if (typeof m.uid === "number" && m.uid > highestSeen) highestSeen = m.uid;
            }
            cache.setMeta(account.id, mailbox, {
              uidvalidity: box.uidvalidity,
              last_uid: highestSeen,
            });
          }
          cursor = batchEnd + 1;
        }

        imap.end();
        resolve(totalNew);
      } catch (e) {
        imap.end();
        reject(e);
      }
    });
    imap.once("error", reject);
    imap.connect();
  });
}

// imap:fetch — return cached messages immediately (no network call).
ipcMain.handle("imap:fetch", async (_e, { accountId, mailbox = "INBOX", limit = 200 }) => {
  return cache.listMessages(accountId, mailbox, limit);
});

// imap:sync — pull only new messages from the server into the cache.
ipcMain.handle("imap:sync", async (_e, { accountId, mailbox = "INBOX", limit = 200 }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("Account not found");
  // If caller asked for "INBOX" but the server uses a different name
  // (e.g. Hostinger's "INBOX.*" namespace), resolve the real name first.
  let realMailbox = mailbox;
  if (mailbox === "INBOX") {
    try {
      const resolved = await resolveAccountMailboxes(account);
      realMailbox = resolved.inbox || "INBOX";
    } catch {
      /* fall back to "INBOX" */
    }
  }
  const added = await syncMailbox(account, realMailbox);
  return {
    added,
    messages: cache.listMessages(account.id, realMailbox, limit),
  };
});

// imap:syncAll — sync Inbox, Sent and Drafts for an account.
// Uses the server's actual mailbox names (handles Hostinger's "INBOX.Sent" etc.).
ipcMain.handle("imap:syncAll", async (_e, { accountId }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("Account not found");

  let mailboxes;
  try {
    mailboxes = await resolveAccountMailboxes(account);
  } catch (e) {
    return { INBOX: { error: `Mappa felismerés sikertelen: ${e?.message || e}` } };
  }

  const targets = [
    ["INBOX", mailboxes.inbox],
    ["Sent", mailboxes.sent],
    ["Drafts", mailboxes.drafts],
  ].filter(([, real]) => !!real);

  const results = {};
  for (const [label, real] of targets) {
    try {
      results[label] = await syncMailbox(account, real);
    } catch (e) {
      results[label] = { error: String(e?.message || e) };
    }
  }
  return results;
});

ipcMain.handle("imap:cacheInfo", async (_e, { accountId, mailbox = "INBOX" }) => {
  return {
    meta: cache.getMeta(accountId, mailbox),
    count: cache.countMessages(accountId, mailbox),
  };
});



ipcMain.handle("smtp:send", async (_e, { accountId, to, cc, bcc, subject, html, text }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("Account not found");
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort || 465,
    secure: account.smtpSecure !== false,
    auth: {
      user: account.smtpUser || account.authUser || account.user,
      pass: decryptPassword(account.smtpPassword || account.password),
    },
    tls: { rejectUnauthorized: false },
  });
  const fromAddress = account.displayName
    ? `"${String(account.displayName).replace(/"/g, '\\"')}" <${account.user}>`
    : account.from || account.user;
  const info = await transporter.sendMail({
    from: fromAddress,
    to, cc, bcc, subject, html, text,
  });
  return { ok: true, messageId: info.messageId };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f5f6f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.ELECTRON_DEV_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
