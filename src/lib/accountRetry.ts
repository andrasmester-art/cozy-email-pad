// Az IMAP/SMTP réteg el lett távolítva — a fiók-állapot követés és az
// automatikus újrapróbálkozás már nem értelmezett. Az API megmarad no-op
// függvényekként, hogy a meglévő hívási helyek ne törjenek.

import type { Account } from "./mailBridge";

export function setKnownAccounts(_accounts: Account[]) {
  /* no-op */
}

export function markSuccess(_accountId: string) {
  /* no-op */
}

export function markFailure(_accountId: string, _error: string) {
  /* no-op */
}

export function startRetryScheduler() {
  /* no-op */
}

export function cancelRetry(_accountId: string) {
  /* no-op */
}

export function clearRetryFor(_accountId: string) {
  /* no-op */
}
