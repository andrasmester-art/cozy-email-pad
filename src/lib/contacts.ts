// Kontakt-extraktor: végigmegy az összes fiók összes mappájának lokális cache-én
// (electron mailcache JSON fájlok a UI rétegen csak a `mailAPI.imap.fetch`-en
// keresztül érhetők el), és kinyeri az egyedi e-mail címeket. Minden címhez:
//   - név (ha van),
//   - hány levélben szerepelt,
//   - utolsó találat időpontja,
//   - mely fiókokban / mappákban fordult elő.

import { mailAPI } from "./mailBridge";

export type Contact = {
  email: string;        // kanonikus, lowercase
  name: string;         // legjobb ismert megjelenítendő név
  count: number;        // összes előfordulás (from + to)
  lastSeen: number;     // legnagyobb date timestamp
  accounts: Set<string>;
  mailboxes: Set<string>;
};

const EMAIL_RE = /(?:"?([^"<>@]+?)"?\s*)?<?([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})>?/gi;

// Kibont egy header-szerű mezőt ("Név <a@b.c>, x@y.z, ...") → [{name,email}, ...]
function parseAddresses(field: string): Array<{ name: string; email: string }> {
  if (!field) return [];
  const out: Array<{ name: string; email: string }> = [];
  // Vesszővel daraboljuk, de figyelünk az idézőjelben lévő vesszőkre.
  const parts = field.split(/,(?![^"<]*>)/);
  for (const raw of parts) {
    const s = raw.trim();
    if (!s) continue;
    EMAIL_RE.lastIndex = 0;
    const m = EMAIL_RE.exec(s);
    if (!m) continue;
    const name = (m[1] || "").trim().replace(/^['"]|['"]$/g, "");
    const email = (m[2] || "").trim().toLowerCase();
    if (!email) continue;
    out.push({ name, email });
  }
  return out;
}

export async function buildContacts(opts?: {
  excludeOwnAddresses?: boolean;
}): Promise<Contact[]> {
  const accounts = await mailAPI.accounts.list();
  const ownEmails = new Set(
    accounts.map((a) => (a.user || "").toLowerCase()).filter(Boolean),
  );

  const map = new Map<string, Contact>();

  // A jelenleg ismert mappák: ezek vannak a sidebar-on és a cache-ben.
  const MAILBOXES = ["INBOX", "Sent", "Drafts", "Archive", "Spam"];

  for (const account of accounts) {
    for (const mailbox of MAILBOXES) {
      let messages: any[] = [];
      try {
        messages = await mailAPI.imap.fetch({
          accountId: account.id,
          mailbox,
          limit: 5000,
        });
      } catch {
        continue;
      }
      for (const m of messages) {
        const ts = m.date ? new Date(m.date).getTime() : 0;
        // INBOX/Spam/Archive: a `from` az érdekes (ki írt nekünk).
        // Sent/Drafts: a `to` (kinek írtunk). Mindkettőt feldolgozzuk
        // mindenhol, hogy a Cc/másolatokon szereplő partnerek is bekerüljenek.
        const addrs = [
          ...parseAddresses(m.from || ""),
          ...parseAddresses(m.to || ""),
        ];
        for (const { name, email } of addrs) {
          if (!email) continue;
          if (opts?.excludeOwnAddresses && ownEmails.has(email)) continue;
          const existing = map.get(email);
          if (existing) {
            existing.count += 1;
            if (ts > existing.lastSeen) existing.lastSeen = ts;
            // Hosszabb / "valódi" név nyer (ne legyen csak email)
            if (name && (!existing.name || existing.name === existing.email)) {
              existing.name = name;
            } else if (name && name.length > existing.name.length && !/^[<>"]/.test(name)) {
              existing.name = name;
            }
            existing.accounts.add(account.id);
            existing.mailboxes.add(mailbox);
          } else {
            map.set(email, {
              email,
              name: name || email,
              count: 1,
              lastSeen: ts,
              accounts: new Set([account.id]),
              mailboxes: new Set([mailbox]),
            });
          }
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    // Legtöbb forgalom előre, azonos számnál a frissebb előbb.
    if (b.count !== a.count) return b.count - a.count;
    return b.lastSeen - a.lastSeen;
  });
}
