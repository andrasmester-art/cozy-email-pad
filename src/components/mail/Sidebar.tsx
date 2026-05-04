import { useEffect, useRef, useState } from "react";
import { Account } from "@/lib/mailBridge";
import { cn } from "@/lib/utils";
import { Inbox, Send, FileText, Archive, Trash2, AlertOctagon, Plus, Settings, FileCode2, Pencil, X, AlertCircle, CheckCircle2, Circle, PenSquare, FileSignature, RefreshCw, GripVertical, Users, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getAllAccountStatuses, formatRelative, formatCountdown, type AccountStatus } from "@/lib/accountStatus";

const WIDTH_KEY = "mailwise.sidebarWidth";
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 240;

type Props = {
  accounts: Account[];
  activeAccountId: string | null;
  activeMailbox: string;
  onSelectAccount: (id: string) => void;
  onSelectMailbox: (mb: string) => void;
  onAddAccount: () => void;
  onEditAccount: (a: Account) => void;
  onDeleteAccount: (a: Account) => void;
  onCompose: () => void;
  onSyncAll: () => void;
  syncing?: boolean;
  onOpenTemplates: () => void;
  onOpenSignatures: () => void;
  onOpenSettings: () => void;
  onOpenAppSettings: () => void;
  onOpenUpdater: () => void;
  onOpenContacts: () => void;
  onReorderAccounts?: (fromId: string, toId: string) => void;
};

const MAILBOXES = [
  { id: "INBOX", label: "Beérkezett", icon: Inbox },
  { id: "Sent", label: "Elküldött", icon: Send },
  { id: "Drafts", label: "Piszkozatok", icon: FileText },
  { id: "Archive", label: "Archívum", icon: Archive },
  { id: "Spam", label: "Spam", icon: AlertOctagon },
  { id: "Trash", label: "Kuka", icon: Trash2 },
];

const COLORS = ["bg-primary", "bg-success", "bg-warning", "bg-destructive", "bg-purple-500"];

export function Sidebar({
  accounts, activeAccountId, activeMailbox,
  onSelectAccount, onSelectMailbox, onAddAccount, onEditAccount, onDeleteAccount, onCompose, onSyncAll, syncing, onOpenTemplates, onOpenSignatures, onOpenSettings, onOpenAppSettings, onOpenUpdater, onOpenContacts, onReorderAccounts,
}: Props) {
  const [statuses, setStatuses] = useState<Record<string, AccountStatus>>(() => getAllAccountStatuses());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [width, setWidth] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem(WIDTH_KEY) || "", 10);
      if (!isNaN(v) && v >= MIN_WIDTH && v <= MAX_WIDTH) return v;
    } catch { /* ignore */ }
    return DEFAULT_WIDTH;
  });
  const resizingRef = useRef(false);

  useEffect(() => {
    const refresh = () => setStatuses(getAllAccountStatuses());
    refresh();
    window.addEventListener("accountStatusChanged", refresh);
    const t = setInterval(refresh, 1000); // 1s tick so retry countdown stays accurate
    return () => {
      window.removeEventListener("accountStatusChanged", refresh);
      clearInterval(t);
    };
  }, []);

  // Drag-to-resize a sidebar jobb széléről.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setWidth(next);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try { localStorage.setItem(WIDTH_KEY, String(Math.round(width))); } catch { /* ignore */ }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <TooltipProvider delayDuration={200}>
    <aside
      className="shrink-0 bg-gradient-sidebar border-r border-sidebar-border flex flex-col h-full relative"
      style={{ width: `${width}px` }}
    >
      <div className="mac-titlebar shrink-0" />

      <div className="px-3 pb-2 space-y-1.5">
        <Button onClick={onCompose} className="w-full bg-gradient-primary shadow-mac-md">
          <PenSquare className="h-4 w-4 mr-1.5" /> Új levél
        </Button>
        <Button
          onClick={onSyncAll}
          variant="outline"
          size="sm"
          disabled={syncing}
          className="w-full"
          title="Minden fiók szinkronizálása (bejövő és elküldött)"
        >
          <RefreshCw className={cn("h-4 w-4 mr-1.5", syncing && "animate-spin")} />
          {syncing ? "Szinkronizálás…" : "Szinkronizálás"}
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1.5">
          Fiókok
        </div>
        <div className="space-y-0.5">
          {accounts.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-2">
              Még nincs fiók. Adj hozzá egyet!
            </div>
          )}
          {accounts.map((a, i) => {
            const st = statuses[a.id];
            const StatusIcon = !st ? Circle : st.ok ? CheckCircle2 : AlertCircle;
            const statusColor = !st
              ? "text-muted-foreground/50"
              : st.ok
              ? "text-success"
              : "text-destructive";
            const retryCountdown = !st || st.ok ? "" : formatCountdown(st.nextRetryAt);
            const statusLabel = !st
              ? "Nincs ellenőrzés"
              : st.ok
              ? `Csatlakozva · ${formatRelative(st.lastChecked)}`
              : retryCountdown
                ? `Hiba · újra ${retryCountdown} múlva`
                : `Hiba · ${st.error || "ismeretlen"}`;
            const tooltipLabel = !st || st.ok
              ? statusLabel
              : `${st.error || "Ismeretlen hiba"}${retryCountdown ? ` · újrapróbálkozás ${retryCountdown} múlva` : ""}`;
            return (
              <div
                key={a.id}
                className={cn(
                  "space-y-0.5",
                  dragOverId === a.id && dragId !== a.id && "ring-2 ring-primary/40 rounded-md",
                  dragId === a.id && "opacity-50",
                )}
                draggable={!!onReorderAccounts}
                onDragStart={(e) => {
                  if (!onReorderAccounts) return;
                  setDragId(a.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", a.id);
                }}
                onDragOver={(e) => {
                  if (!onReorderAccounts || !dragId || dragId === a.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverId !== a.id) setDragOverId(a.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === a.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromId = dragId || e.dataTransfer.getData("text/plain");
                  if (onReorderAccounts && fromId && fromId !== a.id) {
                    onReorderAccounts(fromId, a.id);
                  }
                  setDragId(null);
                  setDragOverId(null);
                }}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
              >
                <div
                  className={cn(
                    "group w-full flex items-center gap-1 pl-1 pr-1 py-1.5 rounded-md text-sm transition-colors",
                    activeAccountId === a.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/60 text-sidebar-foreground",
                  )}
                >
                  {onReorderAccounts && (
                    <span
                      className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity p-0.5"
                      title="Húzd a sorrend módosításához"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <button
                    onClick={() => onSelectAccount(a.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <span className={cn("w-2 h-2 rounded-full shrink-0", COLORS[i % COLORS.length])} />
                    <span className="truncate">{a.label}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", statusColor)} />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <div className="text-xs">{tooltipLabel}</div>
                      </TooltipContent>
                    </Tooltip>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditAccount(a); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-background/50"
                    title="Fiók szerkesztése"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteAccount(a); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive"
                    title="Fiók törlése"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {activeAccountId === a.id && (
                  <div className={cn("text-[10px] px-2 pb-1 truncate", statusColor)}>
                    {statusLabel}
                  </div>
                )}
              </div>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 h-8 text-muted-foreground hover:text-foreground"
            onClick={onAddAccount}
          >
            <Plus className="h-4 w-4" /> Új fiók
          </Button>
        </div>
      </div>

      <div className="px-3 mt-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1.5">
          Mappák
        </div>
        <div className="space-y-0.5">
          {MAILBOXES.map((mb) => {
            const Icon = mb.icon;
            const active = activeMailbox === mb.id;
            return (
              <button
                key={mb.id}
                onClick={() => onSelectMailbox(mb.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-sidebar-accent text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{mb.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto p-3 border-t border-sidebar-border space-y-1">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={onOpenContacts}>
          <Users className="h-4 w-4" /> Kapcsolatok
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={onOpenTemplates}>
          <FileCode2 className="h-4 w-4" /> Sablonok
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={onOpenSignatures}>
          <FileSignature className="h-4 w-4" /> Aláírások
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={onOpenSettings}>
          <UserCog className="h-4 w-4" /> Fiók szerkesztése
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={onOpenAppSettings}>
          <Settings className="h-4 w-4" /> Beállítások
        </Button>
      </div>
      {/* Átméretező fogantyú a jobb szélen */}
      <div
        onMouseDown={startResize}
        onDoubleClick={() => {
          setWidth(DEFAULT_WIDTH);
          try { localStorage.setItem(WIDTH_KEY, String(DEFAULT_WIDTH)); } catch { /* ignore */ }
        }}
        title="Húzd a szélesség módosításához (dupla kattintás: alaphelyzet)"
        className="absolute top-0 right-0 h-full w-1.5 -mr-0.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors z-10"
      />
    </aside>
    </TooltipProvider>
  );
}
