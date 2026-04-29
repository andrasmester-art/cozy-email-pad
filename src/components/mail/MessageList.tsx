import { MailMessage } from "@/lib/mailBridge";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { hu } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";

type Props = {
  messages: MailMessage[];
  selectedSeqno: number | null;
  onSelect: (m: MailMessage) => void;
  loading: boolean;
  onRefresh: () => void;
  mailbox: string;
};

function senderName(from: string) {
  const m = from.match(/^"?([^"<]+?)"?\s*<.+>$/);
  return (m ? m[1] : from).trim() || from;
}

export function MessageList({ messages, selectedSeqno, onSelect, loading, onRefresh, mailbox }: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return messages;
    const needle = q.toLowerCase();
    return messages.filter(
      (m) =>
        m.subject.toLowerCase().includes(needle) ||
        m.from.toLowerCase().includes(needle) ||
        m.snippet.toLowerCase().includes(needle),
    );
  }, [messages, q]);

  return (
    <div className="w-[340px] shrink-0 border-r border-border bg-surface flex flex-col h-full">
      <div className="mac-titlebar shrink-0 flex items-center justify-between px-3">
        <div>
          <div className="text-sm font-semibold">{mailbox}</div>
          <div className="text-xs text-muted-foreground">{filtered.length} üzenet</div>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRefresh} title="Frissítés">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Keresés"
            className="pl-8 h-8 bg-muted/60 border-transparent focus-visible:bg-surface"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && messages.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Betöltés…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nincs üzenet</div>
        ) : (
          <ul>
            {filtered.map((m) => {
              const active = selectedSeqno === m.seqno;
              return (
                <li key={m.seqno}>
                  <button
                    onClick={() => onSelect(m)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-border/60 transition-colors",
                      active ? "bg-accent" : "hover:bg-muted/60",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("text-sm truncate", active ? "font-semibold" : "font-medium")}>
                        {senderName(m.from)}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {m.date
                          ? formatDistanceToNowStrict(new Date(m.date), { locale: hu, addSuffix: false })
                          : ""}
                      </span>
                    </div>
                    <div className="text-sm truncate mt-0.5">{m.subject}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{m.snippet}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
