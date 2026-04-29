// Electron main process — fiók/sablon tárolás + minimalista IMAP/SMTP híd.
// Szándékosan nincs cache, nincs background sync, nincs mailbox-resolve és nincs
// auto-retry. Minden IPC hívás egyszer lefut, kemény timeouttal, és véget ér.
const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const Imap = require("imap");
const { simpleParser } = require("mailparser");
const nodemailer = require("nodemailer");
require("./updater.cjs");

// ---- Persistent storage ----
const userDataDir = () => app.getPath("userData");
const storeFile = (name) => path.join(userDataDir(), `${name}.json`);

function readStore(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(storeFile(name), "utf-8"));
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

const loadAccounts = () => readStore("accounts", []);
const saveAccounts = (a) => writeStore("accounts", a);

// ---- IPC: accounts ----
ipcMain.handle("accounts:list", () =>
  loadAccounts().map((a) => ({ ...a, password: undefined, smtpPassword: undefined })),
);

ipcMain.handle("accounts:save", (_e, account) => {
  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => a.id === account.id);
  const existing = idx >= 0 ? accounts[idx] : null;
  const stored = {
    ...account,
    password: account.password ? encryptPassword(account.password) : existing?.password,
    smtpPassword: account.smtpPassword ? encryptPassword(account.smtpPassword) : existing?.smtpPassword,
  };
  if (idx >= 0) accounts[idx] = { ...accounts[idx], ...stored };
  else accounts.push(stored);
  saveAccounts(accounts);
  return { ok: true };
});

ipcMain.handle("accounts:delete", (_e, id) => {
  saveAccounts(loadAccounts().filter((a) => a.id !== id));
  return { ok: true };
});

// ---- IPC: templates ----
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

// ---- IMAP helpers ----
function imapClient(account) {
  return new Imap({
    user: account.authUser || account.user,
    password: decryptPassword(account.password),
    host: account.imapHost,
    port: account.imapPort || 993,
    tls: account.imapTls !== false,
    authTimeout: 12000,
    connTimeout: 12000,
    socketTimeout: 25000,
    keepalive: false,
    tlsOptions: { rejectUnauthorized: false },
  });
}

// Wrap an IMAP session with a hard deadline so a stuck server can never
// freeze the renderer. The session always ends, success or failure.
function withImap(account, totalTimeoutMs, work) {
  return new Promise((resolve, reject) => {
    const imap = imapClient(account);
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      try { if (imap.state !== "disconnected") imap.end(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(value);
    };
    const deadline = setTimeout(
      () => finish(new Error(`Időtúllépés (${Math.ceil(totalTimeoutMs / 1000)}s) — az IMAP szerver nem válaszol.`)),
      totalTimeoutMs,
    );
    imap.once("error", (e) => finish(e));
    imap.once("ready", () => {
      Promise.resolve()
        .then(() => work(imap))
        .then((v) => finish(null, v))
        .catch((e) => finish(e));
    });
    try { imap.connect(); } catch (e) { finish(e); }
  });
}

function openInbox(imap) {
  return new Promise((resolve, reject) => {
    imap.openBox("INBOX", true, (err, box) => (err ? reject(err) : resolve(box)));
  });
}

function fetchSeqRange(imap, range) {
  return new Promise((resolve, reject) => {
    const out = [];
    const f = imap.seq.fetch(range, { bodies: "", struct: true });
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
            seqno,
            uid: attrs?.uid,
            from: parsed.from?.text || "",
            to: parsed.to?.text || "",
            subject: parsed.subject || "(nincs tárgy)",
            date: parsed.date?.toISOString() || null,
            text: parsed.text || "",
            html: parsed.html || "",
            snippet: (parsed.text || "").slice(0, 140),
          });
        } catch { /* skip unparseable message */ }
      });
    });
    f.once("error", reject);
    f.once("end", () => resolve(out));
  });
}

// ---- IPC: IMAP ----
// Egyszerű kapcsolat-teszt: bejelentkezés, INBOX megnyitás, kilépés.
ipcMain.handle("imap:test", async (_e, { accountId } = {}) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  await withImap(account, 15000, async (imap) => {
    await openInbox(imap);
  });
  return { ok: true };
});

// Az INBOX utolsó `limit` üzenetét hozza le, parsolva. Nincs cache, nincs UID
// követés — minden hívás újrahúzza az adatokat. Egyszerű és kiszámítható.
ipcMain.handle("imap:listInbox", async (_e, { accountId, limit = 30 } = {}) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  return withImap(account, 30000, async (imap) => {
    const box = await openInbox(imap);
    if (!box.messages.total) return [];
    const start = Math.max(1, box.messages.total - limit + 1);
    const range = `${start}:${box.messages.total}`;
    const messages = await fetchSeqRange(imap, range);
    // Newest first
    messages.sort((a, b) => (b.seqno || 0) - (a.seqno || 0));
    return messages;
  });
});

// ---- IPC: SMTP ----
ipcMain.handle("smtp:send", async (_e, { accountId, to, cc, bcc, subject, html, text }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort || 465,
    secure: account.smtpSecure !== false,
    auth: {
      user: account.smtpUser || account.authUser || account.user,
      pass: decryptPassword(account.smtpPassword || account.password),
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
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

// ---- Window ----
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
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
