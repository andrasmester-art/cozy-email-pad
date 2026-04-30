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

const MAX_PER_MAILBOX = 5000;
const INITIAL_PAGE_SIZE = 200;
const PAGE_SIZE = 200;

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
  // oldestUid: a legrégebbi UID, amit már lehúztunk; ennél kisebbeket lazy-load tölt
  return { uidvalidity: null, lastUid: 0, oldestUid: 0, updatedAt: 0, messages: [] };
}

function read(userDataDir, accountId, mailbox) {
  const file = mailboxFile(userDataDir, accountId, mailbox);
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      console.warn(`[cache.read] MISS (invalid JSON shape) ${accountId}/${mailbox} file=${file}`);
      return emptyState();
    }
    const state = {
      uidvalidity: parsed.uidvalidity ?? null,
      lastUid: typeof parsed.lastUid === "number" ? parsed.lastUid : 0,
      oldestUid: typeof parsed.oldestUid === "number" ? parsed.oldestUid : 0,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
    const ageMs = state.updatedAt ? (Date.now() - state.updatedAt) : -1;
    console.log(
      `[cache.read] HIT ${accountId}/${mailbox} msgs=${state.messages.length} lastUid=${state.lastUid} oldestUid=${state.oldestUid} uidvalidity=${state.uidvalidity} updatedAt=${state.updatedAt}(age=${ageMs}ms)`,
    );
    return state;
  } catch (err) {
    const code = err && err.code;
    if (code === "ENOENT") {
      console.log(`[cache.read] MISS (no file) ${accountId}/${mailbox}`);
    } else {
      console.warn(`[cache.read] MISS (${code || "parse error"}) ${accountId}/${mailbox}: ${err && err.message}`);
    }
    return emptyState();
  }
}

function write(userDataDir, accountId, mailbox, state) {
  ensureDir(accountDir(userDataDir, accountId));
  const trimmed = {
    uidvalidity: state.uidvalidity ?? null,
    lastUid: state.lastUid || 0,
    oldestUid: state.oldestUid || 0,
    updatedAt: state.updatedAt || Date.now(),
    messages: (state.messages || []).slice(0, MAX_PER_MAILBOX),
  };
  const file = mailboxFile(userDataDir, accountId, mailbox);
  const t0 = Date.now();
  console.log(
    `[cache.write] start ${accountId}/${mailbox} msgs=${trimmed.messages.length} lastUid=${trimmed.lastUid} oldestUid=${trimmed.oldestUid} updatedAt=${trimmed.updatedAt}`,
  );
  fs.writeFile(
    file,
    JSON.stringify(trimmed),
    (err) => {
      if (err) {
        console.error(`[cache.write] FAIL ${accountId}/${mailbox} (${err.code || "?"}): ${err.message}`);
      } else {
        console.log(`[cache.write] ok ${accountId}/${mailbox} in ${Date.now() - t0}ms`);
      }
    },
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
  const allUids = merged.map((m) => m.uid).filter((u) => typeof u === "number");
  const maxUid = allUids.length ? Math.max(...allUids) : (state.lastUid || 0);
  const minUid = allUids.length ? Math.min(...allUids) : (state.oldestUid || 0);
  return {
    ...state,
    lastUid: maxUid,
    oldestUid: state.oldestUid && state.oldestUid > 0 ? Math.min(state.oldestUid, minUid) : minUid,
    updatedAt: Date.now(),
    messages: merged.slice(0, MAX_PER_MAILBOX),
  };
}

// UIDVALIDITY változás → minden cache-elt levél invalid, tiszta lap.
function reset(uidvalidity) {
  return {
    uidvalidity: uidvalidity ?? null,
    lastUid: 0,
    oldestUid: 0,
    updatedAt: Date.now(),
    messages: [],
  };
}

function purgeAccount(userDataDir, accountId) {
  try {
    fs.rmSync(accountDir(userDataDir, accountId), { recursive: true, force: true });
  } catch { /* ignore */ }
}

// Egyetlen üzenet flag-jeit frissíti uid alapján a state-ben (in-place új objektum).
function updateMessageFlags(state, uid, patch) {
  const idx = state.messages.findIndex((m) => m.uid === uid);
  if (idx < 0) return state;
  const next = state.messages.slice();
  next[idx] = { ...next[idx], ...patch };
  return { ...state, messages: next, updatedAt: Date.now() };
}

// Több UID flag-jeit frissíti egy menetben. updates: Map<uid, { flagged?, seen? }>.
// Visszaadja az új state-et + a ténylegesen módosult UID-okat.
function applyFlagUpdates(state, updates) {
  let changed = 0;
  const next = state.messages.map((m) => {
    if (m.uid == null) return m;
    const upd = updates.get(m.uid);
    if (!upd) return m;
    const newFlagged = typeof upd.flagged === "boolean" ? upd.flagged : !!m.flagged;
    const newSeen = typeof upd.seen === "boolean" ? upd.seen : (m.seen !== false);
    if ((!!m.flagged) === newFlagged && (m.seen !== false) === newSeen) return m;
    changed++;
    return { ...m, flagged: newFlagged, seen: newSeen };
  });
  if (changed === 0) return { state, changed: 0 };
  return { state: { ...state, messages: next, updatedAt: Date.now() }, changed };
}

// Egyetlen üzenet body-mezőit (text/html/snippet/bodyLoaded) frissíti.
function updateMessageBody(state, uid, body) {
  const idx = state.messages.findIndex((m) => m.uid === uid);
  if (idx < 0) return state;
  const next = state.messages.slice();
  next[idx] = {
    ...next[idx],
    text: body.text ?? next[idx].text ?? "",
    html: body.html ?? next[idx].html ?? "",
    snippet: body.snippet ?? next[idx].snippet ?? "",
    bodyLoaded: true,
    flagged: typeof body.flagged === "boolean" ? body.flagged : next[idx].flagged,
    seen: typeof body.seen === "boolean" ? body.seen : next[idx].seen,
  };
  return { ...state, messages: next, updatedAt: Date.now() };
}

module.exports = {
  MAX_PER_MAILBOX,
  INITIAL_PAGE_SIZE,
  PAGE_SIZE,
  read,
  write,
  mergeNewMessages,
  updateMessageFlags,
  updateMessageBody,
  applyFlagUpdates,
  reset,
  purgeAccount,
};
