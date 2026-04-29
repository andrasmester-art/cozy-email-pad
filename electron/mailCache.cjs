// SQLite-based local cache for IMAP messages.
// Stores every message body (text + html) so the app works offline and only
// the *new* messages are pulled from the server on each sync.
//
// Schema:
//   meta(account_id, mailbox, uidvalidity, last_uid)  — per mailbox state
//   messages(account_id, mailbox, uid, ...)            — message bodies
//
// UIDVALIDITY: if it changes, the server has rebuilt UIDs and we must wipe
// the cache for that mailbox.

const path = require("path");
const fs = require("fs");
const { app } = require("electron");

let Database;
try {
  Database = require("better-sqlite3");
} catch (e) {
  console.error("[cache] better-sqlite3 missing — falling back to no-cache mode", e);
}

let db = null;

function open() {
  if (db || !Database) return db;
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "mail-cache.sqlite");
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      account_id TEXT NOT NULL,
      mailbox    TEXT NOT NULL,
      uidvalidity INTEGER,
      last_uid   INTEGER NOT NULL DEFAULT 0,
      last_sync  INTEGER,
      PRIMARY KEY (account_id, mailbox)
    );
    CREATE TABLE IF NOT EXISTS messages (
      account_id TEXT NOT NULL,
      mailbox    TEXT NOT NULL,
      uid        INTEGER NOT NULL,
      seqno      INTEGER,
      message_id TEXT,
      from_addr  TEXT,
      to_addr    TEXT,
      subject    TEXT,
      date       TEXT,
      text       TEXT,
      html       TEXT,
      snippet    TEXT,
      PRIMARY KEY (account_id, mailbox, uid)
    );
    CREATE INDEX IF NOT EXISTS idx_msg_date
      ON messages(account_id, mailbox, date DESC);
  `);
  return db;
}

function getMeta(accountId, mailbox) {
  const d = open();
  if (!d) return null;
  return d.prepare(
    "SELECT uidvalidity, last_uid, last_sync FROM meta WHERE account_id = ? AND mailbox = ?"
  ).get(accountId, mailbox) || null;
}

function setMeta(accountId, mailbox, { uidvalidity, last_uid }) {
  const d = open();
  if (!d) return;
  d.prepare(`
    INSERT INTO meta (account_id, mailbox, uidvalidity, last_uid, last_sync)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account_id, mailbox) DO UPDATE SET
      uidvalidity = excluded.uidvalidity,
      last_uid    = excluded.last_uid,
      last_sync   = excluded.last_sync
  `).run(accountId, mailbox, uidvalidity ?? null, last_uid, Date.now());
}

function wipeMailbox(accountId, mailbox) {
  const d = open();
  if (!d) return;
  d.prepare("DELETE FROM messages WHERE account_id = ? AND mailbox = ?")
    .run(accountId, mailbox);
  d.prepare("DELETE FROM meta WHERE account_id = ? AND mailbox = ?")
    .run(accountId, mailbox);
}

function wipeAccount(accountId) {
  const d = open();
  if (!d) return;
  d.prepare("DELETE FROM messages WHERE account_id = ?").run(accountId);
  d.prepare("DELETE FROM meta WHERE account_id = ?").run(accountId);
}

const insertStmt = () => open().prepare(`
  INSERT INTO messages
    (account_id, mailbox, uid, seqno, message_id, from_addr, to_addr,
     subject, date, text, html, snippet)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(account_id, mailbox, uid) DO UPDATE SET
    seqno = excluded.seqno,
    message_id = excluded.message_id,
    from_addr  = excluded.from_addr,
    to_addr    = excluded.to_addr,
    subject    = excluded.subject,
    date       = excluded.date,
    text       = excluded.text,
    html       = excluded.html,
    snippet    = excluded.snippet
`);

function insertMessages(accountId, mailbox, messages) {
  const d = open();
  if (!d || messages.length === 0) return;
  const stmt = insertStmt();
  const tx = d.transaction((rows) => {
    for (const m of rows) {
      stmt.run(
        accountId, mailbox,
        m.uid, m.seqno || null, m.messageId || null,
        m.from || "", m.to || "",
        m.subject || "", m.date || null,
        m.text || "", m.html || "", m.snippet || "",
      );
    }
  });
  tx(messages);
}

function listMessages(accountId, mailbox, limit = 200) {
  const d = open();
  if (!d) return [];
  const rows = d.prepare(`
    SELECT uid, seqno, message_id, from_addr, to_addr, subject, date, text, html, snippet
    FROM messages
    WHERE account_id = ? AND mailbox = ?
    ORDER BY (CASE WHEN date IS NULL THEN 0 ELSE 1 END) DESC, date DESC, uid DESC
    LIMIT ?
  `).all(accountId, mailbox, limit);
  return rows.map((r) => ({
    seqno: r.seqno || r.uid,
    uid: r.message_id || String(r.uid),
    from: r.from_addr,
    to: r.to_addr,
    subject: r.subject,
    date: r.date,
    text: r.text,
    html: r.html,
    snippet: r.snippet,
  }));
}

function countMessages(accountId, mailbox) {
  const d = open();
  if (!d) return 0;
  return d.prepare(
    "SELECT COUNT(*) AS n FROM messages WHERE account_id = ? AND mailbox = ?"
  ).get(accountId, mailbox).n;
}

module.exports = {
  open,
  getMeta,
  setMeta,
  wipeMailbox,
  wipeAccount,
  insertMessages,
  listMessages,
  countMessages,
  available: () => !!Database,
};
