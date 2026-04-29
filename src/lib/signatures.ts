// Email signatures with per-account defaults.
// All data stored in localStorage so it works in both Electron and browser preview.
import { sanitizeEmailHtml } from "./sanitizeHtml";

export type Signature = {
  id: string;
  name: string;
  body: string; // HTML
  updatedAt: number;
};

const SIG_KEY = "mailwise.signatures";
const MAP_KEY = "mailwise.signatureDefaults"; // { [accountId]: signatureId }

function readSigs(): Signature[] {
  try {
    return JSON.parse(localStorage.getItem(SIG_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeSigs(list: Signature[]) {
  localStorage.setItem(SIG_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("signaturesChanged"));
}

function readMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MAP_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeMap(map: Record<string, string>) {
  localStorage.setItem(MAP_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("signaturesChanged"));
}

export function listSignatures(): Signature[] {
  return readSigs().sort((a, b) => a.name.localeCompare(b.name, "hu"));
}

export function saveSignature(sig: Signature) {
  // Sanitise the HTML body on save so untrusted/pasted content can never be
  // persisted (and later injected into composed messages) in a dangerous form.
  const safe: Signature = { ...sig, body: sanitizeEmailHtml(sig.body || "") };
  const all = readSigs();
  const idx = all.findIndex((s) => s.id === safe.id);
  if (idx >= 0) all[idx] = safe;
  else all.push(safe);
  writeSigs(all);
}

export function deleteSignature(id: string) {
  writeSigs(readSigs().filter((s) => s.id !== id));
  // Also remove any default mapping pointing to it
  const map = readMap();
  let changed = false;
  for (const [k, v] of Object.entries(map)) {
    if (v === id) { delete map[k]; changed = true; }
  }
  if (changed) writeMap(map);
}

export function getDefaultSignatureId(accountId: string): string | null {
  return readMap()[accountId] ?? null;
}

export function setDefaultSignature(accountId: string, signatureId: string | null) {
  const map = readMap();
  if (signatureId) map[accountId] = signatureId;
  else delete map[accountId];
  writeMap(map);
}

export function getSignature(id: string | null | undefined): Signature | null {
  if (!id) return null;
  return readSigs().find((s) => s.id === id) || null;
}

// HTML wrapper used to identify a signature block inside a composed email.
// Allows swapping signatures without touching the user's body content.
export const SIGNATURE_MARKER = "data-mwsig";

export function wrapSignature(html: string): string {
  return `<div ${SIGNATURE_MARKER}="1">${html}</div>`;
}

export function stripSignature(body: string): string {
  if (!body) return body;
  const re = new RegExp(
    `<div[^>]*${SIGNATURE_MARKER}=["']1["'][^>]*>[\\s\\S]*?<\\/div>`,
    "gi",
  );
  return body.replace(re, "");
}

export function applySignatureToBody(body: string, sig: Signature | null): string {
  const stripped = stripSignature(body || "");
  if (!sig) return stripped;
  const sep = stripped && stripped !== "<p></p>" ? "<p><br></p>" : "";
  return `${stripped}${sep}${wrapSignature(sig.body)}`;
}
