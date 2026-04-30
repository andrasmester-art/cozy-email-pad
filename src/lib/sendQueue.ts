// Központi küldési állapotkövetés.
//
// Minden levél-küldés (Composerből vagy bárhonnan máshonnan) bekerül egy
// futási memóriában tartott Map-be, és állapotot kap:
//   - "sending"          : éppen folyamatban (a main process retry-zik 3×)
//   - "success"          : a szerver elfogadta
//   - "transient_error"  : átmeneti hiba (timeout, ECONNRESET, 4xx greylist) —
//                          a main process már 3× próbálta, mégis elbukott;
//                          érdemes manuálisan újraküldeni
//   - "permanent_error"  : végleges hiba (auth fail, 5xx, hibás cím) —
//                          retry valószínűleg nem segít, de a felhasználó
//                          szerkeszthet és újraküldhet
//
// A store eseményeket emittál (subscribe), így a SendStatusOverlay komponens
// reaktívan frissül anélkül, hogy a Composertől függne.

import { mailAPI } from "./mailBridge";
import { rememberAddresses } from "./addressBook";
import { clearDraft } from "./draft";

export type SendCategory = "transient" | "permanent" | "unknown";

export type SendStatus =
  | "sending"
  | "success"
  | "transient_error"
  | "permanent_error";

export type SendPayload = {
  accountId: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  text: string;
};

export type SendJob = {
  id: string;
  payload: SendPayload;
  status: SendStatus;
  createdAt: number;
  finishedAt?: number;
  attempts: number;
  errorMessage?: string;
  errorCategory?: SendCategory;
  // A main process v1.31.0-tól a hibaüzenetbe beilleszti, hogy mentette-e
  // a piszkozatot a szerver Drafts mappájába.
  draftSavedToServer?: boolean;
  // Késleltetett küldés (Visszavonás countdown) alatti megszakító.
  cancel?: () => void;
  // Késleltetés alatt: hátralévő mp + teljes mp.
  countdown?: { remaining: number; total: number };
};

const jobs = new Map<string, SendJob>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

export function subscribeSendQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function listSendJobs(): SendJob[] {
  // Legújabb felül.
  return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getSendJob(id: string): SendJob | undefined {
  return jobs.get(id);
}

function update(id: string, patch: Partial<SendJob>) {
  const prev = jobs.get(id);
  if (!prev) return;
  jobs.set(id, { ...prev, ...patch });
  emit();
}

// Sikeres küldés után 8 mp-vel automatikusan eltávolítjuk a queue-ból,
// hogy ne nőjön végtelenül. Hibás bejegyzések maradnak, amíg a
// felhasználó manuálisan ki nem törli vagy újra nem küldi sikeresen.
const SUCCESS_AUTO_DISMISS_MS = 8000;

export function dismissJob(id: string) {
  if (jobs.delete(id)) emit();
}

export function clearFinishedJobs() {
  let changed = false;
  for (const [id, job] of jobs.entries()) {
    if (job.status !== "sending") {
      jobs.delete(id);
      changed = true;
    }
  }
  if (changed) emit();
}

// A main process error message-éből kiolvassuk a kategóriát. Az `electron/main.cjs`
// `runWithRetry` + `isPermanentError` logikája az alábbi mintákat használja:
//   "SMTP hiba (átmeneti, 3 próbálkozás után, ETIMEDOUT): …"
//   "SMTP hiba (permanens, EAUTH): …"
// A draft-mentés státusza is benne lehet:
//   "… A piszkozat a szerver Drafts mappájába mentve."
//   "… Drafts-mentés is sikertelen: …"
function parseErrorMessage(raw: string): {
  category: SendCategory;
  draftSaved: boolean;
} {
  const lower = raw.toLowerCase();
  let category: SendCategory = "unknown";
  if (lower.includes("átmeneti") || lower.includes("transient") || lower.includes("timeout")
      || lower.includes("econnreset") || lower.includes("econnrefused") || lower.includes("greylist")) {
    category = "transient";
  } else if (lower.includes("permanens") || lower.includes("permanent")
      || lower.includes("eauth") || lower.includes("authentication")
      || lower.includes("550") || lower.includes("553") || lower.includes("554")
      || lower.includes("535") || lower.includes("538")) {
    category = "permanent";
  }
  const draftSaved = lower.includes("drafts mappájába mentve")
                  || lower.includes("saved to drafts");
  return { category, draftSaved };
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Egy küldés indítása. Visszaadja a job ID-t. Az await csak akkor reject-el,
// ha a hívó kifejezetten kéri (most nem — a Composer már nem várja meg).
//
// Opciók:
//   - delaySec: ha > 0, „Visszavonás" countdown indul a queue-ba kerülés
//     előtt. Ez idő alatt a job már ott van a queue-ban "sending" állapotban
//     (countdown mezővel), és az UI mutathat „Mégsem" gombot.
//
// onSuccess opcionális callback, hogy a Composer be tudja zárni magát.
export function enqueueSend(
  payload: SendPayload,
  opts: { delaySec?: number; onSuccess?: () => void } = {},
): string {
  const id = newId();
  const job: SendJob = {
    id,
    payload,
    status: "sending",
    createdAt: Date.now(),
    attempts: 0,
  };
  jobs.set(id, job);

  const performSend = async () => {
    update(id, { attempts: (jobs.get(id)?.attempts || 0) + 1, countdown: undefined });
    try {
      await mailAPI.smtp.send(payload);
      // Címek megtanulása az autocomplete-hez.
      try {
        rememberAddresses([payload.to, payload.cc || "", payload.bcc || ""].filter(Boolean).join(","));
      } catch { /* ignore */ }
      update(id, { status: "success", finishedAt: Date.now(), errorMessage: undefined, errorCategory: undefined });
      try { opts.onSuccess?.(); } catch { /* ignore */ }
      // Auto-dismiss.
      setTimeout(() => {
        const j = jobs.get(id);
        if (j && j.status === "success") dismissJob(id);
      }, SUCCESS_AUTO_DISMISS_MS);
    } catch (e: any) {
      const msg = String(e?.message || e);
      const { category, draftSaved } = parseErrorMessage(msg);
      update(id, {
        status: category === "permanent" ? "permanent_error" : "transient_error",
        finishedAt: Date.now(),
        errorMessage: msg,
        errorCategory: category,
        draftSavedToServer: draftSaved,
      });
    }
  };

  if (!opts.delaySec || opts.delaySec <= 0) {
    void performSend();
    return id;
  }

  // Késleltetett küldés countdown-nal.
  let remaining = opts.delaySec;
  let cancelled = false;
  update(id, { countdown: { remaining, total: opts.delaySec } });

  const tick = setInterval(() => {
    remaining -= 1;
    if (cancelled) return;
    if (remaining > 0) {
      update(id, { countdown: { remaining, total: opts.delaySec! } });
    } else {
      clearInterval(tick);
    }
  }, 1000);

  const timer = setTimeout(() => {
    clearInterval(tick);
    if (cancelled) return;
    void performSend();
  }, opts.delaySec * 1000);

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    clearInterval(tick);
    clearTimeout(timer);
    // Cancellált küldés → eltávolítjuk a queue-ból (nem hiba, csak elálltunk).
    dismissJob(id);
  };
  update(id, { cancel });

  return id;
}

// Újraküldés ugyanazzal a payload-dal. A régi job státusza átkapcsol
// "sending"-re és minden hiba-mező tisztul.
export function retrySend(id: string): void {
  const job = jobs.get(id);
  if (!job || job.status === "sending") return;
  update(id, {
    status: "sending",
    errorMessage: undefined,
    errorCategory: undefined,
    draftSavedToServer: undefined,
    finishedAt: undefined,
    countdown: undefined,
  });
  (async () => {
    update(id, { attempts: (jobs.get(id)?.attempts || 0) + 1 });
    try {
      await mailAPI.smtp.send(job.payload);
      try {
        rememberAddresses([job.payload.to, job.payload.cc || "", job.payload.bcc || ""].filter(Boolean).join(","));
      } catch { /* ignore */ }
      try { clearDraft(); } catch { /* ignore */ }
      update(id, { status: "success", finishedAt: Date.now() });
      setTimeout(() => {
        const j = jobs.get(id);
        if (j && j.status === "success") dismissJob(id);
      }, SUCCESS_AUTO_DISMISS_MS);
    } catch (e: any) {
      const msg = String(e?.message || e);
      const { category, draftSaved } = parseErrorMessage(msg);
      update(id, {
        status: category === "permanent" ? "permanent_error" : "transient_error",
        finishedAt: Date.now(),
        errorMessage: msg,
        errorCategory: category,
        draftSavedToServer: draftSaved,
      });
    }
  })();
}

// React hook a queue feliratkozásra (Re-render minden változásnál).
import { useEffect, useState } from "react";

export function useSendJobs(): SendJob[] {
  const [snapshot, setSnapshot] = useState<SendJob[]>(() => listSendJobs());
  useEffect(() => {
    const tick = () => setSnapshot(listSendJobs());
    const unsub = subscribeSendQueue(tick);
    return unsub;
  }, []);
  return snapshot;
}
