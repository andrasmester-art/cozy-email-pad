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

// HTML wrapper used to identify a quoted previous message (reply/forward).
// Lets us position the signature ABOVE the quote on replies, while still
// keeping it at the very end on a fresh new email.
export const QUOTE_MARKER = "data-mwquote";

export function wrapSignature(html: string): string {
  // Defensive: also sanitise at insertion time, so legacy unsanitised entries
  // already in localStorage are cleaned before being merged into a draft.
  const safe = sanitizeEmailHtml(html || "");
  return `<div ${SIGNATURE_MARKER}="1">${safe}</div>`;
}

export function stripSignature(body: string): string {
  if (!body) return body;
  const re = new RegExp(
    `<div[^>]*${SIGNATURE_MARKER}=["']1["'][^>]*>[\\s\\S]*?<\\/div>`,
    "gi",
  );
  return body.replace(re, "");
}

/**
 * Insert (or swap) the signature into `body`.
 *
 * - **New email** (no quoted previous message): signature is appended to the
 *   very end of the body.
 * - **Reply / forward** (body contains a `data-mwquote` block): signature is
 *   inserted **right before the OUTERMOST quote**, so the recipient sees:
 *   `[user's reply] [signature] [previous email quote(s)]` — matching how
 *   Apple Mail / Gmail / Outlook lay out replies.
 *
 *   Egymásba ágyazott idézetek (pl. forward-olt reply, ami egy korábbi reply
 *   quote-ot is tartalmaz, vagy több egymás utáni `data-mwquote` blokk)
 *   esetén DOM-szinten keressük meg a *legkülső, legkorábban előforduló*
 *   quote-blokkot, és AZ ELÉ tesszük az aláírást — így a belső, ágyazott
 *   idézetek érintetlenül maradnak a quote-blokkon belül.
 */
export function applySignatureToBody(body: string, sig: Signature | null): string {
  const stripped = stripSignature(body || "");
  if (!sig) return stripped;

  // DOM-alapú megközelítés: megbízhatóan kezeli az egymásba ágyazott
  // idézeteket. Ha nincs `document` (SSR/test), regex-fallback-re vált.
  if (typeof document !== "undefined") {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = stripped;

    // Az ÖSSZES quote-jelölt elem közül azokat tartjuk meg, amelyeknek
    // nincs `[data-mwquote="1"]` ősük a wrapper-en belül — ezek a
    // „top-level" quote-ok. Közülük a DOM-sorrendben legelsőt vesszük.
    const allQuotes = Array.from(
      wrapper.querySelectorAll<HTMLElement>(`[${QUOTE_MARKER}="1"]`),
    );
    const topLevelQuotes = allQuotes.filter(
      (el) => !el.parentElement?.closest(`[${QUOTE_MARKER}="1"]`),
    );

    if (topLevelQuotes.length > 0) {
      const firstTop = topLevelQuotes[0];
      // Aláírás-csomag DOM-node-ként, hogy az `insertBefore` natívan kezelje.
      const sigHolder = document.createElement("div");
      sigHolder.innerHTML = wrapSignature(sig.body);
      const sigNode = sigHolder.firstElementChild;
      if (sigNode) {
        // Esztétikai elválasztó: üres bekezdés a tartalom és aláírás közé,
        // hogy ne tapadjon hozzá az utolsó sor.
        const hasContentBefore = (() => {
          // Van-e nem-üres szöveg vagy elem a quote ELŐTT a wrapperben?
          let n: Node | null = firstTop.previousSibling;
          while (n) {
            if (n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim()) return true;
            if (n.nodeType === Node.ELEMENT_NODE) {
              const html = (n as HTMLElement).outerHTML;
              if (html && html !== "<p></p>") return true;
            }
            n = n.previousSibling;
          }
          return false;
        })();
        if (hasContentBefore) {
          const sep = document.createElement("p");
          sep.innerHTML = "<br>";
          firstTop.parentNode?.insertBefore(sep, firstTop);
        }
        firstTop.parentNode?.insertBefore(sigNode, firstTop);
        return wrapper.innerHTML;
      }
    }

    // Nincs quote-blokk → új levél: aláírás a végére.
    const sep = stripped && stripped !== "<p></p>" ? "<p><br></p>" : "";
    return `${stripped}${sep}${wrapSignature(sig.body)}`;
  }

  // ---- SSR/test fallback: az eredeti regex-alapú logika (string-pozíció
  // szerinti első quote — egymás utáni quote-oknál ez is helyes). ----
  const quoteRe = new RegExp(
    `<(blockquote|div)[^>]*${QUOTE_MARKER}=["']1["'][\\s\\S]*`,
    "i",
  );
  const match = stripped.match(quoteRe);
  if (match && match.index !== undefined) {
    const before = stripped.slice(0, match.index);
    const quote = stripped.slice(match.index);
    const sep = before && before !== "<p></p>" ? "<p><br></p>" : "";
    return `${before}${sep}${wrapSignature(sig.body)}${quote}`;
  }

  const sep = stripped && stripped !== "<p></p>" ? "<p><br></p>" : "";
  return `${stripped}${sep}${wrapSignature(sig.body)}`;
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

export const SIGNATURES_EXPORT_VERSION = 1;

export type SignaturesExport = {
  version: number;
  exportedAt: number;
  signatures: Signature[];
};

/** Build a JSON-serialisable bundle of all signatures. */
export function exportSignatures(): SignaturesExport {
  return {
    version: SIGNATURES_EXPORT_VERSION,
    exportedAt: Date.now(),
    signatures: readSigs(),
  };
}

/** Trigger a browser download with the current signatures bundle. */
export function downloadSignaturesJson(filename = "mepodmail-signatures.json") {
  const data = exportSignatures();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the click can resolve in all browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ImportMode = "merge" | "replace";

export type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
};

/**
 * Validate a parsed JSON object and import its signatures.
 * - "merge" (default): keep existing, add new ones, update by id collision.
 * - "replace": discard all existing signatures and use only the imported ones.
 *
 * Bodies are sanitised through saveSignature → sanitizeEmailHtml so untrusted
 * HTML cannot be injected via the import file.
 */
export function importSignatures(
  payload: unknown,
  mode: ImportMode = "merge",
): ImportResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("Érvénytelen fájl: nem JSON objektum.");
  }
  const obj = payload as Partial<SignaturesExport>;
  if (!Array.isArray(obj.signatures)) {
    throw new Error("Érvénytelen fájl: hiányzik a 'signatures' tömb.");
  }

  // Normalise + validate each entry.
  const incoming: Signature[] = [];
  for (const raw of obj.signatures) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Partial<Signature>;
    if (typeof s.name !== "string" || typeof s.body !== "string") continue;
    incoming.push({
      id: typeof s.id === "string" && s.id.trim() ? s.id : `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: s.name.slice(0, 200),
      body: s.body, // sanitisation happens inside saveSignature()
      updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : Date.now(),
    });
  }

  if (incoming.length === 0) {
    return { imported: 0, updated: 0, skipped: 0, total: 0 };
  }

  if (mode === "replace") {
    writeSigs([]);
  }

  const before = new Map(readSigs().map((s) => [s.id, s]));
  let imported = 0;
  let updated = 0;
  for (const sig of incoming) {
    if (before.has(sig.id)) updated += 1;
    else imported += 1;
    saveSignature(sig); // sanitises + writes + dispatches event
  }

  return {
    imported,
    updated,
    skipped: (obj.signatures.length || 0) - incoming.length,
    total: incoming.length,
  };
}
