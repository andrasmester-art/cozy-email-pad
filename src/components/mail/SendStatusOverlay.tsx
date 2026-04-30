// Lebegő küldési-állapot panel a jobb alsó sarokban.
//
// Csak akkor látszik, ha van legalább egy aktív vagy nemrég lezárult
// küldési job. Egy ikon (badge-dzsel a darabszámról) klikkre kibont egy
// listát, ahol minden job:
//   - státusz-szín és ikon (folyamatban / siker / átmeneti / végleges)
//   - címzett + tárgy
//   - aktív küldés alatt: spinner, opcionálisan „Mégsem" (késleltetés alatt)
//   - hiba esetén: „Újraküldés" gomb + „Részletek" gomb
//   - hiba esetén lent: hibaüzenet kibontva (ha kérte)
//
// A komponens app-szinten van mountolva (Index.tsx, MessagePage.tsx),
// így minden küldés látszik függetlenül attól, hogy a Composer közben
// be lett-e zárva.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, AlertTriangle, XCircle, Loader2, Send, X, RotateCcw,
  ChevronUp, ChevronDown, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useSendJobs, retrySend, dismissJob, clearFinishedJobs, type SendJob,
} from "@/lib/sendQueue";
import { cn } from "@/lib/utils";

function statusMeta(job: SendJob): {
  label: string;
  // Tailwind utility osztályok a fő színekhez (semantic tokenek mellett HSL-en
  // alapuló elérhetők — itt vegyes a használat: a státusz-jelzéshez
  // szándékosan amber/red/green, mert a `--primary`/`--destructive` semantic
  // tokenek nem fednek le „warning" árnyalatot).
  iconClass: string;
  Icon: typeof Send;
} {
  if (job.status === "sending") {
    if (job.countdown && job.countdown.remaining > 0) {
      return { label: `Küldés ${job.countdown.remaining} mp múlva…`, iconClass: "text-muted-foreground", Icon: Send };
    }
    return { label: "Küldés folyamatban…", iconClass: "text-primary", Icon: Loader2 };
  }
  if (job.status === "success") {
    return { label: "Elküldve", iconClass: "text-green-600 dark:text-green-500", Icon: CheckCircle2 };
  }
  if (job.status === "transient_error") {
    return { label: "Átmeneti hiba — érdemes újraküldeni", iconClass: "text-amber-600 dark:text-amber-500", Icon: AlertTriangle };
  }
  return { label: "Végleges hiba", iconClass: "text-destructive", Icon: XCircle };
}

function formatRelative(ts: number, _tick: number): string {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 5_000) return "épp most";
  if (diff < 60_000) return `${Math.floor(diff / 1000)} mp-e`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} perce`;
  return new Date(ts).toLocaleTimeString();
}

function JobRow({ job, tick }: { job: SendJob; tick: number }) {
  const [showDetails, setShowDetails] = useState(false);
  const meta = statusMeta(job);
  const Icon = meta.Icon;
  const animate = job.status === "sending" && (!job.countdown || job.countdown.remaining <= 0);
  const recipient = job.payload.to || "(nincs címzett)";
  const subject = job.payload.subject || "(nincs tárgy)";
  const isError = job.status === "transient_error" || job.status === "permanent_error";
  const isCountdown = job.status === "sending" && !!job.countdown && job.countdown.remaining > 0;

  return (
    <li className="border-b border-border last:border-b-0 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", meta.iconClass, animate && "animate-spin")} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate" title={subject}>{subject}</div>
          <div className="text-xs text-muted-foreground truncate" title={recipient}>{recipient}</div>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
            <span className={cn("font-medium", meta.iconClass)}>{meta.label}</span>
            {!isCountdown && job.finishedAt && (
              <>
                <span>·</span>
                <span>{formatRelative(job.finishedAt, tick)}</span>
              </>
            )}
            {isCountdown && (
              <>
                <span>·</span>
                <span>{job.countdown!.remaining}/{job.countdown!.total}s</span>
              </>
            )}
            {job.attempts > 1 && (
              <>
                <span>·</span>
                <span>{job.attempts} próba</span>
              </>
            )}
          </div>

          {isError && showDetails && job.errorMessage && (
            <div className="mt-2 text-[11px] text-foreground bg-muted rounded px-2 py-1.5 break-words whitespace-pre-wrap font-mono">
              {job.errorMessage}
            </div>
          )}
          {isError && job.draftSavedToServer && (
            <div className="mt-1 text-[11px] text-muted-foreground italic">
              ✓ Piszkozat mentve a szerver Drafts mappájába.
            </div>
          )}

          <div className="flex items-center gap-1 mt-2">
            {isCountdown && job.cancel && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                onClick={() => job.cancel?.()}
              >
                Mégsem
              </Button>
            )}
            {isError && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] gap-1"
                  onClick={() => retrySend(job.id)}
                >
                  <RotateCcw className="h-3 w-3" />
                  Újraküldés
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={showDetails}
                >
                  {showDetails ? "Részletek elrejtése" : "Részletek"}
                </Button>
              </>
            )}
            {(job.status !== "sending" || isCountdown === false) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px] ml-auto"
                onClick={() => dismissJob(job.id)}
                aria-label="Bejegyzés eltávolítása"
                title="Bejegyzés eltávolítása"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function SendStatusOverlay() {
  const jobs = useSendJobs();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const prevCountsRef = useRef({ sending: 0, error: 0 });

  // 1 mp-enkénti tick a relatív idők és countdown-frissítés miatt.
  useEffect(() => {
    if (!jobs.length) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [jobs.length]);

  const counts = useMemo(() => {
    let sending = 0, success = 0, transient = 0, permanent = 0;
    for (const j of jobs) {
      if (j.status === "sending") sending++;
      else if (j.status === "success") success++;
      else if (j.status === "transient_error") transient++;
      else if (j.status === "permanent_error") permanent++;
    }
    return { sending, success, transient, permanent, error: transient + permanent, total: jobs.length };
  }, [jobs]);

  // Ha új hiba jön be és a panel zárva van, automatikusan kinyitjuk
  // (hogy ne tűnjön el a hiba a felhasználó figyelméből).
  useEffect(() => {
    const prev = prevCountsRef.current;
    if (counts.error > prev.error && !open) setOpen(true);
    prevCountsRef.current = { sending: counts.sending, error: counts.error };
  }, [counts.error, counts.sending, open]);

  if (!jobs.length) return null;

  // Trigger gomb színe: hiba domináns → destructive/amber, különben primary.
  const triggerColor = counts.permanent > 0
    ? "text-destructive"
    : counts.transient > 0
      ? "text-amber-600 dark:text-amber-500"
      : counts.sending > 0
        ? "text-primary"
        : "text-green-600 dark:text-green-500";

  const TriggerIcon = counts.sending > 0
    ? Loader2
    : counts.permanent > 0
      ? XCircle
      : counts.transient > 0
        ? AlertTriangle
        : CheckCircle2;
  const triggerSpins = counts.sending > 0 && jobs.some((j) => j.status === "sending" && (!j.countdown || j.countdown.remaining <= 0));

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 pointer-events-none">
      {open && (
        <div className="pointer-events-auto w-80 max-w-[calc(100vw-2rem)] bg-popover text-popover-foreground border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5" />
              Küldések
              <span className="text-muted-foreground font-normal">({jobs.length})</span>
            </div>
            <div className="flex items-center gap-0.5">
              {(counts.success + counts.error) > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px] gap-1"
                  onClick={clearFinishedJobs}
                  title="Befejezett küldések törlése a listából"
                >
                  <Trash2 className="h-3 w-3" />
                  Tisztítás
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => setOpen(false)}
                aria-label="Panel becsukása"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {jobs.map((job) => <JobRow key={job.id} job={job} tick={tick} />)}
          </ul>
        </div>
      )}

      <button
        type="button"
        className={cn(
          "pointer-events-auto h-10 w-10 rounded-full bg-popover border border-border shadow-lg",
          "flex items-center justify-center hover:bg-accent transition-colors relative",
          triggerColor,
        )}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Küldések panel becsukása" : "Küldések panel megnyitása"}
        title={`${counts.sending > 0 ? `${counts.sending} folyamatban · ` : ""}${counts.error > 0 ? `${counts.error} hiba · ` : ""}${counts.success > 0 ? `${counts.success} kész` : ""}`.replace(/^· /, "").replace(/ · $/, "") || "Küldések"}
      >
        <TriggerIcon className={cn("h-5 w-5", triggerSpins && "animate-spin")} />
        {(counts.error > 0 || counts.sending > 0) && (
          <span className={cn(
            "absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold",
            "flex items-center justify-center px-1 border border-background",
            counts.permanent > 0 ? "bg-destructive text-destructive-foreground"
              : counts.transient > 0 ? "bg-amber-500 text-white"
              : "bg-primary text-primary-foreground",
          )}>
            {counts.error || counts.sending}
          </span>
        )}
        {open ? null : <ChevronUp className="absolute h-3 w-3 top-0.5 right-0.5 opacity-0" aria-hidden />}
      </button>
    </div>
  );
}
