import { Bug, Download, Sun, Moon, Monitor } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/lib/theme";
import { exportDebugLog } from "@/lib/debugLog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenUpdater: () => void;
};

// Általános alkalmazás-beállítások: téma, app frissítése, hibanapló mentése.
// A korábbi Sidebar-aljra szétszórt akciók egy helyre kerültek.
export function SettingsDialog({ open, onOpenChange, onOpenUpdater }: Props) {
  const { theme, setTheme, isDark } = useTheme();

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
