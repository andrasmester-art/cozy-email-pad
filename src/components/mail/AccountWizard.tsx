import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  PROVIDERS,
  applyPreset,
  detectProvider,
  getDomain,
  type ProviderPreset,
} from "@/lib/providerPresets";
import type { Account } from "@/lib/mailBridge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Mail, Server, KeyRound, Sparkles } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete: (account: Account) => void;
};

type Step = 1 | 2 | 3;

export function AccountWizard({ open, onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState<ProviderPreset | null>(null);
  const [manualPick, setManualPick] = useState(false);

  useEffect(() => {
    if (!open) {
      // Reset on close
      setTimeout(() => {
        setStep(1);
        setDisplayName("");
        setEmail("");
        setProvider(null);
        setManualPick(false);
      }, 200);
    }
  }, [open]);

  // Auto-detect provider from domain
  const detected = useMemo(() => detectProvider(email), [email]);

  useEffect(() => {
    if (!manualPick && detected) {
      setProvider(detected);
    }
  }, [detected, manualPick]);

  const domain = getDomain(email);

  const goNext = () => {
    if (step === 1) {
      if (!email.includes("@")) return;
      setStep(2);
    } else if (step === 2) {
      if (!provider) return;
      setStep(3);
    }
  };

  const goBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const finish = () => {
    if (!provider) return;
    const preset = applyPreset(provider, email);
    const account: Account = {
      id: `acc-${Date.now()}`,
      label: displayName || email,
      displayName: displayName || undefined,
      user: email,
      from: email,
      authUser: email, // a legtöbb tárhelynél a teljes e-mail a felhasználónév
      imapHost: preset.imapHost || "",
      imapPort: preset.imapPort || 993,
      imapTls: preset.imapTls !== false,
      smtpHost: preset.smtpHost || "",
      smtpPort: preset.smtpPort || 465,
      smtpSecure: preset.smtpSecure !== false,
    };
    onComplete(account);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            E-mail beállítás varázsló
          </DialogTitle>
          <DialogDescription>
            Néhány lépésben beállítjuk az IMAP/SMTP fiókodat — a domain alapján
            automatikusan javasolunk hosztot és portot.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StepDot active={step === 1} done={step > 1} label="E-mail" icon={Mail} />
          <Divider />
          <StepDot active={step === 2} done={step > 2} label="Szolgáltató" icon={Server} />
          <Divider />
          <StepDot active={step === 3} done={false} label="Hitelesítés" icon={KeyRound} />
        </div>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">A te neved (megjelenített név)</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Kovács János"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Ez jelenik meg a kimenő levelek feladójaként.
              </p>
            </div>
            <div>
              <Label className="text-xs">E-mail cím</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setManualPick(false);
                }}
                placeholder="te@hoating.eu"
                autoFocus
              />
              {detected && (
                <p className="mt-1 text-xs text-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Felismertük: <strong>{detected.name}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 py-2">
            <div className="text-xs text-muted-foreground">
              {detected
                ? `A "${domain}" domain alapján javasolt szolgáltató: ${detected.name}.`
                : `A "${domain}" domain ismeretlen — válaszd ki a szolgáltatódat.`}
            </div>
            <div className="grid gap-2 max-h-[320px] overflow-y-auto pr-1">
              {PROVIDERS.map((p) => {
                const selected = provider?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProvider(p);
                      setManualPick(true);
                    }}
                    className={cn(
                      "text-left rounded-md border px-3 py-2 transition",
                      "hover:bg-muted/60",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                        : "border-border",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{p.name}</div>
                      {selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && provider && (
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
              <div className="font-medium text-foreground">Javasolt beállítások</div>
              <SettingRow label="IMAP" value={`${preview(provider, email).imapHost}:${preview(provider, email).imapPort} ${preview(provider, email).imapTls ? "(TLS)" : ""}`} />
              <SettingRow label="SMTP" value={`${preview(provider, email).smtpHost}:${preview(provider, email).smtpPort} ${preview(provider, email).smtpSecure ? "(SSL)" : "(STARTTLS)"}`} />
              <SettingRow label="Felhasználónév" value={email} />
            </div>

            {provider.needsAppPassword && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
                <div className="font-medium mb-1 text-warning">⚠️ App-specifikus jelszó szükséges</div>
                <div className="opacity-90">{provider.passwordHint}</div>
              </div>
            )}

            {provider.passwordHint && !provider.needsAppPassword && (
              <p className="text-xs text-muted-foreground">{provider.passwordHint}</p>
            )}

            <p className="text-xs text-muted-foreground">
              A "Befejezés" után a jelszót a fiók szerkesztő ablakában tudod megadni
              és a kapcsolatot tesztelni.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={goBack} className="mr-auto">
              Vissza
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Mégse
          </Button>
          {step < 3 ? (
            <Button
              onClick={goNext}
              disabled={(step === 1 && !email.includes("@")) || (step === 2 && !provider)}
            >
              Tovább
            </Button>
          ) : (
            <Button onClick={finish}>Befejezés</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function preview(provider: ProviderPreset, email: string) {
  const p = applyPreset(provider, email);
  return {
    imapHost: p.imapHost || "—",
    imapPort: p.imapPort || 993,
    imapTls: p.imapTls !== false,
    smtpHost: p.smtpHost || "—",
    smtpPort: p.smtpPort || 465,
    smtpSecure: p.smtpSecure !== false,
  };
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground text-right break-all">{value}</span>
    </div>
  );
}

function StepDot({
  active,
  done,
  label,
  icon: Icon,
}: {
  active: boolean;
  done: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        active && "text-foreground font-medium",
        done && "text-success",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-px flex-1 bg-border" />;
}
