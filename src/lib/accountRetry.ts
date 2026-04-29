// Automatic retry scheduler for accounts whose last sync failed.
// - Exponential backoff per account (15s → 30s → 1m → 2m → 5m → 10m → 30m max).
// - Reset on success.
// - Stops scheduling for accounts that no longer exist.
// - A single global ticker drives all per-account timers.

import { mailAPI, type Account } from "./mailBridge";
import {
  getAccountStatus,
  setAccountStatus,
  clearAccountStatus,
} from "./accountStatus";

const BACKOFFS_MS = [
  15_000,    // 1st retry: 15s after first failure
  30_000,
  60_000,
  2 * 60_000,
  5 * 60_000,
  10 * 60_000,
  30 * 60_000, // cap
];

function backoffFor(attempt: number): number {
  const idx = Math.min(attempt - 1, BACKOFFS_MS.length - 1);
  return BACKOFFS_MS[Math.max(0, idx)];
}

let knownAccounts: Account[] = [];
const inFlight = new Set<string>();
let tickerStarted = false;

export function setKnownAccounts(accounts: Account[]) {
  knownAccounts = accounts;
  // Clean up status for removed accounts
  // (handled by Index on delete, but be defensive)
}

/**
 * Mark a successful check: clears retry counter and next-retry timestamp.
 */
export function markSuccess(accountId: string) {
  setAccountStatus(accountId, {
    lastChecked: Date.now(),
    ok: true,
    attempt: 0,
    nextRetryAt: null,
  });
}

/**
 * Mark a failure and schedule an automatic retry with exponential backoff.
 */
export function markFailure(accountId: string, error: string) {
  const prev = getAccountStatus(accountId);
  const attempt = (prev?.attempt ?? 0) + 1;
  const nextRetryAt = Date.now() + backoffFor(attempt);
  setAccountStatus(accountId, {
    lastChecked: Date.now(),
    ok: false,
    error,
    attempt,
    nextRetryAt,
  });
}

async function attemptRetry(accountId: string) {
  if (inFlight.has(accountId)) return;
  inFlight.add(accountId);
  try {
    await mailAPI.imap.sync({ accountId, mailbox: "INBOX", limit: 1 });
    markSuccess(accountId);
  } catch (e: any) {
    markFailure(accountId, String(e?.message || e));
  } finally {
    inFlight.delete(accountId);
  }
}

function tick() {
  const now = Date.now();
  for (const a of knownAccounts) {
    const st = getAccountStatus(a.id);
    if (!st || st.ok) continue;
    if (!st.nextRetryAt) continue;
    if (st.nextRetryAt <= now) {
      // Trigger retry (fire-and-forget; markSuccess/Failure will reschedule)
      attemptRetry(a.id);
    }
  }
}

/**
 * Start the global retry ticker (idempotent). Re-evaluates every second so
 * the UI countdown stays in sync with the actual scheduled timestamp.
 */
export function startRetryScheduler() {
  if (tickerStarted) return;
  tickerStarted = true;
  setInterval(tick, 1000);
}

/**
 * Manually clear any pending retry for an account (e.g. when the user
 * deletes the account or runs a manual sync).
 */
export function cancelRetry(accountId: string) {
  const st = getAccountStatus(accountId);
  if (!st) return;
  if (st.nextRetryAt) {
    setAccountStatus(accountId, { ...st, nextRetryAt: null });
  }
}

export function clearRetryFor(accountId: string) {
  clearAccountStatus(accountId);
}
