import { useEffect, useState } from "react";
import { Account, mailAPI } from "@/lib/mailBridge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Circle, RefreshCw, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAccountStatus, setAccountStatus, formatRelative, formatCountdown, type AccountStatus } from "@/lib/accountStatus";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (a: Account) => void;
  initial?: Account | null;
};

const PRESETS: Record<string, Partial<Account>> = {
  Gmail: { imapHost: "imap.gmail.com", imapPort: 993, imapTls: true, smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true },
  iCloud: { imapHost: "imap.mail.me.com", imapPort: 993, imapTls: true, smtpHost: "smtp.mail.me.com", smtpPort: 587, smtpSecure: false },
  Outlook: { imapHost: "outlook.office365.com", imapPort: 993, imapTls: true, smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false },
  Yahoo: { imapHost: "imap.mail.yahoo.com", imapPort: 993, imapTls: true, smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, smtpSecure: true },
};

export function AccountDialog({ open, onClose, onSaved, initial }: Props) {
  const [a, setA] = useState<Account>(() => initial || blank());
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (open) {
      setA(initial || blank());
      setStatus(initial ? getAccountStatus(initial.id) : null);
    }
  }, [open, initial]);

  // Live-refresh status (so the auto-retry countdown updates each second
  // and reflects external changes like a successful background retry).
  useEffect(() => {
    if (!open || !initial) return;
    const refresh = () => setStatus(getAccountStatus(initial.id));
    window.addEventListener("accountStatusChanged", refresh);
    const t = setInterval(refresh, 1000);
    return () => {
      window.removeEventListener("accountStatusChanged", refresh);
      clearInterval(t);
    };
  }, [open, initial]);

  const update = (patch: Partial<Account>) => setA((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!a.label || !a.user || !a.imapHost || !a.smtpHost) {
      return toast.error("Hiányzó adatok", { description: "A név, e-mail, IMAP és SMTP host kötelező." });
    }
    await mailAPI.accounts.save(a);
    toast.success(initial ? "Fiók frissítve" : "Fiók hozzáadva");
    onSaved(a);
    onClose();
  };

  const handleTest = async () => {
    if (!a.label || !a.user || !a.imapHost) {
      return toast.error("Hiányzó adatok", { description: "Add meg legalább a nevet, e-mailt és IMAP hostot." });
    }
    setTesting(true);
    try {
      // Mentjük a friss adatokat (jelszót is), majd futtatjuk a teszt-bejelentkezést.
      await mailAPI.accounts.save(a);
      await mailAPI.imap.test(a.id);
      const next: AccountStatus = { lastChecked: Date.now(), ok: true };
      setAccountStatus(a.id, next);
      setStatus(next);
      toast.success("Sikeres kapcsolódás");
    } catch (e: any) {
      const msg = String(e?.message || e);
      const next: AccountStatus = { lastChecked: Date.now(), ok: false, error: msg };
      setAccountStatus(a.id, next);
      setStatus(next);
      toast.error("Kapcsolódás sikertelen", { description: msg });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Fiók szerkesztése" : "Új IMAP fiók"}</DialogTitle>
          <DialogDescription>
            Add meg a fiók adatait. A jelszavakat a Mac app a Keychainben titkosítva tárolja.
          </DialogDescription>
        </DialogHeader>

        {initial && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
              !status && "border-border bg-muted/40 text-muted-foreground",
              status?.ok && "border-success/30 bg-success/10 text-success",
              status && !status.ok && "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {!status ? (
              <Circle className="h-4 w-4 mt-0.5 shrink-0" />
            ) : status.ok ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                {!status ? "Még nem ellenőrzött" : status.ok ? "Kapcsolódva" : "Kapcsolódási hiba"}
              </div>
              <div className="opacity-80 break-words">
                {!status
                  ? "Kattints a Kapcsolat ellenőrzése gombra a teszteléshez."
                  : status.ok
                  ? `Utolsó ellenőrzés: ${formatRelative(status.lastChecked)}`
                  : `${status.error || "Ismeretlen hiba"} · ${formatRelative(status.lastChecked)}`}
              </div>
              {status && !status.ok && status.nextRetryAt && (
                <div className="mt-1 font-medium">
                  Automatikus újrapróbálkozás: {formatCountdown(status.nextRetryAt)}
                  {typeof status.attempt === "number" && status.attempt > 0 && (
                    <span className="opacity-70"> · {status.attempt}. próbálkozás után</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fiók címkéje</Label>
              <Input value={a.label} onChange={(e) => update({ label: e.target.value })} placeholder="Munka" />
            </div>
            <div>
              <Label className="text-xs">Megjelenített név (feladó)</Label>
              <Input
                value={a.displayName || ""}
                onChange={(e) => update({ displayName: e.target.value })}
                placeholder="Kovács János"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">E-mail cím</Label>
            <Input value={a.user} onChange={(e) => update({ user: e.target.value, from: e.target.value })} placeholder="te@hoating.eu" />
          </div>
          <div>
            <Label className="text-xs">
              Felhasználónév <span className="text-muted-foreground">(opcionális — ha eltér az e-mail címtől)</span>
            </Label>
            <Input
              value={a.authUser || ""}
              onChange={(e) => update({ authUser: e.target.value })}
              placeholder="pl. tarhely cPanel mailbox név"
            />
          </div>
          <div>
            <Label className="text-xs">Jelszó</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={a.password || ""}
                onChange={(e) => update({ password: e.target.value })}
                placeholder={initial ? "Mentett jelszó megtartása" : "••••••••"}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Jelszó elrejtése" : "Jelszó megjelenítése"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Gyors beállítások</Label>
            <div className="flex flex-wrap gap-2">
              {Object.keys(PRESETS).map((name) => (
                <Button key={name} variant="outline" size="sm" type="button" onClick={() => update(PRESETS[name])}>
                  {name}
                </Button>
              ))}
            </div>
          </div>

          <Tabs defaultValue="imap">
            <TabsList className="w-full">
              <TabsTrigger value="imap" className="flex-1">IMAP (bejövő)</TabsTrigger>
              <TabsTrigger value="smtp" className="flex-1">SMTP (kimenő)</TabsTrigger>
            </TabsList>
            <TabsContent value="imap" className="space-y-3 pt-3">
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <div>
                  <Label className="text-xs">IMAP host</Label>
                  <Input value={a.imapHost} onChange={(e) => update({ imapHost: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Port</Label>
                  <Input type="number" value={a.imapPort || 993} onChange={(e) => update({ imapPort: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">TLS használata</Label>
                <Switch checked={a.imapTls !== false} onCheckedChange={(v) => update({ imapTls: v })} />
              </div>
            </TabsContent>
            <TabsContent value="smtp" className="space-y-3 pt-3">
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <div>
                  <Label className="text-xs">SMTP host</Label>
                  <Input value={a.smtpHost} onChange={(e) => update({ smtpHost: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Port</Label>
                  <Input type="number" value={a.smtpPort || 465} onChange={(e) => update({ smtpPort: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">SSL/TLS (port 465)</Label>
                <Switch checked={a.smtpSecure !== false} onCheckedChange={(v) => update({ smtpSecure: v })} />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing} className="mr-auto">
            <RefreshCw className={cn("h-4 w-4 mr-1.5", testing && "animate-spin")} />
            {testing ? "Ellenőrzés…" : "Kapcsolat ellenőrzése"}
          </Button>
          <Button variant="outline" onClick={onClose}>Mégse</Button>
          <Button onClick={handleSave}>Mentés</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function blank(): Account {
  return {
    id: `acc-${Date.now()}`,
    label: "",
    user: "",
    password: "",
    imapHost: "",
    imapPort: 993,
    imapTls: true,
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: true,
  };
}
