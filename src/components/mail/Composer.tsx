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
import { X, Send, FileCode2, Save, Clock, Star, Loader2, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { getSendDelay, setSendDelay, SEND_DELAY_OPTIONS, formatDelay } from "@/lib/sendDelay";
import { getDefaultAccountId, setDefaultAccountId } from "@/lib/defaultAccount";
import {
  listSignatures, getDefaultSignatureId, getSignature, applySignatureToBody,
  type Signature,
} from "@/lib/signatures";
import { loadDraft, saveDraft, clearDraft, isDraftMeaningful } from "@/lib/draft";
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
  const resolveInitialAccount = () => {
    const saved = getDefaultAccountId();
    if (saved && accounts.some((a) => a.id === saved)) return saved;
    return defaultAccountId || accounts[0]?.id || "";
  };
  const [accountId, setAccountId] = useState<string>(resolveInitialAccount());
  const [defaultId, setDefaultId] = useState<string | null>(getDefaultAccountId());
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
  const [delay, setDelay] = useState<number>(getSendDelay());
  const [signatures, setSignatures] = useState<Signature[]>(() => listSignatures());

  useEffect(() => {
    const handler = (e: Event) => setDelay((e as CustomEvent<number>).detail);
    window.addEventListener("sendDelayChanged", handler);
    const sigHandler = () => setSignatures(listSignatures());
    window.addEventListener("signaturesChanged", sigHandler);
    return () => {
      window.removeEventListener("sendDelayChanged", handler);
      window.removeEventListener("signaturesChanged", sigHandler);
    };
  }, []);

  useEffect(() => {
    if (open) {
      mailAPI.templates.list().then(setTemplates);
      const saved = getDefaultAccountId();
      const initId = saved && accounts.some((a) => a.id === saved)
        ? saved
        : (defaultAccountId || accounts[0]?.id || "");
      setAccountId(initId);
      setDefaultId(saved);
      setTo(initial?.to || "");
      setSubject(initial?.subject || "");
      // Apply default signature for the initial account on open
      const sig = getSignature(initId ? getDefaultSignatureId(initId) : null);
      setBody(applySignatureToBody(initial?.body || "", sig));
      setCc(""); setBcc(""); setShowCc(false);
    }
  }, [open, defaultAccountId, accounts, initial?.to, initial?.subject, initial?.body]);

  // Swap default signature whenever the account changes (after the dialog is open)
  useEffect(() => {
    if (!open || !accountId) return;
    const sig = getSignature(getDefaultSignatureId(accountId));
    setBody((prev) => applySignatureToBody(prev, sig));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const applyTemplate = (tpl: EmailTemplate) => {
    if (!subject) setSubject(tpl.subject);
    setBody((prev) => (prev && prev !== "<p></p>" ? prev + tpl.body : tpl.body));
  };

  const applySignature = (sig: Signature | null) => {
    setBody((prev) => applySignatureToBody(prev, sig));
  };

  // Pending-send state for the undo countdown UI
  const [pending, setPending] = useState<{
    remaining: number;
    total: number;
    cancel: () => void;
  } | null>(null);

  // Cleanup any active countdown when the component unmounts
  useEffect(() => {
    return () => { pending?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async () => {
    if (sending || pending) return; // guard against double-click
    if (!accountId) return toast.error("Válassz fiókot");
    if (!to.trim()) return toast.error("Adj meg címzettet");

    const payload = {
      accountId, to, cc: cc || undefined, bcc: bcc || undefined,
      subject, html: body, text: htmlToText(body),
    };

    // No delay → send immediately
    if (delay === 0) {
      setSending(true);
      try {
        await mailAPI.smtp.send(payload);
        toast.success("Levél elküldve");
        onClose();
      } catch (e: any) {
        toast.error("Küldés sikertelen", { description: String(e?.message || e) });
      } finally {
        setSending(false);
      }
      return;
    }

    // Delayed send with inline undo banner
    let cancelled = false;
    let remaining = delay;
    let tick: ReturnType<typeof setInterval>;
    let timer: ReturnType<typeof setTimeout>;

    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      clearInterval(tick);
      clearTimeout(timer);
      setPending(null);
      toast.info("Küldés visszavonva", {
        description: `Tárgy: ${subject || "(nincs tárgy)"}`,
      });
    };

    setPending({ remaining, total: delay, cancel });

    tick = setInterval(() => {
      remaining -= 1;
      if (cancelled) return;
      if (remaining > 0) {
        setPending({ remaining, total: delay, cancel });
      } else {
        clearInterval(tick);
      }
    }, 1000);

    timer = setTimeout(async () => {
      clearInterval(tick);
      if (cancelled) return;
      setPending(null);
      setSending(true);
      try {
        await mailAPI.smtp.send(payload);
        toast.success("Levél elküldve");
        onClose();
      } catch (e: any) {
        toast.error("Küldés sikertelen", {
          description: String(e?.message || e),
        });
      } finally {
        setSending(false);
      }
    }, delay * 1000);
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
          <h2 className="text-sm font-semibold">
            {pending ? "Tart a küldés…" : sending ? "Küldés folyamatban…" : "Új levél"}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            disabled={!!pending || sending}
            title={pending ? "Vond vissza vagy várd meg a küldést" : "Bezárás"}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {pending && (
          <div
            role="status"
            aria-live="polite"
            className="px-4 py-2.5 bg-primary/10 border-b border-primary/20 flex items-center gap-3"
          >
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">
                Tart a küldés — {pending.remaining} mp múlva indul
              </div>
              <div className="h-1 mt-1.5 bg-primary/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-1000 ease-linear"
                  style={{ width: `${((pending.total - pending.remaining) / pending.total) * 100}%` }}
                />
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={pending.cancel}>
              Visszavonás
            </Button>
          </div>
        )}

        <div className="px-4 py-3 space-y-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Label className="w-14 text-xs text-muted-foreground">Fiók</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Válassz fiókot" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label} ({a.user}){defaultId === a.id ? " — alapértelmezett" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title={
                !accountId
                  ? "Válassz fiókot"
                  : defaultId === accountId
                    ? "Alapértelmezett fiók eltávolítása"
                    : "Beállítás alapértelmezett fiókként"
              }
              disabled={!accountId}
              onClick={() => {
                if (defaultId === accountId) {
                  setDefaultAccountId(null);
                  setDefaultId(null);
                  toast.info("Alapértelmezett fiók törölve");
                } else {
                  setDefaultAccountId(accountId);
                  setDefaultId(accountId);
                  const acc = accounts.find((a) => a.id === accountId);
                  toast.success("Alapértelmezett fiók beállítva", {
                    description: acc ? `${acc.label} (${acc.user})` : undefined,
                  });
                }
              }}
            >
              <Star className={`h-4 w-4 ${defaultId === accountId ? "fill-primary text-primary" : "text-muted-foreground"}`} />
            </Button>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <FileSignature className="h-4 w-4 mr-1.5" /> Aláírás
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {signatures.length === 0 && (
                  <DropdownMenuItem disabled>Nincs aláírás</DropdownMenuItem>
                )}
                {signatures.map((s) => {
                  const isAccountDefault = !!accountId && getDefaultSignatureId(accountId) === s.id;
                  return (
                    <DropdownMenuItem key={s.id} onClick={() => applySignature(s)}>
                      {s.name}{isAccountDefault ? " — alapértelmezett" : ""}
                    </DropdownMenuItem>
                  );
                })}
                {signatures.length > 0 && (
                  <DropdownMenuItem onClick={() => applySignature(null)}>
                    — Aláírás nélkül —
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => setSaveTplOpen(true)}>
              <Save className="h-4 w-4 mr-1.5" /> Mentés sablonként
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Visszavonási idő</span>
            </div>
            <Select
              value={String(delay)}
              onValueChange={(v) => { const n = parseInt(v, 10); setDelay(n); setSendDelay(n); }}
            >
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEND_DELAY_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-xs">
                    {formatDelay(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleSend}
              disabled={sending || !!pending}
              aria-busy={sending || !!pending}
              className="bg-gradient-primary min-w-[120px]"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Küldés {pending.remaining} mp
                </>
              ) : sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Küldés…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1.5" />
                  Küldés
                </>
              )}
            </Button>
          </div>
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
