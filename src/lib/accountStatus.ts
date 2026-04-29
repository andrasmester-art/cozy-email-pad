// Per-account sync status: last successful check, last error.
// Stored in localStorage so the UI can show it across reloads in both
// Electron and browser preview modes.

export type AccountStatus = {
  lastChecked: number | null; // epoch ms of last attempt
  ok: boolean;                // result of last attempt
  error?: string;             // error message if !ok
};

const KEY = "mailwise.accountStatus";

type Map = Record<string, AccountStatus>;

function readAll(): Map {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAll(map: Map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent("accountStatusChanged"));
  } catch {
    /* ignore */
  }
}

export function getAccountStatus(id: string): AccountStatus | null {
  return readAll()[id] ?? null;
}

export function getAllAccountStatuses(): Map {
  return readAll();
}

export function setAccountStatus(id: string, status: AccountStatus) {
  const all = readAll();
  all[id] = status;
  writeAll(all);
}

export function clearAccountStatus(id: string) {
  const all = readAll();
  delete all[id];
  writeAll(all);
}

export function formatRelative(ts: number | null): string {
  if (!ts) return "még nem ellenőrzött";
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "épp most";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} perce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} órája`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} napja`;
  return new Date(ts).toLocaleDateString("hu-HU");
}
