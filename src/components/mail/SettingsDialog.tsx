import { useRef } from "react";
import { Bug, Download, Sun, Moon, Monitor, Upload, FileDown } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/lib/theme";
import { exportDebugLog } from "@/lib/debugLog";
import { mailAPI, type AccountsExportPayload } from "@/lib/mailBridge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenUpdater: () => void;
  onAccountsChanged?: () => void;
};

// Általános alkalmazás-beállítások: téma, app frissítése, hibanapló mentése.
// A korábbi Sidebar-aljra szétszórt akciók egy helyre kerültek.
export function SettingsDialog({ open, onOpenChange, onOpenUpdater, onAccountsChanged }: Props) {
  const { theme, setTheme, isDark } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  const themeOpt = (value: Theme, text: string, Icon: typeof Sun) => (
    <Button
      key={value}
      type="button"
      variant={theme === value ? "default" : "outline"}
      size="sm"
      className={cn("flex-1 gap-2", theme === value && "shadow-mac-md")}
      onClick={() => setTheme(value)}
    >
      <Icon className="h-4 w-4" />
      {text}
    </Button>
  );

  const handleExportLog = async () => {
    try {
      const r = await exportDebugLog();
      toast.success("Hibanapló mentve", {
        description: `${r.filename} · ${(r.bytes / 1024).toFixed(1)} KB`,
      });
    } catch (err: any) {
      toast.error("Mentés sikertelen", { description: String(err?.message || err) });
    }
  };

  const handleExportAccounts = async () => {
    try {
      const payload = await mailAPI.accounts.export();
      const count = payload.accounts?.length || 0;
      if (!count) {
        toast.info("Nincs exportálható fiók");
        return;
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `cozy-email-pad-fiokok-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${count} fiók exportálva`, {
        description: "A jelszavak titkosítatlanul kerülnek a fájlba — tárold biztonságos helyen.",
      });
    } catch (err: any) {
      toast.error("Export sikertelen", { description: String(err?.message || err) });
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AccountsExportPayload;
      if (!parsed || parsed.type !== "cozy-email-pad-accounts" || !Array.isArray(parsed.accounts)) {
        throw new Error("Érvénytelen fájl formátum.");
      }
      const r = await mailAPI.accounts.import(parsed);
      toast.success("Fiókok importálva", {
        description: `${r.added} új, ${r.updated} frissítve.`,
      });
      onAccountsChanged?.();
    } catch (err: any) {
      toast.error("Import sikertelen", { description: String(err?.message || err) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Beállítások</DialogTitle>
          <DialogDescription>
            Megjelenés, frissítés és hibakeresés.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Téma */}
          <section className="space-y-2">
            <div className="text-sm font-medium">Téma</div>
            <div className="flex gap-2">
              {themeOpt("light", "Világos", Sun)}
              {themeOpt("dark", "Sötét", Moon)}
              {themeOpt("system", "Rendszer", Monitor)}
            </div>
            <div className="text-xs text-muted-foreground">
              Aktuális: {theme === "system" ? `Rendszer (${isDark ? "sötét" : "világos"})` : isDark ? "Sötét" : "Világos"}
            </div>
          </section>

          {/* App frissítés */}
          <section className="space-y-2">
            <div className="text-sm font-medium">Alkalmazás frissítése</div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => { onOpenChange(false); onOpenUpdater(); }}
            >
              <Download className="h-4 w-4" /> App frissítése…
            </Button>
            <div className="text-xs text-muted-foreground">
              Új verzió keresése és telepítése.
            </div>
          </section>

          {/* Fiókok export / import */}
          <section className="space-y-2">
            <div className="text-sm font-medium">Fiókok átvitele másik gépre</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 justify-start gap-2"
                onClick={handleExportAccounts}
              >
                <FileDown className="h-4 w-4" /> Exportálás (.json)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 justify-start gap-2"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" /> Importálás…
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Az összes IMAP/SMTP fiók exportja egy JSON fájlba, jelszavakkal együtt. Importáláskor az azonos e-mail című fiók frissül, az új fiókok hozzáadódnak. Tárold a fájlt biztonságos helyen — nem titkosított!
            </div>
          </section>

          {/* Hibanapló */}
          <section className="space-y-2">
            <div className="text-sm font-medium">Hibakeresés</div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={handleExportLog}
            >
              <Bug className="h-4 w-4" /> Hibanapló mentése (.log)
            </Button>
            <div className="text-xs text-muted-foreground">
              A legutóbbi levélbetöltési, cache- és szinkron-események mentése fájlba.
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Bezárás</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
