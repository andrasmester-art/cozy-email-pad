// Undo-send delay setting (seconds). Stored in localStorage so it persists
// across both Electron and the browser preview.

const KEY = "mailwise.sendDelaySeconds";
const DEFAULT_DELAY = 5;

export const SEND_DELAY_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60];

export function getSendDelay(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return DEFAULT_DELAY;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0) return DEFAULT_DELAY;
    return n;
  } catch {
    return DEFAULT_DELAY;
  }
}

export function setSendDelay(seconds: number) {
  const clamped = Math.max(0, Math.min(120, Math.round(seconds / 5) * 5));
  localStorage.setItem(KEY, String(clamped));
  window.dispatchEvent(new CustomEvent("sendDelayChanged", { detail: clamped }));
}

export function formatDelay(seconds: number): string {
  if (seconds === 0) return "Azonnal";
  return `${seconds} mp`;
}
