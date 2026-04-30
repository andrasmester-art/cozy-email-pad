// Címzett-mező autocomplete-tel a To/Cc/Bcc-hez. Vesszővel/pontosvesszővel
// több címet is kezel; a felhasználó épp gépelt utolsó "tokenére" javasol.
//
// Vezérlés:
//   - ↓/↑ navigál a listában
//   - Enter / Tab kiválasztja a kiemelt találatot
//   - Esc bezárja a listát
//   - Egér: kattintásra beilleszti
//
// A kiválasztott javaslatot az utolsó token helyére írjuk, és egy ", "
// elválasztót teszünk utána, hogy a felhasználó folytathassa a gépelést.

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchAddresses, formatAddress, type AddressEntry } from "@/lib/addressBook";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
};

// Az utolsó token kezdő-indexének és szövegének kiszámítása. A vessző és
// pontosvessző egyaránt elválasztó.
function getActiveToken(value: string, caret: number) {
  const upto = value.slice(0, caret);
  const sepIdx = Math.max(upto.lastIndexOf(","), upto.lastIndexOf(";"));
  const start = sepIdx === -1 ? 0 : sepIdx + 1;
  const tokenRaw = value.slice(start, caret);
  const leading = tokenRaw.match(/^\s*/)?.[0].length ?? 0;
  return {
    start: start + leading,
    end: caret,
    text: tokenRaw.trimStart(),
  };
}

export function RecipientInput({ value, onChange, placeholder, className, ariaLabel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [caret, setCaret] = useState(0);
  // Külső változás (pl. ablak újra-megnyitás) is triggerelje az újrarendert
  // a localStorage-frissítések után.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const h = () => setTick((n) => n + 1);
    window.addEventListener("addressBookChanged", h);
    return () => window.removeEventListener("addressBookChanged", h);
  }, []);

  const token = useMemo(() => getActiveToken(value, caret), [value, caret]);

  // Csak akkor mutassunk találatokat, ha a felhasználó gépelt valamit ebbe a
  // tokenbe. Üres tokenre nem nyomulunk a felületre.
  const suggestions: AddressEntry[] = useMemo(() => {
    if (!open) return [];
    if (!token.text) return [];
    return searchAddresses(token.text, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token.text, tick]);

  // Új gépelésnél kezdjük az első találattól.
  useEffect(() => {
    setHighlight(0);
  }, [token.text, suggestions.length]);

  const updateCaretFromEvent = (el: HTMLInputElement) => {
    setCaret(el.selectionStart ?? el.value.length);
  };

  const insertSuggestion = (entry: AddressEntry) => {
    const replacement = formatAddress(entry);
    const before = value.slice(0, token.start);
    const after = value.slice(token.end);
    // Ha utána már van szöveg (pl. ", másik@x.hu"), ne tegyünk plusz vesszőt.
    const needsSeparator = after.trim().length === 0;
    const next = before + replacement + (needsSeparator ? ", " : "") + after;
    onChange(next);
    setOpen(false);
    // A kurzor a beillesztés utáni pozícióra ugorjon.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const pos = before.length + replacement.length + (needsSeparator ? 2 : 0);
      el.focus();
      el.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      // Ha nincs nyitva a lista, hagyjuk a normál működést. A le-nyíl
      // viszont nyissa meg, ha van mit ajánlani.
      if (e.key === "ArrowDown" && token.text) {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertSuggestion(suggestions[highlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={cn("relative flex-1", className)}>
      <Input
        ref={inputRef}
        value={value}
        aria-label={ariaLabel}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          updateCaretFromEvent(e.target);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => updateCaretFromEvent(e.currentTarget)}
        onClick={(e) => {
          updateCaretFromEvent(e.currentTarget);
          setOpen(true);
        }}
        onFocus={(e) => {
          updateCaretFromEvent(e.currentTarget);
          setOpen(true);
        }}
        // 150ms késleltetés, hogy a kattintás végbemehessen a listán mielőtt bezárjuk.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="h-8 w-full"
      />
      {open && suggestions.length > 0 && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-mac-lg"
        >
          {suggestions.map((s, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === highlight}
              key={s.email}
              // mousedown, hogy az input blur eseménye előtt fusson le.
              onMouseDown={(e) => {
                e.preventDefault();
                insertSuggestion(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "w-full text-left px-3 py-1.5 text-sm flex flex-col gap-0.5",
                i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
              )}
            >
              {s.name ? (
                <>
                  <span className="truncate">{s.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{s.email}</span>
                </>
              ) : (
                <span className="truncate">{s.email}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
