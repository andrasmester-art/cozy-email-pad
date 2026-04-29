// Ismert IMAP/SMTP szolgáltatók és a hozzájuk tartozó host/port beállítások.
// A varázsló ezekből választ az e-mail domain vagy a felhasználó által kiválasztott
// szolgáltató alapján.

import type { Account } from "./mailBridge";

export type ProviderId =
  | "hostinger"
  | "hoating"
  | "gmail"
  | "icloud"
  | "outlook"
  | "yahoo"
  | "rackhost"
  | "tarhely"
  | "dotroll"
  | "ezit"
  | "cpanel"
  | "custom";

export type ProviderPreset = {
  id: ProviderId;
  name: string;
  description: string;
  domains?: string[]; // ezekre a domainekre automatikusan találatot ad
  hostPattern?: (domain: string) => Partial<Account>; // dinamikus host (pl. mail.<domain>)
  settings?: Partial<Account>; // statikus beállítások
  authUserHint?: "email" | "local" | "custom"; // mit írjon a felhasználónév mezőbe
  passwordHint?: string;
  needsAppPassword?: boolean;
};

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "hostinger",
    name: "Hostinger",
    description:
      "Hostinger Email / Titan Mail — minden domainnél a központi mail.hostinger.com hostot használja.",
    domains: [
      "hostinger.com",
      // Sok Hostinger ügyfél saját domainen futtatja az email-jét, ezeket nem
      // tudjuk előre felsorolni — viszont a "Hostinger" gomb mindig kiválasztható kézzel.
    ],
    settings: {
      imapHost: "imap.hostinger.com",
      imapPort: 993,
      imapTls: true,
      smtpHost: "smtp.hostinger.com",
      smtpPort: 465,
      smtpSecure: true,
    },
    authUserHint: "email",
    passwordHint:
      "A Hostinger / hPanel-ben az e-mail fiókhoz beállított jelszót add meg (nem a Hostinger fiók bejelentkezési jelszót).",
  },
  {
    id: "hoating",
    name: "Hoating.eu",
    description: "Hoating.eu — Hostinger infrastruktúrán fut.",
    domains: ["hoating.eu"],
    settings: {
      imapHost: "imap.hostinger.com",
      imapPort: 993,
      imapTls: true,
      smtpHost: "smtp.hostinger.com",
      smtpPort: 465,
      smtpSecure: true,
    },
    authUserHint: "email",
    passwordHint:
      "A Hostinger / hPanel-ben a mailbox-hoz beállított jelszó (nem a tárhely admin jelszó).",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Google fiókokhoz app-specifikus jelszó szükséges (2FA mellett).",
    domains: ["gmail.com", "googlemail.com"],
    settings: {
      imapHost: "imap.gmail.com",
      imapPort: 993,
      imapTls: true,
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: true,
    },
    authUserHint: "email",
    needsAppPassword: true,
    passwordHint:
      "Generálj App Password-ot itt: myaccount.google.com/apppasswords (2FA kell hozzá).",
  },
  {
    id: "icloud",
    name: "iCloud",
    description: "Apple iCloud fiókok — app-specifikus jelszóval.",
    domains: ["icloud.com", "me.com", "mac.com"],
    settings: {
      imapHost: "imap.mail.me.com",
      imapPort: 993,
      imapTls: true,
      smtpHost: "smtp.mail.me.com",
      smtpPort: 587,
      smtpSecure: false,
    },
    authUserHint: "email",
    needsAppPassword: true,
    passwordHint: "Generálj app-specifikus jelszót itt: account.apple.com",
  },
  {
    id: "outlook",
    name: "Outlook / Office 365",
    description: "Microsoft személyes és céges fiókok.",
    domains: ["outlook.com", "hotmail.com", "live.com", "office365.com"],
    settings: {
      imapHost: "outlook.office365.com",
      imapPort: 993,
      imapTls: true,
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      smtpSecure: false,
    },
    authUserHint: "email",
    needsAppPassword: true,
    passwordHint: "2FA esetén app-specifikus jelszó kell: account.microsoft.com/security",
  },
  {
    id: "yahoo",
    name: "Yahoo Mail",
    description: "Yahoo fiókok — app-specifikus jelszóval.",
    domains: ["yahoo.com", "yahoo.co.uk", "ymail.com"],
    settings: {
      imapHost: "imap.mail.yahoo.com",
      imapPort: 993,
      imapTls: true,
      smtpHost: "smtp.mail.yahoo.com",
      smtpPort: 465,
      smtpSecure: true,
    },
    authUserHint: "email",
    needsAppPassword: true,
    passwordHint: "Generálj App jelszót: login.yahoo.com/account/security",
  },
  {
    id: "rackhost",
    name: "Rackhost",
    description: "Magyar tárhely szolgáltató — saját domain.",
    hostPattern: (domain) => ({
      imapHost: `mail.${domain}`,
      imapPort: 993,
      imapTls: true,
      smtpHost: `mail.${domain}`,
      smtpPort: 465,
      smtpSecure: true,
    }),
    authUserHint: "email",
    passwordHint: "A Rackhost ügyfélkapun beállított mailbox jelszó.",
  },
  {
    id: "tarhely",
    name: "Tárhely.eu",
    description: "Magyar tárhely szolgáltató.",
    hostPattern: (domain) => ({
      imapHost: `mail.${domain}`,
      imapPort: 993,
      imapTls: true,
      smtpHost: `mail.${domain}`,
      smtpPort: 465,
      smtpSecure: true,
    }),
    authUserHint: "email",
    passwordHint: "A Tárhely.eu felületén a fiókhoz beállított jelszó.",
  },
  {
    id: "dotroll",
    name: "DotRoll",
    description: "Magyar tárhely szolgáltató.",
    hostPattern: (domain) => ({
      imapHost: `mail.${domain}`,
      imapPort: 993,
      imapTls: true,
      smtpHost: `mail.${domain}`,
      smtpPort: 465,
      smtpSecure: true,
    }),
    authUserHint: "email",
    passwordHint: "A DotRoll ügyfélkapun beállított mailbox jelszó.",
  },
  {
    id: "ezit",
    name: "EZIT",
    description: "Magyar tárhely szolgáltató.",
    hostPattern: (domain) => ({
      imapHost: `mail.${domain}`,
      imapPort: 993,
      imapTls: true,
      smtpHost: `mail.${domain}`,
      smtpPort: 465,
      smtpSecure: true,
    }),
    authUserHint: "email",
    passwordHint: "Az EZIT felületén beállított mailbox jelszó.",
  },
  {
    id: "cpanel",
    name: "cPanel / Plesk (általános)",
    description: "Általános cPanel/Plesk alapú tárhely — mail.<domain> hoszttal.",
    hostPattern: (domain) => ({
      imapHost: `mail.${domain}`,
      imapPort: 993,
      imapTls: true,
      smtpHost: `mail.${domain}`,
      smtpPort: 465,
      smtpSecure: true,
    }),
    authUserHint: "email",
    passwordHint: "A tárhely admin felületén a mailbox-hoz beállított jelszó.",
  },
  {
    id: "custom",
    name: "Egyéni beállítás",
    description: "Adj meg minden adatot kézzel.",
    settings: {},
    authUserHint: "custom",
  },
];

export function getDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase().trim() : "";
}

export function detectProvider(email: string): ProviderPreset | null {
  const domain = getDomain(email);
  if (!domain) return null;
  return PROVIDERS.find((p) => p.domains?.includes(domain)) || null;
}

export function applyPreset(
  preset: ProviderPreset,
  email: string,
): Partial<Account> {
  const domain = getDomain(email);
  const base = preset.hostPattern && domain ? preset.hostPattern(domain) : {};
  return { ...base, ...(preset.settings || {}) };
}
