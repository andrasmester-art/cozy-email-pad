import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, RefreshCw, CheckCircle2, AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { mailAPI, type UpdaterInfo } from "@/lib/mailBridge";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function UpdaterDialog({ open, onClose }: Props) {
  const [info, setInfo] = useState<UpdaterInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [applying, setApplying] = useState(false);
  const [log, setLog] = useState<string>("");
  const logRef = useRef<HTMLPreElement | null>(null);

  const refresh = async () => {
    setLoadingInfo(true);
    try {
      const i = await mailAPI.updater.info();
      setInfo(i);
    } catch (e: any) {
      toast.error("Nem sikerült lekérni a verzióinformációt", {
        description: String(e?.message || e),
      });
    } finally {
      setLoadingInfo(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setLog("");
    refresh();
  }, [open]);

  // Live-stream the updater log lines from the main process.
  useEffect(() => {
    if (!open) return;
    const off = mailAPI.updater.onLog((line) => {
      setLog((prev) => prev + line);
      // Auto-scroll
      requestAnimationFrame(() => {
        if (logRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
      });
    });
    return off;
  }, [open]);

  const apply = async () => {
    setApplying(true);
    setLog("");
    try {
      await mailAPI.updater.apply();
      toast.success("Frissítés sikeres", {
        description: "Az alkalmazás újratöltődött az új verzióval.",
      });
      onClose();
    } catch (e: any) {
      toast.error("Frissítés sikertelen", {
        description: String(e?.message || e),
      });
    } finally {
      setApplying(false);
      refresh();
    }
  };

  const shortSha = (s: string | null) => (s ? s.slice(0, 7) : "—");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !applying && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" /> Alkalmazás frissítése
          </DialogTitle>
          <DialogDescription>
            Letölti és telepíti a legfrissebb verziót a GitHub repóból. Nem
            kell kézzel újratelepíteni az appot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-surface p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Repó</span>
              <a
                href={info?.repoUrl || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs inline-flex items-center gap-1 text-primary hover:underline truncate max-w-[260px]"
                title={info?.repoUrl}
              >
                {info?.repoUrl || "—"} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Ág</span>
              <span className="text-xs font-mono">{info?.branch || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Telepített verzió</span>
              <span className="text-xs font-mono">{shortSha(info?.localSha || null)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Elérhető verzió</span>
              <span className="text-xs font-mono">{shortSha(info?.remoteSha || null)}</span>
            </div>
            {info?.remoteMessage && (
              <div className="text-xs text-muted-foreground border-t border-border pt-2">
                <span className="font-medium text-foreground">Legutóbbi commit: </span>
                {info.remoteMessage.split("\n")[0]}
                {info.remoteDate && (
                  <span className="opacity-60"> · {new Date(info.remoteDate).toLocaleString("hu-HU")}</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {loadingInfo ? (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Ellenőrzés…
              </Badge>
            ) : info?.remoteError ? (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" /> Hiba a lekérdezésnél
              </Badge>
            ) : info?.upToDate ? (
              <Badge className="gap-1 bg-green-600 hover:bg-green-600">
                <CheckCircle2 className="h-3 w-3" /> Naprakész
              </Badge>
            ) : info?.remoteSha && info?.localSha && info.localSha !== info.remoteSha ? (
              <Badge className="gap-1 bg-amber-500 hover:bg-amber-500 text-white">
                <Download className="h-3 w-3" /> Új verzió elérhető
              </Badge>
            ) : (
              <Badge variant="secondary">Ismeretlen állapot</Badge>
            )}
            {!info?.writable && (
              <Badge variant="outline" className="text-xs">
                Csak újratöltés (csomagolt build)
              </Badge>
            )}
          </div>

          {info?.remoteError && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
              {info.remoteError}
            </div>
          )}

          {(applying || log) && (
            <pre
              ref={logRef}
              className="text-[11px] font-mono bg-black text-green-300 rounded-md p-3 h-44 overflow-auto whitespace-pre-wrap"
            >
              {log || "Frissítés indítása…"}
            </pre>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loadingInfo || applying}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loadingInfo ? "animate-spin" : ""}`} />
            Ellenőrzés
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={applying}>
              Bezárás
            </Button>
            <Button
              onClick={apply}
              disabled={applying || loadingInfo || (info?.upToDate && !!info?.writable)}
              className="bg-gradient-primary"
            >
              {applying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Frissítés…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-1.5" /> Frissítés telepítése
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
