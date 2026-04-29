import { useEffect, useState, useCallback } from "react";
import { Account, MailMessage, mailAPI } from "@/lib/mailBridge";

import { clearRetryFor } from "@/lib/accountRetry";
import { Sidebar } from "@/components/mail/Sidebar";
import { MessageList } from "@/components/mail/MessageList";
import { MessageView } from "@/components/mail/MessageView";
import { Composer } from "@/components/mail/Composer";
import { AccountDialog } from "@/components/mail/AccountDialog";

import { TemplatesDialog } from "@/components/mail/TemplatesDialog";
import { SignaturesDialog } from "@/components/mail/SignaturesDialog";
import { UpdaterDialog } from "@/components/mail/UpdaterDialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PenSquare, Sparkles } from "lucide-react";
import { toast } from "sonner";

const Index = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activeMailbox, setActiveMailbox] = useState("INBOX");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitial, setComposerInitial] = useState<{ to?: string; cc?: string; bcc?: string; subject?: string; body?: string } | undefined>();
  const [composerMode, setComposerMode] = useState<"new" | "reply" | "forward">("new");
  const [accountDlgOpen, setAccountDlgOpen] = useState(false);
  
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [signaturesOpen, setSignaturesOpen] = useState(false);
  const [updaterOpen, setUpdaterOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);

  const confirmDeleteAccount = async () => {
    if (!deletingAccount) return;
    const id = deletingAccount.id;
    await mailAPI.accounts.delete(id);
    clearRetryFor(id);
    const list = await mailAPI.accounts.list();
    setAccounts(list);
    if (activeAccountId === id) {
      setActiveAccountId(list[0]?.id ?? null);
      setMessages([]);
      setSelected(null);
    }
    toast.success("Fiók törölve", { description: deletingAccount.label });
    setDeletingAccount(null);
  };

  // Initial load
  useEffect(() => {
    (async () => {
      const list = await mailAPI.accounts.list();
      setAccounts(list);
      if (list.length > 0) setActiveAccountId(list[0].id);
      else if (!mailAPI.isElectron) {
        // seed a demo account in browser preview
        const demo: Account = {
          id: "demo-account",
          label: "Demó fiók",
          user: "te@példa.hu",
          imapHost: "imap.example.com",
          smtpHost: "smtp.example.com",
        };
        await mailAPI.accounts.save(demo);
        setAccounts([demo]);
        setActiveAccountId(demo.id);
      }
    })();
  }, []);

  // Levelek betöltése: jelenleg csak az INBOX él, a többi mappa üres listát ad.
  const loadMessages = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    setSelected(null);
    try {
      const msgs = await mailAPI.imap.fetch({
        accountId: activeAccountId,
        mailbox: activeMailbox,
        limit: 30,
      });
      setMessages(msgs);
    } catch (e: any) {
      toast.error("Levelek betöltése sikertelen", { description: String(e?.message || e) });
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, activeMailbox]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // "Szinkronizálás" gomb: minden fiókra újrahúzzuk az INBOX-ot.
  const syncAll = useCallback(async () => {
    if (syncing || accounts.length === 0) {
      if (accounts.length === 0) toast.info("Nincs fiók a szinkronizáláshoz");
      return;
    }
    setSyncing(true);
    const t = toast.loading(`Frissítés (${accounts.length} fiók)…`);
    let okCount = 0;
    let failCount = 0;
    await Promise.all(
      accounts.map(async (a) => {
        try {
          await mailAPI.imap.fetch({ accountId: a.id, mailbox: "INBOX", limit: 30 });
          okCount++;
        } catch {
          failCount++;
        }
      }),
    );
    await loadMessages();
    setSyncing(false);
    toast.dismiss(t);
    if (failCount === 0) toast.success(`Frissítve — ${okCount} fiók`);
    else toast.warning(`${okCount} sikeres, ${failCount} hiba`);
  }, [accounts, syncing, loadMessages]);

  const quoteBody = (m: MailMessage) =>
    `<p></p><blockquote><p><em>${m.from} írta:</em></p>${m.html || `<p>${m.text}</p>`}</blockquote>`;

  const handleReply = (m: MailMessage) => {
    setComposerInitial({
      to: m.from,
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      body: quoteBody(m),
    });
    setComposerMode("reply");
    setComposerOpen(true);
  };

  // Extract email addresses from a header-style string ("Name <a@b.c>, x@y.z")
  const extractEmails = (s: string): string[] => {
    if (!s) return [];
    const out: string[] = [];
    const re = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) out.push(m[1]);
    return out;
  };

  const handleReplyAll = (m: MailMessage) => {
    const account = accounts.find((a) => a.id === activeAccountId);
    const myEmail = (account?.user || "").toLowerCase();
    const fromEmails = extractEmails(m.from);
    const toEmails = extractEmails(m.to);
    const primary = fromEmails[0] || m.from;
    // Recipients in CC: original To recipients plus any extra From addresses,
    // minus the primary reply target and the current account's own address.
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
      body: `<p></p><blockquote><p><em>Továbbított üzenet — ${m.from}:</em></p>${m.html || `<p>${m.text}</p>`}</blockquote>`,
    });
    setComposerMode("forward");
    setComposerOpen(true);
  };

  const openCompose = () => {
    setComposerInitial(undefined);
    setComposerMode("new");
    setComposerOpen(true);
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {!mailAPI.isElectron && (
        <div className="bg-gradient-primary text-primary-foreground text-xs px-4 py-1.5 flex items-center justify-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Böngésző előnézet — demó adatokkal. A natív Mac appban valódi IMAP fiókokat tudsz hozzáadni.
        </div>
      )}
      <div className="flex-1 flex min-h-0">
        <Sidebar
          accounts={accounts}
          activeAccountId={activeAccountId}
          activeMailbox={activeMailbox}
          onSelectAccount={(id) => setActiveAccountId(id)}
          onSelectMailbox={setActiveMailbox}
          onAddAccount={() => { setEditingAccount(null); setWizardOpen(true); }}
          onEditAccount={(a) => { setEditingAccount(a); setAccountDlgOpen(true); }}
          onDeleteAccount={(a) => setDeletingAccount(a)}
          onCompose={openCompose}
          onSyncAll={syncAll}
          syncing={syncing}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onOpenSignatures={() => setSignaturesOpen(true)}
          onOpenUpdater={() => setUpdaterOpen(true)}
          onOpenSettings={() => {
            const current = accounts.find((x) => x.id === activeAccountId) || null;
            setEditingAccount(current);
            setAccountDlgOpen(true);
          }}
        />

        <MessageList
          messages={messages}
          selectedSeqno={selected?.seqno ?? null}
          onSelect={setSelected}
          loading={loading}
          onRefresh={loadMessages}
          mailbox={activeMailbox}
        />

        <div className="flex-1 flex flex-col min-w-0 relative">
          <MessageView
            message={selected}
            onReply={handleReply}
            onReplyAll={handleReplyAll}
            onForward={handleForward}
          />
        </div>
      </div>

      <Composer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        accounts={accounts}
        defaultAccountId={activeAccountId}
        initial={composerInitial}
        mode={composerMode}
      />
      <AccountDialog
        open={accountDlgOpen}
        onClose={() => { setAccountDlgOpen(false); setEditingAccount(null); }}
        initial={editingAccount}
        onSaved={async () => {
          const list = await mailAPI.accounts.list();
          setAccounts(list);
        }}
      />
      <TemplatesDialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <SignaturesDialog open={signaturesOpen} onClose={() => setSignaturesOpen(false)} />
      <UpdaterDialog open={updaterOpen} onClose={() => setUpdaterOpen(false)} />

      <AlertDialog open={!!deletingAccount} onOpenChange={(o) => !o && setDeletingAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fiók törlése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan törlöd a(z) <strong>{deletingAccount?.label}</strong> fiókot?
              A bejelentkezési adatok eltűnnek a gépedről. Ez nem vonható vissza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Törlés
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
