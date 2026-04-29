// Electron main process — fiók- és sablon-tárolás.
// Az IMAP/SMTP logika el lett távolítva (1.2.0); a hálózati kommunikáció
// most már nem támogatott a desktop appban.
const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
require("./updater.cjs");

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

function loadAccounts() {
  return readStore("accounts", []);
}
function saveAccounts(accounts) {
  writeStore("accounts", accounts);
}

// ---- IPC: accounts ----
ipcMain.handle("accounts:list", () => {
  return loadAccounts().map((a) => ({ ...a, password: undefined, smtpPassword: undefined }));
});

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
