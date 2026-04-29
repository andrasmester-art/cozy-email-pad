// Bridge between the React app and the Electron main process.
// Az IMAP/SMTP hálózati logika el lett távolítva (1.2.0). A `mailAPI.imap`
// és `mailAPI.smtp` továbbra is létezik no-op formában, hogy a UI ne törjön —
// minden hívás üres adatot vagy "nem támogatott" hibát ad vissza.

export type Account = {
  id: string;
  label: string;
  displayName?: string;
  from?: string;
  user: string;
  authUser?: string;
  password?: string;
  imapHost: string;
  imapPort?: number;
  imapTls?: boolean;
  smtpHost: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  color?: string;
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  updatedAt: number;
};

export type MailMessage = {
  seqno: number;
  uid?: string;
  from: string;
  to: string;
  subject: string;
  date: string | null;
  text: string;
  html: string;
  snippet: string;
};

const isElectron = typeof window !== "undefined" && (window as any).mailAPI?.isElectron;

const LS = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

const NOT_SUPPORTED = "Az e-mail küldés és fogadás el lett távolítva ebből a verzióból.";

export const mailAPI = {
  isElectron: !!isElectron,
  platform: isElectron ? "Electron (Mac native)" : "Browser preview",

  accounts: {
    async list(): Promise<Account[]> {
      if (isElectron) return (window as any).mailAPI.accounts.list();
      return LS.get<Account[]>("accounts", []);
    },
    async save(account: Account) {
      if (isElectron) return (window as any).mailAPI.accounts.save(account);
      const all = LS.get<Account[]>("accounts", []);
      const idx = all.findIndex((a) => a.id === account.id);
      if (idx >= 0) all[idx] = { ...all[idx], ...account };
      else all.push(account);
      LS.set("accounts", all);
      return { ok: true };
    },
    async delete(id: string) {
      if (isElectron) return (window as any).mailAPI.accounts.delete(id);
      LS.set("accounts", LS.get<Account[]>("accounts", []).filter((a) => a.id !== id));
      return { ok: true };
    },
  },

  templates: {
    async list(): Promise<EmailTemplate[]> {
      if (isElectron) return (window as any).mailAPI.templates.list();
      return LS.get<EmailTemplate[]>("templates", defaultTemplates());
    },
    async save(tpl: EmailTemplate) {
      if (isElectron) return (window as any).mailAPI.templates.save(tpl);
      const all = LS.get<EmailTemplate[]>("templates", defaultTemplates());
      const idx = all.findIndex((t) => t.id === tpl.id);
      if (idx >= 0) all[idx] = tpl;
      else all.push(tpl);
      LS.set("templates", all);
      return { ok: true };
    },
    async delete(id: string) {
      if (isElectron) return (window as any).mailAPI.templates.delete(id);
      LS.set(
        "templates",
        LS.get<EmailTemplate[]>("templates", defaultTemplates()).filter((t) => t.id !== id),
      );
      return { ok: true };
    },
  },

  // No-op IMAP/SMTP implementation. Kept so the existing UI code doesn't crash.
  imap: {
    async listMailboxes(_accountId: string): Promise<string[]> {
      return ["INBOX", "Sent", "Drafts", "Archive", "Spam", "Trash"];
    },
    async testConnection(_params: { accountId: string; timeoutMs?: number }): Promise<{ ok: true }> {
      throw new Error(NOT_SUPPORTED);
    },
    async fetch(_params: { accountId: string; mailbox?: string; limit?: number }): Promise<MailMessage[]> {
      return [];
    },
    async sync(_params: { accountId: string; mailbox?: string; limit?: number }): Promise<{ added: number; messages: MailMessage[] }> {
      return { added: 0, messages: [] };
    },
    async syncAll(_params: { accountId: string }): Promise<Record<string, number | { error: string }>> {
      return {};
    },
  },

  smtp: {
    async send(_params: {
      accountId: string;
      to: string;
      cc?: string;
      bcc?: string;
      subject: string;
      html: string;
      text: string;
    }) {
      throw new Error(NOT_SUPPORTED);
    },
  },

  updater: {
    async info(): Promise<UpdaterInfo> {
      if (isElectron && (window as any).mailAPI.updater) {
        return (window as any).mailAPI.updater.info();
      }
      return {
        appRoot: "(böngésző)",
        writable: false,
        isGit: false,
        localSha: null,
        remoteSha: null,
        remoteMessage: null,
        remoteDate: null,
        remoteError: "Az automatikus frissítés csak a Mac/Windows appban érhető el.",
        repoUrl: "https://github.com/andrasmester-art/cozy-email-pad.git",
        branch: "main",
        upToDate: false,
      };
    },
    async apply(): Promise<{ ok: true }> {
      if (isElectron && (window as any).mailAPI.updater) {
        return (window as any).mailAPI.updater.apply();
      }
      window.location.reload();
      return { ok: true };
    },
    onLog(cb: (line: string) => void): () => void {
      if (isElectron && (window as any).mailAPI.updater?.onLog) {
        return (window as any).mailAPI.updater.onLog(cb);
      }
      return () => {};
    },
  },
};

export type ReleaseNote = { version: string; date: string; body: string };

export type UpdaterInfo = {
  appRoot: string;
  writable: boolean;
  isGit: boolean;
  localSha: string | null;
  localVersion?: string | null;
  remoteSha: string | null;
  remoteVersion?: string | null;
  remoteMessage: string | null;
  remoteDate: string | null;
  remoteError: string | null;
  repoUrl: string;
  branch: string;
  upToDate: boolean;
  versionDelta?: number;
  releaseNotes?: ReleaseNote[];
};

function defaultTemplates(): EmailTemplate[] {
  return [
    {
      id: "tpl-welcome",
      name: "Üdvözlő levél",
      subject: "Üdv nálunk!",
      body: "<p>Kedves <strong>Címzett</strong>,</p><p>Köszönjük, hogy regisztráltál!</p><p>Üdvözlettel,<br>A csapat</p>",
      updatedAt: Date.now(),
    },
    {
      id: "tpl-meeting",
      name: "Megbeszélés egyeztetés",
      subject: "Egyeztetés időpontja",
      body: "<p>Szia!</p><p>Az alábbi időpontok közül melyik felelne meg neked?</p><ul><li>Hétfő 10:00</li><li>Kedd 14:00</li></ul><p>Üdv</p>",
      updatedAt: Date.now(),
    },
  ];
}
