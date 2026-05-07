import { useState } from "react";
import { MailMessage } from "@/lib/mailBridge";
import { Button } from "@/components/ui/button";
import { Reply, ReplyAll, Forward, Trash2, Archive, Star, Mail, MailOpen, FileDown, Copy, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { EmailHtmlFrame } from "./EmailHtmlFrame";
import { exportEmailToPdf } from "@/lib/exportPdf";
import { AttachmentList } from "./AttachmentList";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

function extractEmail(s: string): string {
  if (!s) return "";
  const m = s.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  return (m ? m[1] : s).trim();
}

type Props = {
  message: MailMessage | null;
  onReply: (m: MailMessage) => void;
  onReplyAll?: (m: MailMessage) => void;
  onForward?: (m: MailMessage) => void;
  onToggleFlag?: (m: MailMessage) => void;
  onToggleSeen?: (m: MailMessage) => void;
  onDelete?: (m: MailMessage) => void;
  onOpenInNewWindow?: (m: MailMessage) => void;
};

export function MessageView({ message, onReply, onReplyAll, onForward, onToggleFlag, onToggleSeen, onDelete, onOpenInNewWindow }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!message) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground bg-background">
        <div className="text-center">
          <div className="text-sm">Válassz egy üzenetet a megtekintéshez</div>
        </div>
      </div>
    );
  }

  const flagged = !!message.flagged;
  const seen = message.seen !== false;

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} másolva`);
    } catch { toast.error("Másolás sikertelen"); }
  };

  const savePdf = async () => {
    try { await exportEmailToPdf(message); }
    catch (e: any) { toast.error("PDF mentése sikertelen", { description: String(e?.message || e) }); }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex-1 flex flex-col h-full bg-background">
          <div className="mac-titlebar shrink-0 flex items-center justify-end px-3 gap-1 border-b border-border">
        <Button size="sm" variant="ghost" onClick={() => onReply(message)}>
          <Reply className="h-4 w-4 mr-1.5" /> Válasz
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onReplyAll?.(message)}
          disabled={!onReplyAll}
        >
          <ReplyAll className="h-4 w-4 mr-1.5" /> Mind
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onForward?.(message)}
          disabled={!onForward}
        >
          <Forward className="h-4 w-4 mr-1.5" /> Tov.
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        {onToggleFlag && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onToggleFlag(message)}
            className={cn(flagged ? "text-amber-500" : "text-muted-foreground")}
            title={flagged ? "Csillag eltávolítása" : "Megjelölés csillaggal"}
          >
            <Star className={cn("h-4 w-4", flagged && "fill-current")} />
          </Button>
        )}
        {onToggleSeen && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onToggleSeen(message)}
            className="text-muted-foreground"
            title={seen ? "Megjelölés olvasatlannak" : "Megjelölés olvasottnak"}
          >
            {seen ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            try {
              await exportEmailToPdf(message);
            } catch (e: any) {
              toast.error("PDF mentése sikertelen", { description: String(e?.message || e) });
            }
          }}
          className="text-muted-foreground"
          title="Levél mentése PDF-ként – a megnyíló nyomtatási ablakban válaszd a PDF-ként mentés opciót"
        >
          <FileDown className="h-4 w-4 mr-1.5" /> PDF
        </Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground"><Archive className="h-4 w-4" /></Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => onDelete && setConfirmOpen(true)}
          disabled={!onDelete}
          title={onDelete ? "Levél törlése (Kukába helyezés)" : "Törlés nem érhető el"}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="px-8 py-5 border-b border-border bg-surface">
        <h1 className="text-[19px] font-medium leading-[1.2] [font-family:var(--font-display)]">{message.subject}</h1>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <div className="text-[14px] font-medium text-foreground">{message.from}</div>
            <div className="text-[13px] text-muted-foreground mt-0.5">→ {message.to}</div>
          </div>
          {message.date && (
            <div className="text-[13px] text-muted-foreground shrink-0">
              {format(new Date(message.date), "yyyy. MMM d. HH:mm")}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 min-h-full bg-surface">
          {message.bodyLoaded === false && !message.html && !message.text ? (
            <div className="text-sm text-muted-foreground italic">
              Levél tartalmának betöltése…
            </div>
          ) : message.html ? (
            // A levél HTML-jét izolált iframe-be tesszük, hogy a benne lévő
            // `<style>` blokkok és inline szabályok ne ütközzenek a Tailwind
            // reset / `prose` stílusokkal — különben a komplexebb levelek
            // (HTML kampányok, számlák, hírlevelek) „puszta szövegként"
            // jelennek meg.
            // Az attachments prop átadása szükséges a CID képcsere miatt:
            // a multipart/related levelekben az inline képek src="cid:xxx"
            // formában vannak a HTML-ben, ezeket az iframe renderelése előtt
            // base64 data URL-re cseréljük.
            <EmailHtmlFrame
              html={message.html}
              attachments={message.attachments}
              className="bg-surface"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-[17px] leading-[1.47] [font-family:var(--font-ui)]">{message.text}</pre>
          )}
        </div>
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentList attachments={message.attachments} />
        )}
      </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => onReply(message)}>
          <Reply className="h-4 w-4 mr-2" /> Válasz
        </ContextMenuItem>
        {onReplyAll && (
          <ContextMenuItem onSelect={() => onReplyAll(message)}>
            <ReplyAll className="h-4 w-4 mr-2" /> Válasz mindenkinek
          </ContextMenuItem>
        )}
        {onForward && (
          <ContextMenuItem onSelect={() => onForward(message)}>
            <Forward className="h-4 w-4 mr-2" /> Továbbítás
          </ContextMenuItem>
        )}
        {onOpenInNewWindow && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onOpenInNewWindow(message)}>
              <ExternalLink className="h-4 w-4 mr-2" /> Megnyitás új ablakban
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        {onToggleSeen && (
          <ContextMenuItem onSelect={() => onToggleSeen(message)}>
            {seen ? <MailOpen className="h-4 w-4 mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
            {seen ? "Megjelölés olvasatlannak" : "Megjelölés olvasottnak"}
          </ContextMenuItem>
        )}
        {onToggleFlag && (
          <ContextMenuItem onSelect={() => onToggleFlag(message)}>
            <Star className={cn("h-4 w-4 mr-2", flagged && "fill-current text-amber-500")} />
            {flagged ? "Csillag eltávolítása" : "Megjelölés csillaggal"}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => copyToClipboard(extractEmail(message.from), "Feladó címe")}>
          <Copy className="h-4 w-4 mr-2" /> Feladó címének másolása
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => copyToClipboard(message.subject || "", "Tárgy")}>
          <Copy className="h-4 w-4 mr-2" /> Tárgy másolása
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={savePdf}>
          <FileDown className="h-4 w-4 mr-2" /> Mentés PDF-ként
        </ContextMenuItem>
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => setConfirmOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Levél törlése
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Levél törlése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan törlöd ezt a levelet? A levél a Kukába kerül (vagy ha már a Kukában van, véglegesen törlődik).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmOpen(false); onDelete?.(message); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Törlés
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContextMenu>
  );
}
