import { useEffect, useRef, useState } from "react";
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
import { X, Send, FileCode2, Save, Clock, Star, Loader2, FileSignature, FileText, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSendDelay, setSendDelay, SEND_DELAY_OPTIONS, formatDelay } from "@/lib/sendDelay";
import { getDefaultAccountId, setDefaultAccountId } from "@/lib/defaultAccount";
import {
  listSignatures, getDefaultSignatureId, getSignature, applySignatureToBody,
  SIGNATURE_MARKER, QUOTE_MARKER,
  type Signature,
} from "@/lib/signatures";
import { loadDraft, saveDraft, clearDraft, isDraftMeaningful, type Draft } from "@/lib/draft";
import { sanitizeEmailHtml } from "@/lib/sanitizeHtml";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  defaultAccountId?: string | null;
  initial?: { to?: string; cc?: string; bcc?: string; subject?: string; body?: string };
  mode?: "new" | "reply" | "forward";
};

function htmlToText(html: string) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || "";
}

// Human-friendly relative timestamp for the draft-status panel.
function formatRelativeTime(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 5_000) return "épp most";
  if (diff < 60_000) return `${Math.floor(diff / 1000)} mp-e`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} perce`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} órája`;
  return new Date(ts).toLocaleString("hu-HU");
}

// Valós idejű, vizuális összegzés a levél felépítéséről, hogy a felhasználó
// azonnal lássa, hová kerül az aláírása reply / forward / új levél esetén.
//
// A `body` HTML-jét a sanitizer-markerek alapján 3 logikai blokkra bontjuk:
//   1) "Tartalom" — a felhasználó által írt rész (a `data-mwsig` és
//      `data-mwquote` blokkok ELŐTT)
//   2) "Aláírás (név)" — a `data-mwsig`-jelölt blokk (ha van), a megtalált
//      aláírás nevével
//   3) "Idézett előzmény" — a `data-mwquote`-jelölt blokk (reply / forward)
//
// A blokkokat ténylegesen olyan sorrendben mutatjuk, ahogyan a generált
// HTML-ben szerepelnek — így a felhasználó pontosan látja a végső sorrendet
// (pl. válasznál: Tartalom → Aláírás → Idézet).
function SignatureLayoutPreview({
  body,
  signatures,
}: {
  body: string;
  signatures: Signature[];
}) {
  // Üres / triviális body esetén ne foglaljon helyet.
  const trimmed = (body || "").trim();
  if (!trimmed || trimmed === "<p></p>") return null;

  const sigRe = new RegExp(
    `<div[^>]*${SIGNATURE_MARKER}=["']1["'][\\s\\S]*?<\\/div>`,
    "i",
  );
  const quoteRe = new RegExp(
    `<(blockquote|div)[^>]*${QUOTE_MARKER}=["']1["']`,
    "i",
  );
  const sigMatch = body.match(sigRe);
  const quoteMatch = body.match(quoteRe);

  // Ha sem aláírás, sem idézet nincs, nincs mit „összegezni" — a szerkesztő
  // önmagában is mutatja a tartalmat.
  if (!sigMatch && !quoteMatch) return null;

  // Az aláírás nevének felismerése: a `body`-ban tárolt aláírás-HTML-t
  // összevetjük a mentett aláírások body-jával — exact match esetén
  // megjelenítjük a nevet ("Üdv, Példa Péter — Munkahely").
  let sigName: string | null = null;
  if (sigMatch) {
    const inner = sigMatch[0]
      .replace(/^<div[^>]*>/i, "")
      .replace(/<\/div>$/i, "")
      .trim();
    const found = signatures.find((s) => (s.body || "").trim() === inner);
    if (found) sigName = found.name;
  }

  // Sorrend kiszámítása az indexek alapján (kisebb index → előbb jön).
  type Block = { key: "content" | "sig" | "quote"; label: string; pos: number };
  const blocks: Block[] = [];
  // A „Tartalom" mindig az első blokk ELŐTT helyezkedik el (pos = 0), és
  // csak akkor mutatjuk, ha tényleg van valami a sig/quote ELŐTT.
  const firstMarkerPos = Math.min(
    sigMatch?.index ?? Number.POSITIVE_INFINITY,
    quoteMatch?.index ?? Number.POSITIVE_INFINITY,
  );
  const beforeFirst = body.slice(0, firstMarkerPos).replace(/<[^>]+>/g, "").trim();
  if (beforeFirst.length > 0) {
    blocks.push({ key: "content", label: "Tartalom", pos: 0 });
  }
  if (sigMatch) {
    blocks.push({
      key: "sig",
      label: sigName ? `Aláírás (${sigName})` : "Aláírás",
      pos: sigMatch.index ?? 0,
    });
  }
  if (quoteMatch) {
    blocks.push({
      key: "quote",
      label: "Idézett előzmény",
      pos: quoteMatch.index ?? 0,
    });
  }
  blocks.sort((a, b) => a.pos - b.pos);

  const colorFor = (key: Block["key"]) =>
    key === "sig"
      ? "border-primary/40 bg-primary/10 text-primary"
      : key === "quote"
        ? "border-muted-foreground/30 bg-muted text-muted-foreground"
        : "border-border bg-surface-elevated text-foreground";

  return (
    <div
      className="px-4 py-1.5 text-[11px] border-b border-border bg-surface-elevated/40 flex items-center gap-1.5 flex-wrap"
      aria-label="A levél felépítésének előnézete"
    >
      <span className="text-muted-foreground mr-1">Sorrend:</span>
      {blocks.map((b, i) => (
        <span key={b.key} className="inline-flex items-center gap-1.5">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded border ${colorFor(b.key)}`}
          >
            {b.label}
          </span>
          {i < blocks.length - 1 && (
            <span className="text-muted-foreground select-none">→</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function Composer({ open, onClose, accounts, defaultAccountId, initial, mode = "new" }: Props) {
  const titleIdle = mode === "reply" ? "Válasz" : mode === "forward" ? "Továbbítás" : "Új levél";
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
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [delay, setDelay] = useState<number>(getSendDelay());
  const [signatures, setSignatures] = useState<Signature[]>(() => listSignatures());
  // Draft persistence UI state
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null); // shown as a banner on open
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [savedTick, setSavedTick] = useState(0); // forces relative-time refresh
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const skipAutoSaveRef = useRef(false); // suppress autosave while we (re)hydrate fields
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const hasInitial = !!(initial?.to || initial?.cc || initial?.bcc || initial?.subject || initial?.body);
      const draft = !hasInitial ? loadDraft() : null;
      const offerDraft = draft && isDraftMeaningful(draft);

      const initId = saved && accounts.some((a) => a.id === saved)
        ? saved
        : (defaultAccountId || accounts[0]?.id || "");

      // Suppress autosave during initial hydration so we don't bump `lastSavedAt`
      // immediately on open and so the offered draft isn't overwritten before
      // the user decides whether to restore it.
      skipAutoSaveRef.current = true;
      setAccountId(initId);
      setDefaultId(saved);
      setTo(initial?.to || "");
      setCc(initial?.cc || "");
      setBcc(initial?.bcc || "");
      setShowCc(!!initial?.cc || !!initial?.bcc);
      setSubject(initial?.subject || "");
      const sig = getSignature(initId ? getDefaultSignatureId(initId) : null);
      setBody(applySignatureToBody(initial?.body || "", sig));

      // Show the recovery banner if a meaningful draft exists; otherwise track
      // the last-saved timestamp from the loaded draft (if any).
      setPendingDraft(offerDraft && draft ? draft : null);
      setLastSavedAt(draft?.updatedAt ?? null);

      // Re-enable autosave on the next tick so the hydration setStates settle.
      const re = setTimeout(() => { skipAutoSaveRef.current = false; }, 50);
      return () => clearTimeout(re);
    }
  }, [open, defaultAccountId, accounts, initial?.to, initial?.cc, initial?.bcc, initial?.subject, initial?.body]);

  // Apply the offered draft into the editor when the user clicks "Visszaállítás".
  const restorePendingDraft = () => {
    if (!pendingDraft) return;
    skipAutoSaveRef.current = true;
    if (pendingDraft.accountId && accounts.some((a) => a.id === pendingDraft.accountId)) {
      setAccountId(pendingDraft.accountId);
    }
    setTo(pendingDraft.to || "");
    setCc(pendingDraft.cc || "");
    setBcc(pendingDraft.bcc || "");
    setShowCc(!!pendingDraft.showCc || !!pendingDraft.cc || !!pendingDraft.bcc);
    setSubject(pendingDraft.subject || "");
    setBody(pendingDraft.body || "");
    setLastSavedAt(pendingDraft.updatedAt);
    setPendingDraft(null);
    toast.success("Piszkozat visszaállítva");
    setTimeout(() => { skipAutoSaveRef.current = false; }, 50);
  };

  const dismissPendingDraft = () => {
    // User chose not to restore — discard so it doesn't keep popping up.
    clearDraft();
    setPendingDraft(null);
    setLastSavedAt(null);
    toast.info("Mentett piszkozat eldobva");
  };

  // Permanently discard the saved draft from localStorage and reset all
  // composer fields. Suppresses the next autosave tick so the freshly cleared
  // state can't immediately repopulate the storage entry.
  const discardDraft = () => {
    skipAutoSaveRef.current = true;
    clearDraft();
    setPendingDraft(null);
    setLastSavedAt(null);
    setTo("");
    setCc("");
    setBcc("");
    setShowCc(false);
    setSubject("");
    const sig = getSignature(accountId ? getDefaultSignatureId(accountId) : null);
    setBody(applySignatureToBody("", sig));
    toast.success("Piszkozat törölve");
    setTimeout(() => { skipAutoSaveRef.current = false; }, 50);
  };

  // Auto-save draft whenever editable fields change while the composer is open.
  useEffect(() => {
    if (!open) return;
    if (skipAutoSaveRef.current) return; // hydration / restore in progress
    const t = setTimeout(() => {
      const now = Date.now();
      const draft = {
        accountId, to, cc, bcc, showCc, subject, body, updatedAt: now,
      };
      try {
        if (isDraftMeaningful(draft)) {
          // A „Mentés…" jelzést saját render-ciklusban mutatjuk, hogy a
          // felhasználó tényleg lássa a folyamatban-állapotot — különben a
          // React a saving→saved setStateket batch-elné, és a spinner
          // soha nem villanna fel.
          setSaveStatus("saving");
          requestAnimationFrame(() => {
            try {
              saveDraft(draft);
              setLastSavedAt(now);
              setSaveStatus("saved");
              if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
              savedFlashRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
            } catch (e: any) {
              setSaveStatus("error");
              toast.error("Piszkozat mentése sikertelen", {
                description: String(e?.message || e),
              });
            }
          });
        } else {
          clearDraft();
          setLastSavedAt(null);
          setSaveStatus("idle");
        }
      } catch (e: any) {
        setSaveStatus("error");
        toast.error("Piszkozat mentése sikertelen", {
          description: String(e?.message || e),
        });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [open, accountId, to, cc, bcc, showCc, subject, body]);

  // Tick every 30s so "x perce mentve" stays accurate without re-rendering on every keystroke.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setSavedTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [open]);

  // Swap default signature whenever the account changes (after the dialog is open)
  useEffect(() => {
    if (!open || !accountId) return;
    const sig = getSignature(getDefaultSignatureId(accountId));
    setBody((prev) => applySignatureToBody(prev, sig));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const applyTemplate = (tpl: EmailTemplate) => {
    if (!subject) setSubject(tpl.subject);
    // A sablon törzsét beillesztés előtt megtisztítjuk, hogy se XSS, se
    // tördelést rontó (script/style/eseménykezelő) markup ne kerüljön a Composerbe.
    const safeBody = sanitizeEmailHtml(tpl.body || "");
    setBody((prev) => (prev && prev !== "<p></p>" ? prev + safeBody : safeBody));
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
    if (sending || pending) return;
    if (!accountId) return toast.error("Válassz fiókot");
    if (!to.trim()) return toast.error("Adj meg címzettet");

    const payload = {
      accountId, to, cc: cc || undefined, bcc: bcc || undefined,
      subject, html: body, text: htmlToText(body),
    };

    // Azonnali küldés — nincs késleltetés.
    if (delay === 0) {
      setSending(true);
      try {
        await mailAPI.smtp.send(payload);
        clearDraft();
        toast.success("Levél elküldve");
        onClose();
      } catch (e: any) {
        toast.error("Küldés sikertelen", { description: String(e?.message || e) });
      } finally {
        setSending(false);
      }
      return;
    }

    // Késleltetett küldés "Visszavonás" lehetőséggel.
    let cancelled = false;
    let remaining = delay;
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      clearInterval(tick);
      clearTimeout(timer);
      setPending(null);
      toast.info("Küldés visszavonva");
    };
    setPending({ remaining, total: delay, cancel });
    const tick = setInterval(() => {
      remaining -= 1;
      if (cancelled) return;
      if (remaining > 0) setPending({ remaining, total: delay, cancel });
      else clearInterval(tick);
    }, 1000);
    const timer = setTimeout(async () => {
      clearInterval(tick);
      if (cancelled) return;
      setPending(null);
      setSending(true);
      try {
        await mailAPI.smtp.send(payload);
        clearDraft();
        toast.success("Levél elküldve");
        onClose();
      } catch (e: any) {
        toast.error("Küldés sikertelen", { description: String(e?.message || e) });
      } finally {
        setSending(false);
      }
    }, delay * 1000);
  };

  // Piszkozat mentése a szerver Drafts mappájába (IMAP APPEND).
  // Ettől más kliensben (Gmail web, Mail.app) is megjelenik, és a saját
  // appunkban is — a Piszkozatok mappa azonnal frissül.
  const saveDraftToServer = async () => {
    if (savingDraft) return;
    if (!accountId) return toast.error("Válassz fiókot");
    if (!subject.trim() && !body.trim()) {
      return toast.error("A piszkozat üres");
    }
    setSavingDraft(true);
    try {
      await mailAPI.imap.appendDraft({
        accountId,
        to: to || undefined,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject: subject || "(piszkozat)",
        html: body,
        text: htmlToText(body),
      });
      toast.success("Piszkozat mentve a szerverre");
    } catch (e: any) {
      toast.error("Piszkozat mentése sikertelen", {
        description: String(e?.message || e),
      });
    } finally {
      setSavingDraft(false);
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
          <h2 className="text-sm font-semibold">
            {pending ? "Tart a küldés…" : sending ? "Küldés folyamatban…" : titleIdle}
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

        {/* Restore-draft banner: shown when reopening with a saved draft available. */}
        {pendingDraft && !pending && (
          <div
            role="status"
            aria-live="polite"
            className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-3"
          >
            <FileText className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0 text-sm">
              <div className="font-medium text-foreground">
                Mentett piszkozat található
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {pendingDraft.subject?.trim() || "(nincs tárgy)"}
                {pendingDraft.to ? ` · ${pendingDraft.to}` : ""}
                {" · "}
                {formatRelativeTime(pendingDraft.updatedAt)}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={restorePendingDraft}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Visszaállítás
            </Button>
            <Button size="sm" variant="ghost" onClick={dismissPendingDraft}>
              Eldobás
            </Button>
          </div>
        )}

        {/* Persistent draft-status strip showing the autosave state and last timestamp. */}
        {!pendingDraft && (
          <div
            className={`px-4 py-1.5 text-[11px] border-b border-border bg-surface-elevated/60 flex items-center gap-1.5 ${
              saveStatus === "error" ? "text-destructive" : "text-muted-foreground"
            }`}
            data-tick={savedTick}
            aria-live="polite"
          >
            {saveStatus === "saving" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className={`h-3 w-3 ${saveStatus === "saved" ? "text-primary" : "opacity-70"}`} />
            )}
            <span>
              {saveStatus === "saving"
                ? "Mentés…"
                : saveStatus === "error"
                  ? "Mentés sikertelen"
                  : saveStatus === "saved"
                    ? "Mentve"
                    : lastSavedAt
                      ? `Piszkozat mentve · ${formatRelativeTime(lastSavedAt)}`
                      : "Még nincs mentett piszkozat"}
            </span>
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

        <SignatureLayoutPreview body={body} signatures={signatures} />

        <div className="flex-1 p-4 overflow-hidden">
          <RichTextEditor value={body} onChange={setBody} placeholder="Írd ide az üzeneted…" className="h-full" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-border bg-surface-elevated">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
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
            <Button
              variant="outline"
              size="sm"
              onClick={saveDraftToServer}
              disabled={savingDraft || !accountId}
              title="A piszkozat mentése a fiók szerverére (Drafts mappa) — más kliensekben is látható lesz"
            >
              {savingDraft
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <FileText className="h-4 w-4 mr-1.5" />}
              {savingDraft ? "Mentés…" : "Mentés piszkozatként"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSaveTplOpen(true)}>
              <Save className="h-4 w-4 mr-1.5" /> Mentés sablonként
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={discardDraft}
              disabled={!lastSavedAt && !pendingDraft}
              title={
                !lastSavedAt && !pendingDraft
                  ? "Nincs mentett piszkozat"
                  : "A mentett piszkozat törlése a tárolóból"
              }
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Piszkozat törlése
            </Button>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
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
