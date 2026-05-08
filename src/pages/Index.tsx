import { useEffect, useState, useCallback, useRef } from "react";
import { Account, MailMessage, mailAPI } from "@/lib/mailBridge";
import { rememberAddresses } from "@/lib/addressBook";
import { buildReplyQuote, buildForwardQuote } from "@/lib/quoteBody";

import { clearRetryFor } from "@/lib/accountRetry";
import { Sidebar } from "@/components/mail/Sidebar";
import { MessageList } from "@/components/mail/MessageList";
import { MessageView } from "@/components/mail/MessageView";
import { Composer } from "@/components/mail/Composer";
import { AccountDialog } from "@/components/mail/AccountDialog";

import { TemplatesDialog } from "@/components/mail/TemplatesDialog";
import { SignaturesDialog } from "@/components/mail/SignaturesDialog";
import { UpdaterDialog } from "@/components/mail/UpdaterDialog";
import { SettingsDialog } from "@/components/mail/SettingsDialog";
import { ContactsDialog } from "@/components/mail/ContactsDialog";
import { SendStatusOverlay } from "@/components/mail/SendStatusOverlay";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PenSquare, Sparkles } from "lucide-react";
import { toast } from "sonner";

// A levéllista (középső oszlop) szélességét a felhasználó húzhatja, és
// localStorage-be mentjük, hogy újraindításkor is megmaradjon.
const LIST_WIDTH_KEY = "mw.layout.listWidth";
const LIST_WIDTH_MIN = 260;
const LIST_WIDTH_MAX = 720;
const LIST_WIDTH_DEFAULT = 340;

function readListWidth(): number {
  try {
    const raw = Number(localStorage.getItem(LIST_WIDTH_KEY));
    if (Number.isFinite(raw) && raw >= LIST_WIDTH_MIN && raw <= LIST_WIDTH_MAX) return raw;
  } catch {}
  return LIST_WIDTH_DEFAULT;
}

const Index = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activeMailbox, setActiveMailbox] = useState("INBOX");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listWidth, setListWidth] = useState<number>(readListWidth);

  // Bárhonnan is kerülnek a `messages`-be új levelek (cache, sync, loadOlder),
  // tanuljuk meg a feladók címét az autocomplete címjegyzékhez. Idempotens:
  // ugyanaz a feladó több-szöri látása csak a count/lastUsed-et frissíti.
  useEffect(() => {
    if (!messages.length) return;
    const froms = messages.map((m) => m.from).filter(Boolean) as string[];
    if (froms.length) rememberAddresses(froms);
  }, [messages]);

  // Húzás közben élőben frissítjük a szélességet, és pointerup-on mentjük le.
  // A `pointer*` eseményeket a `window`-on figyeljük, hogy a kurzor akkor is
  // követhető legyen, ha kicsúszik a fogantyú fölül.
  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = listWidth;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const next = Math.min(LIST_WIDTH_MAX, Math.max(LIST_WIDTH_MIN, startW + dx));
      setListWidth(next);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const dx = ev.clientX - startX;
      const final = Math.min(LIST_WIDTH_MAX, Math.max(LIST_WIDTH_MIN, startW + dx));
      try { localStorage.setItem(LIST_WIDTH_KEY, String(final)); } catch {}
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [listWidth]);

  // Dupla kattintás → visszaáll alapértelmezett szélességre.
  const resetListWidth = useCallback(() => {
    setListWidth(LIST_WIDTH_DEFAULT);
    try { localStorage.setItem(LIST_WIDTH_KEY, String(LIST_WIDTH_DEFAULT)); } catch {}
  }, []);
  const [exhausted, setExhausted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // Beérkezett fiókok olvasatlanjainak újraszámolása a cache-ből.
  const refreshUnreadCounts = useCallback(async (list?: Account[]) => {
    const accs = list || accounts;
    if (!accs.length) { setUnreadCounts({}); return; }
    const entries = await Promise.all(accs.map(async (a) => {
      try {
        const msgs = await mailAPI.imap.fetch({ accountId: a.id, mailbox: "INBOX", limit: 5000 });
        const n = msgs.filter((m) => m.seen === false).length;
        return [a.id, n] as const;
      } catch {
        return [a.id, 0] as const;
      }
    }));
    setUnreadCounts(Object.fromEntries(entries));
  }, [accounts]);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitial, setComposerInitial] = useState<{ to?: string; cc?: string; bcc?: string; subject?: string; body?: string } | undefined>();
  const [composerMode, setComposerMode] = useState<"new" | "reply" | "forward">("new");
  // A megnyitott szerver-piszkozat hivatkozása — a Composer „Mentés
  // piszkozatként" gombja ezt írja felül új APPEND helyett.
  const [composerReplaceDraft, setComposerReplaceDraft] = useState<{ accountId: string; mailbox: string; uid: string | number } | null>(null);
  // Az eredeti levél hivatkozása, amelyikre épp válaszolunk — sikeres küldés
  // után a Composer rárakja a \Answered IMAP-flag-et, így a listanézet
  // tudja jelölni, hogy már válaszoltunk.
  const [composerMarkAnswered, setComposerMarkAnswered] = useState<{ accountId: string; mailbox: string; uid: string | number } | null>(null);
  const [accountDlgOpen, setAccountDlgOpen] = useState(false);
  
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [signaturesOpen, setSignaturesOpen] = useState(false);
  const [updaterOpen, setUpdaterOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
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

  // Cache-first betöltés: csak a lokális cache-t olvassuk be, NEM indítunk
  // szerver-szinkront. Ha üres a cache (pl. első indulás), rövid polling
  // figyeli, mikor tölti meg a háttérben futó startup-prefetch / bgSync —
  // így a UI magától megjelenik, nem kell kattintani.
  const loadMessages = useCallback(async () => {
    if (!activeAccountId) return;
    const accountId = activeAccountId;
    const mailbox = activeMailbox;
    const tag = `[loadMessages] ${accountId}/${mailbox}`;
    const t0 = performance.now();
    console.log(`${tag} start (cache-only)`);
    setSelected(null);
    setExhausted(false);
    try {
      const cached = await mailAPI.imap.fetch({ accountId, mailbox, limit: 5000 });
      console.log(`${tag} cache returned ${cached.length} msgs in ${(performance.now() - t0).toFixed(0)}ms`);
      setMessages(cached);
      if (cached.length === 0) {
        console.warn(`${tag} ⚠ cache EMPTY — polling for background sync`);
        // Polling: 1.5 mp-enként, max 20× (~30 mp). Ha közben fiókot/mappát
        // vált a felhasználó, leállunk (a guard ellenőrzi).
        let attempts = 0;
        const interval = window.setInterval(async () => {
          attempts++;
          if (accountId !== activeAccountIdRef.current || mailbox !== activeMailboxRef.current) {
            window.clearInterval(interval);
            return;
          }
          try {
            const fresh = await mailAPI.imap.fetch({ accountId, mailbox, limit: 5000 });
            if (fresh.length > 0) {
              console.log(`${tag} poll attempt ${attempts}: cache filled with ${fresh.length} msgs`);
              setMessages(fresh);
              window.clearInterval(interval);
            } else if (attempts >= 20) {
              window.clearInterval(interval);
            }
          } catch { /* ignore */ }
        }, 1500);
      }
    } catch (err) {
      console.error(`${tag} cache READ FAILED`, err);
      setMessages([]);
    }
  }, [activeAccountId, activeMailbox]);

  // A polling-hoz friss aktív kombó kell minden iterációban, ezért ref-ben tartjuk.
  const activeAccountIdRef = useRef(activeAccountId);
  const activeMailboxRef = useRef(activeMailbox);
  useEffect(() => { activeAccountIdRef.current = activeAccountId; }, [activeAccountId]);
  useEffect(() => { activeMailboxRef.current = activeMailbox; }, [activeMailbox]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Felhasználó által kezdeményezett frissítés (Frissítés gomb): tényleges
  // szerver-szinkron. Ezt szándékosan külön választjuk a loadMessages-től,
  // hogy a fiók/mappa váltás ne indítson dupla IMAP sessiont.
  const refreshMailbox = useCallback(async () => {
    if (!activeAccountId) return;
    const tag = `[refreshMailbox] ${activeAccountId}/${activeMailbox}`;
    const t0 = performance.now();
    setLoading(true);
    try {
      const r = await mailAPI.cache.syncMailbox({
        accountId: activeAccountId,
        mailbox: activeMailbox,
      });
      console.log(`${tag} sync added=${r.added} msgs=${r.messages.length} in ${(performance.now() - t0).toFixed(0)}ms`);
      setMessages(r.messages);
      if (r.added > 0) toast.success(`${r.added} új levél`);
      if (r.warnings && r.warnings.length > 0) {
        toast.warning("Frissítés részleges hibákkal", {
          description: r.warnings.join("\n• ").replace(/^/, "• "),
          duration: 12000,
        });
      }
    } catch (e: any) {
      console.error(`${tag} sync FAILED`, e);
      toast.error("Frissítés sikertelen", {
        description: String(e?.message || e),
        duration: 12000,
      });
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, activeMailbox]);

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
      if (r.warnings && r.warnings.length > 0) {
        toast.warning("Régebbi levelek részleges hibákkal", {
          description: r.warnings.join("\n• ").replace(/^/, "• "),
          duration: 12000,
        });
      }
    } catch (e: any) {
      toast.error("Régebbi levelek betöltése sikertelen", {
        description: String(e?.message || e),
        duration: 12000,
      });
    } finally {
      setLoadingMore(false);
    }
  }, [activeAccountId, activeMailbox, loadingMore, exhausted]);

  // Fiók/mappa váltáskor háttér-szinkron — DE csak ha a cache régebbi, mint
  // FRESH_TTL. Friss cache esetén nem indítunk IMAP kapcsolatot, így a váltás
  // azonnali. A Drafts háttérszinkront teljesen elhagyjuk innen — az auto-sync
  // (5 percenként) és a manuális Frissítés gomb úgyis elintézi.
  const FRESH_TTL_MS = 60 * 1000;
  const lastSyncRef = (Index as any)._lastSyncRef || ((Index as any)._lastSyncRef = new Map<string, number>());
  useEffect(() => {
    if (!activeAccountId || !mailAPI.isElectron) return;
    let cancelled = false;
    const key = `${activeAccountId}::${activeMailbox}`;
    const last = lastSyncRef.get(key) || 0;
    if (Date.now() - last < FRESH_TTL_MS) {
      console.log(`[bgSync] skip ${key} — cache fresh (age=${Date.now() - last}ms)`);
      return;
    }
    const tag = `[bgSync] ${activeAccountId}/${activeMailbox}`;
    (async () => {
      const t0 = performance.now();
      setLoading(true);
      try {
        const r = await mailAPI.cache.syncMailbox({
          accountId: activeAccountId,
          mailbox: activeMailbox,
        });
        console.log(`${tag} active sync added=${r.added} msgs=${r.messages.length} in ${(performance.now() - t0).toFixed(0)}ms`);
        if (cancelled) return;
        lastSyncRef.set(key, Date.now());
        setMessages(r.messages);
        if (r.added > 0) toast.success(`${r.added} új levél`);
        if (r.warnings && r.warnings.length > 0) {
          toast.warning("Frissítés részleges hibákkal", {
            description: r.warnings.join("\n• ").replace(/^/, "• "),
            duration: 12000,
          });
        }
      } catch (e: any) {
        if (!cancelled) console.error(`${tag} active sync FAILED`, e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, activeMailbox]);

  // Automatikus háttér-szinkron értesítés: ha a main process új levelet talált
  // 5 percenként, és pont azt a fiók/mappa kombót nézzük, frissítsük a listát.
  useEffect(() => {
    if (!mailAPI.isElectron) return;
    const api = (window as any).mailAPI;
    if (!api?.events?.onAutoSync) return;
    let active = true;
    const off = api.events.onAutoSync(async (payload: { accountId: string; mailbox: string; added: number }) => {
      if (!active || !payload) return;
      if (payload.added > 0) {
        const acc = accounts.find((a) => a.id === payload.accountId);
        const accLabel = acc?.label || acc?.from || acc?.user;
        const label = accLabel ? ` (${accLabel})` : "";
        toast.success(`${payload.added} új levél${label}`);
      }
      if (payload.accountId === activeAccountId && payload.mailbox === activeMailbox) {
        try {
          const fresh = await mailAPI.imap.fetch({
            accountId: payload.accountId,
            mailbox: payload.mailbox,
            limit: 5000,
          });
          if (active) setMessages(fresh);
        } catch { /* ignore */ }
      }
      refreshUnreadCounts();
    });
    return () => {
      active = false;
      try { off?.(); } catch { /* ignore */ }
    };
  }, [accounts, activeAccountId, activeMailbox, refreshUnreadCounts]);

  // Olvasatlan-számláló frissítés: fiókváltáskor / fiók-listaváltáskor / aktív INBOX
  // üzenetváltozáskor (csillag/olvasott toggle, törlés) újraszámolunk.
  useEffect(() => {
    refreshUnreadCounts();
  }, [accounts, refreshUnreadCounts]);

  useEffect(() => {
    if (activeMailbox === "INBOX" && activeAccountId) {
      const n = messages.filter((m) => m.seen === false).length;
      setUnreadCounts((prev) => (prev[activeAccountId] === n ? prev : { ...prev, [activeAccountId]: n }));
    }
  }, [messages, activeAccountId, activeMailbox]);

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
    refreshUnreadCounts();
    toast.dismiss(t);
    if (failCount === 0) {
      toast.success(totalAdded > 0 ? `Frissítve — ${totalAdded} új levél` : "Minden naprakész");
    } else {
      toast.warning(`${accounts.length - failCount} sikeres, ${failCount} hiba`);
    }
  }, [accounts, syncing, activeAccountId, activeMailbox, refreshUnreadCounts]);

  // Az idézett előzményt a `quoteBody.ts` állítja össze: a forrás HTML-t
  // sortörés-megőrző `<p>` listává alakítja, hogy a Tiptap szerkesztő ne
  // lapítsa egy soros, dőlt blokkba.


  // Optimista flag-frissítés: azonnal módosítjuk a lokális state-et, és a
  // szerverhívás sikere után NEM írjuk felül a teljes listát az r.messages-szel.
  // A teljes tömb visszaírása felesleges re-rendert okozott (látható UI-laggot
  // a csillag/olvasott togglenál), miközben az optimista update már a helyes
  // állapotot tükrözi. Hibánál visszaolvassuk a cache-t a konzisztens állapotért.
  const applyFlagPatch = useCallback(async (m: MailMessage, patch: { flagged?: boolean; seen?: boolean }) => {
    if (!activeAccountId || !m.uid) return;
    setMessages((arr) => arr.map((x) => (x.uid === m.uid ? { ...x, ...patch } : x)));
    setSelected((s) => (s && s.uid === m.uid ? { ...s, ...patch } : s));
    try {
      await mailAPI.mail.setFlag({
        accountId: activeAccountId,
        mailbox: activeMailbox,
        uid: m.uid,
        patch,
      });
    } catch (e: any) {
      try {
        const cached = await mailAPI.imap.fetch({
          accountId: activeAccountId,
          mailbox: activeMailbox,
          limit: 5000,
        });
        setMessages(cached);
      } catch { /* ignore */ }
      toast.error("Megjelölés sikertelen", { description: String(e?.message || e) });
    }
  }, [activeAccountId, activeMailbox]);

  const toggleFlag = useCallback((m: MailMessage) => {
    applyFlagPatch(m, { flagged: !m.flagged });
  }, [applyFlagPatch]);

  const toggleSeen = useCallback((m: MailMessage) => {
    applyFlagPatch(m, { seen: m.seen === false ? true : false });
  }, [applyFlagPatch]);

  // Levél törlése: optimista lokális eltávolítás + IMAP MOVE Trash-be
  // (vagy EXPUNGE, ha már a Trash-ben vagyunk). Hiba esetén visszagörgetjük.
  const deleteMessage = useCallback(async (m: MailMessage) => {
    if (!activeAccountId || !m.uid) {
      toast.error("Ezt az üzenetet nem lehet törölni (hiányzó UID).");
      return;
    }
    const prevMessages = messages;
    const prevSelected = selected;
    setMessages((arr) => arr.filter((x) => x.uid !== m.uid));
    setSelected((s) => (s && s.uid === m.uid ? null : s));
    try {
      const r = await mailAPI.mail.delete({
        accountId: activeAccountId,
        mailbox: activeMailbox,
        uid: m.uid,
      });
      if (r?.messages) setMessages(r.messages);
      toast.success(r?.mode === "expunge" ? "Levél véglegesen törölve" : "Levél a Kukába helyezve");
    } catch (e: any) {
      setMessages(prevMessages);
      setSelected(prevSelected);
      toast.error("Törlés sikertelen", { description: String(e?.message || e) });
    }
  }, [activeAccountId, activeMailbox, messages, selected]);

  // Az aktív mappa minden olvasatlan levelét jelöljük olvasottnak (kötegelve).
  // Optimista lokális update + szerverhívás üzenetenként; hiba esetén az
  // adott levél visszaáll. A Sidebar Mappa context menüből hívható.
  const markAllReadInActiveMailbox = useCallback(async () => {
    if (!activeAccountId) return;
    const unread = messages.filter((m) => m.seen === false && m.uid != null);
    if (unread.length === 0) {
      toast.info("Nincs olvasatlan levél ebben a mappában");
      return;
    }
    setMessages((arr) => arr.map((x) => (x.seen === false ? { ...x, seen: true } : x)));
    let failed = 0;
    await Promise.all(unread.map(async (m) => {
      try {
        await mailAPI.mail.setFlag({
          accountId: activeAccountId,
          mailbox: activeMailbox,
          uid: m.uid as string | number,
          patch: { seen: true },
        });
      } catch { failed++; }
    }));
    if (failed === 0) {
      toast.success(`${unread.length} levél olvasottnak jelölve`);
    } else {
      toast.warning(`${unread.length - failed} sikeres, ${failed} hiba`);
    }
  }, [activeAccountId, activeMailbox, messages]);

  // Egyetlen fiók (INBOX + Drafts) szinkronizálása a context menüből.
  const syncSingleAccount = useCallback(async (accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    const label = acc?.label || acc?.user || "fiók";
    const t = toast.loading(`Szinkronizálás (${label})…`);
    try {
      const r = await mailAPI.cache.syncAccount(accountId);
      const added = (r.results || []).reduce((s, x) => s + (x.added || 0), 0);
      toast.dismiss(t);
      toast.success(added > 0 ? `${label}: ${added} új levél` : `${label}: naprakész`);
      if (accountId === activeAccountId) {
        const fresh = await mailAPI.imap.fetch({
          accountId, mailbox: activeMailbox, limit: 5000,
        });
        setMessages(fresh);
      }
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(`${label} szinkron sikertelen`, { description: String(e?.message || e) });
    }
  }, [accounts, activeAccountId, activeMailbox]);

  // Új levél írása konkrét fiókkal (Sidebar fiók context menü).
  const composeFromAccount = useCallback((accountId: string) => {
    setActiveAccountId(accountId);
    setComposerInitial(undefined);
    setComposerMode("new");
    setComposerReplaceDraft(null);
    setComposerMarkAnswered(null);

  // Kiválasztáskor: 1) automatikus \\Seen, 2) ha nincs még betöltve a body,
  // VAGY régi cache miatt nincs csatolmány-meta egy csatolmányos levélnél,
  // lazy lekérjük a teljes szöveget/HTML-t.
  useEffect(() => {
    if (!selected || !selected.uid || !activeAccountId) return;
    if (selected.seen === false) {
      applyFlagPatch(selected, { seen: true });
    }
    const needsAttachmentHydration = !!selected.hasAttachments
      && (!Array.isArray(selected.attachments) || selected.attachments.length === 0);
    if (selected.bodyLoaded === false || needsAttachmentHydration) {
      let cancelled = false;
      mailAPI.mail
        .fetchBody({ accountId: activeAccountId, mailbox: activeMailbox, uid: selected.uid })
        .then((r) => {
          if (cancelled || !r?.ok || !r.message) return;
          const fresh = r.message;
          setSelected((s) => (s && s.uid === fresh.uid ? { ...s, ...fresh } : s));
          setMessages((list) =>
            list.map((m) => (m.uid === fresh.uid ? { ...m, ...fresh } : m)),
          );
        })
        .catch(() => { /* csendes hiba — a UI így is működik üres body-val */ });
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.uid]);

  const handleReply = (m: MailMessage) => {
    setComposerInitial({
      to: m.from,
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      body: buildReplyQuote(m),
    });
    setComposerMode("reply");
    setComposerReplaceDraft(null);
    setComposerMarkAnswered(
      activeAccountId && m.uid != null
        ? { accountId: activeAccountId, mailbox: activeMailbox, uid: m.uid }
        : null,
    );
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
      body: buildReplyQuote(m),
      cc: others.length ? others.join(", ") : undefined,
    });
    setComposerMode("reply");
    setComposerReplaceDraft(null);
    setComposerMarkAnswered(
      activeAccountId && m.uid != null
        ? { accountId: activeAccountId, mailbox: activeMailbox, uid: m.uid }
        : null,
    );
    setComposerOpen(true);
  };

  const handleForward = (m: MailMessage) => {
    setComposerInitial({
      subject: m.subject.startsWith("Fwd:") ? m.subject : `Fwd: ${m.subject}`,
      body: buildForwardQuote(m),
    });
    setComposerMode("forward");
    setComposerReplaceDraft(null);
    setComposerMarkAnswered(null);
    setComposerOpen(true);
  };

  // Piszkozat megnyitása szerkesztésre: az eredeti tartalmat új levélként
  // töltjük be a Composerbe. Az eredeti szerver-piszkozat UID-ját átadjuk
  // a Composer-nek, hogy a „Mentés piszkozatként" felülírja, ne új
  // példányt hozzon létre.
  const handleEditDraft = (m: MailMessage) => {
    setComposerInitial({
      to: m.to || "",
      subject: m.subject || "",
      body: m.html || (m.text ? `<p>${m.text}</p>` : ""),
    });
    setComposerMode("new");
    if (activeAccountId && m.uid != null) {
      setComposerReplaceDraft({ accountId: activeAccountId, mailbox: activeMailbox, uid: m.uid });
    } else {
      setComposerReplaceDraft(null);
    }
    setComposerOpen(true);
  };

  const openCompose = () => {
    setComposerInitial(undefined);
    setComposerMode("new");
    setComposerReplaceDraft(null);
    setComposerOpen(true);
  };


  // Dupla kattintás: levél megnyitása új natív ablakban (Electron). Böngészőben
  // fallback: csak kijelöli a levelet (ott úgyis csak előnézet van).
  const openInNewWindow = (m: MailMessage) => {
    if (!activeAccountId) return;
    const api = (window as any).mailAPI;
    if (mailAPI.isElectron && api?.window?.openMessage) {
      api.window.openMessage({
        accountId: activeAccountId,
        mailbox: activeMailbox,
        seqno: m.seqno,
        uid: m.uid ?? null,
      });
    } else {
      setSelected(m);
    }
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
          unreadCounts={unreadCounts}
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
          onOpenAppSettings={() => setAppSettingsOpen(true)}
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
          onOpen={openInNewWindow}
          onToggleFlag={toggleFlag}
          onToggleSeen={toggleSeen}
          onReply={handleReply}
          onReplyAll={handleReplyAll}
          onForward={handleForward}
          onDelete={deleteMessage}
          loading={loading}
          onRefresh={refreshMailbox}
          mailbox={activeMailbox}
          onLoadMore={loadOlder}
          loadingMore={loadingMore}
          exhausted={exhausted}
          width={listWidth}
        />

        {/* Húzható válaszfal a levéllista és az üzenet-nézet között.
            - Húzás: bal/jobb mozgatással átméretezi a listát (260–720 px).
            - Dupla kattintás: visszaáll a 340 px alapértékre. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Levéllista szélességének átméretezése"
          title="Húzd a szélesség beállításához (dupla kattintás: alapérték)"
          onPointerDown={startResize}
          onDoubleClick={resetListWidth}
          className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors"
        />

        <div className="flex-1 flex flex-col min-w-0 relative">
          <MessageView
            message={selected}
            onReply={handleReply}
            onReplyAll={handleReplyAll}
            onForward={handleForward}
            onToggleFlag={toggleFlag}
            onToggleSeen={toggleSeen}
            onDelete={deleteMessage}
            onOpenInNewWindow={openInNewWindow}
            onEditDraft={activeMailbox.toLowerCase().includes("draft") ? handleEditDraft : undefined}
          />
        </div>


      </div>

      <Composer
        open={composerOpen}
        onClose={() => { setComposerOpen(false); setComposerReplaceDraft(null); }}
        accounts={accounts}
        defaultAccountId={activeAccountId}
        initial={composerInitial}
        mode={composerMode}
        replaceDraft={composerReplaceDraft}
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
      <SettingsDialog
        open={appSettingsOpen}
        onOpenChange={setAppSettingsOpen}
        onOpenUpdater={() => setUpdaterOpen(true)}
      />
      <ContactsDialog
        open={contactsOpen}
        onClose={() => setContactsOpen(false)}
        onCompose={(to) => {
          setComposerInitial({ to });
          setComposerMode("new");
          setComposerReplaceDraft(null);
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

      {/* Lebegő küldési-állapot panel a jobb alsó sarokban — csak akkor látszik,
          ha van aktív vagy nemrég lezárult küldési job. */}
      <SendStatusOverlay />
    </div>
  );
};

export default Index;
