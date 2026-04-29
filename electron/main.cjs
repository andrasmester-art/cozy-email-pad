// Electron main process — fiók/sablon tárolás + IMAP/SMTP híd lokális cache-sel.
const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const Imap = require("imap");
const { simpleParser } = require("mailparser");
const nodemailer = require("nodemailer");
const cache = require("./mailCache.cjs");
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

// Fő mappák, amiket a sidebar listáz — ezeket szinkronizáljuk inkrementálisan.
const SYNC_MAILBOXES = ["INBOX", "Sent", "Drafts", "Archive", "Spam", "Trash"];

// IMAP szerverenként eltérő mappanév-leképzés (Gmail [Gmail]/Sent Mail, stb.).
// Próbálunk több névvariációt; az első létezőt használjuk.
const MAILBOX_ALIASES = {
  Sent: ["Sent", "INBOX.Sent", "Sent Items", "Sent Messages", "[Gmail]/Sent Mail", "[Google Mail]/Sent Mail"],
  Drafts: ["Drafts", "INBOX.Drafts", "[Gmail]/Drafts", "[Google Mail]/Drafts"],
  Archive: ["Archive", "Archives", "INBOX.Archive", "All Mail", "[Gmail]/All Mail", "[Google Mail]/All Mail"],
  Spam: ["Spam", "Junk", "INBOX.Spam", "INBOX.Junk", "[Gmail]/Spam", "[Google Mail]/Spam"],
  Trash: ["Trash", "Deleted", "Deleted Items", "INBOX.Trash", "[Gmail]/Trash", "[Google Mail]/Trash"],
};

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
  cache.purgeAccount(userDataDir(), id);
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

function openBox(imap, name) {
  return new Promise((resolve, reject) => {
    imap.openBox(name, true, (err, box) => (err ? reject(err) : resolve(box)));
  });
}

function listBoxes(imap) {
  return new Promise((resolve, reject) => {
    imap.getBoxes((err, boxes) => (err ? reject(err) : resolve(boxes || {})));
  });
}

function flattenBoxNames(boxes, prefix = "") {
  const out = [];
  for (const [name, info] of Object.entries(boxes || {})) {
    const full = prefix + name;
    out.push(full);
    if (info && info.children) {
      const sep = info.delimiter || "/";
      out.push(...flattenBoxNames(info.children, full + sep));
    }
  }
  return out;
}

// Megpróbálja megtalálni az adott logikai mappához tartozó valódi nevet a szerveren.
async function resolveMailbox(imap, logical) {
  if (logical === "INBOX") return "INBOX";
  const aliases = MAILBOX_ALIASES[logical] || [logical];
  let allBoxes = null;
  for (const candidate of aliases) {
    try {
      await openBox(imap, candidate);
      return candidate;
    } catch {
      if (!allBoxes) {
        try { allBoxes = flattenBoxNames(await listBoxes(imap)); } catch { allBoxes = []; }
      }
      const found = allBoxes.find(
        (n) => n.toLowerCase() === candidate.toLowerCase()
            || n.toLowerCase().endsWith(`/${candidate.toLowerCase()}`)
            || n.toLowerCase().endsWith(`.${candidate.toLowerCase()}`),
      );
      if (found) {
        try { await openBox(imap, found); return found; } catch { /* keep trying */ }
      }
    }
  }
  return null;
}

function fetchByUidRange(imap, range) {
  return new Promise((resolve, reject) => {
    const out = [];
    const pending = [];
    const f = imap.fetch(range, { bodies: "", struct: true });
    f.on("message", (msg) => {
      pending.push(new Promise((done) => {
        let raw = "";
        let attrs = null;
        msg.on("body", (stream) => {
          stream.on("data", (chunk) => (raw += chunk.toString("utf8")));
        });
        msg.once("attributes", (a) => { attrs = a; });
        msg.once("end", () => {
          Promise.resolve(simpleParser(raw))
            .then((parsed) => {
              const flags = Array.isArray(attrs?.flags) ? attrs.flags : [];
              out.push({
                uid: attrs?.uid,
                from: parsed.from?.text || "",
                to: parsed.to?.text || "",
                subject: parsed.subject || "(nincs tárgy)",
                date: parsed.date?.toISOString() || null,
                text: parsed.text || "",
                html: parsed.html || "",
                snippet: (parsed.text || "").slice(0, 140),
                flagged: flags.includes("\\Flagged"),
                seen: flags.includes("\\Seen"),
              });
            })
            .catch(() => {
              // skip unparseable message
            })
            .finally(done);
        });
      }));
    });
    f.once("error", reject);
    f.once("end", () => {
      Promise.allSettled(pending)
        .then(() => resolve(out))
        .catch(reject);
    });
  });
}

// ---- IPC: IMAP ----
ipcMain.handle("imap:test", async (_e, { accountId } = {}) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  await withImap(account, 15000, async (imap) => { await openBox(imap, "INBOX"); });
  return { ok: true };
});

// Cache azonnali olvasása — a UI render-first ezt hívja.
ipcMain.handle("cache:read", (_e, { accountId, mailbox }) => {
  if (!accountId || !mailbox) return { messages: [], updatedAt: 0 };
  const state = cache.read(userDataDir(), accountId, mailbox);
  return { messages: state.messages, updatedAt: state.updatedAt };
});

// Inkrementális szinkron egy mappához. Csak az új UID-okat húzza le, vagy
// üres cache-nél a legfrissebb INITIAL_PAGE_SIZE darabot. UIDVALIDITY változás → reset.
async function syncMailbox(account, logicalMailbox) {
  return withImap(account, 120000, async (imap) => {
    const realName = await resolveMailbox(imap, logicalMailbox);
    if (!realName) return { added: 0, total: 0, mailbox: logicalMailbox, missing: true };
    const box = await openBox(imap, realName);
    const uidvalidity = box.uidvalidity ?? null;
    let state = cache.read(userDataDir(), account.id, logicalMailbox);

    // UIDVALIDITY váltott → eldobjuk a cache-t.
    if (state.uidvalidity != null && uidvalidity != null && state.uidvalidity !== uidvalidity) {
      state = cache.reset(uidvalidity);
    } else if (state.uidvalidity == null) {
      state.uidvalidity = uidvalidity;
    }

    if (!box.messages.total) {
      cache.write(userDataDir(), account.id, logicalMailbox, { ...state, updatedAt: Date.now() });
      return { added: 0, total: 0, mailbox: logicalMailbox };
    }

    // Lekérdezzük a szervertől a tényleges UID listát — így nem ragadunk be
    // egy hibás lastUid miatt, és UIDVALIDITY-rejtett változásokat is észrevesszük.
    const uidSearch = (criteria) => new Promise((resolve, reject) => {
      imap.search(criteria, (err, results) => (err ? reject(err) : resolve(results || [])));
    });

    let uidsToFetch = [];
    if (state.lastUid > 0) {
      // Kérdezzük meg a szervert: melyek a tényleg új UID-ok?
      try {
        const newer = await uidSearch([["UID", `${state.lastUid + 1}:*`]]);
        uidsToFetch = newer.filter((u) => u > state.lastUid);
      } catch {
        uidsToFetch = [];
      }

      // Biztonsági ellenőrzés: ha a szerver legnagyobb UID-ja kisebb, mint a
      // cached lastUid, valami félrement (UIDVALIDITY váltás amit nem jeleztek,
      // mailbox visszaállítás stb.) → reseteljük a cache-t és újra szinkronizálunk.
      if (uidsToFetch.length === 0) {
        try {
          const all = await uidSearch(["ALL"]);
          const serverMax = all.length ? Math.max(...all) : 0;
          if (serverMax > 0 && serverMax < state.lastUid) {
            // Cache invalid → reset, és töltsük le a legutóbbi INITIAL_PAGE_SIZE darabot
            state = cache.reset(uidvalidity);
          }
        } catch { /* ignore */ }
      }
    }

    if (state.lastUid === 0) {
      // Üres cache (vagy reset után) → a legutolsó INITIAL_PAGE_SIZE UID
      let allUids = [];
      try { allUids = await uidSearch(["ALL"]); } catch { allUids = []; }
      allUids.sort((a, b) => a - b);
      uidsToFetch = allUids.slice(-cache.INITIAL_PAGE_SIZE);
    }

    if (uidsToFetch.length === 0) {
      cache.write(userDataDir(), account.id, logicalMailbox, { ...state, updatedAt: Date.now() });
      return { added: 0, total: box.messages.total, mailbox: logicalMailbox };
    }

    const minUid = Math.min(...uidsToFetch);
    const maxUid = Math.max(...uidsToFetch);
    const fetched = await fetchByUidRange(imap, `${minUid}:${maxUid}`);
    const wanted = new Set(uidsToFetch);
    const newOnly = fetched.filter((m) => wanted.has(m.uid) && m.uid > (state.lastUid || 0));
    const next = cache.mergeNewMessages(state, newOnly);
    cache.write(userDataDir(), account.id, logicalMailbox, next);
    return { added: newOnly.length, total: box.messages.total, mailbox: logicalMailbox };
  });
}

// Lazy-load: a cache-nél régebbi leveleket tölti le (oldestUid alatt).
async function loadOlder(account, logicalMailbox, pageSize) {
  return withImap(account, 120000, async (imap) => {
    const realName = await resolveMailbox(imap, logicalMailbox);
    if (!realName) return { added: 0, mailbox: logicalMailbox, missing: true };
    const box = await openBox(imap, realName);
    let state = cache.read(userDataDir(), account.id, logicalMailbox);
    if (!state.oldestUid || state.oldestUid <= 1) {
      return { added: 0, mailbox: logicalMailbox, exhausted: true };
    }
    const upper = state.oldestUid - 1;
    if (upper < 1) return { added: 0, mailbox: logicalMailbox, exhausted: true };

    // Kérdezzük meg a szervert, mely UID-ok léteznek 1..upper között.
    // (UID-ok nem összefüggőek — a törölt levelek hézagokat hagynak, ezért
    // egy egyszerű `lower:upper` range gyakran üres halmazt vagy hibát ad.)
    const uidSearch = (criteria) => new Promise((resolve, reject) => {
      imap.search(criteria, (err, results) => (err ? reject(err) : resolve(results || [])));
    });

    let olderUids = [];
    try {
      olderUids = await uidSearch([["UID", `1:${upper}`]]);
    } catch {
      olderUids = [];
    }
    olderUids = olderUids.filter((u) => u >= 1 && u <= upper).sort((a, b) => a - b);

    if (!olderUids.length) {
      // Tényleg nincs több régebbi → jelöljük kimerítettnek.
      const next = { ...state, oldestUid: 1, updatedAt: Date.now() };
      cache.write(userDataDir(), account.id, logicalMailbox, next);
      return { added: 0, mailbox: logicalMailbox, exhausted: true };
    }

    const limit = pageSize || cache.PAGE_SIZE;
    // A legfrissebb N régebbi UID (a tetejéről).
    const pageUids = olderUids.slice(-limit);
    const minUid = Math.min(...pageUids);
    const maxUid = Math.max(...pageUids);

    const fetched = await fetchByUidRange(imap, `${minUid}:${maxUid}`);
    const wanted = new Set(pageUids);
    const filtered = fetched.filter((m) => wanted.has(m.uid));

    // Ha a fetch valamiért semmit nem adott vissza (parse hibák), akkor is
    // léptessük az oldestUid-ot a kért tartomány alá, hogy a következő
    // "régebbi" hívás tovább tudjon menni és ne ragadjunk ugyanott.
    let next;
    if (filtered.length === 0) {
      next = { ...state, oldestUid: minUid, updatedAt: Date.now() };
    } else {
      next = cache.mergeNewMessages(state, filtered);
      // Biztosítsuk, hogy az oldestUid mindenképp a kért sáv aljára álljon
      // (mergeNewMessages a tényleg betöltött minimumra állítja).
      if (next.oldestUid > minUid) next.oldestUid = minUid;
    }
    cache.write(userDataDir(), account.id, logicalMailbox, next);

    // Akkor kimerített, ha már az 1-es UID is benne volt a most letöltöttekben,
    // VAGY az olderUids első eleme (a legrégebbi létező UID) most lett behúzva.
    const exhausted = olderUids[0] >= minUid;
    return {
      added: filtered.length,
      mailbox: logicalMailbox,
      exhausted,
    };
  });
}

// Egyetlen mappa szinkronizálása (UI gomb / fiókváltás háttér-sync).
ipcMain.handle("cache:syncMailbox", async (_e, { accountId, mailbox }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  const result = await syncMailbox(account, mailbox);
  const state = cache.read(userDataDir(), accountId, mailbox);
  return { ...result, messages: state.messages, updatedAt: state.updatedAt };
});

// Lazy-load régebbi levelek (görgetésre).
ipcMain.handle("cache:loadOlder", async (_e, { accountId, mailbox, pageSize }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  const result = await loadOlder(account, mailbox, pageSize);
  const state = cache.read(userDataDir(), accountId, mailbox);
  return { ...result, messages: state.messages, updatedAt: state.updatedAt };
});

// Egy fiók szinkronizálása. Csak az INBOX-ot húzzuk inkrementálisan, hogy
// fiókváltás ne akadjon meg a többi mappa miatt — azokat csak akkor szinkronizáljuk,
// amikor a felhasználó rákattint.
// Egy fiók szinkronizálása. Az INBOX és a Drafts mindig friss legyen
// fiókváltáskor (Piszkozatok mappában gyorsan akarunk visszanézni); a többi
// mappa csak akkor szinkronizál, amikor a felhasználó rákattint.
ipcMain.handle("cache:syncAccount", async (_e, { accountId }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  const results = [];
  for (const mb of ["INBOX", "Drafts"]) {
    try {
      const r = await syncMailbox(account, mb);
      results.push({ mailbox: mb, ok: true, added: r.added, missing: !!r.missing });
    } catch (e) {
      results.push({ mailbox: mb, ok: false, error: String(e?.message || e) });
    }
  }
  return { ok: true, results };
});

// Régi végpont kompatibilitás: ha valami még listInbox-ot hívna, INBOX cache-et adunk.
ipcMain.handle("imap:listInbox", async (_e, { accountId } = {}) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  await syncMailbox(account, "INBOX");
  return cache.read(userDataDir(), accountId, "INBOX").messages;
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

// ---- IPC: Draft mentés a szerverre (IMAP APPEND a Drafts mappába) ----
// Összeállítjuk a teljes RFC822 üzenetet a nodemailer MailComposerrel,
// majd a node-imap `append` metódusával beletesszük a Drafts mappába
// `\Draft` flag-gel és a jelenlegi időbélyegzővel. Sikeres APPEND után
// inkrementálisan szinkronizáljuk a Drafts mappát, hogy azonnal megjelenjen
// a UI-ban — és más kliensben (Gmail web, Mail.app) is látható legyen.
function buildRawMime(account, payload) {
  const MailComposer = require("nodemailer/lib/mail-composer");
  const fromAddress = account.displayName
    ? `"${String(account.displayName).replace(/"/g, '\\"')}" <${account.user}>`
    : account.from || account.user;
  const composer = new MailComposer({
    from: fromAddress,
    to: payload.to || undefined,
    cc: payload.cc || undefined,
    bcc: payload.bcc || undefined,
    subject: payload.subject || "",
    html: payload.html || undefined,
    text: payload.text || undefined,
  });
  return new Promise((resolve, reject) => {
    composer.compile().build((err, message) => {
      if (err) reject(err); else resolve(message);
    });
  });
}

function appendToMailbox(imap, mailbox, raw, flags) {
  return new Promise((resolve, reject) => {
    imap.append(raw, { mailbox, flags: flags || [], date: new Date() }, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

ipcMain.handle("imap:appendDraft", async (_e, { accountId, to, cc, bcc, subject, html, text }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  const raw = await buildRawMime(account, { to, cc, bcc, subject, html, text });
  await withImap(account, 60000, async (imap) => {
    const realName = await resolveMailbox(imap, "Drafts");
    if (!realName) throw new Error("Drafts mappa nem található a szerveren.");
    await appendToMailbox(imap, realName, raw, ["\\Draft", "\\Seen"]);
  });
  // Inkrementális szinkron, hogy az új piszkozat azonnal megjelenjen.
  try { await syncMailbox(account, "Drafts"); } catch { /* nem kritikus */ }
  const state = cache.read(userDataDir(), accountId, "Drafts");
  return { ok: true, messages: state.messages, updatedAt: state.updatedAt };
});

// ---- Window ----
let mainWindow = null;
const childWindows = new Set();

function loadRoute(win, hashRoute) {
  const devUrl = process.env.ELECTRON_DEV_URL;
  if (devUrl) {
    // Vite dev server — hash route mögé fűzve.
    win.loadURL(devUrl + (hashRoute ? `#${hashRoute}` : ""));
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      hash: hashRoute || undefined,
    });
  }
}

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
  mainWindow = win;
  win.on("closed", () => { if (mainWindow === win) mainWindow = null; });
  loadRoute(win, "");
}

// Egy levél megnyitása új ablakban (dupla kattintás a listában).
function openMessageWindow({ accountId, mailbox, seqno, uid }) {
  const win = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 560,
    minHeight: 420,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f5f6f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  childWindows.add(win);
  win.on("closed", () => childWindows.delete(win));
  const params = new URLSearchParams();
  if (accountId) params.set("accountId", String(accountId));
  if (mailbox) params.set("mailbox", String(mailbox));
  if (seqno != null) params.set("seqno", String(seqno));
  if (uid != null) params.set("uid", String(uid));
  loadRoute(win, `/message?${params.toString()}`);
  return { ok: true };
}

ipcMain.handle("window:openMessage", (_e, params = {}) => openMessageWindow(params));


// ---- Automatikus háttér-szinkron (polling) ----
// 5 percenként végigmegy minden mentett fiók INBOX-án; ha érkezett új levél,
// értesíti a renderert, hogy frissítse a listát.
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let autoSyncRunning = false;

async function runAutoSync() {
  if (autoSyncRunning) return;
  autoSyncRunning = true;
  try {
    const accounts = loadAccounts();
    for (const account of accounts) {
      try {
        const r = await syncMailbox(account, "INBOX");
        if (r && r.added > 0 && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("mail:auto-synced", {
            accountId: account.id,
            mailbox: "INBOX",
            added: r.added,
          });
        }
      } catch (e) {
        // Egy fiók hibája ne állítsa meg a többit.
        console.error("[auto-sync] hiba:", account.id, e?.message || e);
      }
    }
  } finally {
    autoSyncRunning = false;
  }
}

app.whenReady().then(() => {
  createWindow();
  // Első futás 30 mp múlva, hogy az UI nyugodtan betöltsön; utána 5 percenként.
  setTimeout(runAutoSync, 30 * 1000);
  setInterval(runAutoSync, AUTO_SYNC_INTERVAL_MS);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
