import { MailMessage } from "@/lib/mailBridge";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { hu } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw, Loader2, Star, Mail, Rows3, Reply, ReplyAll, Forward, ExternalLink, Copy, MailOpen, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "sonner";
import * as React from "react";
import { useState, useMemo, useRef, useEffect } from "react";

// A levéllista sortávolsága (sűrűsége). A választás localStorage-ben
// perzisztálódik, hogy újraindításkor is ugyanúgy nézzen ki.
export type ListDensity = "compact" | "comfortable" | "relaxed";
const DENSITY_KEY = "mw.layout.listDensity";
function readDensity(): ListDensity {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    if (v === "compact" || v === "comfortable" || v === "relaxed") return v;
  } catch {}
  return "comfortable";
}
function writeDensity(d: ListDensity) {
  try { localStorage.setItem(DENSITY_KEY, d); } catch {}
}
// Az egyes sűrűségi módok Tailwind-stílusai: a függőleges padding és a
// belső sorok közti rés állítja a tényleges „sortávolságot".
const DENSITY_STYLES: Record<ListDensity, { padding: string; gap: string }> = {
  compact:     { padding: "py-1.5", gap: "mt-0" },
  comfortable: { padding: "py-3",   gap: "mt-0.5" },
  relaxed:     { padding: "py-4",   gap: "mt-1" },
};
const DENSITY_LABEL: Record<ListDensity, string> = {
  compact: "Tömör",
  comfortable: "Kényelmes",
  relaxed: "Tágas",
};

type Props = {
  messages: MailMessage[];
  selectedSeqno: number | null;
  onSelect: (m: MailMessage) => void;
  onOpen?: (m: MailMessage) => void;
  onToggleFlag?: (m: MailMessage) => void;
  onToggleSeen?: (m: MailMessage) => void;
  onReply?: (m: MailMessage) => void;
  onReplyAll?: (m: MailMessage) => void;
  onForward?: (m: MailMessage) => void;
  onDelete?: (m: MailMessage) => void;
  loading: boolean;
  onRefresh: () => void;
  mailbox: string;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  exhausted?: boolean;
  /** Pixel-szélesség; ha nincs megadva, a régi 340px alapértékre esik vissza. */
  width?: number;
};

function senderName(from: string) {
  const m = from.match(/^"?([^"<]+?)"?\s*<.+>$/);
  return (m ? m[1] : from).trim() || from;
}

// Email cím kinyerése egy "Név <a@b>" stílusú stringből — a context menü
// "Feladó címének másolása" pontja használja.
function extractEmail(s: string): string {
  if (!s) return "";
  const m = s.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  return (m ? m[1] : s).trim();
}

type FilterMode = "all" | "unread" | "flagged";

export function MessageList({ messages, selectedSeqno, onSelect, onOpen, onToggleFlag, onToggleSeen, onReply, onReplyAll, onForward, onDelete, loading, onRefresh, mailbox, onLoadMore, loadingMore, exhausted, width }: Props) {
  const [q, setQ] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [density, setDensityState] = useState<ListDensity>(readDensity);
  const setDensity = (d: ListDensity) => { setDensityState(d); writeDensity(d); };

  // Mappaváltáskor visszaállunk az "Összes" szűrőre, hogy ne maradjon rajta
  // egy üres találati lista egy másik mappában.
  useEffect(() => { setFilterMode("all"); }, [mailbox]);

  const unreadCount = useMemo(() => messages.filter((m) => m.seen === false).length, [messages]);
  const flaggedCount = useMemo(() => messages.filter((m) => !!m.flagged).length, [messages]);

  const filtered = useMemo(() => {
    let list = messages;
    if (filterMode === "unread") list = list.filter((m) => m.seen === false);
    else if (filterMode === "flagged") list = list.filter((m) => !!m.flagged);
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter(
      (m) =>
        m.subject.toLowerCase().includes(needle) ||
        m.from.toLowerCase().includes(needle) ||
        m.snippet.toLowerCase().includes(needle),
    );
  }, [messages, q, filterMode]);

  return (
    <div
      className="shrink-0 border-r border-border bg-surface flex flex-col h-full"
      style={{ width: width ?? 340 }}
    >
      <div className="mac-titlebar shrink-0 flex items-center justify-between px-3">
        <div>
          <div className="text-sm font-semibold">{mailbox}</div>
          <div className="text-xs text-muted-foreground">{filtered.length} üzenet</div>
        </div>
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title={`Sortávolság: ${DENSITY_LABEL[density]}`}
              >
                <Rows3 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sortávolság</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(["compact", "comfortable", "relaxed"] as ListDensity[]).map((d) => (
                <DropdownMenuItem
                  key={d}
                  onClick={() => setDensity(d)}
                  className={density === d ? "bg-accent text-accent-foreground" : ""}
                >
                  {DENSITY_LABEL[d]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRefresh} title="Frissítés">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="px-3 pb-2 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Keresés"
            className="pl-8 h-8 bg-muted/60 border-transparent focus-visible:bg-surface"
          />
        </div>

        <div className="flex items-center gap-1" role="tablist" aria-label="Lista szűrő">
          <FilterChip
            active={filterMode === "all"}
            onClick={() => setFilterMode("all")}
            label="Összes"
            count={messages.length}
          />
          <FilterChip
            active={filterMode === "unread"}
            onClick={() => setFilterMode(filterMode === "unread" ? "all" : "unread")}
            label="Olvasatlan"
            count={unreadCount}
            icon={<Mail className="h-3 w-3" />}
          />
          <FilterChip
            active={filterMode === "flagged"}
            onClick={() => setFilterMode(filterMode === "flagged" ? "all" : "flagged")}
            label="Csillagos"
            count={flaggedCount}
            icon={<Star className={cn("h-3 w-3", filterMode === "flagged" && "fill-current")} />}
            accent="amber"
          />
        </div>
      </div>

      <ScrollList
        loading={loading}
        messages={messages}
        filtered={filtered}
        selectedSeqno={selectedSeqno}
        onSelect={onSelect}
        onOpen={onOpen}
        onToggleFlag={onToggleFlag}
        onToggleSeen={onToggleSeen}
        onReply={onReply}
        onReplyAll={onReplyAll}
        onForward={onForward}
        onDelete={onDelete}
        onLoadMore={onLoadMore}
        loadingMore={loadingMore}
        exhausted={exhausted}
        density={density}
        searching={!!q.trim() || filterMode !== "all"}
        emptyHint={
          filterMode === "unread" ? "Nincs olvasatlan levél"
          : filterMode === "flagged" ? "Nincs megjelölt levél"
          : undefined
        }
      />
    </div>
  );
}

function FilterChip({
  active, onClick, label, count, icon, accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ReactNode;
  accent?: "amber";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium transition-colors border",
        active
          ? accent === "amber"
            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700"
            : "bg-primary text-primary-foreground border-primary"
          : "bg-transparent text-muted-foreground border-border hover:bg-muted/60",
      )}
    >
      {icon}
      <span>{label}</span>
      <span className={cn(
        "tabular-nums px-1 rounded text-[10px]",
        active ? "bg-background/20" : "bg-muted/60",
      )}>
        {count}
      </span>
    </button>
  );
}

// `forwardRef`-tel definiáljuk, hogy a Radix `ContextMenu` (és bármely más
// szülő, ami a children-en keresztül ref-et próbál átadni) ne dobja a
// „Function components cannot be given refs … Check the render method of
// `ScrollList`" dev-warningot. A külső ref-et a görgethető konténerre kötjük,
// hogy a hívó pl. programatikusan tudna scrollozni / méretet mérni.
const ScrollList = React.forwardRef<HTMLDivElement, {
  loading: boolean;
  messages: MailMessage[];
  filtered: MailMessage[];
  selectedSeqno: number | null;
  onSelect: (m: MailMessage) => void;
  onOpen?: (m: MailMessage) => void;
  onToggleFlag?: (m: MailMessage) => void;
  onToggleSeen?: (m: MailMessage) => void;
  onReply?: (m: MailMessage) => void;
  onReplyAll?: (m: MailMessage) => void;
  onForward?: (m: MailMessage) => void;
  onDelete?: (m: MailMessage) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  exhausted?: boolean;
  searching: boolean;
  emptyHint?: string;
  density: ListDensity;
}>(function ScrollList({
  loading, messages, filtered, selectedSeqno, onSelect, onOpen, onToggleFlag, onToggleSeen, onReply, onReplyAll, onForward, onDelete, onLoadMore, loadingMore, exhausted, searching, emptyHint, density,
}, forwardedRef) {
  const ref = useRef<HTMLDivElement>(null);
  // A belső ref-et és a kívülről kapott ref-et ugyanarra a DOM-elemre kötjük.
  React.useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onLoadMore || searching) return;
    const onScroll = () => {
      if (loadingMore || exhausted) return;
      // 200px-en belül az aljához → következő oldal
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
        onLoadMore();
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [onLoadMore, loadingMore, exhausted, searching]);

  return (
    <div ref={ref} className="flex-1 overflow-y-auto">
      {loading && messages.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Betöltés…</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">{emptyHint || "Nincs üzenet"}</div>
      ) : (
        <>
          <ul>
            {filtered.map((m) => {
              const active = selectedSeqno === m.seqno;
              const unread = m.seen === false;
              const flagged = !!m.flagged;
              return (
                <li key={m.seqno + ":" + (m.uid ?? "")} className="relative">
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <button
                        onClick={() => onSelect(m)}
                        onDoubleClick={() => onOpen?.(m)}
                        className={cn(
                          "w-full text-left pl-4 pr-10 border-b border-border/60 transition-colors",
                          DENSITY_STYLES[density].padding,
                          active ? "bg-accent" : "hover:bg-muted/60",
                          flagged && !active && "bg-amber-50/60 dark:bg-amber-950/20",
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="flex items-center gap-2 min-w-0">
                            {unread && (
                              <span
                                className="h-2 w-2 rounded-full bg-primary shrink-0"
                                aria-label="Olvasatlan"
                              />
                            )}
                            <span className={cn("text-sm truncate", unread || active ? "font-semibold" : "font-medium")}>
                              {senderName(m.from)}
                            </span>
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {m.date
                              ? formatDistanceToNowStrict(new Date(m.date), { locale: hu, addSuffix: false })
                              : ""}
                          </span>
                        </div>
                        <div className={cn("flex items-center gap-1.5 text-sm truncate", DENSITY_STYLES[density].gap, unread && "font-semibold")}>
                          {(m.hasAttachments || (m.attachments && m.attachments.length > 0)) && (
                            <Paperclip
                              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                              aria-label="Csatolmány"
                            />
                          )}
                          <span className="truncate">{m.subject}</span>
                        </div>
                        <div className={cn("text-xs text-muted-foreground truncate", DENSITY_STYLES[density].gap)}>{m.snippet}</div>
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-56">
                      {onReply && (
                        <ContextMenuItem onSelect={() => onReply(m)}>
                          <Reply className="h-4 w-4 mr-2" /> Válasz
                        </ContextMenuItem>
                      )}
                      {onReplyAll && (
                        <ContextMenuItem onSelect={() => onReplyAll(m)}>
                          <ReplyAll className="h-4 w-4 mr-2" /> Válasz mindenkinek
                        </ContextMenuItem>
                      )}
                      {onForward && (
                        <ContextMenuItem onSelect={() => onForward(m)}>
                          <Forward className="h-4 w-4 mr-2" /> Továbbítás
                        </ContextMenuItem>
                      )}
                      {onOpen && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem onSelect={() => onOpen(m)}>
                            <ExternalLink className="h-4 w-4 mr-2" /> Megnyitás új ablakban
                          </ContextMenuItem>
                        </>
                      )}
                      <ContextMenuSeparator />
                      {onToggleSeen && (
                        <ContextMenuItem onSelect={() => onToggleSeen(m)}>
                          {unread ? (
                            <><Mail className="h-4 w-4 mr-2" /> Megjelölés olvasottnak</>
                          ) : (
                            <><MailOpen className="h-4 w-4 mr-2" /> Megjelölés olvasatlannak</>
                          )}
                        </ContextMenuItem>
                      )}
                      {onToggleFlag && (
                        <ContextMenuItem onSelect={() => onToggleFlag(m)}>
                          <Star className={cn("h-4 w-4 mr-2", flagged && "fill-current text-amber-500")} />
                          {flagged ? "Csillag eltávolítása" : "Megjelölés csillaggal"}
                        </ContextMenuItem>
                      )}
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onSelect={async () => {
                          try {
                            await navigator.clipboard.writeText(extractEmail(m.from));
                            toast.success("Feladó címe másolva");
                          } catch { toast.error("Másolás sikertelen"); }
                        }}
                      >
                        <Copy className="h-4 w-4 mr-2" /> Feladó címének másolása
                      </ContextMenuItem>
                      <ContextMenuItem
                        onSelect={async () => {
                          try {
                            await navigator.clipboard.writeText(m.subject || "");
                            toast.success("Tárgy másolva");
                          } catch { toast.error("Másolás sikertelen"); }
                        }}
                      >
                        <Copy className="h-4 w-4 mr-2" /> Tárgy másolása
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                  {onToggleFlag && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onToggleFlag(m); }}
                      className={cn(
                        "absolute top-2 right-2 p-1.5 rounded-md transition-opacity",
                        flagged
                          ? "opacity-100 text-amber-500 hover:bg-amber-100/60 dark:hover:bg-amber-900/30"
                          : "opacity-40 hover:opacity-100 text-muted-foreground hover:bg-muted",
                      )}
                      title={flagged ? "Csillag eltávolítása" : "Megjelölés csillaggal"}
                      aria-label={flagged ? "Csillag eltávolítása" : "Megjelölés csillaggal"}
                    >
                      <Star className={cn("h-3.5 w-3.5", flagged && "fill-current")} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {!searching && (
            <div className="p-4 flex items-center justify-center gap-2 text-xs text-muted-foreground border-t border-border/60">
              {loadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="font-medium">Régebbi levelek betöltése…</span>
                </>
              ) : exhausted ? (
                <span>Nincs több régebbi levél</span>
              ) : (
                <span>Görgess lejjebb régebbi levelekért</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
});
ScrollList.displayName = "ScrollList";
