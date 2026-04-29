// Bridge between the React app and the Electron main process.
// In Electron, calls go via window.mailAPI (IPC).
// In the browser preview, we use localStorage + demo IMAP data so the UI
// remains fully usable for design and template editing.

export type Account = {
  id: string;
  label: string;
  from?: string;
  user: string;
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
  body: string; // HTML from Tiptap
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

// ---- localStorage helpers (browser fallback) ----
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

// ---- Demo data for browser preview ----
const demoMessages = (accountLabel: string): MailMessage[] => [
  {
    seqno: 5,
    from: `Apple <noreply@apple.com>`,
    to: accountLabel,
    subject: "Az új iCloud+ funkciók most elérhetőek",
    date: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    text: "Fedezd fel a Privát Relé és a Hide My Email legújabb fejlesztéseit...",
    html: "<p>Fedezd fel a <strong>Privát Relé</strong> és a Hide My Email legújabb fejlesztéseit...</p>",
    snippet: "Fedezd fel a Privát Relé és a Hide My Email legújabb fejlesztéseit...",
  },
  {
    seqno: 4,
    from: "GitHub <noreply@github.com>",
    to: accountLabel,
    subject: "[your-repo] Pull request #42 ready for review",
    date: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    text: "@you opened a pull request to merge feature/inbox into main.",
    html: "<p><strong>@you</strong> opened a pull request to merge <code>feature/inbox</code> into <code>main</code>.</p>",
    snippet: "@you opened a pull request to merge feature/inbox into main.",
  },
  {
    seqno: 3,
    from: "Lovable <hello@lovable.dev>",
    to: accountLabel,
    subject: "Üdv a saját email kliensedben! ✉️",
    date: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    text: "Ez egy demó üzenet a böngésző előnézethez. A natív Mac appban valódi IMAP fiókok jelennek meg.",
    html: "<p>Ez egy <em>demó üzenet</em> a böngésző előnézethez. A natív Mac appban valódi IMAP fiókok jelennek meg.</p><p>Próbáld ki az új levél írását a jobb felső sarokban!</p>",
    snippet: "Ez egy demó üzenet a böngésző előnézethez...",
  },
  {
    seqno: 2,
    from: "Anna Kovács <anna@example.com>",
    to: accountLabel,
    subject: "Re: Heti egyeztetés",
    date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    text: "Szia! Csütörtök 10:00 jó? Küldök naptármeghívót.",
    html: "<p>Szia!</p><p>Csütörtök <strong>10:00</strong> jó? Küldök naptármeghívót.</p><p>Üdv,<br>Anna</p>",
    snippet: "Szia! Csütörtök 10:00 jó? Küldök naptármeghívót.",
  },
  {
    seqno: 1,
    from: "Newsletter <news@techweekly.com>",
    to: accountLabel,
    subject: "🚀 Tech Weekly — A 7 legjobb DevTool ezen a héten",
    date: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    text: "Heti összefoglaló a fejlesztői világból...",
    html: "<h2>Tech Weekly</h2><p>Heti összefoglaló a fejlesztői világból...</p>",
    snippet: "Heti összefoglaló a fejlesztői világból...",
  },
];

// ---- API ----
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
    async listMailboxes(accountId: string): Promise<string[]> {
      if (isElectron) return (window as any).mailAPI.imap.listMailboxes(accountId);
      return ["INBOX", "Sent", "Drafts", "Archive", "Spam", "Trash"];
    },
    async fetch(params: { accountId: string; mailbox?: string; limit?: number }): Promise<MailMessage[]> {
      if (isElectron) return (window as any).mailAPI.imap.fetch(params);
      const accounts = await mailAPI.accounts.list();
      const acc = accounts.find((a) => a.id === params.accountId);
      return demoMessages(acc?.label || "demo@local");
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
};

function defaultTemplates(): EmailTemplate[] {
  return [
    {
      id: "tpl-welcome",
      name: "Üdvözlő levél",
      subject: "Üdv nálunk!",
      body: "<p>Kedves <strong>Címzett</strong>,</p><p>Köszönjük, hogy regisztráltál! Ha bármi kérdésed van, írj nyugodtan.</p><p>Üdvözlettel,<br>A csapat</p>",
      updatedAt: Date.now(),
    },
    {
      id: "tpl-meeting",
      name: "Megbeszélés egyeztetés",
      subject: "Egyeztetés időpontja",
      body: "<p>Szia!</p><p>Az alábbi időpontok közül melyik felelne meg neked?</p><ul><li>Hétfő 10:00</li><li>Kedd 14:00</li><li>Szerda 9:00</li></ul><p>Üdv</p>",
      updatedAt: Date.now(),
    },
    {
      id: "tpl-followup",
      name: "Follow-up",
      subject: "Visszajelzés kérése",
      body: "<p>Szia!</p><p>Csak finoman rákérdeznék, sikerült-e ránézned az előző levelemre. Köszönöm előre is!</p><p>Üdv</p>",
      updatedAt: Date.now(),
    },
  ];
}
