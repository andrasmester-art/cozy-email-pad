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
import { ContactsDialog } from "@/components/mail/ContactsDialog";
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitial, setComposerInitial] = useState<{ to?: string; cc?: string; bcc?: string; subject?: string; body?: string } | undefined>();
  const [composerMode, setComposerMode] = useState<"new" | "reply" | "forward">("new");
  const [accountDlgOpen, setAccountDlgOpen] = useState(false);
  
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [signaturesOpen, setSignaturesOpen] = useState(false);
  const [updaterOpen, setUpdaterOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);

  const confirmDeleteAccount = async () => {
    if (!deletingAccount) return;
    const id = deletingAccount.id;
    await mailAPI.accounts.delete(id);
    clearRetryFor(id);
    const list = sortByOrder(await mailAPI.accounts.list());
    setAccounts(list);
    if (activeAccountId === id) {
      setActiveAccountId(list[0]?.id ?? null);
      setMessages([]);
      setSelected(null);
    }
    toast.success("Fiók törölve", { description: deletingAccount.label });
    setDeletingAccount(null);
  };

  // Account ordering — saved in localStorage so a user-defined order persists.
  const ORDER_KEY = "mailwise.accountOrder";
  const sortByOrder = (list: Account[]): Account[] => {
    try {
      const order: string[] = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]");
      if (!Array.isArray(order) || order.length === 0) return list;
      const idx = new Map(order.map((id, i) => [id, i]));
      return [...list].sort((a, b) => {
        const ia = idx.has(a.id) ? (idx.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
        const ib = idx.has(b.id) ? (idx.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
        return ia - ib;
      });
    } catch {
      return list;
    }
  };
  const saveOrder = (list: Account[]) => {
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(list.map((a) => a.id))); } catch { /* ignore */ }
  };

  const reorderAccounts = (fromId: string, toId: string) => {
    setAccounts((prev) => {
      const from = prev.findIndex((a) => a.id === fromId);
      const to = prev.findIndex((a) => a.id === toId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      saveOrder(next);
      return next;
    });
  };

  // Initial load
  useEffect(() => {
    (async () => {
      const raw = await mailAPI.accounts.list();
      const list = sortByOrder(raw);
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

  // Cache-first betöltés: azonnal kirakjuk a lokálisan tárolt leveleket,
  // majd háttérben inkrementális szinkronnal lehúzzuk az újakat.
  const loadMessages = useCallback(async () => {
    if (!activeAccountId) return;
    setSelected(null);
    setExhausted(false);
    // 1) Cache azonnal — nincs spinner, nincs várakozás.
    try {
      const cached = await mailAPI.imap.fetch({
        accountId: activeAccountId,
        mailbox: activeMailbox,
        limit: 5000,
      });
      setMessages(cached);
    } catch {
      setMessages([]);
    }
    // 2) Háttér-szinkron: csak az új UID-okat húzza le.
    setLoading(true);
    try {
      const r = await mailAPI.cache.syncMailbox({
        accountId: activeAccountId,
        mailbox: activeMailbox,
      });
      setMessages(r.messages);
      if (r.added > 0) {
        toast.success(`${r.added} új levél`);
      }
    } catch (e: any) {
      toast.error("Frissítés sikertelen", { description: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, activeMailbox]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Régebbi levelek lazy-load betöltése (görgetésre).
  const loadOlder = useCallback(async () => {
    if (!activeAccountId || loadingMore || exhausted) return;
    setLoadingMore(true);
    try {
      const r = await mailAPI.cache.loadOlder({
        accountId: activeAccountId,
        mailbox: activeMailbox,
        pageSize: 200,
      });
      setMessages(r.messages);
      if (r.exhausted) setExhausted(true);
    } catch (e: any) {
      toast.error("Régebbi levelek betöltése sikertelen", { description: String(e?.message || e) });
    } finally {
      setLoadingMore(false);
    }
  }, [activeAccountId, activeMailbox, loadingMore, exhausted]);

  // Fiókváltáskor csak az INBOX-ot szinkronizáljuk háttérben — a többi
  // mappa csak akkor töltődik, ha a felhasználó rákattint.
  useEffect(() => {
    if (!activeAccountId || !mailAPI.isElectron) return;
    let cancelled = false;
    (async () => {
      try {
        await mailAPI.cache.syncAccount(activeAccountId);
        if (cancelled) return;
        const fresh = await mailAPI.imap.fetch({
          accountId: activeAccountId,
          mailbox: activeMailbox,
          limit: 5000,
        });
        if (!cancelled) setMessages((prev) => (fresh.length >= prev.length ? fresh : prev));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId]);

  // Automatikus háttér-szinkron értesítés: ha a main process új levelet talált
  // 5 percenként, és pont azt a fiók/mappa kombót nézzük, frissítsük a listát.
  useEffect(() => {
    if (!mailAPI.isElectron) return;
    const api = (window as any).mailAPI;
    if (!api?.events?.onAutoSync) return;
    const off = api.events.onAutoSync(async (payload: { accountId: string; mailbox: string; added: number }) => {
      if (!payload?.added) return;
      const acc = accounts.find((a) => a.id === payload.accountId);
      const label = acc?.email ? ` (${acc.email})` : "";
      toast.success(`${payload.added} új levél${label}`);
      if (payload.accountId === activeAccountId && payload.mailbox === activeMailbox) {
        try {
          const fresh = await mailAPI.imap.fetch({
            accountId: payload.accountId,
            mailbox: payload.mailbox,
            limit: 5000,
          });
          setMessages(fresh);
        } catch { /* ignore */ }
      }
    });
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, [accounts, activeAccountId, activeMailbox]);

  // "Szinkronizálás" gomb: minden fiók összes mappáját inkrementálisan frissíti.
  const syncAll = useCallback(async () => {
    if (syncing || accounts.length === 0) {
      if (accounts.length === 0) toast.info("Nincs fiók a szinkronizáláshoz");
      return;
    }
    setSyncing(true);
    const t = toast.loading(`Frissítés (${accounts.length} fiók)…`);
    let totalAdded = 0;
    let failCount = 0;
    await Promise.all(
      accounts.map(async (a) => {
        try {
          const r = await mailAPI.cache.syncAccount(a.id);
          totalAdded += (r.results || []).reduce((s, x) => s + (x.added || 0), 0);
        } catch {
          failCount++;
        }
      }),
    );
    if (activeAccountId) {
      const fresh = await mailAPI.imap.fetch({
        accountId: activeAccountId,
        mailbox: activeMailbox,
        limit: 1000,
      });
      setMessages(fresh);
    }
    setSyncing(false);
    toast.dismiss(t);
    if (failCount === 0) {
      toast.success(totalAdded > 0 ? `Frissítve — ${totalAdded} új levél` : "Minden naprakész");
    } else {
      toast.warning(`${accounts.length - failCount} sikeres, ${failCount} hiba`);
    }
  }, [accounts, syncing, activeAccountId, activeMailbox]);

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
          onAddAccount={() => { setEditingAccount(null); setAccountDlgOpen(true); }}
          onEditAccount={(a) => { setEditingAccount(a); setAccountDlgOpen(true); }}
          onDeleteAccount={(a) => setDeletingAccount(a)}
          onCompose={openCompose}
          onSyncAll={syncAll}
          syncing={syncing}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onOpenSignatures={() => setSignaturesOpen(true)}
          onOpenUpdater={() => setUpdaterOpen(true)}
          onOpenContacts={() => setContactsOpen(true)}
          onReorderAccounts={reorderAccounts}
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
          onLoadMore={loadOlder}
          loadingMore={loadingMore}
          exhausted={exhausted}
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
          const list = sortByOrder(await mailAPI.accounts.list());
          setAccounts(list);
        }}
      />
      <TemplatesDialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <SignaturesDialog open={signaturesOpen} onClose={() => setSignaturesOpen(false)} />
      <UpdaterDialog open={updaterOpen} onClose={() => setUpdaterOpen(false)} />
      <ContactsDialog
        open={contactsOpen}
        onClose={() => setContactsOpen(false)}
        onCompose={(to) => {
          setComposerInitial({ to });
          setComposerMode("new");
          setComposerOpen(true);
        }}
      />

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
