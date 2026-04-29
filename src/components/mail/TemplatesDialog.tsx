import { useEffect, useState } from "react";
import { EmailTemplate, mailAPI } from "@/lib/mailBridge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "./RichTextEditor";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sanitizeEmailHtml } from "@/lib/sanitizeHtml";

type Props = { open: boolean; onClose: () => void };

export function TemplatesDialog({ open, onClose }: Props) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      mailAPI.templates.list().then((list) => {
        setTemplates(list);
        setActiveId(list[0]?.id || null);
      });
    }
  }, [open]);

  const active = templates.find((t) => t.id === activeId) || null;

  const update = (patch: Partial<EmailTemplate>) => {
    if (!active) return;
    setTemplates((list) =>
      list.map((t) => (t.id === active.id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
    );
  };

  const addNew = () => {
    const tpl: EmailTemplate = {
      id: `tpl-${Date.now()}`,
      name: "Új sablon",
      subject: "",
      body: "",
      updatedAt: Date.now(),
    };
    setTemplates((l) => [...l, tpl]);
    setActiveId(tpl.id);
  };

  const save = async () => {
    if (!active) return;
    await mailAPI.templates.save(active);
    toast.success("Sablon mentve");
  };

  const remove = async () => {
    if (!active) return;
    await mailAPI.templates.delete(active.id);
    setTemplates((l) => l.filter((t) => t.id !== active.id));
    setActiveId(templates.find((t) => t.id !== active.id)?.id || null);
    toast.success("Sablon törölve");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle>Sablonok</DialogTitle>
        </DialogHeader>
        <div className="flex-1 flex min-h-0">
          <div className="w-56 border-r border-border bg-muted/40 flex flex-col">
            <div className="p-2">
              <Button size="sm" variant="outline" className="w-full" onClick={addNew}>
                <Plus className="h-4 w-4 mr-1.5" /> Új sablon
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm border-b border-border/60 transition-colors",
                    activeId === t.id ? "bg-accent text-accent-foreground" : "hover:bg-background",
                  )}
                >
                  <div className="truncate font-medium">{t.name || "Névtelen"}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.subject}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col p-4 gap-3 min-w-0">
            {active ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    value={active.name}
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder="Sablon neve"
                  />
                  <Input
                    value={active.subject}
                    onChange={(e) => update({ subject: e.target.value })}
                    placeholder="Tárgy"
                  />
                </div>
                <RichTextEditor
                  value={active.body}
                  onChange={(html) => update({ body: html })}
                  placeholder="Sablon tartalma…"
                  className="flex-1 min-h-0"
                />
                <div className="flex justify-between">
                  <Button variant="ghost" className="text-destructive" onClick={remove}>
                    <Trash2 className="h-4 w-4 mr-1.5" /> Törlés
                  </Button>
                  <Button onClick={save}>Mentés</Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Válassz vagy hozz létre egy sablont
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
