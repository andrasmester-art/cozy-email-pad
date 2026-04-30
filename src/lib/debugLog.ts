// In-memory körkörös puffer a renderer console-eseményekhez. A célunk, hogy a
// felhasználó hibakereséskor egy gombnyomással le tudja menteni a legutóbbi
// levélbetöltési és cache eseményeket (cache.read, syncMailbox, loadOlder, …).
//
// Csak a saját, releváns logjainkat tartjuk meg (prefix-szűrés), hogy a fájl
// használható méretű maradjon és ne legyen tele harmadik féltől származó zajjal.

export type DebugEntry = {
  ts: number;          // Date.now()
  level: "log" | "warn" | "error" | "info" | "debug";
  message: string;     // a teljes formázott üzenet
};

const MAX_ENTRIES = 2000;

// Csak ezeket a prefixeket gyűjtjük (a többi konzolzaj nem érdekes).
// `[loadMessages] …`, `[cache.read] …`, `[cache.write] …`, `[syncMailbox] …`,
// `[ipc cache:…] …`, `[smtp] …`, `[loadOlder] …` stb.
const RELEVANT_PREFIXES = [
  "[loadMessages]",
  "[loadOlder]",
  "[cache.read]",
  "[cache.write]",
  "[syncMailbox]",
  "[ipc cache:",
  "[ipc imap:",
  "[smtp]",
  "[mail.fetchBody]",
  "[autoSync]",
];

const buffer: DebugEntry[] = [];
let installed = false;

function isRelevant(message: string): boolean {
  if (!message) return false;
  for (const p of RELEVANT_PREFIXES) {
    if (message.startsWith(p) || message.includes(` ${p}`)) return true;
  }
  return false;
}

function formatArg(arg: unknown): string {
  if (arg == null) return String(arg);
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ""}`;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function record(level: DebugEntry["level"], args: unknown[]) {
  const message = args.map(formatArg).join(" ");
  if (!isRelevant(message)) return;
  buffer.push({ ts: Date.now(), level, message });
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
}

/**
 * Telepíti a console-figyelőt. Idempotens — többszöri hívás esetén csak
 * egyszer fűz be hookot. Az eredeti console-metódusok továbbra is futnak.
 */
export function installDebugLog() {
  if (installed) return;
  installed = true;
  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  };
  console.log = (...args: unknown[]) => { record("log", args); orig.log(...args); };
  console.warn = (...args: unknown[]) => { record("warn", args); orig.warn(...args); };
  console.error = (...args: unknown[]) => { record("error", args); orig.error(...args); };
  console.info = (...args: unknown[]) => { record("info", args); orig.info(...args); };
  console.debug = (...args: unknown[]) => { record("debug", args); orig.debug(...args); };
}

export function getRendererEntries(): DebugEntry[] {
  return buffer.slice();
}

function pad(n: number, w = 2) { return String(n).padStart(w, "0"); }
function fmtTs(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function entriesToText(entries: DebugEntry[], source: "renderer" | "main"): string {
  if (!entries.length) return `# (no ${source} entries)\n`;
  return entries
    .map((e) => `${fmtTs(e.ts)} [${source}/${e.level.toUpperCase()}] ${e.message}`)
    .join("\n");
}

/**
 * Összegyűjti a renderer + (Electron alatt) a main process logjait, és
 * letölti egyetlen .log fájlként. Böngészőben csak a renderer logokat menti.
 */
export async function exportDebugLog(): Promise<{ filename: string; bytes: number }> {
  const rendererEntries = getRendererEntries();
  let mainEntries: DebugEntry[] = [];
  try {
    const api = (window as any).mailAPI;
    if (api?.debug?.getLog) {
      const r = await api.debug.getLog();
      if (Array.isArray(r?.entries)) mainEntries = r.entries;
    }
  } catch (err) {
    console.warn("[debugLog] main process log fetch failed", err);
  }

  const header = [
    `# Cozy Email Pad — debug log`,
    `# exported: ${new Date().toISOString()}`,
    `# userAgent: ${navigator.userAgent}`,
    `# renderer entries: ${rendererEntries.length}`,
    `# main entries: ${mainEntries.length}`,
    `# (only mail/cache/sync events are captured — see src/lib/debugLog.ts)`,
    "",
  ].join("\n");

  // Időrendi sorrend (renderer + main együtt)
  const all = [
    ...rendererEntries.map((e) => ({ ...e, _src: "renderer" as const })),
    ...mainEntries.map((e) => ({ ...e, _src: "main" as const })),
  ].sort((a, b) => a.ts - b.ts);

  const body = all.length
    ? all.map((e) => `${fmtTs(e.ts)} [${e._src}/${e.level.toUpperCase()}] ${e.message}`).join("\n")
    : "# (no entries captured yet — try loading the inbox first)";

  const text = `${header}${body}\n`;
  const bytes = new Blob([text], { type: "text/plain;charset=utf-8" });

  const stamp = fmtTs(Date.now()).replace(/[:.]/g, "-");
  const filename = `cozy-email-pad-debug-${stamp}.log`;
  const url = URL.createObjectURL(bytes);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { filename, bytes: bytes.size };
}
