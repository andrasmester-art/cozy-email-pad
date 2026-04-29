// Email address parsing & normalisation helpers used by the composer's draft
// persistence so that the To/Cc/Bcc fields look identical after reopening a
// saved draft, regardless of whitespace, duplicates, or domain casing.

export type ParsedAddress = {
  /** Optional display name (without surrounding quotes). */
  name?: string;
  /** Lowercased email address (local part is preserved as typed; domain lowercased). */
  email: string;
};

/**
 * Split a header-style address list ("Foo <a@b.c>, x@y.z; \"Q\" <q@r.s>")
 * into individual entries. Tolerates `,`, `;` and newline separators while
 * respecting commas inside quoted display names.
 */
export function splitAddressList(input: string): string[] {
  if (!input) return [];
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  let inAngle = false;
  for (const ch of input) {
    if (ch === '"' && !inAngle) inQuotes = !inQuotes;
    else if (ch === "<" && !inQuotes) inAngle = true;
    else if (ch === ">" && !inQuotes) inAngle = false;

    if ((ch === "," || ch === ";" || ch === "\n") && !inQuotes && !inAngle) {
      const t = buf.trim();
      if (t) out.push(t);
      buf = "";
    } else {
      buf += ch;
    }
  }
  const last = buf.trim();
  if (last) out.push(last);
  return out;
}

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

/** Parse a single entry into `{ name, email }`. Returns null when no email is found. */
export function parseAddress(entry: string): ParsedAddress | null {
  if (!entry) return null;
  const trimmed = entry.trim();
  // "Name" <email@host> or Name <email@host>
  const angle = trimmed.match(/^\s*(?:"([^"]*)"|([^<]*?))\s*<\s*([^>]+?)\s*>\s*$/);
  if (angle) {
    const name = (angle[1] ?? angle[2] ?? "").trim();
    const email = angle[3].trim();
    if (!EMAIL_RE.test(email)) return null;
    return { name: name || undefined, email: lowerDomain(email) };
  }
  // Bare email
  if (EMAIL_RE.test(trimmed)) {
    return { email: lowerDomain(trimmed) };
  }
  return null;
}

function lowerDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return email;
  return email.slice(0, at) + "@" + email.slice(at + 1).toLowerCase();
}

/** Render a parsed address back to its canonical header form. */
export function formatAddress(addr: ParsedAddress): string {
  if (!addr.name) return addr.email;
  // Quote the name if it contains characters that need it.
  const needsQuotes = /[",<>()@:;\\[\]]/.test(addr.name);
  const name = needsQuotes ? `"${addr.name.replace(/"/g, '\\"')}"` : addr.name;
  return `${name} <${addr.email}>`;
}

/**
 * Normalise an address-field string:
 *  - splits on `,` / `;` / newlines
 *  - parses each entry to `{ name, email }`
 *  - drops invalid entries and de-duplicates by email (case-insensitive)
 *  - rejoins with `, `
 *
 * Returns the same input when nothing parseable is present, so the user's
 * typed text isn't destroyed mid-edit.
 */
export function normalizeAddressField(input: string): string {
  if (!input) return "";
  const parts = splitAddressList(input);
  if (parts.length === 0) return input.trim();

  const seen = new Set<string>();
  const kept: ParsedAddress[] = [];
  let anyParsed = false;
  for (const p of parts) {
    const addr = parseAddress(p);
    if (!addr) continue;
    anyParsed = true;
    const key = addr.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(addr);
  }

  if (!anyParsed) return input.trim();
  return kept.map(formatAddress).join(", ");
}
