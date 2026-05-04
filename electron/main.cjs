// Electron main process — fiók/sablon tárolás + IMAP/SMTP híd lokális cache-sel.
const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const Imap = require("imap");
const { simpleParser } = require("mailparser");
const nodemailer = require("nodemailer");
const cache = require("./mailCache.cjs");
require("./updater.cjs");

// ---- Debug log ring buffer ----
// Elkapjuk a saját, releváns log-üzeneteket a main processben (cache.read,
// syncMailbox, loadOlder, smtp, …), hogy a UI-ből egy gombnyomással
// le lehessen menteni a hibakereséshez.
const DEBUG_MAX_ENTRIES = 2000;
const DEBUG_PREFIXES = [
  "[loadMessages]", "[loadOlder]", "[cache.read]", "[cache.write]",
  "[syncMailbox]", "[ipc cache:", "[ipc imap:", "[smtp]",
  "[mail.fetchBody]", "[autoSync]",
];
const debugBuffer = [];
function debugRecord(level, args) {
  let message;
  try {
    message = args.map((a) => {
      if (a == null) return String(a);
      if (typeof a === "string") return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join(" ");
  } catch { return; }
  let relevant = false;
  for (const p of DEBUG_PREFIXES) {
    if (message.startsWith(p) || message.includes(` ${p}`)) { relevant = true; break; }
  }
  if (!relevant) return;
  debugBuffer.push({ ts: Date.now(), level, message });
  if (debugBuffer.length > DEBUG_MAX_ENTRIES) {
    debugBuffer.splice(0, debugBuffer.length - DEBUG_MAX_ENTRIES);
  }
}
(function installDebugHook() {
  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };
  console.log = (...a) => { debugRecord("log", a); orig.log(...a); };
  console.warn = (...a) => { debugRecord("warn", a); orig.warn(...a); };
  console.error = (...a) => { debugRecord("error", a); orig.error(...a); };
  console.info = (...a) => { debugRecord("info", a); orig.info(...a); };
})();
ipcMain.handle("debug:getLog", () => ({ entries: debugBuffer.slice() }));
ipcMain.handle("debug:clearLog", () => { debugBuffer.length = 0; return { ok: true }; });

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

// IMAP SPECIAL-USE attribútumok (RFC 6154) → logikai mappanevek leképzése.
// Ez a leghitelesebb forrás a Drafts/Sent/Trash/Junk/Archive azonosításra,
// függetlenül a szerver névsémájától (Drafts vs INBOX.Drafts vs [Gmail]/Drafts).
const SPECIAL_USE_TO_LOGICAL = {
  "\\Drafts": "Drafts",
  "\\Sent": "Sent",
  "\\Trash": "Trash",
  "\\Junk": "Spam",
  "\\Archive": "Archive",
  "\\All": "Archive", // Gmail "All Mail" — archive-szerű viselkedés
};

// Mappa-feloldás cache. Memóriában (per accountId), ÉS perzisztensen lemezen
// (mailbox-resolutions.json), hogy indulásokon át gyors maradjon a felhasználói
// élmény és ne kelljen mindig LIST-elni a szervert.
//
// Struktúra: { [accountId]: { [logical]: realName } }
const resolvedMailboxCache = new Map();
let resolvedMailboxLoaded = false;

function loadResolvedMailboxesFromDisk() {
  if (resolvedMailboxLoaded) return;
  resolvedMailboxLoaded = true;
  try {
    const raw = readStore("mailbox-resolutions", {});
    for (const [accId, map] of Object.entries(raw || {})) {
      const m = new Map();
      for (const [logical, real] of Object.entries(map || {})) {
        if (typeof real === "string" && real) m.set(logical, real);
      }
      resolvedMailboxCache.set(accId, m);
    }
  } catch (e) {
    console.warn(`[mailbox] failed to load resolutions from disk: ${e?.message || e}`);
  }
}

function persistResolvedMailboxes() {
  try {
    const out = {};
    for (const [accId, m] of resolvedMailboxCache.entries()) {
      out[accId] = Object.fromEntries(m.entries());
    }
    writeStore("mailbox-resolutions", out);
  } catch (e) {
    console.warn(`[mailbox] failed to persist resolutions: ${e?.message || e}`);
  }
}

function getCachedMailbox(accountId, logical) {
  loadResolvedMailboxesFromDisk();
  return resolvedMailboxCache.get(accountId)?.get(logical) ?? null;
}
function setCachedMailbox(accountId, logical, real) {
  loadResolvedMailboxesFromDisk();
  if (!resolvedMailboxCache.has(accountId)) resolvedMailboxCache.set(accountId, new Map());
  const prev = resolvedMailboxCache.get(accountId).get(logical);
  if (prev === real) return;
  resolvedMailboxCache.get(accountId).set(logical, real);
  if (prev && prev !== real) {
    console.log(`[mailbox] resolution changed acct=${accountId} ${logical}: "${prev}" → "${real}"`);
  } else {
    console.log(`[mailbox] resolution stored acct=${accountId} ${logical} → "${real}"`);
  }
  persistResolvedMailboxes();
}

// Per-mailbox sync lock: ugyanarra a (accountId, mailbox) párra egyszerre csak
// ---- Sync lock + in-flight deduplikáció ----
// Account+mailbox párokra biztosítjuk, hogy egyszerre csak EGY syncMailbox
// fusson. Ha érkezik egy második hívás MIALATT az első még fut, NEM indítunk
// új IMAP kapcsolatot a sor végére — visszaadjuk ugyanazt az in-flight
// Promise-t, és minden hívó ugyanazt az eredményt kapja meg. Így elkerüljük:
//   • a duplikált IMAP sessiont (auto-sync + manuális Frissítés egyszerre),
//   • a felesleges 25+ mp-es várakozást a második kapcsolatnál lassú szervernél,
//   • a cache-write race-t (két konkurens szinkron felülírná egymást).
const syncLocks = new Map(); // key: `${accountId}::${mailbox}` → Promise
function withSyncLock(accountId, mailbox, fn) {
  const key = `${accountId}::${mailbox}`;
  const inflight = syncLocks.get(key);
  if (inflight) {
    console.log(`[syncLock] reuse in-flight ${key}`);
    return inflight;
  }
  const p = Promise.resolve().then(fn).finally(() => {
    if (syncLocks.get(key) === p) syncLocks.delete(key);
  });
  syncLocks.set(key, p);
  return p;
}

// ---- Retry helper átmeneti hibákra (SMTP/IMAP) ----
//
// Általános szabály: 3× próbálkozás exponenciális backoff-fal (1s, 2s, 4s).
// PERMANENS hibákat (pl. authentication failed, 5xx response code, hiányzó
// fiók, misszing mailbox) NEM próbálja újra — felesleges és csak elhúzza
// a hibajelzést a felhasználó felé. Az átmeneti hibákhoz tartozik minden
// hálózati eredetű probléma: timeout, ECONNRESET, ECONNREFUSED, EHOSTUNREACH,
// 4xx greylisting/rate limit, valamint a kapcsolat-szint kódok.
//
// A `label` csak a logoláshoz kell — `[retry] <label> attempt N/3 …` formában.
function isPermanentError(err) {
  if (!err) return false;
  const msg = String(err.message || err.response || err).toLowerCase();
  const code = err.code || "";
  const responseCode = Number(err.responseCode || 0);
  // SMTP 5xx → permanens (auth failed, mailbox not found, message rejected)
  if (responseCode >= 500 && responseCode < 600) return true;
  // Authentication / authorization → ne próbáljuk újra
  if (/(authentication failed|invalid login|invalid credentials|authentication unsuccessful|535|534|538)/i.test(msg)) {
    return true;
  }
  // Konfigurációs / állandó hibák
  if (/no such mailbox|mailbox.*not.*exist|550|553|554/i.test(msg)) return true;
  if (code === "EAUTH") return true;
  return false;
}

async function runWithRetry(label, fn, { maxAttempts = 3, baseDelayMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn(attempt);
      if (attempt > 1) {
        console.log(`[retry] ${label} succeeded on attempt ${attempt}/${maxAttempts}`);
      }
      return result;
    } catch (err) {
      lastErr = err;
      const permanent = isPermanentError(err);
      const detail = err?.message || err?.response || String(err);
      const code = err?.code || err?.responseCode || "?";
      if (permanent) {
        console.warn(`[retry] ${label} PERMANENT error on attempt ${attempt}/${maxAttempts} (code=${code}) — not retrying: ${detail}`);
        throw err;
      }
      if (attempt >= maxAttempts) {
        console.warn(`[retry] ${label} TRANSIENT error on attempt ${attempt}/${maxAttempts} (code=${code}) — giving up: ${detail}`);
        throw err;
      }
      const wait = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[retry] ${label} TRANSIENT error on attempt ${attempt}/${maxAttempts} (code=${code}) — waiting ${wait}ms before retry: ${detail}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

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
  resolvedMailboxCache.delete(id);
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
    authTimeout: 8000,      // gyorsabb hibajelzés lassú szervereknél (volt: 12000)
    connTimeout: 8000,      // gyorsabb hibajelzés lassú szervereknél (volt: 12000)
    socketTimeout: 20000,   // (volt: 25000)
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

function openBox(imap, name, readOnly = true) {
  return new Promise((resolve, reject) => {
    imap.openBox(name, readOnly, (err, box) => (err ? reject(err) : resolve(box)));
  });
}

function listBoxes(imap) {
  return new Promise((resolve, reject) => {
    imap.getBoxes((err, boxes) => (err ? reject(err) : resolve(boxes || {})));
  });
}

// Bejárja a node-imap getBoxes() fájának egészét, és minden mappához visszaadja
// a teljes elérési utat ÉS a SPECIAL-USE attribútumokat (RFC 6154).
//   pl. { name: "INBOX.Drafts", attribs: ["\\HasNoChildren", "\\Drafts"] }
function flattenBoxesWithAttribs(boxes, prefix = "") {
  const out = [];
  for (const [name, info] of Object.entries(boxes || {})) {
    const full = prefix + name;
    const attribs = Array.isArray(info?.attribs) ? info.attribs : [];
    out.push({ name: full, attribs });
    if (info && info.children) {
      const sep = info.delimiter || "/";
      out.push(...flattenBoxesWithAttribs(info.children, full + sep));
    }
  }
  return out;
}

// Visszamenőleges kompatibilitás (csak nevek listája).
function flattenBoxNames(boxes, prefix = "") {
  return flattenBoxesWithAttribs(boxes, prefix).map((b) => b.name);
}

// Megpróbálja megtalálni az adott logikai mappához tartozó valódi nevet a szerveren.
//
// Stratégia (prioritás szerint):
//   1) IMAP SPECIAL-USE attribútumok (RFC 6154) — a leghitelesebb.
//      Pl. \Drafts attribútumú mappa = Drafts, függetlenül a névtől.
//   2) Név-alias egyezés (Drafts, INBOX.Drafts, [Gmail]/Drafts, …).
//      Ha több jelölt is létezik, a nem-üres mappát preferáljuk
//      (elkerüli a „server box EMPTY" helyzetet, ha a kliens egy másik
//      mappában tartja ténylegesen a piszkozatokat).
//   3) Suffix egyezés (bármi, ami `/Drafts`-ra vagy `.Drafts`-ra végződik).
async function resolveMailbox(imap, logical) {
  if (logical === "INBOX") return "INBOX";
  let allBoxes;
  try {
    allBoxes = flattenBoxesWithAttribs(await listBoxes(imap));
  } catch {
    allBoxes = [];
  }

  // 1) SPECIAL-USE
  const wantedAttrib = Object.entries(SPECIAL_USE_TO_LOGICAL)
    .find(([, log]) => log === logical)?.[0];
  if (wantedAttrib) {
    const matches = allBoxes.filter((b) => b.attribs.includes(wantedAttrib));
    const picked = await pickBestCandidate(imap, matches.map((m) => m.name));
    if (picked) {
      console.log(`[mailbox] ${logical}: SPECIAL-USE ${wantedAttrib} → "${picked}"`);
      return picked;
    }
  }

  // 2) Név-aliasok
  const aliases = MAILBOX_ALIASES[logical] || [logical];
  const aliasLower = new Set(aliases.map((a) => a.toLowerCase()));
  const aliasMatches = allBoxes
    .filter((b) => aliasLower.has(b.name.toLowerCase()))
    .map((b) => b.name);
  const picked2 = await pickBestCandidate(imap, aliasMatches);
  if (picked2) {
    console.log(`[mailbox] ${logical}: name-alias → "${picked2}"`);
    return picked2;
  }

  // 3) Suffix egyezés (delimiter-független)
  const suffixMatches = allBoxes
    .filter((b) => {
      const lower = b.name.toLowerCase();
      return aliases.some((a) => {
        const al = a.toLowerCase();
        return lower.endsWith(`/${al}`) || lower.endsWith(`.${al}`);
      });
    })
    .map((b) => b.name);
  const picked3 = await pickBestCandidate(imap, suffixMatches);
  if (picked3) {
    console.log(`[mailbox] ${logical}: suffix-match → "${picked3}"`);
    return picked3;
  }

  return null;
}

// Több jelölt közül a legjobb kiválasztása: az első nyitható, és lehetőleg
// nem üres mappa. Ha mind üres, az elsőt adjuk vissza (jobb mint a semmi).
async function pickBestCandidate(imap, names) {
  if (!names || !names.length) return null;
  let firstOpenable = null;
  for (const name of names) {
    try {
      const box = await openBox(imap, name);
      if (!firstOpenable) firstOpenable = name;
      if (box && box.messages && box.messages.total > 0) return name;
    } catch { /* not openable, skip */ }
  }
  return firstOpenable;
}

// Megszámolja a „valódi" csatolmányokat egy `simpleParser` által kibontott
// üzenetből — minden content-type-ra (pdf, kép, szöveg, zip, doc, stb.)
// egységesen működik, mert nem a typeból, hanem a csatolmány-rész
// jellemzőiből (filename / méret / disposition / content-id) dolgozik.
//
// Mit számolunk csatolmánynak:
//   • bármilyen rész, aminek van fájlneve (filename) → felhasználói intent
//   • bármilyen rész, aminek a tartalmi mérete > 0 ÉS van content-disposition
//     (`attachment` vagy `inline`) — ez kizárja a multipart strukturális
//     wrapper-eket, amik 0 byte-osak és nincs disposition-jük
//   • inline image/* cid-vel — explicit beágyazott kép, akkor is csatolmány
// Mit NEM számolunk:
//   • 0 byte-os, fájlnév és disposition nélküli részek (üres cid-stub,
//     hibás multipart wrapper)
function countRealAttachments(parsed) {
  const atts = parsed?.attachments || [];
  let n = 0;
  for (const a of atts) {
    const size = a.size || 0;
    const hasName = !!a.filename;
    const disp = (a.contentDisposition || "").toLowerCase();
    const hasDisp = disp === "attachment" || disp === "inline";
    const ct = (a.contentType || "").toLowerCase();
    const isInlineImage = !!a.cid && ct.startsWith("image/");
    if (hasName || (size > 0 && hasDisp) || isInlineImage) n += 1;
  }
  return n;
}

// Ugyanaz a logika, de a `node-imap` BODYSTRUCTURE-jén (rekurzív tömb).
// Ezt a HEADER-szinkron használja: nem kell teljes body letöltés, így gyors,
// és pontosan jelzi a 📎 ikont a listanézetben — minden csatolmány-típushoz
// (pdf, kép, szöveg, zip, doc, hang, video, …).
//
// A `node-imap` `struct` formátum: nested array. Egy levél alkatrésze (part)
// vagy egy alkatrész-tömb (multipart). Az alkatrész egy objektum, amiben:
//   - type, subtype          (pl. "image", "png")
//   - disposition            (pl. { type: "attachment", params: { filename } })
//   - id                     (Content-ID, cid)
//   - size                   (byte)
function hasAttachmentsInStruct(struct) {
  if (!Array.isArray(struct)) return false;
  for (const item of struct) {
    if (Array.isArray(item)) {
      if (hasAttachmentsInStruct(item)) return true;
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const type = String(item.type || "").toLowerCase();
    const subtype = String(item.subtype || "").toLowerCase();
    if (!type) continue;
    // Multipart wrapper-eket átugorjuk — a tartalmukat a tömb-rekurzió
    // járja be (lásd fent), itt magát a wrapper-objektumot nem nézzük.
    if (type === "multipart") continue;

    const disp = item.disposition || null;
    const dispType = disp && typeof disp === "object" ? String(disp.type || "").toLowerCase() : null;
    const params = item.params || (disp && disp.params) || {};
    const filename = params && (params.filename || params.name);
    const size = Number(item.size) || 0;
    const cid = item.id || null;
    const isInlineImage = !!cid && type === "image";

    if (filename) return true;
    if ((dispType === "attachment" || dispType === "inline") && size > 0) return true;
    if (isInlineImage) return true;

    // Tipikus „nyilvánvalóan csatolmány" típusok body-disposition nélkül is.
    if (type === "application" && size > 0 && subtype && subtype !== "pkcs7-signature") return true;
    if (type === "image" && size > 0 && (filename || cid)) return true;
  }
  return false;
}

const ATTACHMENT_META_VERSION = 1;

async function refreshAttachmentFlagsFromServer(imap, state) {
  if (!state || !Array.isArray(state.messages) || state.messages.length === 0) {
    return state;
  }
  const cachedUids = state.messages
    .map((m) => (typeof m.uid === "number" ? m.uid : null))
    .filter((u) => u != null);
  if (cachedUids.length === 0) {
    return { ...state, attachmentMetaVersion: ATTACHMENT_META_VERSION };
  }
  const minUid = Math.min(...cachedUids);
  const maxUid = Math.max(...cachedUids);
  const headers = await fetchHeadersByUidRange(imap, `${minUid}:${maxUid}`);
  const byUid = new Map(headers.map((m) => [m.uid, !!m.hasAttachments]));
  let changed = false;
  const nextMessages = state.messages.map((m) => {
    if (!m || typeof m !== "object" || typeof m.uid !== "number") return m;
    if (!byUid.has(m.uid)) return m;
    const nextHasAttachments = byUid.get(m.uid);
    if (m.hasAttachments === nextHasAttachments) return m;
    changed = true;
    return { ...m, hasAttachments: nextHasAttachments };
  });
  return {
    ...state,
    messages: changed ? nextMessages : state.messages,
    attachmentMetaVersion: ATTACHMENT_META_VERSION,
    updatedAt: changed ? Date.now() : state.updatedAt,
  };
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
              // hasAttachments: a `countRealAttachments` minden típust felismer
              // (pdf, kép, szöveg, zip, doc, …) — body letöltése nélkül is
              // pontosan jelzi a 📎 ikont a listán. Ld. a függvény kommentjét.
              const hasAttachments = countRealAttachments(parsed) > 0;
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
                hasAttachments,
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

// Csak a flag-eket olvassa le (body nélkül) → gyors, használjuk a cache-elt
// levelek \\Flagged / \\Seen állapotának visszaszinkronjához.
function fetchFlagsByUidRange(imap, range) {
  return new Promise((resolve, reject) => {
    const out = [];
    const f = imap.fetch(range, { bodies: "", struct: false });
    f.on("message", (msg) => {
      let attrs = null;
      msg.once("attributes", (a) => { attrs = a; });
      msg.once("end", () => {
        if (attrs && typeof attrs.uid === "number") {
          const flags = Array.isArray(attrs.flags) ? attrs.flags : [];
          out.push({
            uid: attrs.uid,
            flagged: flags.includes("\\Flagged"),
            seen: flags.includes("\\Seen"),
          });
        }
      });
    });
    f.once("error", reject);
    f.once("end", () => resolve(out));
  });
}

// Gyors RFC822 header parser — csak a list-megjelenítéshez kellő mezőket bontja ki.
// Lényegesen olcsóbb, mint a teljes simpleParser, és nem tölti le a body-t.
function parseHeaderBlock(raw) {
  // Folytatólagos sorok (CRLF + space/tab) összevonása.
  const unfolded = String(raw || "").replace(/\r?\n[ \t]+/g, " ");
  const lines = unfolded.split(/\r?\n/);
  const headers = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (!headers[key]) headers[key] = val;
  }
  return headers;
}

// MIME encoded-word dekódolás (=?UTF-8?B?...?= és =?UTF-8?Q?...?=) — fejlécek
// (Subject, From) gyakran tartalmaznak ilyet nem-ASCII karaktereknél.
function decodeMimeWords(input) {
  if (!input) return "";
  return String(input).replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_, charset, enc, data) => {
      try {
        const cs = String(charset).toLowerCase();
        if (enc.toUpperCase() === "B") {
          return Buffer.from(data, "base64").toString(cs);
        }
        // Q-encoding: _ = space, =XX = hex byte
        const bytes = [];
        for (let i = 0; i < data.length; i++) {
          const c = data[i];
          if (c === "_") bytes.push(0x20);
          else if (c === "=" && i + 2 < data.length) {
            bytes.push(parseInt(data.substr(i + 1, 2), 16));
            i += 2;
          } else bytes.push(c.charCodeAt(0));
        }
        return Buffer.from(bytes).toString(cs);
      } catch {
        return data;
      }
    },
  ).replace(/\?=\s+=\?[^?]+\?[BbQq]\?/g, ""); // szomszédos encoded-word szóköz eltüntetése
}

// Csak fejléceket tölt le (FROM, TO, SUBJECT, DATE) + BODYSTRUCTURE-t a
// `hasAttachments` flag-hez. A teljes body NINCS letöltve — gyors marad,
// de az IMAP `BODYSTRUCTURE` válaszból pontosan tudjuk, van-e csatolmány,
// így a lista-nézetben rögtön megjelenik a 📎 ikon (body letöltése nélkül).
// A teljes szöveg/HTML lazy-n töltődik le a fetchBodyByUid hívásával,
// amikor a felhasználó megnyit egy levelet.
function fetchHeadersByUidRange(imap, range) {
  return new Promise((resolve, reject) => {
    const out = [];
    const f = imap.fetch(range, {
      bodies: "HEADER.FIELDS (FROM TO SUBJECT DATE)",
      struct: true,
    });
    f.on("message", (msg) => {
      let raw = "";
      let attrs = null;
      msg.on("body", (stream) => {
        stream.on("data", (chunk) => (raw += chunk.toString("utf8")));
      });
      msg.once("attributes", (a) => { attrs = a; });
      msg.once("end", () => {
        if (!attrs || typeof attrs.uid !== "number") return;
        const h = parseHeaderBlock(raw);
        const flags = Array.isArray(attrs.flags) ? attrs.flags : [];
        let dateIso = null;
        if (h.date) {
          const d = new Date(h.date);
          if (!Number.isNaN(d.getTime())) dateIso = d.toISOString();
        }
        const hasAttachments = hasAttachmentsInStruct(attrs.struct);
        out.push({
          uid: attrs.uid,
          from: decodeMimeWords(h.from || ""),
          to: decodeMimeWords(h.to || ""),
          subject: decodeMimeWords(h.subject || "(nincs tárgy)"),
          date: dateIso,
          text: "",
          html: "",
          snippet: "",
          flagged: flags.includes("\\Flagged"),
          seen: flags.includes("\\Seen"),
          bodyLoaded: false,
          hasAttachments,
        });
      });
    });
    f.once("error", reject);
    f.once("end", () => resolve(out));
  });
}

// Egyetlen levél teljes body-ját tölti le és parse-olja — lazy hívás a UI-ból
// (MessageView/MessagePage), amikor a felhasználó megnyit egy levelet.
function fetchBodyByUid(imap, uid) {
  return new Promise((resolve, reject) => {
    const f = imap.fetch(String(uid), { bodies: "", struct: true });
    let raw = "";
    let attrs = null;
    let gotMessage = false;
    f.on("message", (msg) => {
      gotMessage = true;
      msg.on("body", (stream) => {
        stream.on("data", (chunk) => (raw += chunk.toString("utf8")));
      });
      msg.once("attributes", (a) => { attrs = a; });
    });
    f.once("error", reject);
    f.once("end", async () => {
      if (!gotMessage) return resolve(null);
      try {
        const parsed = await simpleParser(raw);
        const flags = Array.isArray(attrs?.flags) ? attrs.flags : [];
        // A header mezőket is visszaadjuk, hogy a hívó (pl. új ablak,
        // ami nem találja a levelet a cache-ben) önmagában fel tudjon
        // építeni egy teljes MailMessage objektumot, ne csak a body-t
        // tudja merge-elni egy meglévő fejlécre.
        const fmt = (a) => {
          if (!a) return "";
          if (Array.isArray(a)) return a.map(fmt).filter(Boolean).join(", ");
          if (a.text) return a.text;
          if (Array.isArray(a.value)) {
            return a.value
              .map((v) => (v.name ? `${v.name} <${v.address}>` : v.address))
              .filter(Boolean)
              .join(", ");
          }
          return "";
        };
        resolve({
          uid: attrs?.uid ?? Number(uid),
          from: fmt(parsed.from),
          to: fmt(parsed.to),
          cc: fmt(parsed.cc),
          subject: parsed.subject || "(nincs tárgy)",
          date: parsed.date ? new Date(parsed.date).toISOString() : null,
          text: parsed.text || "",
          html: parsed.html || "",
          snippet: (parsed.text || "").slice(0, 140),
          flagged: flags.includes("\\Flagged"),
          seen: flags.includes("\\Seen"),
          bodyLoaded: true,
          attachments: (parsed.attachments || []).map((a) => ({
            filename: a.filename || "melléklet",
            contentType: a.contentType || "application/octet-stream",
            size: a.size || 0,
            data: a.content ? a.content.toString("base64") : undefined,
            cid: a.cid || undefined,
            inline: !!a.contentDisposition && a.contentDisposition === "inline",
          })),
          hasAttachments: countRealAttachments(parsed) > 0,
        });
      } catch (err) {
        reject(err);
      }
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
  if (!accountId || !mailbox) {
    console.warn(`[ipc cache:read] missing args accountId=${accountId} mailbox=${mailbox}`);
    return { messages: [], updatedAt: 0 };
  }
  const state = cache.read(userDataDir(), accountId, mailbox);
  console.log(`[ipc cache:read] → ${accountId}/${mailbox} returning msgs=${state.messages.length} updatedAt=${state.updatedAt}`);
  return { messages: state.messages, updatedAt: state.updatedAt };
});

// Inkrementális szinkron egy mappához. Csak az új UID-okat húzza le, vagy
// üres cache-nél a legfrissebb INITIAL_PAGE_SIZE darabot. UIDVALIDITY változás → reset.
//
// FONTOS: per (accountId, mailbox) lock alatt fut, így két konkurens hívás
// nem írja felül egymás cache-ét (race elkerülése — különben a régebbi state-tel
// induló sync az újabb merge-et felülírhatja, és „eltűnnek" a levelek).
async function syncMailbox(account, logicalMailbox) {
  const tStart = Date.now();
  console.log(`[syncMailbox] enter ${account.id}/${logicalMailbox}`);
  // A futás során összegyűjtött figyelmeztetések — a UI ezek alapján mutat
  // részletes toast-leírást a felhasználónak (pl. „ALL search FAILED …",
  // „UIDVALIDITY changed …", „server box EMPTY"), hogy ne csak az utolsó
  // exception látszódjon, hanem az IMAP-szintű részletek is.
  const warnings = [];
  const warn = (msg) => { warnings.push(msg); };
  return withSyncLock(account.id, logicalMailbox, () =>
    withImap(account, 120000, async (imap) => {
      console.log(`[syncMailbox] imap connected ${account.id}/${logicalMailbox} (+${Date.now() - tStart}ms)`);
      // 1. Mappa-feloldás: cache → ha nincs, friss LIST + SPECIAL-USE alapján.
      let realName = getCachedMailbox(account.id, logicalMailbox);
      let cameFromCache = !!realName;
      if (!realName) {
        realName = await resolveMailbox(imap, logicalMailbox);
        if (realName) setCachedMailbox(account.id, logicalMailbox, realName);
        console.log(`[syncMailbox] resolved mailbox ${logicalMailbox} → ${realName || "(none)"}`);
      }
      if (!realName) {
        const state = cache.read(userDataDir(), account.id, logicalMailbox);
        const w = `Mappa nem található a szerveren: „${logicalMailbox}" — a megjelenített lista a helyi cache-ből származik.`;
        warn(w);
        console.warn(`[syncMailbox] MISSING mailbox ${account.id}/${logicalMailbox} → returning ${state.messages.length} cached msgs`);
        return { added: 0, total: 0, mailbox: logicalMailbox, missing: true, messages: state.messages, updatedAt: state.updatedAt, warnings };
      }

      // 2. Cache-validáció: a cache-elt valós nevet megpróbáljuk megnyitni.
      // Ha nem nyitható (törölték / átnevezték), újra-feloldunk és frissítjük a cache-t.
      let box;
      try {
        box = await openBox(imap, realName);
      } catch (openErr) {
        if (cameFromCache) {
          const reResolved = await resolveMailbox(imap, logicalMailbox);
          if (reResolved && reResolved !== realName) {
            console.warn(`[syncMailbox] cached "${realName}" not openable (${openErr?.message || openErr}) — re-resolved to "${reResolved}"`);
            warn(`A korábbi mappa-feloldás („${realName}") már nem érvényes, áttértünk erre: „${reResolved}".`);
            realName = reResolved;
            setCachedMailbox(account.id, logicalMailbox, realName);
            box = await openBox(imap, realName);
          } else {
            throw openErr;
          }
        } else {
          throw openErr;
        }
      }
      const uidvalidity = box.uidvalidity ?? null;
      let state = cache.read(userDataDir(), account.id, logicalMailbox);
      console.log(`[syncMailbox] opened box ${realName} server.total=${box.messages.total} uidvalidity=${uidvalidity} cache.uidvalidity=${state.uidvalidity} cache.lastUid=${state.lastUid} cache.msgs=${state.messages.length}`);

      // UIDVALIDITY váltott → eldobjuk a cache-t (ez a hivatalos IMAP jelzés
      // arra, hogy a UID-ok újraszámozódtak).
      if (state.uidvalidity != null && uidvalidity != null && state.uidvalidity !== uidvalidity) {
        const w = `UIDVALIDITY változott (${state.uidvalidity} → ${uidvalidity}) — a helyi cache törölve, minden levelet újraszinkronizálunk.`;
        warn(w);
        console.warn(`[syncMailbox] UIDVALIDITY CHANGED ${account.id}/${logicalMailbox}: ${state.uidvalidity} → ${uidvalidity} — cache reset`);
        state = cache.reset(uidvalidity);
      } else if (state.uidvalidity == null) {
        state.uidvalidity = uidvalidity;
      }

      // 3. Üres-mappa egyeztetés: ha a feloldott mappa üres, megnézzük, hogy
      //    egy másik jelölt (más név vagy SPECIAL-USE) tartalmazza-e a leveleket.
      //    Ha igen, áttérünk arra (ez szünteti meg a discrepancy warningot,
      //    pl. ha eddig „Drafts" volt a cache-elt, de a kliens valójában az
      //    „INBOX.Drafts"-ba teszi a piszkozatokat).
      if (!box.messages.total && cameFromCache) {
        const reResolved = await resolveMailbox(imap, logicalMailbox);
        if (reResolved && reResolved !== realName) {
          try {
            const altBox = await openBox(imap, reResolved);
            if (altBox.messages.total > 0) {
              console.warn(`[syncMailbox] "${realName}" empty, but "${reResolved}" has ${altBox.messages.total} msgs — switching cache`);
              warn(`Mappa egyeztetés: „${realName}" üres a szerveren, áttértünk erre: „${reResolved}" (${altBox.messages.total} levél).`);
              realName = reResolved;
              setCachedMailbox(account.id, logicalMailbox, realName);
              box = altBox;
            }
          } catch { /* ignore */ }
        }
      }

      if (!box.messages.total) {
        const w = `A szerver szerint a(z) „${realName}" mappa üres — megtartjuk a meglévő ${state.messages.length} cache-elt levelet (lehet tranziens IMAP állapot).`;
        warn(w);
        console.warn(`[syncMailbox] server box EMPTY ${account.id}/${logicalMailbox} — keeping ${state.messages.length} cached msgs (no destructive reset)`);
        cache.write(userDataDir(), account.id, logicalMailbox, { ...state, updatedAt: Date.now() });
        return { added: 0, total: 0, mailbox: logicalMailbox, messages: state.messages, updatedAt: Date.now(), warnings };
      }


      const uidSearch = (criteria) => new Promise((resolve, reject) => {
        imap.search(criteria, (err, results) => (err ? reject(err) : resolve(results || [])));
      });

      let uidsToFetch = [];
      if (state.lastUid > 0) {
        try {
          const newer = await uidSearch([["UID", `${state.lastUid + 1}:*`]]);
          uidsToFetch = newer.filter((u) => u > state.lastUid);
          console.log(`[syncMailbox] incremental search ${account.id}/${logicalMailbox} after UID ${state.lastUid} → ${uidsToFetch.length} new`);
        } catch (err) {
          const msg = (err && err.message) || String(err);
          warn(`Inkrementális UID search sikertelen (UID ${state.lastUid + 1}:*): ${msg}`);
          console.warn(`[syncMailbox] incremental search FAILED ${account.id}/${logicalMailbox}: ${msg}`);
          uidsToFetch = [];
        }

        // KONZERVATÍV reset: csak akkor dobjuk el a cache-t, ha az ALL search
        // ténylegesen sikeres volt ÉS jelentős eltérés van. Ha bármilyen hiba
        // történik, megtartjuk a meglévő cache-t (jobb régi adat, mint üres).
        if (uidsToFetch.length === 0) {
          let allOk = false;
          let serverMax = 0;
          try {
            const all = await uidSearch(["ALL"]);
            allOk = true;
            serverMax = all.length ? Math.max(...all) : 0;
          } catch (err) {
            const msg = (err && err.message) || String(err);
            warn(`ALL UID search sikertelen — nem tudtuk verifikálni a cache-t: ${msg}`);
            console.warn(`[syncMailbox] ALL search FAILED ${account.id}/${logicalMailbox}: ${msg}`);
            allOk = false;
          }
          if (allOk && serverMax > 0 && serverMax < state.lastUid) {
            warn(`Cache reset: a szerver max UID-ja (${serverMax}) kisebb, mint a cache-elt lastUid (${state.lastUid}).`);
            console.warn(`[syncMailbox] cache reset: ${account.id}/${logicalMailbox} serverMax=${serverMax} < cached lastUid=${state.lastUid}`);
            state = cache.reset(uidvalidity);
          } else if (allOk) {
            console.log(`[syncMailbox] no reset ${account.id}/${logicalMailbox} (serverMax=${serverMax}, cache.lastUid=${state.lastUid})`);
          }
        }
      }

      if (state.lastUid === 0) {
        let allUids = [];
        try { allUids = await uidSearch(["ALL"]); } catch (err) {
          const msg = (err && err.message) || String(err);
          warn(`Kezdeti ALL UID search sikertelen — nem tudtunk leveleket lehúzni: ${msg}`);
          console.warn(`[syncMailbox] initial ALL search FAILED ${account.id}/${logicalMailbox}: ${msg}`);
          allUids = [];
        }
        allUids.sort((a, b) => a - b);
        uidsToFetch = allUids.slice(-cache.INITIAL_PAGE_SIZE);
        console.log(`[syncMailbox] initial fetch ${account.id}/${logicalMailbox}: server total=${allUids.length}, picking ${uidsToFetch.length} newest`);
      }

      async function resyncFlags(currentState) {
        const cachedUids = currentState.messages
          .map((m) => (typeof m.uid === "number" ? m.uid : null))
          .filter((u) => u != null);
        if (cachedUids.length === 0) return currentState;
        try {
          const minU = Math.min(...cachedUids);
          const maxU = Math.max(...cachedUids);
          const flagsList = await fetchFlagsByUidRange(imap, `${minU}:${maxU}`);
          const updates = new Map();
          for (const f of flagsList) updates.set(f.uid, { flagged: f.flagged, seen: f.seen });
          const { state: nextState, changed } = cache.applyFlagUpdates(currentState, updates);
          if (changed > 0) console.log(`[syncMailbox] resyncFlags ${account.id}/${logicalMailbox} updated ${changed} flags`);
          return changed > 0 ? nextState : currentState;
        } catch (err) {
          const msg = (err && err.message) || String(err);
          warn(`Flag-szinkron sikertelen — a csillag/olvasott állapot lehet, hogy elavult: ${msg}`);
          console.warn(`[syncMailbox] resyncFlags FAILED ${account.id}/${logicalMailbox}: ${msg}`);
          return currentState;
        }
      }

      const flagSyncNeeded = (Date.now() - (state.updatedAt || 0)) > 10 * 60 * 1000;

      if (uidsToFetch.length === 0) {
        let migrated = state;
        if (state.attachmentMetaVersion < ATTACHMENT_META_VERSION) {
          try {
            migrated = await refreshAttachmentFlagsFromServer(imap, state);
          } catch (err) {
            const msg = (err && err.message) || String(err);
            warn(`Csatolmány-meta frissítés sikertelen — a gemkapocs ikon elavult lehet: ${msg}`);
            console.warn(`[syncMailbox] attachment meta refresh FAILED ${account.id}/${logicalMailbox}: ${msg}`);
            migrated = { ...state, attachmentMetaVersion: ATTACHMENT_META_VERSION };
          }
        }
        const synced = flagSyncNeeded ? await resyncFlags(migrated) : migrated;
        const next = { ...synced, updatedAt: Date.now() };
        cache.write(userDataDir(), account.id, logicalMailbox, next);
        console.log(`[syncMailbox] DONE ${account.id}/${logicalMailbox} added=0 returning msgs=${next.messages.length} (+${Date.now() - tStart}ms)`);
        return { added: 0, total: box.messages.total, mailbox: logicalMailbox, messages: next.messages, updatedAt: next.updatedAt, warnings };
      }

      const minUid = Math.min(...uidsToFetch);
      const maxUid = Math.max(...uidsToFetch);
      let fetched = [];
      try {
        fetched = await fetchHeadersByUidRange(imap, `${minUid}:${maxUid}`);
      } catch (err) {
        const msg = (err && err.message) || String(err);
        warn(`Fejléc-letöltés sikertelen (UID ${minUid}:${maxUid}): ${msg}`);
        console.warn(`[syncMailbox] header fetch FAILED ${account.id}/${logicalMailbox} range=${minUid}:${maxUid}: ${msg}`);
      }
      const wanted = new Set(uidsToFetch);
      const newOnly = fetched.filter((m) => wanted.has(m.uid) && m.uid > (state.lastUid || 0));
      console.log(`[syncMailbox] fetched headers ${account.id}/${logicalMailbox} range=${minUid}:${maxUid} got=${fetched.length} newOnly=${newOnly.length}`);
      // FONTOS: a merge előtt újraolvassuk a state-et a diszkről, hogy más
      // (pl. flag-állítás) közben írt változások se vesszenek el.
      const freshState = cache.read(userDataDir(), account.id, logicalMailbox);
      const useFresh = (freshState.uidvalidity === state.uidvalidity && freshState.lastUid >= state.lastUid);
      if (!useFresh) {
        warn(`Cache race detektálva — a diszk közben frissült (disk.lastUid=${freshState.lastUid}, mem.lastUid=${state.lastUid}). A memóriabeli állapotot használjuk.`);
        console.warn(`[syncMailbox] RACE: disk diverged ${account.id}/${logicalMailbox} — disk.lastUid=${freshState.lastUid} mem.lastUid=${state.lastUid} — using in-memory state`);
      }
      const baseState = useFresh ? freshState : state;
      const merged = cache.mergeNewMessages(baseState, newOnly);
      const next = (flagSyncNeeded || newOnly.length > 0) ? await resyncFlags(merged) : merged;
      cache.write(userDataDir(), account.id, logicalMailbox, next);
      console.log(`[syncMailbox] DONE ${account.id}/${logicalMailbox} added=${newOnly.length} returning msgs=${next.messages.length} (+${Date.now() - tStart}ms)`);
      return { added: newOnly.length, total: box.messages.total, mailbox: logicalMailbox, messages: next.messages, updatedAt: next.updatedAt, warnings };
    }),
  );
}

// Lazy-load: a cache-nél régebbi leveleket tölti le (oldestUid alatt).
async function loadOlder(account, logicalMailbox, pageSize) {
  const warnings = [];
  const warn = (msg) => { warnings.push(msg); };
  return withImap(account, 120000, async (imap) => {
    let state = cache.read(userDataDir(), account.id, logicalMailbox);
    let realName = getCachedMailbox(account.id, logicalMailbox);
    if (!realName) {
      realName = await resolveMailbox(imap, logicalMailbox);
      if (realName) setCachedMailbox(account.id, logicalMailbox, realName);
    }
    if (!realName) {
      warn(`Mappa nem található a szerveren: „${logicalMailbox}".`);
      return { added: 0, mailbox: logicalMailbox, missing: true, messages: state.messages, updatedAt: state.updatedAt, warnings };
    }
    const box = await openBox(imap, realName);
    if (!state.oldestUid || state.oldestUid <= 1) {
      return { added: 0, mailbox: logicalMailbox, exhausted: true, messages: state.messages, updatedAt: state.updatedAt, warnings };
    }
    const upper = state.oldestUid - 1;
    if (upper < 1) return { added: 0, mailbox: logicalMailbox, exhausted: true, messages: state.messages, updatedAt: state.updatedAt, warnings };

    // Kérdezzük meg a szervert, mely UID-ok léteznek 1..upper között.
    // (UID-ok nem összefüggőek — a törölt levelek hézagokat hagynak, ezért
    // egy egyszerű `lower:upper` range gyakran üres halmazt vagy hibát ad.)
    const uidSearch = (criteria) => new Promise((resolve, reject) => {
      imap.search(criteria, (err, results) => (err ? reject(err) : resolve(results || [])));
    });

    let olderUids = [];
    try {
      olderUids = await uidSearch([["UID", `1:${upper}`]]);
    } catch (err) {
      const msg = (err && err.message) || String(err);
      warn(`Régebbi UID search sikertelen (UID 1:${upper}): ${msg}`);
      console.warn(`[loadOlder] search FAILED ${account.id}/${logicalMailbox}: ${msg}`);
      olderUids = [];
    }
    olderUids = olderUids.filter((u) => u >= 1 && u <= upper).sort((a, b) => a - b);

    if (!olderUids.length) {
      // Tényleg nincs több régebbi → jelöljük kimerítettnek.
      const next = { ...state, oldestUid: 1, updatedAt: Date.now() };
      cache.write(userDataDir(), account.id, logicalMailbox, next);
      return { added: 0, mailbox: logicalMailbox, exhausted: true, messages: next.messages, updatedAt: next.updatedAt, warnings };
    }

    const limit = pageSize || cache.PAGE_SIZE;
    // A legfrissebb N régebbi UID (a tetejéről).
    const pageUids = olderUids.slice(-limit);
    const minUid = Math.min(...pageUids);
    const maxUid = Math.max(...pageUids);

    let fetched = [];
    try {
      fetched = await fetchHeadersByUidRange(imap, `${minUid}:${maxUid}`);
    } catch (err) {
      const msg = (err && err.message) || String(err);
      warn(`Régebbi fejléc-letöltés sikertelen (UID ${minUid}:${maxUid}): ${msg}`);
      console.warn(`[loadOlder] header fetch FAILED ${account.id}/${logicalMailbox}: ${msg}`);
    }
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
      messages: next.messages,
      updatedAt: next.updatedAt,
      warnings,
    };
  });
}

// Egyetlen mappa szinkronizálása (UI gomb / fiókváltás háttér-sync).
ipcMain.handle("cache:syncMailbox", async (_e, { accountId, mailbox }) => {
  console.log(`[ipc cache:syncMailbox] ← ${accountId}/${mailbox}`);
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  // 3× retry exp. backoff-fal — átmeneti hibákra (timeout, ECONNRESET).
  // Permanens hibák (auth fail, missing mailbox) azonnal megálltják.
  const result = await runWithRetry(`syncMailbox ${accountId}/${mailbox}`, () =>
    syncMailbox(account, mailbox),
  );
  if (Array.isArray(result?.messages)) {
    console.log(`[ipc cache:syncMailbox] → ${accountId}/${mailbox} memory msgs=${result.messages.length} added=${result.added}`);
    return { ...result, messages: result.messages, updatedAt: result.updatedAt || Date.now() };
  }
  console.warn(`[ipc cache:syncMailbox] ${accountId}/${mailbox} no in-memory messages → fallback disk read`);
  const state = cache.read(userDataDir(), accountId, mailbox);
  return { ...result, messages: state.messages, updatedAt: state.updatedAt };
});

// Lazy-load régebbi levelek (görgetésre).
ipcMain.handle("cache:loadOlder", async (_e, { accountId, mailbox, pageSize }) => {
  console.log(`[ipc cache:loadOlder] ← ${accountId}/${mailbox} pageSize=${pageSize}`);
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  // 3× retry exp. backoff-fal (lásd syncMailbox kommentet).
  const result = await runWithRetry(`loadOlder ${accountId}/${mailbox}`, () =>
    loadOlder(account, mailbox, pageSize),
  );
  if (Array.isArray(result?.messages)) {
    console.log(`[ipc cache:loadOlder] → ${accountId}/${mailbox} memory msgs=${result.messages.length} added=${result.added} exhausted=${!!result.exhausted}`);
    return { ...result, messages: result.messages, updatedAt: result.updatedAt || Date.now() };
  }
  console.warn(`[ipc cache:loadOlder] ${accountId}/${mailbox} no in-memory messages → fallback disk read`);
  const state = cache.read(userDataDir(), accountId, mailbox);
  return { ...result, messages: state.messages, updatedAt: state.updatedAt };
});

// Levél flag-ek beállítása (\\Flagged = csillag, \\Seen = olvasott).
// patch: { flagged?: boolean, seen?: boolean }
async function setMessageFlags(account, logicalMailbox, uid, patch) {
  return withImap(account, 30000, async (imap) => {
    let realName = getCachedMailbox(account.id, logicalMailbox);
    if (!realName) {
      realName = await resolveMailbox(imap, logicalMailbox);
      if (realName) setCachedMailbox(account.id, logicalMailbox, realName);
    }
    if (!realName) throw new Error(`Mappa nem található: ${logicalMailbox}`);
    await openBox(imap, realName, false); // RW mód a flag-íráshoz

    const numericUid = Number(uid);
    if (!numericUid || Number.isNaN(numericUid)) throw new Error("Érvénytelen UID");

    const addFlags = (flags) => new Promise((resolve, reject) => {
      imap.addFlags(numericUid, flags, (err) => (err ? reject(err) : resolve()));
    });
    const delFlags = (flags) => new Promise((resolve, reject) => {
      imap.delFlags(numericUid, flags, (err) => (err ? reject(err) : resolve()));
    });

    if (typeof patch.flagged === "boolean") {
      if (patch.flagged) await addFlags(["\\Flagged"]);
      else await delFlags(["\\Flagged"]);
    }
    if (typeof patch.seen === "boolean") {
      if (patch.seen) await addFlags(["\\Seen"]);
      else await delFlags(["\\Seen"]);
    }

    // Cache frissítése a renderer kérése alapján — szervervisszaolvasás nélkül,
    // hogy gyors legyen; a következő syncMailbox úgyis felülírja a friss flags-szel.
    const state = cache.read(userDataDir(), account.id, logicalMailbox);
    const next = cache.updateMessageFlags(state, numericUid, patch);
    cache.write(userDataDir(), account.id, logicalMailbox, next);
    return { ok: true, messages: next.messages, updatedAt: next.updatedAt };
  });
}

ipcMain.handle("mail:setFlag", async (_e, { accountId, mailbox, uid, patch }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  return setMessageFlags(account, mailbox, uid, patch || {});
});

// Levél(ek) törlése: ha a Trash mappából töröljük → \\Deleted + EXPUNGE (végleges).
// Egyébként → áthelyezés a Trash mappába (MOVE; ha nincs MOVE támogatás, COPY+DELETE+EXPUNGE).
async function deleteMessages(account, logicalMailbox, uids) {
  const numericUids = (Array.isArray(uids) ? uids : [uids])
    .map((u) => Number(u))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (numericUids.length === 0) throw new Error("Érvénytelen UID");

  return withImap(account, 60000, async (imap) => {
    let realName = getCachedMailbox(account.id, logicalMailbox);
    if (!realName) {
      realName = await resolveMailbox(imap, logicalMailbox);
      if (realName) setCachedMailbox(account.id, logicalMailbox, realName);
    }
    if (!realName) throw new Error(`Mappa nem található: ${logicalMailbox}`);

    const isTrash = String(logicalMailbox).toLowerCase().includes("trash")
      || String(realName).toLowerCase().includes("trash")
      || String(realName).toLowerCase().includes("kuka")
      || String(realName).toLowerCase().includes("deleted");

    await openBox(imap, realName, false);

    const addDeleted = () => new Promise((resolve, reject) => {
      imap.addFlags(numericUids, ["\\Deleted"], (err) => (err ? reject(err) : resolve()));
    });
    const expunge = () => new Promise((resolve, reject) => {
      imap.expunge((err) => (err ? reject(err) : resolve()));
    });
    const move = (target) => new Promise((resolve, reject) => {
      imap.move(numericUids, target, (err) => (err ? reject(err) : resolve()));
    });
    const copy = (target) => new Promise((resolve, reject) => {
      imap.copy(numericUids, target, (err) => (err ? reject(err) : resolve()));
    });

    let mode = isTrash ? "expunge" : "move";
    let trashName = null;

    if (!isTrash) {
      // Próbáljuk meg a Trash mappát feloldani; ha nincs, kényszerített \\Deleted+EXPUNGE.
      trashName = getCachedMailbox(account.id, "Trash");
      if (!trashName) {
        try {
          trashName = await resolveMailbox(imap, "Trash");
          if (trashName) setCachedMailbox(account.id, "Trash", trashName);
        } catch { /* ignore */ }
      }
      if (!trashName) {
        console.warn("[mail.delete] Trash mappa nem található → végleges törlés EXPUNGE-zsal");
        mode = "expunge";
      }
    }

    if (mode === "expunge") {
      await addDeleted();
      await expunge();
    } else {
      try {
        await move(trashName);
      } catch (e) {
        console.warn(`[mail.delete] MOVE sikertelen (${e?.message}), fallback COPY+DELETE+EXPUNGE`);
        await copy(trashName);
        await addDeleted();
        await expunge();
      }
    }

    // Cache frissítése: töröljük az érintett UID-okat a forrás mappából.
    const state = cache.read(userDataDir(), account.id, logicalMailbox);
    const next = cache.removeMessages(state, numericUids);
    cache.write(userDataDir(), account.id, logicalMailbox, next);

    return {
      ok: true,
      mode,
      removedUids: numericUids,
      messages: next.messages,
      updatedAt: next.updatedAt,
    };
  });
}

ipcMain.handle("mail:delete", async (_e, { accountId, mailbox, uid, uids }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  const list = Array.isArray(uids) && uids.length ? uids : [uid];
  return deleteMessages(account, mailbox, list);
});


// Egyetlen levél teljes body-jának lazy letöltése. A lista-szinkron már csak
// fejléceket húz le (gyors), így a body-t akkor töltjük le, amikor a felhasználó
// megnyit egy levelet. Eredmény bekerül a cache-be (bodyLoaded=true).
async function loadMessageBody(account, logicalMailbox, uid) {
  return withImap(account, 30000, async (imap) => {
    let realName = getCachedMailbox(account.id, logicalMailbox);
    if (!realName) {
      realName = await resolveMailbox(imap, logicalMailbox);
      if (realName) setCachedMailbox(account.id, logicalMailbox, realName);
    }
    if (!realName) throw new Error(`Mappa nem található: ${logicalMailbox}`);
    await openBox(imap, realName);
    const numericUid = Number(uid);
    if (!numericUid || Number.isNaN(numericUid)) throw new Error("Érvénytelen UID");
    const body = await fetchBodyByUid(imap, numericUid);
    if (!body) return { ok: false, reason: "not-found" };
    const state = cache.read(userDataDir(), account.id, logicalMailbox);
    const next = cache.updateMessageBody(state, numericUid, body);
    cache.write(userDataDir(), account.id, logicalMailbox, next);
    const updated = next.messages.find((m) => m.uid === numericUid) || null;
    // A body-t is rámergeljuk a cache-objektumra, hogy a friss `attachments`
    // és `hasAttachments` mezők mindenképp megérkezzenek a renderernek —
    // akkor is, ha a cache valamiért régi adatot adna vissza.
    const merged = updated
      ? {
          ...updated,
          text: body.text ?? updated.text,
          html: body.html ?? updated.html,
          snippet: body.snippet ?? updated.snippet,
          attachments: Array.isArray(body.attachments) ? body.attachments : (updated.attachments || []),
          hasAttachments: typeof body.hasAttachments === "boolean" ? body.hasAttachments : !!updated.hasAttachments,
          bodyLoaded: true,
        }
      : { ...body, bodyLoaded: true };
    return { ok: true, message: merged };
  });
}

ipcMain.handle("mail:fetchBody", async (_e, { accountId, mailbox, uid }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  return loadMessageBody(account, mailbox, uid);
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
  const results = await Promise.allSettled(
    ["INBOX", "Drafts"].map(async (mb) => {
      try {
        const r = await syncMailbox(account, mb);
        return { mailbox: mb, ok: true, added: r.added, missing: !!r.missing };
      } catch (e) {
        return { mailbox: mb, ok: false, error: String(e?.message || e) };
      }
    }),
  );
  return {
    ok: true,
    results: results.map((r) => (r.status === "fulfilled" ? r.value : { mailbox: "unknown", ok: false, error: r.reason })),
  };
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
  const tStart = Date.now();
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) {
    console.warn(`[smtp] missing account ${accountId}`);
    throw new Error("A fiók nem található.");
  }
  if (!account.smtpHost) {
    console.warn(`[smtp] account ${account.id} has no smtpHost configured`);
    throw new Error("Hiányzó SMTP szerver — szerkeszd a fiókot.");
  }
  const smtpUser = account.smtpUser || account.authUser || account.user;
  const smtpPass = decryptPassword(account.smtpPassword || account.password);
  if (!smtpUser || !smtpPass) {
    console.warn(`[smtp] account ${account.id} missing credentials (user=${!!smtpUser} pass=${!!smtpPass})`);
    throw new Error("Hiányzó SMTP felhasználónév vagy jelszó — szerkeszd a fiókot és add meg újra a jelszót.");
  }
  // STARTTLS heurisztika: 587-es port → secure=false + requireTLS, 465 → secure=true.
  const port = account.smtpPort || 465;
  const explicitSecure = typeof account.smtpSecure === "boolean";
  const secure = explicitSecure ? account.smtpSecure : port === 465;

  const countAddr = (s) => (s ? String(s).split(",").map((x) => x.trim()).filter(Boolean).length : 0);
  const subjectPreview = (subject || "").slice(0, 80).replace(/\s+/g, " ");
  console.log(
    `[smtp] send begin acct=${account.id} host=${account.smtpHost}:${port} secure=${secure} requireTLS=${!secure} user=${smtpUser} to=${countAddr(to)} cc=${countAddr(cc)} bcc=${countAddr(bcc)} subject="${subjectPreview}"`,
  );

  // Nodemailer belső naplójának átkötése a saját [smtp] csatornánkra, hogy
  // a teljes SMTP-párbeszéd (EHLO/STARTTLS/AUTH/MAIL FROM/RCPT/DATA) is
  // bekerüljön a Hibanapló fájlba. A jelszót/AUTH base64 sorokat redaktáljuk.
  const smtpLogger = {
    debug: (entry, ...args) => console.log(`[smtp] dbg ${redactSmtp(formatSmtpEntry(entry, args))}`),
    info:  (entry, ...args) => console.log(`[smtp] inf ${redactSmtp(formatSmtpEntry(entry, args))}`),
    warn:  (entry, ...args) => console.warn(`[smtp] wrn ${redactSmtp(formatSmtpEntry(entry, args))}`),
    error: (entry, ...args) => console.error(`[smtp] err ${redactSmtp(formatSmtpEntry(entry, args))}`),
  };

  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port,
    secure,
    requireTLS: !secure, // STARTTLS kötelezővé tétele 587-en
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
    connectionTimeout: 30000,
    greetingTimeout: 20000,
    socketTimeout: 60000,
    logger: smtpLogger,
    debug: true,
  });
  const fromAddress = account.displayName
    ? `"${String(account.displayName).replace(/"/g, '\\"')}" <${account.user}>`
    : account.from || account.user;
  try {
    // 3× retry exp. backoff-fal — átmeneti hibákra (pl. timeout, ECONNRESET,
    // 4xx greylisting). Permanens hibáknál (5xx, AUTH fail) az első próba
    // után azonnal megáll, nem húzzuk a felhasználó idegeit.
    const info = await runWithRetry(`smtp:send acct=${account.id}`, async (attempt) => {
      if (attempt > 1) {
        console.log(`[smtp] retry attempt=${attempt} acct=${account.id} ${account.smtpHost}:${port}`);
      }
      return await transporter.sendMail({
        from: fromAddress,
        to, cc, bcc, subject, html, text,
      });
    });
    const dur = Date.now() - tStart;
    const accepted = (info.accepted || []).length;
    const rejected = (info.rejected || []).length;
    const response = String(info.response || "").slice(0, 200);
    console.log(
      `[smtp] sent acct=${account.id} ${account.smtpHost}:${port} secure=${secure} messageId=${info.messageId} accepted=${accepted} rejected=${rejected} response="${response}" duration=${dur}ms`,
    );
    if (rejected > 0) {
      console.warn(`[smtp] partial reject acct=${account.id} rejected=${JSON.stringify(info.rejected)}`);
    }
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const code = err?.code || err?.responseCode || "?";
    const command = err?.command || "?";
    const responseCode = err?.responseCode || "";
    const detail = err?.response || err?.message || String(err);
    const stack = err?.stack ? String(err.stack).split("\n").slice(0, 4).join(" | ") : "";
    const dur = Date.now() - tStart;
    const permanent = isPermanentError(err);
    console.error(
      `[smtp] FAILED acct=${account.id} ${account.smtpHost}:${port} secure=${secure} permanent=${permanent} code=${code} responseCode=${responseCode} command=${command} duration=${dur}ms — ${detail}`,
    );
    if (stack) console.error(`[smtp] stack: ${stack}`);

    // Sikertelen küldés → mentsük a szerver Drafts mappájába, hogy ne vesszen el
    // a fáradságos szöveg. Best-effort: ha ez is hibára fut, csak logoljuk.
    let draftSaved = false;
    let draftError = null;
    try {
      console.log(`[smtp] saving failed send to server Drafts acct=${account.id}`);
      const raw = await buildRawMime(account, { to, cc, bcc, subject, html, text });
      await withImap(account, 60000, async (imap) => {
        let realName = getCachedMailbox(account.id, "Drafts");
        if (!realName) {
          realName = await resolveMailbox(imap, "Drafts");
          if (realName) setCachedMailbox(account.id, "Drafts", realName);
        }
        if (!realName) throw new Error("Drafts mappa nem található a szerveren.");
        await appendToMailbox(imap, realName, raw, ["\\Draft"]);
      });
      draftSaved = true;
      console.log(`[smtp] failed send saved to Drafts acct=${account.id}`);
      // Inkrementális szinkron a háttérben, ne blokkolja a hibadobást.
      syncMailbox(account, "Drafts").catch((e) => {
        console.warn(`[smtp] post-fail Drafts sync error: ${e?.message || e}`);
      });
    } catch (saveErr) {
      draftError = saveErr?.message || String(saveErr);
      console.warn(`[smtp] failed to save to Drafts after send error: ${draftError}`);
    }

    // Részletesebb hibaüzenet a felhasználónak — benne a kategória és a Drafts-mentés státusza.
    const category = permanent ? "végleges" : "átmeneti, 3 próbálkozás után";
    const draftNote = draftSaved
      ? " A piszkozat a szerver Drafts mappájába mentve."
      : (draftError ? ` Drafts-mentés is sikertelen: ${draftError}` : "");
    const userMsg = `SMTP hiba (${category}, ${code}): ${detail}.${draftNote}`;
    const e = new Error(userMsg);
    e.code = code;
    e.permanent = permanent;
    e.draftSaved = draftSaved;
    throw e;
  } finally {
    try { transporter.close(); } catch { /* ignore */ }
  }
});

// Nodemailer logger payload formázása emberi sorrá. Az `entry` általában
// `{ tnx, sid, cid }` típusú metaadat, az args az üzenet darabjai.
function formatSmtpEntry(entry, args) {
  let prefix = "";
  if (entry && typeof entry === "object") {
    const parts = [];
    if (entry.tnx) parts.push(`tnx=${entry.tnx}`);
    if (entry.sid) parts.push(`sid=${entry.sid}`);
    if (entry.cid) parts.push(`cid=${entry.cid}`);
    if (parts.length) prefix = `[${parts.join(" ")}] `;
  } else if (typeof entry === "string") {
    return [entry, ...args].join(" ");
  }
  return prefix + args.map((a) => (typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(" ");
}

// Érzékeny sorok redaktálása az SMTP párbeszédből (AUTH base64, jelszó).
function redactSmtp(line) {
  if (!line) return line;
  return String(line)
    .replace(/(AUTH\s+\S+\s+)\S+/gi, "$1[REDACTED]")
    .replace(/(AUTH\s+PLAIN\s+)\S+/gi, "$1[REDACTED]")
    .replace(/(AUTH\s+LOGIN[\s\S]*?\n)[A-Za-z0-9+/=]{8,}/g, "$1[REDACTED]")
    .replace(/(pass(?:word)?["':=\s]+)["']?[^"'\s,}]+/gi, "$1[REDACTED]");
}

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
    // FONTOS: a node-imap `append()` opciók közé NE tegyünk `date` mezőt.
    // A node-imap belső `buildSearchQuery`/argument-formázója egy `isDate`
    // helpert hív, ami egyes Node verziókban már nincs az `util` modulban
    // (pl. Node 20+), és „TypeError: isDate is not a function" hibát dob.
    // Date nélkül a szerver a saját aktuális idejét rendeli a levélhez,
    // ami piszkozatnál teljesen elfogadható.
    imap.append(raw, { mailbox, flags: flags || [] }, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

ipcMain.handle("imap:appendDraft", async (_e, { accountId, to, cc, bcc, subject, html, text }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("A fiók nem található.");
  const raw = await buildRawMime(account, { to, cc, bcc, subject, html, text });
  await withImap(account, 60000, async (imap) => {
    let realName = getCachedMailbox(account.id, "Drafts");
    if (!realName) {
      realName = await resolveMailbox(imap, "Drafts");
      if (realName) setCachedMailbox(account.id, "Drafts", realName);
    }
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

// ---- Ablakméret/pozíció megőrzése ----
// Megnyitáskor visszaállítjuk az utoljára használt méretet, pozíciót és
// maximalizált állapotot, hogy ne kelljen minden indulásnál újrahúzni az
// ablakot. A bezáráskor (és resize/move közben debouncolva) elmentjük a
// `window-state.json` állományba a felhasználói adatkönyvtárban.
//
// Két külön kulcs: "main" (fő ablak) és "message" (egy-üzenet ablakok).

const { screen } = require("electron");

const WINDOW_DEFAULTS = {
  main:    { width: 1280, height: 820, minWidth: 920, minHeight: 600 },
  message: { width: 900,  height: 720, minWidth: 560, minHeight: 420 },
};

function loadWindowState(key) {
  const all = readStore("window-state", {});
  const s = all && typeof all === "object" ? all[key] : null;
  if (!s || typeof s !== "object") return null;
  return s;
}

function saveWindowState(key, state) {
  const all = readStore("window-state", {}) || {};
  all[key] = state;
  writeStore("window-state", all);
}

// Egy mentett { x, y, width, height } érték csak akkor használható, ha
// továbbra is van olyan kijelző, amibe legalább részben belelóg. Ezzel
// elkerüljük, hogy egy levált monitor miatt láthatatlanná váljon az ablak.
function isBoundsVisible(bounds) {
  if (!bounds || typeof bounds.x !== "number" || typeof bounds.y !== "number") return false;
  try {
    const displays = screen.getAllDisplays();
    return displays.some((d) => {
      const a = d.workArea;
      const overlapX = Math.max(0, Math.min(bounds.x + bounds.width,  a.x + a.width)  - Math.max(bounds.x, a.x));
      const overlapY = Math.max(0, Math.min(bounds.y + bounds.height, a.y + a.height) - Math.max(bounds.y, a.y));
      // Legalább 100×100 pixel látszódjon.
      return overlapX >= 100 && overlapY >= 100;
    });
  } catch {
    return true;
  }
}

// Bekötés: figyeli a resize/move/maximize/unmaximize/close eseményeket és
// debouncolva menti a méretet. Bezáráskor utolsó snapshotot is ír.
function attachWindowStatePersistence(win, key) {
  let saveTimer = null;
  const persist = () => {
    try {
      if (win.isDestroyed()) return;
      const isMax = win.isMaximized();
      // Maximalizált állapotban a getBounds() a nem-maximalizált alapot adja
      // vissza macOS-en, de Win/Linux-on a teljes képernyőt — emiatt csak
      // akkor írjuk felül a bounds-ot, ha NEM maximalizált.
      const state = { maximized: isMax };
      if (!isMax) {
        const b = win.getBounds();
        state.x = b.x; state.y = b.y; state.width = b.width; state.height = b.height;
      } else {
        // Maximalizált esetben tartsuk meg az előző normál bounds-ot, hogy
        // az unmaximize-kor visszakapja a méretét.
        const prev = loadWindowState(key) || {};
        state.x = prev.x; state.y = prev.y;
        state.width = prev.width; state.height = prev.height;
      }
      saveWindowState(key, state);
    } catch (e) {
      console.warn(`[window-state] save failed (${key}): ${e?.message || e}`);
    }
  };
  const schedule = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  };
  win.on("resize", schedule);
  win.on("move", schedule);
  win.on("maximize", persist);
  win.on("unmaximize", persist);
  win.on("close", () => { if (saveTimer) clearTimeout(saveTimer); persist(); });
}

// A mentett állapotot összefésüli az alapértelmezésekkel, és visszaadja a
// `BrowserWindow` konstruktornak átadható objektumot (csak a látható-kijelző
// teszten átment koordinátákat őrzi meg).
function buildWindowOptions(key) {
  const def = WINDOW_DEFAULTS[key];
  const saved = loadWindowState(key);
  const opts = {
    width: saved?.width ?? def.width,
    height: saved?.height ?? def.height,
    minWidth: def.minWidth,
    minHeight: def.minHeight,
  };
  if (saved && isBoundsVisible({ x: saved.x, y: saved.y, width: opts.width, height: opts.height })) {
    opts.x = saved.x;
    opts.y = saved.y;
  }
  return { opts, savedMaximized: !!saved?.maximized };
}

function createWindow() {
  const { opts, savedMaximized } = buildWindowOptions("main");
  const win = new BrowserWindow({
    ...opts,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f5f6f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (savedMaximized) win.maximize();
  attachWindowStatePersistence(win, "main");
  mainWindow = win;
  win.on("closed", () => { if (mainWindow === win) mainWindow = null; });
  loadRoute(win, "");
}

// Egy levél megnyitása új ablakban (dupla kattintás a listában).
function openMessageWindow({ accountId, mailbox, seqno, uid }) {
  const { opts, savedMaximized } = buildWindowOptions("message");
  const win = new BrowserWindow({
    ...opts,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f5f6f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (savedMaximized) win.maximize();
  attachWindowStatePersistence(win, "message");
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
    // Fiókonként párhuzamos INBOX-szinkron — sokfiókos esetben drasztikusan
    // gyorsabb, mintha sorban várnánk az IMAP körutakra.
    await Promise.allSettled(accounts.map(async (account) => {
      try {
        const r = await syncMailbox(account, "INBOX");
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("mail:auto-synced", {
            accountId: account.id,
            mailbox: "INBOX",
            added: (r && r.added) || 0,
          });
        }
      } catch (e) {
        console.error("[auto-sync] hiba:", account.id, e?.message || e);
      }
    }));
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
