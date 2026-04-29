import { useEffect, useRef, useState } from "react";
import { Account, mailAPI } from "@/lib/mailBridge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "./RichTextEditor";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, FileSignature, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Signature, listSignatures, saveSignature, deleteSignature,
  getDefaultSignatureId, setDefaultSignature,
  downloadSignaturesJson, importSignatures, type ImportMode,
} from "@/lib/signatures";
import { sanitizeEmailHtml } from "@/lib/sanitizeHtml";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SignaturesDialog({ open, onClose }: Props) {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<Record<string, string | null>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    payload: unknown;
    fileName: string;
    count: number;
  } | null>(null);

  const reload = () => {
    const sigs = listSignatures();
    setSignatures(sigs);
    if (sigs.length && !sigs.some((s) => s.id === selectedId)) {
      setSelectedId(sigs[0].id);
    } else if (!sigs.length) {
      setSelectedId(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    reload();
    mailAPI.accounts.list().then((list) => {
      setAccounts(list);
      const map: Record<string, string | null> = {};
      list.forEach((a) => { map[a.id] = getDefaultSignatureId(a.id); });
      setDefaults(map);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = signatures.find((s) => s.id === selectedId) || null;

  const create = () => {
    const sig: Signature = {
      id: `sig-${Date.now()}`,
      name: "Új aláírás",
      body: "<p>Üdvözlettel,<br>Neved</p>",
      updatedAt: Date.now(),
    };
    saveSignature(sig);
    setSelectedId(sig.id);
    reload();
  };

  const updateSelected = (patch: Partial<Signature>) => {
    if (!selected) return;
    const next: Signature = { ...selected, ...patch, updatedAt: Date.now() };
    saveSignature(next);
    setSignatures((list) => list.map((s) => (s.id === next.id ? next : s)));
  };

  const remove = (id: string) => {
    deleteSignature(id);
    toast.success("Aláírás törölve");
    reload();
    // refresh defaults
    const map: Record<string, string | null> = {};
    accounts.forEach((a) => { map[a.id] = getDefaultSignatureId(a.id); });
    setDefaults(map);
  };

  const changeDefault = (accountId: string, sigId: string) => {
    const value = sigId === "__none__" ? null : sigId;
    setDefaultSignature(accountId, value);
    setDefaults((d) => ({ ...d, [accountId]: value }));
  };

  const handleExport = () => {
    if (signatures.length === 0) {
      toast.info("Nincs exportálható aláírás.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadSignaturesJson(`mepodmail-signatures-${stamp}.json`);
    toast.success(`Exportálva — ${signatures.length} aláírás`);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file later
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A fájl túl nagy (max. 5 MB).");
      return;
    }
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const incoming = Array.isArray((payload as any)?.signatures)
        ? (payload as any).signatures.length
        : 0;
      if (incoming === 0) {
        toast.error("A fájl nem tartalmaz aláírásokat.");
        return;
      }
      // If there are existing signatures, ask whether to merge or replace.
      if (signatures.length > 0) {
        setPendingImport({ payload, fileName: file.name, count: incoming });
      } else {
        runImport(payload, "merge");
      }
    } catch (err: any) {
      toast.error("Hibás JSON fájl", {
        description: String(err?.message || err),
      });
    }
  };

  const runImport = (payload: unknown, mode: ImportMode) => {
    try {
      const res = importSignatures(payload, mode);
      reload();
      toast.success("Importálás kész", {
        description: `${res.imported} új, ${res.updated} frissítve${
          res.skipped ? `, ${res.skipped} kihagyva` : ""
        }.`,
      });
    } catch (err: any) {
      toast.error("Importálás sikertelen", {
        description: String(err?.message || err),
      });
    } finally {
      setPendingImport(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-4 w-4" /> Email aláírások
          </DialogTitle>
          <DialogDescription>
            Hozz létre több aláírást és rendelj fiókonként alapértelmezettet. Levélíráskor bármelyik beilleszthető.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[200px_1fr] gap-4 min-h-[420px]">
          {/* Lista */}
          <div className="border border-border rounded-md flex flex-col overflow-hidden bg-surface">
            <div className="px-2 py-1.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Aláírások</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={create} title="Új aláírás">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {signatures.length === 0 && (
                <div className="text-xs text-muted-foreground p-3">
                  Még nincs aláírás. Kattints a + gombra.
                </div>
              )}
              {signatures.map((s) => (
                <div
                  key={s.id}
                  className={`group flex items-center px-2 py-1.5 text-sm cursor-pointer ${
                    selectedId === s.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
                  }`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="truncate flex-1">{s.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(s.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive"
                    title="Törlés"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Szerkesztő + per-fiók alapértelmezések */}
          <div className="flex flex-col gap-3 min-w-0">
            {selected ? (
              <>
                <div>
                  <Label className="text-xs">Aláírás neve</Label>
                  <Input
                    value={selected.name}
                    onChange={(e) => updateSelected({ name: e.target.value })}
                    placeholder="Pl. Munkahelyi"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-[220px]">
                  <div className="flex flex-col min-w-0">
                    <Label className="text-xs">Tartalom</Label>
                    <RichTextEditor
                      value={selected.body}
                      onChange={(html) => updateSelected({ body: html })}
                      placeholder="Üdvözlettel, …"
                      className="h-[260px]"
                    />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <Label className="text-xs flex items-center justify-between">
                      <span>Élő előnézet</span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        a teljes levél stílusával
                      </span>
                    </Label>
                    <div className="h-[260px] rounded-md border border-border bg-background overflow-hidden flex flex-col">
                      {/* Levél fejléc — a MessageView stílusát követi, reszponzív paddinggal. */}
                      <div className="px-4 sm:px-6 md:px-8 py-3 sm:py-4 border-b border-border bg-background">
                        <h1 className="text-lg sm:text-xl md:text-2xl font-semibold leading-tight truncate">
                          Példa üzenet
                        </h1>
                        <div className="mt-1.5 sm:mt-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">neved@példa.hu</div>
                            <div className="text-xs text-muted-foreground mt-0.5 truncate">
                              → címzett@példa.hu
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0">most</div>
                        </div>
                      </div>
                      {/* Törzs — egyetlen prose blokk, hogy a sortávolság és betűtípus
                          a teljes levélben (üdvözlés + aláírás) egységes legyen, ahogy
                          az elküldött levélben is megjelenik. */}
                      <div
                        className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 py-4 sm:py-6 bg-background"
                        style={{
                          fontFamily:
                            '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif',
                        }}
                      >
                        <div
                          className="prose prose-sm max-w-none dark:prose-invert text-[15px] leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html:
                              `<p>Kedves Címzett!</p>` +
                              `<p>Ez egy minta üzenet, hogy lásd hogyan néz ki az aláírásod a kész levélben.</p>` +
                              (selected.body
                                ? sanitizeEmailHtml(selected.body)
                                : '<p class="text-muted-foreground italic">Üres aláírás</p>'),
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Hozz létre vagy válassz egy aláírást.
              </div>
            )}

            <div className="border-t border-border pt-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Alapértelmezett aláírás fiókonként
              </div>
              {accounts.length === 0 ? (
                <div className="text-xs text-muted-foreground">Nincs fiók.</div>
              ) : (
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                  {accounts.map((a) => (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className="flex-1 text-sm truncate">{a.label}</span>
                      <Select
                        value={defaults[a.id] || "__none__"}
                        onValueChange={(v) => changeDefault(a.id, v)}
                      >
                        <SelectTrigger className="h-8 w-[200px] text-xs">
                          <SelectValue placeholder="Nincs" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-xs">— Nincs —</SelectItem>
                          {signatures.map((s) => (
                            <SelectItem key={s.id} value={s.id} className="text-xs">
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1.5" /> Exportálás (JSON)
            </Button>
            <Button variant="outline" size="sm" onClick={handleImportClick}>
              <Upload className="h-4 w-4 mr-1.5" /> Importálás
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFilePicked}
            />
          </div>
          <Button onClick={onClose}>Kész</Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog
        open={!!pendingImport}
        onOpenChange={(o) => !o && setPendingImport(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aláírások importálása</AlertDialogTitle>
            <AlertDialogDescription>
              A <strong>{pendingImport?.fileName}</strong> fájl{" "}
              <strong>{pendingImport?.count}</strong> aláírást tartalmaz.
              Hogyan szeretnéd egyesíteni a meglévő{" "}
              <strong>{signatures.length}</strong> aláírással?
              <br />
              <span className="text-xs text-muted-foreground">
                · <strong>Egyesítés</strong>: új aláírások hozzáadódnak, az
                azonos azonosítójúak felülíródnak.
                <br />· <strong>Felülírás</strong>: minden meglévő aláírás
                törlődik, csak a fájlból érkezők maradnak.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => pendingImport && runImport(pendingImport.payload, "replace")}
            >
              Felülírás
            </Button>
            <AlertDialogAction
              onClick={() => pendingImport && runImport(pendingImport.payload, "merge")}
            >
              Egyesítés
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
