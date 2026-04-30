import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Account, MailMessage, mailAPI } from "@/lib/mailBridge";
import { MessageView } from "@/components/mail/MessageView";
import { Composer } from "@/components/mail/Composer";
import { SendStatusOverlay } from "@/components/mail/SendStatusOverlay";
import { toast } from "sonner";

// Új ablakban megnyitott egyetlen levél nézete. URL: /message?accountId=..&mailbox=..&seqno=..&uid=..
// Tartalmaz egy beágyazott Composert is, hogy ugyanitt lehessen válaszolni / továbbítani / szerkeszteni.

function extractEmails(s: string): string[] {
  if (!s) return [];
  const out: string[] = [];
  const re = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

function quoteBody(m: MailMessage) {
  return `<p></p><blockquote data-mwquote="1"><p><em>${m.from} írta:</em></p>${m.html || `<p>${m.text}</p>`}</blockquote>`;
}

const MessagePage = () => {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const accountId = params.get("accountId") || "";
  const mailbox = params.get("mailbox") || "INBOX";
  const seqno = params.get("seqno") ? Number(params.get("seqno")) : null;
  const uid = params.get("uid");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [message, setMessage] = useState<MailMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitial, setComposerInitial] = useState<{ to?: string; cc?: string; bcc?: string; subject?: string; body?: string } | undefined>();
  const [composerMode, setComposerMode] = useState<"new" | "reply" | "forward">("reply");

  // Fiókok + levél betöltése.
  // Először a cache-ből próbáljuk (gyors), és ha ott nincs (pl. még nem
  // szinkronizált, vagy a felhasználó épp most kapta meg), akkor élőben
  // letöltjük a szervertől UID alapján. Így dupla kattal nyitva sosem
  // marad üres az ablak — vagy a cache-ből, vagy frissen jön a tartalom.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accs, list] = await Promise.all([
          mailAPI.accounts.list(),
          mailAPI.imap.fetch({ accountId, mailbox, limit: 5000 }),
        ]);
        if (cancelled) return;
        setAccounts(accs);
        const found =
          (uid ? list.find((m) => m.uid === uid) : null) ||
          (seqno != null ? list.find((m) => m.seqno === seqno) : null) ||
          null;

        if (found) {
          setMessage(found);
          return;
        }

        // Cache-ben nincs → próbáljuk élőben a szervertől, ha van UID-unk.
        if (!uid) {
          toast.error("A levél nem található és nincs UID a megnyitáshoz.");
          return;
        }
        const r = await mailAPI.mail.fetchBody({ accountId, mailbox, uid });
        if (cancelled) return;
        if (!r?.ok || !r.message) {
          toast.error("A levél nem tölthető le a szerverről.");
          return;
        }
        // A fetchBody most már fejléc-mezőket is visszaad (from/to/subject/date),
        // így önmagában elég egy teljes nézethez.
        setMessage({
          seqno: seqno ?? 0,
          ...r.message,
        } as MailMessage);
      } catch (e: any) {
        toast.error("Levél betöltése sikertelen", { description: String(e?.message || e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, mailbox, seqno, uid]);

  // Ablakcím a tárgy alapján.
  useEffect(() => {
    if (message?.subject) document.title = message.subject;
  }, [message?.subject]);

  const handleReply = (m: MailMessage) => {
    setComposerInitial({
      to: m.from,
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      body: quoteBody(m),
    });
    setComposerMode("reply");
    setComposerOpen(true);
  };

  const handleReplyAll = (m: MailMessage) => {
    const account = accounts.find((a) => a.id === accountId);
    const myEmail = (account?.user || "").toLowerCase();
    const fromEmails = extractEmails(m.from);
    const toEmails = extractEmails(m.to);
    const primary = fromEmails[0] || m.from;
    const others = Array.from(new Set([...toEmails, ...fromEmails.slice(1)]))
      .filter((e) => e.toLowerCase() !== primary.toLowerCase())
      .filter((e) => !myEmail || e.toLowerCase() !== myEmail);
    setComposerInitial({
      to: primary,
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      body: quoteBody(m),
      cc: others.length ? others.join(", ") : undefined,
    });
    setComposerMode("reply");
    setComposerOpen(true);
  };

  const handleForward = (m: MailMessage) => {
    setComposerInitial({
      subject: m.subject.startsWith("Fwd:") ? m.subject : `Fwd: ${m.subject}`,
      body: `<p></p><blockquote data-mwquote="1"><p><em>Továbbított üzenet — ${m.from}:</em></p>${m.html || `<p>${m.text}</p>`}</blockquote>`,
    });
    setComposerMode("forward");
    setComposerOpen(true);
  };

  const applyFlagPatch = async (m: MailMessage, patch: { flagged?: boolean; seen?: boolean }) => {
    if (!m.uid) return;
    setMessage((prev) => (prev ? { ...prev, ...patch } : prev));
    try {
      await mailAPI.mail.setFlag({ accountId, mailbox, uid: m.uid, patch });
    } catch (e: any) {
      setMessage((prev) => (prev ? { ...prev, flagged: m.flagged, seen: m.seen } : prev));
      toast.error("Megjelölés sikertelen", { description: String(e?.message || e) });
    }
  };
  const toggleFlag = (m: MailMessage) => applyFlagPatch(m, { flagged: !m.flagged });
  const toggleSeen = (m: MailMessage) => applyFlagPatch(m, { seen: m.seen === false ? true : false });

  // Levél megnyitásakor: 1) automatikus \\Seen, 2) lazy body fetch, ha még
  // nincs letöltve a teljes tartalom (a sync csak fejléceket húz).
  useEffect(() => {
    if (!message || !message.uid) return;
    if (message.seen === false) {
      applyFlagPatch(message, { seen: true });
    }
    if (message.bodyLoaded === false && accountId) {
      let cancelled = false;
      mailAPI.mail
        .fetchBody({ accountId, mailbox, uid: message.uid })
        .then((r) => {
          if (cancelled || !r?.ok || !r.message) return;
          const fresh = r.message;
          setMessage((prev) => (prev && prev.uid === fresh.uid ? { ...prev, ...fresh } : prev));
        })
        .catch(() => { /* csendes hiba */ });
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.uid]);

  // "Szerkesztés" gomb a Drafts mappához: betöltjük az eredeti tartalmat új levélként.
  const handleEditAsNew = (m: MailMessage) => {
    setComposerInitial({
      to: m.to || "",
      subject: m.subject || "",
      body: m.html || (m.text ? `<p>${m.text}</p>` : ""),
    });
    setComposerMode("new");
    setComposerOpen(true);
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Levél betöltése…
          </div>
        ) : !message ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            A levél nem tölthető le. Ellenőrizd a kapcsolatot, és próbáld újra.
          </div>
        ) : (
          <>
            <MessageView
              message={message}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
              onToggleFlag={toggleFlag}
              onToggleSeen={toggleSeen}
            />
            {mailbox.toLowerCase().includes("draft") && (
              <div className="border-t border-border px-3 py-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleEditAsNew(message)}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                >
                  Piszkozat szerkesztése
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Composer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        accounts={accounts}
        defaultAccountId={accountId}
        initial={composerInitial}
        mode={composerMode}
      />

      {/* Küldési állapot panel — minden ablakban külön példány. */}
      <SendStatusOverlay />
    </div>
  );
};

export default MessagePage;
