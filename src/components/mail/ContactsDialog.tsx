import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Mail, Copy, RefreshCw, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { buildContacts, type Contact } from "@/lib/contacts";

type Props = {
  open: boolean;
  onClose: () => void;
  onCompose?: (to: string) => void;
};

function formatDate(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("hu-HU", { year: "numeric", month: "short", day: "numeric" });
}

export function ContactsDialog({ open, onClose, onCompose }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [excludeOwn, setExcludeOwn] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await buildContacts({ excludeOwnAddresses: excludeOwn });
      setContacts(list);
    } catch (e: any) {
      toast.error("Kapcsolatok betöltése sikertelen", { description: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, excludeOwn]);

  const filtered = useMemo(() => {
    if (!q.trim()) return contacts;
    const needle = q.toLowerCase();
    return contacts.filter(
      (c) => c.email.includes(needle) || c.name.toLowerCase().includes(needle),
    );
  }, [contacts, q]);

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Másolva", { description: email });
    } catch {
      toast.error("Másolás sikertelen");
    }
  };

  const writeTo = (c: Contact) => {
    const target = c.name && c.name !== c.email
      ? `"${c.name.replace(/"/g, '\\"')}" <${c.email}>`
      : c.email;
    onCompose?.(target);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl h-[680px] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Kapcsolatok
          </DialogTitle>
          <DialogDescription>
            Az összes egyedi e-mail cím a fogadott és elküldött leveleidből — automatikusan kinyerve.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Keresés név vagy e-mail alapján…"
              className="pl-8 h-9"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExcludeOwn((v) => !v)}
            title="Saját fiókcímek elrejtése a listából"
          >
            {excludeOwn ? "Saját rejtve" : "Saját látszik"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            {loading
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Frissítés
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && contacts.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Kapcsolatok kinyerése a postafiókból…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {contacts.length === 0
                ? "Még nincsenek kapcsolatok. Szinkronizáld a leveleket, és térj vissza."
                : "Nincs találat"}
            </div>
          ) : (
            <ul>
              {filtered.map((c) => (
                <li
                  key={c.email}
                  className="group flex items-center gap-3 px-5 py-2.5 border-b border-border/60 hover:bg-muted/40"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                    {(c.name || c.email).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name || c.email}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.name && c.name !== c.email ? c.email : ""}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 text-right hidden sm:block">
                    <div>{c.count} levél</div>
                    <div>{formatDate(c.lastSeen)}</div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="E-mail cím másolása"
                      onClick={() => copyEmail(c.email)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {onCompose && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Új levél írása"
                        onClick={() => writeTo(c)}
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-border text-xs text-muted-foreground shrink-0">
          {filtered.length} kapcsolat {q && `(${contacts.length} összesen)`}
        </div>
      </DialogContent>
    </Dialog>
  );
}
