// Default "from" account for new messages. Persisted in localStorage so the
// preference survives reloads and works in both Electron and browser preview.

const KEY = "mailwise.defaultAccountId";

export function getDefaultAccountId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setDefaultAccountId(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("defaultAccountChanged", { detail: id }));
  } catch {
    /* ignore */
  }
}
