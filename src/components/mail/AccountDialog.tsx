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
import { CheckCircle2, AlertCircle, Circle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAccountStatus, setAccountStatus, formatRelative, type AccountStatus } from "@/lib/accountStatus";

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

  useEffect(() => {
    if (open) setA(initial || blank());
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Fiók szerkesztése" : "Új IMAP fiók"}</DialogTitle>
          <DialogDescription>
            Add meg a fiók adatait. A jelszavakat a Mac app a Keychainben titkosítva tárolja.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Megjelenített név</Label>
              <Input value={a.label} onChange={(e) => update({ label: e.target.value })} placeholder="Munka" />
            </div>
            <div>
              <Label className="text-xs">E-mail cím</Label>
              <Input value={a.user} onChange={(e) => update({ user: e.target.value, from: e.target.value })} placeholder="te@példa.hu" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Jelszó</Label>
            <Input type="password" value={a.password || ""} onChange={(e) => update({ password: e.target.value })} placeholder="••••••••" />
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

        <DialogFooter>
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
