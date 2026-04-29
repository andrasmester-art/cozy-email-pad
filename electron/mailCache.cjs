// Egyszerű JSON-alapú per-fiók/per-mappa lokális üzenet cache.
//
// Tárolási hely: <userData>/mailcache/<accountId>/<sanitizedMailbox>.json
//
// Fájl séma:
// {
//   uidvalidity: number | null,   // IMAP UIDVALIDITY — ha változik, a cache invalid
//   lastUid: number,              // a legnagyobb UID, amit már lehúztunk
//   updatedAt: number,            // utolsó sikeres szinkron timestamp
//   messages: Message[]           // legfrissebb elöl; max MAX_PER_MAILBOX
// }
//
// Egy fiók törlésekor a teljes mappa törlődik (purgeAccount).

const fs = require("fs");
const path = require("path");

const MAX_PER_MAILBOX = 1000;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(s) {
  return String(s || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "_";
}

function cacheRoot(userDataDir) {
  return path.join(userDataDir, "mailcache");
}

function accountDir(userDataDir, accountId) {
  return path.join(cacheRoot(userDataDir), safeName(accountId));
}

function mailboxFile(userDataDir, accountId, mailbox) {
  return path.join(accountDir(userDataDir, accountId), `${safeName(mailbox)}.json`);
}

function emptyState() {
  return { uidvalidity: null, lastUid: 0, updatedAt: 0, messages: [] };
}

function read(userDataDir, accountId, mailbox) {
  try {
    const raw = fs.readFileSync(mailboxFile(userDataDir, accountId, mailbox), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyState();
    return {
      uidvalidity: parsed.uidvalidity ?? null,
      lastUid: typeof parsed.lastUid === "number" ? parsed.lastUid : 0,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
  } catch {
    return emptyState();
  }
}

function write(userDataDir, accountId, mailbox, state) {
  ensureDir(accountDir(userDataDir, accountId));
  const trimmed = {
    uidvalidity: state.uidvalidity ?? null,
    lastUid: state.lastUid || 0,
    updatedAt: state.updatedAt || Date.now(),
    messages: (state.messages || []).slice(0, MAX_PER_MAILBOX),
  };
  fs.writeFileSync(
    mailboxFile(userDataDir, accountId, mailbox),
    JSON.stringify(trimmed),
  );
}

// Új üzeneteket fűz a cache elejére, dedupol UID alapján, frissíti a lastUid-ot.
function mergeNewMessages(state, newMessages) {
  const seen = new Set(state.messages.map((m) => m.uid).filter((u) => u != null));
  const filtered = newMessages.filter((m) => m.uid != null && !seen.has(m.uid));
  // Newest-first sorrend
  const merged = [...filtered, ...state.messages].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });
  const maxUid = merged.reduce((m, x) => (x.uid > m ? x.uid : m), state.lastUid || 0);
  return {
    ...state,
    lastUid: maxUid,
    updatedAt: Date.now(),
    messages: merged.slice(0, MAX_PER_MAILBOX),
  };
}

// UIDVALIDITY változás → minden cache-elt levél invalid, tiszta lap.
function reset(uidvalidity) {
  return {
    uidvalidity: uidvalidity ?? null,
    lastUid: 0,
    updatedAt: Date.now(),
    messages: [],
  };
}

function purgeAccount(userDataDir, accountId) {
  try {
    fs.rmSync(accountDir(userDataDir, accountId), { recursive: true, force: true });
  } catch { /* ignore */ }
}

module.exports = {
  MAX_PER_MAILBOX,
  read,
  write,
  mergeNewMessages,
  reset,
  purgeAccount,
};
