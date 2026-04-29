// Electron main process — IMAP/SMTP bridge
// CommonJS module so __dirname works without ESM gymnastics.
const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const Imap = require("imap");
const { simpleParser } = require("mailparser");
const nodemailer = require("nodemailer");
require("./updater.cjs");

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
  const stored = {
    ...account,
    password: account.password ? encryptPassword(account.password) : undefined,
    smtpPassword: account.smtpPassword ? encryptPassword(account.smtpPassword) : undefined,
  };
  if (idx >= 0) accounts[idx] = { ...accounts[idx], ...stored };
  else accounts.push(stored);
  saveAccounts(accounts);
  return { ok: true };
});

ipcMain.handle("accounts:delete", (_e, id) => {
  const accounts = loadAccounts().filter((a) => a.id !== id);
  saveAccounts(accounts);
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
    tlsOptions: { rejectUnauthorized: false },
  });
}

function openInbox(imap, mailbox) {
  return new Promise((resolve, reject) => {
    imap.openBox(mailbox || "INBOX", true, (err, box) => (err ? reject(err) : resolve(box)));
  });
}

ipcMain.handle("imap:listMailboxes", async (_e, accountId) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("Account not found");
  const imap = imapConfigFor(account);
  return new Promise((resolve, reject) => {
    imap.once("ready", () => {
      imap.getBoxes((err, boxes) => {
        imap.end();
        if (err) return reject(err);
        const flatten = (obj, prefix = "") => {
          const out = [];
          for (const [name, val] of Object.entries(obj)) {
            const full = prefix ? `${prefix}${val.delimiter || "/"}${name}` : name;
            out.push(full);
            if (val.children) out.push(...flatten(val.children, full));
          }
          return out;
        };
        resolve(flatten(boxes));
      });
    });
    imap.once("error", reject);
    imap.connect();
  });
});

ipcMain.handle("imap:fetch", async (_e, { accountId, mailbox = "INBOX", limit = 50 }) => {
  const account = loadAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("Account not found");
  const imap = imapConfigFor(account);

  return new Promise((resolve, reject) => {
    const messages = [];
    imap.once("ready", async () => {
      try {
        const box = await openInbox(imap, mailbox);
        const total = box.messages.total;
        if (total === 0) {
          imap.end();
          return resolve([]);
        }
        const start = Math.max(1, total - limit + 1);
        const range = `${start}:${total}`;
        const f = imap.seq.fetch(range, { bodies: "", struct: true });
        f.on("message", (msg, seqno) => {
          let raw = "";
          msg.on("body", (stream) => {
            stream.on("data", (chunk) => (raw += chunk.toString("utf8")));
          });
          msg.once("end", async () => {
            try {
              const parsed = await simpleParser(raw);
              messages.push({
                seqno,
                uid: parsed.messageId,
                from: parsed.from?.text || "",
                to: parsed.to?.text || "",
                subject: parsed.subject || "(no subject)",
                date: parsed.date?.toISOString() || null,
                text: parsed.text || "",
                html: parsed.html || "",
                snippet: (parsed.text || "").slice(0, 140),
              });
            } catch (e) { /* ignore */ }
          });
        });
        f.once("error", reject);
        f.once("end", () => {
          imap.end();
          resolve(messages.sort((a, b) => b.seqno - a.seqno));
        });
      } catch (e) {
        imap.end();
        reject(e);
      }
    });
    imap.once("error", reject);
    imap.connect();
  });
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
