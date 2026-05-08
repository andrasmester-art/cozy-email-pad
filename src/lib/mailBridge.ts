// Bridge between the React app and the Electron main process.
// Egyszerűsített, minimalista IMAP/SMTP API (1.3.0):
//   - imap.test(accountId)               → bejelentkezés-ellenőrzés
//   - imap.fetch({ accountId, mailbox }) → INBOX utolsó N levele
//   - smtp.send(payload)                 → levél kiküldés
// Más mappa (Sent / Drafts / Archive) jelenleg üres listát ad vissza.

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

// Egy levélhez tartozó csatolmány. A `data` base64-kódolt bináris tartalom
// (a natív/Electron oldal tölti ki, miután a body-val együtt letöltötte).
// Az `inline` jelzi a HTML-be ágyazott (cid:…) képeket, amelyeket nem
// szoktunk külön „letöltés" listában mutatni.
export type MailAttachment = {
  filename: string;
  contentType: string; // pl. "image/png", "application/pdf", "text/plain"
  size: number; // byte
  /** Base64-kódolt tartalom. Lehet undefined, ha még nem töltődött le a body. */
  data?: string;
  /** A HTML-ben hivatkozott Content-ID (cid:…), ha inline-ágyazott. */
  cid?: string;
  /** True, ha inline (a HTML-be ágyazott) — pl. embedded kép. */
  inline?: boolean;
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
  flagged?: boolean;
  seen?: boolean;
  /** True, ha a levélen rajta van a \Answered IMAP-flag (azaz már válaszoltunk
   *  rá). A listanézet egy kis Reply-ikont mutat ezeknél. */
  answered?: boolean;
  bodyLoaded?: boolean;
  attachments?: MailAttachment[];
  /** True, ha a levél tartalmaz letölthető csatolmányt (a header-szinkron a
   *  BODYSTRUCTURE alapján számolja, így a body letöltése nélkül is tudjuk
   *  mutatni a gemkapocs ikont a levéllistában). */
  hasAttachments?: boolean;
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

const demoMessages = (label: string): MailMessage[] => [
  {
    seqno: 2,
    from: "Lovable <hello@lovable.dev>",
    to: label,
    subject: "Üdv a saját email kliensedben! ✉️",
    date: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    text: "Ez egy demó üzenet a böngésző előnézethez. A natív Mac appban valódi IMAP fiókok jelennek meg.",
    html: "<p>Ez egy <em>demó üzenet</em> a böngésző előnézethez.</p>",
    snippet: "Ez egy demó üzenet a böngésző előnézethez…",
  },
  {
    seqno: 1,
    from: "Anna <anna@example.com>",
    to: label,
    subject: "Re: Heti egyeztetés",
    date: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    text: "Csütörtök 10:00 jó? Küldök naptármeghívót.",
    html: "<p>Csütörtök <strong>10:00</strong> jó?</p>",
    snippet: "Csütörtök 10:00 jó?",
  },
];

export const mailAPI = {
  isElectron: !!isElectron,
  platform: isElectron ? "Electron (Mac native)" : "Browser preview (demo mode)",

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

  imap: {
    async listMailboxes(_accountId: string): Promise<string[]> {
      return ["INBOX", "Sent", "Drafts", "Archive", "Spam", "Trash"];
    },
    async test(accountId: string): Promise<{ ok: true }> {
      if (isElectron) return (window as any).mailAPI.imap.test({ accountId });
      await new Promise((r) => setTimeout(r, 400));
      return { ok: true };
    },
    // Csak a cache-ből olvas — azonnali, nem hív szervert.
    async fetch(params: { accountId: string; mailbox?: string; limit?: number }): Promise<MailMessage[]> {
      const { accountId, mailbox = "INBOX", limit = 1000 } = params;
      if (isElectron) {
        const res = await (window as any).mailAPI.cache.read({ accountId, mailbox });
        return (res?.messages || []).slice(0, limit);
      }
      const accounts = await mailAPI.accounts.list();
      const acc = accounts.find((a) => a.id === accountId);
      return mailbox === "INBOX" ? demoMessages(acc?.label || "demo@local") : [];
    },
    // Piszkozat mentése a szerver Drafts mappájába (IMAP APPEND).
    async appendDraft(params: {
      accountId: string;
      to?: string; cc?: string; bcc?: string;
      subject: string; html: string; text: string;
      replaceUid?: string | number | null;
      replaceMailbox?: string | null;
    }): Promise<{ ok: true; messages?: MailMessage[]; newUid?: number | null; replacedUid?: number | null }> {
      if (isElectron && (window as any).mailAPI.imap.appendDraft) {
        return (window as any).mailAPI.imap.appendDraft(params);
      }
      // Demó / böngésző: nincs IMAP, csak visszajelzés.
      await new Promise((r) => setTimeout(r, 300));
      return { ok: true };
    },
  },

  cache: {
    // Egy mappa inkrementális szinkronja — visszaadja a friss listát.
    async syncMailbox(params: { accountId: string; mailbox: string }): Promise<{ added: number; messages: MailMessage[]; warnings?: string[]; missing?: boolean }> {
      if (isElectron) {
        const r = await (window as any).mailAPI.cache.syncMailbox(params);
        return {
          added: r?.added || 0,
          messages: r?.messages || [],
          warnings: Array.isArray(r?.warnings) ? r.warnings : [],
          missing: !!r?.missing,
        };
      }
      const accounts = await mailAPI.accounts.list();
      const acc = accounts.find((a) => a.id === params.accountId);
      return {
        added: 0,
        messages: params.mailbox === "INBOX" ? demoMessages(acc?.label || "demo@local") : [],
        warnings: [],
      };
    },
    // Régebbi levelek lazy-load betöltése (görgetésre).
    async loadOlder(params: { accountId: string; mailbox: string; pageSize?: number }): Promise<{ added: number; messages: MailMessage[]; exhausted?: boolean; warnings?: string[] }> {
      if (isElectron && (window as any).mailAPI.cache.loadOlder) {
        const r = await (window as any).mailAPI.cache.loadOlder(params);
        return {
          added: r?.added || 0,
          messages: r?.messages || [],
          exhausted: !!r?.exhausted,
          warnings: Array.isArray(r?.warnings) ? r.warnings : [],
        };
      }
      return { added: 0, messages: [], exhausted: true, warnings: [] };
    },
    // Egy fiók INBOX szinkronja (a többi mappa csak kattintásra).
    async syncAccount(accountId: string): Promise<{ ok: true; results: Array<{ mailbox: string; ok: boolean; added?: number; error?: string; missing?: boolean }> }> {
      if (isElectron) return (window as any).mailAPI.cache.syncAccount({ accountId });
      await new Promise((r) => setTimeout(r, 200));
      return { ok: true, results: [] };
    },
  },

  mail: {
    async setFlag(params: {
      accountId: string;
      mailbox: string;
      uid: string | number;
      patch: { flagged?: boolean; seen?: boolean };
    }): Promise<{ ok: true; messages: MailMessage[]; updatedAt: number }> {
      if (isElectron) return (window as any).mailAPI.mail.setFlag(params);
      // Böngésző / demó: csak színlelt OK válasz, nincs szerver.
      return { ok: true, messages: [], updatedAt: Date.now() };
    },
    async fetchBody(params: {
      accountId: string;
      mailbox: string;
      uid: string | number;
    }): Promise<{ ok: boolean; message?: MailMessage | null; reason?: string }> {
      if (isElectron) return (window as any).mailAPI.mail.fetchBody(params);
      return { ok: false, reason: "not-electron" };
    },
    async delete(params: {
      accountId: string;
      mailbox: string;
      uid?: string | number;
      uids?: Array<string | number>;
    }): Promise<{ ok: true; mode: "move" | "expunge"; removedUids: number[]; messages: MailMessage[]; updatedAt: number }> {
      if (isElectron && (window as any).mailAPI.mail.delete) {
        return (window as any).mailAPI.mail.delete(params);
      }
      // Demó / böngésző: csak színlelt OK
      return { ok: true, mode: "move", removedUids: [], messages: [], updatedAt: Date.now() };
    },
  },

  smtp: {
    async send(params: {
      accountId: string;
      to: string;
      cc?: string;
      bcc?: string;
      subject: string;
      html: string;
      text: string;
    }) {
      if (isElectron) return (window as any).mailAPI.smtp.send(params);
      console.info("[demo] sendMail", params);
      await new Promise((r) => setTimeout(r, 600));
      return { ok: true, messageId: `demo-${Date.now()}` };
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
      body: "<p>Szia!</p><p>Mikor lenne jó? Hétfő 10:00 / Kedd 14:00 / Szerda 9:00.</p><p>Üdv</p>",
      updatedAt: Date.now(),
    },
  ];
}
