// Persists the currently-edited (unsent) composer draft to localStorage so
// it survives reloads, accidental closes, or app restarts.
import { normalizeAddressField } from "./emailAddress";

const KEY = "mw.composer.draft.v1";

export type Draft = {
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  showCc: boolean;
  subject: string;
  body: string;
  updatedAt: number;
};

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || typeof d !== "object") return null;
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  try {
    // Persist a normalised copy of the recipient fields so reopening the draft
    // yields the same canonical form (deduped, lowercased domains, "Name <addr>").
    const normalised: Draft = {
      ...d,
      to: normalizeAddressField(d.to || ""),
      cc: normalizeAddressField(d.cc || ""),
      bcc: normalizeAddressField(d.bcc || ""),
    };
    localStorage.setItem(KEY, JSON.stringify(normalised));
  } catch {
    // ignore quota errors
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function isDraftMeaningful(d: Partial<Draft> | null | undefined): boolean {
  if (!d) return false;
  const text = (d.body || "").replace(/<[^>]*>/g, "").trim();
  return Boolean(
    (d.to && d.to.trim()) ||
    (d.cc && d.cc.trim()) ||
    (d.bcc && d.bcc.trim()) ||
    (d.subject && d.subject.trim()) ||
    text
  );
}
