import { useEffect, useState, useCallback } from "react";
import { Account, MailMessage, mailAPI } from "@/lib/mailBridge";

import {
  startRetryScheduler, setKnownAccounts, markSuccess, markFailure, clearRetryFor,
} from "@/lib/accountRetry";
import { Sidebar } from "@/components/mail/Sidebar";
import { MessageList } from "@/components/mail/MessageList";
import { MessageView } from "@/components/mail/MessageView";
import { Composer } from "@/components/mail/Composer";
import { AccountDialog } from "@/components/mail/AccountDialog";
import { TemplatesDialog } from "@/components/mail/TemplatesDialog";
import { SignaturesDialog } from "@/components/mail/SignaturesDialog";
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
  const [composerInitial, setComposerInitial] = useState<{ to?: string; subject?: string; body?: string } | undefined>();
  const [accountDlgOpen, setAccountDlgOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [signaturesOpen, setSignaturesOpen] = useState(false);
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

  // Auto-retry: keep the scheduler in sync with the current account list.
  useEffect(() => {
    setKnownAccounts(accounts);
    startRetryScheduler();
  }, [accounts]);
  const loadMessages = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    setSelected(null);
    try {
      const msgs = await mailAPI.imap.fetch({ accountId: activeAccountId, mailbox: activeMailbox, limit: 50 });
      setMessages(msgs);
      markSuccess(activeAccountId);
    } catch (e: any) {
      const msg = String(e?.message || e);
      markFailure(activeAccountId, msg);
      toast.error("Levelek betöltése sikertelen", { description: msg });
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, activeMailbox]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Manual sync across ALL accounts: fetches INBOX + Sent for each so the
  // status indicator + the visible mailbox both refresh in one go.
  const syncAll = useCallback(async () => {
    if (syncing) return;
    if (accounts.length === 0) {
      toast.info("Nincs fiók a szinkronizáláshoz");
      return;
    }
    setSyncing(true);
    const t = toast.loading(`Szinkronizálás (${accounts.length} fiók)…`);
    let okCount = 0;
    let failCount = 0;
    await Promise.all(
      accounts.map(async (a) => {
        try {
          // Pull both inbox and sent so "ki és be" egyaránt frissül
          await mailAPI.imap.fetch({ accountId: a.id, mailbox: "INBOX", limit: 50 });
          try {
            await mailAPI.imap.fetch({ accountId: a.id, mailbox: "Sent", limit: 50 });
          } catch { /* Sent folder may not exist on every server */ }
          markSuccess(a.id);
          okCount++;
        } catch (e: any) {
          markFailure(a.id, String(e?.message || e));
          failCount++;
        }
      }),
    );
    // Refresh the currently visible mailbox so new messages show up
    await loadMessages();
    setSyncing(false);
    toast.dismiss(t);
    if (failCount === 0) {
      toast.success(`Szinkronizálva — ${okCount} fiók`);
    } else {
      toast.warning(`Szinkronizálás kész — ${okCount} sikeres, ${failCount} hiba`);
    }
  }, [accounts, syncing, loadMessages]);

  const handleReply = (m: MailMessage) => {
    setComposerInitial({
      to: m.from,
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      body: `<p></p><blockquote><p><em>${m.from} írta:</em></p>${m.html || `<p>${m.text}</p>`}</blockquote>`,
    });
    setComposerOpen(true);
  };

  const openCompose = () => {
    setComposerInitial(undefined);
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
          onAddAccount={() => { setEditingAccount(null); setAccountDlgOpen(true); }}
          onEditAccount={(a) => { setEditingAccount(a); setAccountDlgOpen(true); }}
          onDeleteAccount={(a) => setDeletingAccount(a)}
          onCompose={openCompose}
          onSyncAll={syncAll}
          syncing={syncing}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onOpenSignatures={() => setSignaturesOpen(true)}
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
          <MessageView message={selected} onReply={handleReply} />
        </div>
      </div>

      <Composer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        accounts={accounts}
        defaultAccountId={activeAccountId}
        initial={composerInitial}
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
