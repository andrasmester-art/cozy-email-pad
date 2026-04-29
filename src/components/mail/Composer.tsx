import { useEffect, useState } from "react";
import { Account, EmailTemplate, MailMessage, mailAPI } from "@/lib/mailBridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "./RichTextEditor";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { X, Send, FileCode2, Save, Clock } from "lucide-react";
import { toast } from "sonner";
import { getSendDelay, setSendDelay, SEND_DELAY_OPTIONS, formatDelay } from "@/lib/sendDelay";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  defaultAccountId?: string | null;
  initial?: { to?: string; subject?: string; body?: string };
};

function htmlToText(html: string) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || "";
}

export function Composer({ open, onClose, accounts, defaultAccountId, initial }: Props) {
  const [accountId, setAccountId] = useState<string>(defaultAccountId || accounts[0]?.id || "");
  const [to, setTo] = useState(initial?.to || "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(initial?.subject || "");
  const [body, setBody] = useState(initial?.body || "");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [sending, setSending] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");

  useEffect(() => {
    if (open) {
      mailAPI.templates.list().then(setTemplates);
      setAccountId(defaultAccountId || accounts[0]?.id || "");
      setTo(initial?.to || "");
      setSubject(initial?.subject || "");
      setBody(initial?.body || "");
      setCc(""); setBcc(""); setShowCc(false);
    }
  }, [open, defaultAccountId, accounts, initial?.to, initial?.subject, initial?.body]);

  const applyTemplate = (tpl: EmailTemplate) => {
    if (!subject) setSubject(tpl.subject);
    setBody((prev) => (prev && prev !== "<p></p>" ? prev + tpl.body : tpl.body));
  };

  const handleSend = async () => {
    if (!accountId) return toast.error("Válassz fiókot");
    if (!to.trim()) return toast.error("Adj meg címzettet");
    setSending(true);
    try {
      await mailAPI.smtp.send({
        accountId, to, cc: cc || undefined, bcc: bcc || undefined,
        subject, html: body, text: htmlToText(body),
      });
      toast.success("Levél elküldve");
      onClose();
    } catch (e: any) {
      toast.error("Küldés sikertelen", { description: String(e?.message || e) });
    } finally {
      setSending(false);
    }
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) return;
    const tpl: EmailTemplate = {
      id: `tpl-${Date.now()}`,
      name: tplName.trim(),
      subject,
      body,
      updatedAt: Date.now(),
    };
    await mailAPI.templates.save(tpl);
    setTemplates((t) => [...t, tpl]);
    toast.success("Sablon elmentve");
    setSaveTplOpen(false);
    setTplName("");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-mac-lg w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden border border-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Új levél</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-4 py-3 space-y-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Label className="w-14 text-xs text-muted-foreground">Fiók</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Válassz fiókot" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.label} ({a.user})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="w-14 text-xs text-muted-foreground">Címzett</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="valaki@példa.hu" className="h-8 flex-1" />
            {!showCc && (
              <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => setShowCc(true)}>
                Cc / Bcc
              </Button>
            )}
          </div>
          {showCc && (
            <>
              <div className="flex items-center gap-2">
                <Label className="w-14 text-xs text-muted-foreground">Cc</Label>
                <Input value={cc} onChange={(e) => setCc(e.target.value)} className="h-8 flex-1" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="w-14 text-xs text-muted-foreground">Bcc</Label>
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} className="h-8 flex-1" />
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <Label className="w-14 text-xs text-muted-foreground">Tárgy</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 flex-1" />
          </div>
        </div>

        <div className="flex-1 p-4 overflow-hidden">
          <RichTextEditor value={body} onChange={setBody} placeholder="Írd ide az üzeneted…" className="h-full" />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-elevated">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <FileCode2 className="h-4 w-4 mr-1.5" /> Sablon beszúrása
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {templates.length === 0 && (
                  <DropdownMenuItem disabled>Nincs sablon</DropdownMenuItem>
                )}
                {templates.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => applyTemplate(t)}>
                    {t.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => setSaveTplOpen(true)}>
              <Save className="h-4 w-4 mr-1.5" /> Mentés sablonként
            </Button>
          </div>
          <Button onClick={handleSend} disabled={sending} className="bg-gradient-primary">
            <Send className="h-4 w-4 mr-1.5" /> {sending ? "Küldés…" : "Küldés"}
          </Button>
        </div>
      </div>

      <Dialog open={saveTplOpen} onOpenChange={setSaveTplOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Mentés sablonként</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Sablon neve</Label>
            <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Pl. Üdvözlő levél" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTplOpen(false)}>Mégse</Button>
            <Button onClick={saveAsTemplate}>Mentés</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
