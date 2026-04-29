import { MailMessage } from "@/lib/mailBridge";
import { Button } from "@/components/ui/button";
import { Reply, ReplyAll, Forward, Trash2, Archive, Star, Mail, MailOpen } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Props = {
  message: MailMessage | null;
  onReply: (m: MailMessage) => void;
  onReplyAll?: (m: MailMessage) => void;
  onForward?: (m: MailMessage) => void;
  onToggleFlag?: (m: MailMessage) => void;
  onToggleSeen?: (m: MailMessage) => void;
};

export function MessageView({ message, onReply, onReplyAll, onForward }: Props) {
  if (!message) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground bg-background">
        <div className="text-center">
          <div className="text-sm">Válassz egy üzenetet a megtekintéshez</div>
        </div>
      </div>
    );
  }

  return (
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
        <Button size="sm" variant="ghost" className="text-muted-foreground"><Archive className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
      </div>

      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-2xl font-semibold leading-tight">{message.subject}</h1>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">{message.from}</div>
            <div className="text-xs text-muted-foreground mt-0.5">→ {message.to}</div>
          </div>
          {message.date && (
            <div className="text-xs text-muted-foreground shrink-0">
              {format(new Date(message.date), "yyyy. MMM d. HH:mm")}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {message.html ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: message.html }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm">{message.text}</pre>
        )}
      </div>
    </div>
  );
}
