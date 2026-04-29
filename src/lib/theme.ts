// Téma-kezelés: világos / sötét / rendszer (auto). A választást
// localStorage-be mentjük, és a `<html>` elemen váltjuk a `.dark` osztályt
// — ehhez a tailwind.config.ts `darkMode: ["class"]`-szal van konfigurálva,
// és az index.css-ben minden CSS változó (`--background`, `--foreground`,
// `--surface`, …) megfelelő dark értékkel rendelkezik a `.dark` blokkban.
//
// A "system" mód a `prefers-color-scheme` médialekérdezést követi, és
// élőben reagál a rendszerszintű váltásra (pl. macOS automatikus est).
import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "mw.theme";

function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

/** A `<html>` `.dark` osztály ténylegesen érvényben lévő értéke a `theme` alapján. */
function resolveDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return systemPrefersDark();
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (resolveDark(theme)) root.classList.add("dark");
  else root.classList.remove("dark");
  // Natív űrlap-elemek (input, scrollbar) színsémája
  root.style.colorScheme = resolveDark(theme) ? "dark" : "light";
}

/** Korai inicializálás (main.tsx-ből hívandó), hogy ne villanjon a világos téma. */
export function initTheme() {
  applyTheme(readStoredTheme());
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // Téma állítása + perzisztálás + DOM-frissítés.
  const setTheme = (next: Theme) => {
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    applyTheme(next);
    window.dispatchEvent(new CustomEvent("themeChanged", { detail: next }));
  };

  // A „system" módban élőben követjük az OS sötét/világos váltását.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = () => applyTheme("system");
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [theme]);

  // Más ablakból/komponensből történő témaváltás szinkronizálása.
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      if (next && next !== theme) setThemeState(next);
    };
    window.addEventListener("themeChanged", handler);
    return () => window.removeEventListener("themeChanged", handler);
  }, [theme]);

  return { theme, setTheme, isDark: resolveDark(theme) };
}
