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
    listMailboxes: (accountId) => ipcRenderer.invoke("imap:listMailboxes", accountId),
    fetch: (params) => ipcRenderer.invoke("imap:fetch", params),
    sync: (params) => ipcRenderer.invoke("imap:sync", params),
    syncAll: (params) => ipcRenderer.invoke("imap:syncAll", params),
    cacheInfo: (params) => ipcRenderer.invoke("imap:cacheInfo", params),
  },
  smtp: {
    send: (params) => ipcRenderer.invoke("smtp:send", params),
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
});
