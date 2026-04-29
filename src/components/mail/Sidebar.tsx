import { Account } from "@/lib/mailBridge";
import { cn } from "@/lib/utils";
import { Inbox, Send, FileText, Archive, Trash2, AlertOctagon, Plus, Settings, FileCode2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  accounts: Account[];
  activeAccountId: string | null;
  activeMailbox: string;
  onSelectAccount: (id: string) => void;
  onSelectMailbox: (mb: string) => void;
  onAddAccount: () => void;
  onEditAccount: (a: Account) => void;
  onOpenTemplates: () => void;
  onOpenSettings: () => void;
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
  onSelectAccount, onSelectMailbox, onAddAccount, onOpenTemplates, onOpenSettings,
}: Props) {
  return (
    <aside className="w-60 shrink-0 bg-gradient-sidebar border-r border-sidebar-border flex flex-col h-full">
      <div className="mac-titlebar shrink-0" />

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
          {accounts.map((a, i) => (
            <button
              key={a.id}
              onClick={() => onSelectAccount(a.id)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                activeAccountId === a.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/60 text-sidebar-foreground",
              )}
            >
              <span className={cn("w-2 h-2 rounded-full", COLORS[i % COLORS.length])} />
              <span className="truncate flex-1 text-left">{a.label}</span>
            </button>
          ))}
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
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={onOpenTemplates}>
          <FileCode2 className="h-4 w-4" /> Sablonok
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={onOpenSettings}>
          <Settings className="h-4 w-4" /> Beállítások
        </Button>
      </div>
    </aside>
  );
}
