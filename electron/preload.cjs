const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mailAPI", {
  isElectron: true,
  accounts: {
    list: () => ipcRenderer.invoke("accounts:list"),
    save: (account) => ipcRenderer.invoke("accounts:save", account),
    delete: (id) => ipcRenderer.invoke("accounts:delete", id),
  },
  templates: {
    list: () => ipcRenderer.invoke("templates:list"),
    save: (tpl) => ipcRenderer.invoke("templates:save", tpl),
    delete: (id) => ipcRenderer.invoke("templates:delete", id),
  },
  imap: {
    test: (params) => ipcRenderer.invoke("imap:test", params),
    listInbox: (params) => ipcRenderer.invoke("imap:listInbox", params),
    appendDraft: (params) => ipcRenderer.invoke("imap:appendDraft", params),
  },
  cache: {
    read: (params) => ipcRenderer.invoke("cache:read", params),
    syncMailbox: (params) => ipcRenderer.invoke("cache:syncMailbox", params),
    syncAccount: (params) => ipcRenderer.invoke("cache:syncAccount", params),
    loadOlder: (params) => ipcRenderer.invoke("cache:loadOlder", params),
  },
  smtp: {
    send: (params) => ipcRenderer.invoke("smtp:send", params),
  },
  events: {
    onAutoSync: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on("mail:auto-synced", handler);
      return () => ipcRenderer.removeListener("mail:auto-synced", handler);
    },
  },
  updater: {
    info: () => ipcRenderer.invoke("updater:info"),
    apply: () => ipcRenderer.invoke("updater:apply"),
    onLog: (cb) => {
      const handler = (_e, line) => cb(line);
      ipcRenderer.on("updater:log", handler);
      return () => ipcRenderer.removeListener("updater:log", handler);
    },
  },
  window: {
    openMessage: (params) => ipcRenderer.invoke("window:openMessage", params),
  },
