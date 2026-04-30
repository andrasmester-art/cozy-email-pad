// Lokális címjegyzék – nincs külön kapcsolat-tár, csak a ténylegesen használt
// címeket tanulja meg automatikusan (kimenő smtp.send sikerből és a beérkező
// levelek From mezőjéből). Cél: To/Cc/Bcc autocomplete a Composerben.
//
// Tárolás: localStorage egyetlen JSON kulcsban. A bejegyzéseket gyakoriság
// és frissesség szerint rangsoroljuk.

const STORAGE_KEY = "mw.addressbook.v1";
const MAX_ENTRIES = 2000; // védelem a végtelen növekedés ellen

export type AddressEntry = {
  email: string;       // mindig kisbetűs, normalizált
  name?: string;       // legutóbb látott megjelenítendő név
  count: number;       // hányszor láttuk
  lastUsed: number;    // utolsó használat / előfordulás timestamp
};

type Store = Record<string, AddressEntry>; // kulcs: lowercased email

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    // Ha túl sok bejegyzés van, dobjuk el a legrégebbi/legritkábbakat.
    const entries = Object.values(store);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => rankScore(b) - rankScore(a));
      const trimmed: Store = {};
      for (const e of entries.slice(0, MAX_ENTRIES)) trimmed[e.email] = e;
      store = trimmed;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    // Más komponensek (pl. nyitott Composer) értesüljenek a változásról.
    window.dispatchEvent(new CustomEvent("addressBookChanged"));
  } catch {
    // quota / private mode – csendben elnyeljük, nem kritikus funkció
  }
}

// "Anna Példa <anna@x.hu>", "anna@x.hu", '"Anna" <anna@x.hu>' formátumokat
// bont fel { name, email } objektumra. Ha nincs felismerhető e-mail, null-t ad.
export function parseAddress(raw: string): { name?: string; email: string } | null {
  if (!raw) return null;
  const s = raw.trim();
  // Forma: Név <email@host>
  const m = s.match(/^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  if (m) {
    const name = m[1].replace(/^["']|["']$/g, "").trim();
    const email = m[2].toLowerCase();
    if (!isValidEmail(email)) return null;
    return { name: name || undefined, email };
  }
  // Csak email
  if (isValidEmail(s)) return { email: s.toLowerCase() };
  return null;
}

// Vesszővel vagy pontosvesszővel elválasztott listát darabol fel.
export function splitAddressList(raw: string): string[] {
  if (!raw) return [];
  return raw.split(/[,;]/g).map((s) => s.trim()).filter(Boolean);
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Egyetlen "raw" címet (vagy listát) elment / frissít a címjegyzékben.
export function rememberAddresses(raws: string | string[] | undefined | null) {
  if (!raws) return;
  const list = Array.isArray(raws) ? raws : splitAddressList(raws);
  if (!list.length) return;
  const store = readStore();
  const now = Date.now();
  let changed = false;
  for (const r of list) {
    const parsed = parseAddress(r);
    if (!parsed) continue;
    const existing = store[parsed.email];
    if (existing) {
      existing.count += 1;
      existing.lastUsed = now;
      // Csak akkor frissítsük a nevet, ha most kaptunk értelmeset, és
      // korábban üres volt vagy ugyanannyira informatív.
      if (parsed.name && (!existing.name || existing.name === existing.email)) {
        existing.name = parsed.name;
      }
    } else {
      store[parsed.email] = {
        email: parsed.email,
        name: parsed.name,
        count: 1,
        lastUsed: now,
      };
    }
    changed = true;
  }
  if (changed) writeStore(store);
}

// Rangsorolás: gyakoriság + frissesség (logaritmikus súlyozás), hogy a
// "régen, sokszor" és a "most, egyszer" se nyomja agyon a másikat.
function rankScore(e: AddressEntry): number {
  const ageDays = Math.max(0, (Date.now() - e.lastUsed) / 86_400_000);
  const recency = 1 / (1 + ageDays / 14); // ~2 hét felezési idő
  return Math.log2(1 + e.count) * 2 + recency;
}

// Fuzzy keresés: a query bárhol előfordulhat az emailben vagy a névben
// (case-insensitive). Üres query esetén is visszaadja a top találatokat.
export function searchAddresses(query: string, limit = 8): AddressEntry[] {
  const store = readStore();
  const all = Object.values(store);
  const q = (query || "").trim().toLowerCase();
  const filtered = q
    ? all.filter((e) =>
        e.email.includes(q) || (e.name && e.name.toLowerCase().includes(q)),
      )
    : all;
  filtered.sort((a, b) => {
    // Találati pontossági bónusz: a query elejére illeszkedés előrébb.
    if (q) {
      const aStart = a.email.startsWith(q) || (a.name?.toLowerCase().startsWith(q) ?? false);
      const bStart = b.email.startsWith(q) || (b.name?.toLowerCase().startsWith(q) ?? false);
      if (aStart !== bStart) return aStart ? -1 : 1;
    }
    return rankScore(b) - rankScore(a);
  });
  return filtered.slice(0, limit);
}

// Megjelenítendő alak: 'Név <email>' vagy csak email.
export function formatAddress(e: AddressEntry): string {
  return e.name ? `${e.name} <${e.email}>` : e.email;
}
