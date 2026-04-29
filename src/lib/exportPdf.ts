// Levél exportálása PDF-be a böngésző natív nyomtatási dialógusán keresztül.
// Nincs külső függőség (jsPDF, html2canvas), a HTML formázás 1:1 megmarad,
// mert maga a böngésző renderelő motorja állítja elő a PDF-et.
//
// Hogyan működik:
//  1) Készítünk egy off-screen `<iframe>`-et, és belerakunk egy teljes HTML-
//     dokumentumot: fejléc-tábla (Tárgy / Feladó / Címzett / Dátum) + a levél
//     eredeti HTML-törzse, néhány nyomtatás-barát stílussal kiegészítve.
//  2) Megvárjuk, hogy a tartalom (és a benne lévő képek) betöltődjenek.
//  3) `iframe.contentWindow.print()`-et hívunk — a felhasználó a böngésző /
//     macOS PDF-mentés ablakában menthet PDF-ként, vagy nyomtathat papírra.
//  4) Az iframe az `afterprint` után törlődik a DOM-ból.
//
// A `<base target="_blank">` biztosítja, hogy a levélben lévő linkek új ablakba
// nyíljanak, ne az iframe-en belül navigáljanak el.
import type { MailMessage } from "./mailBridge";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeFilename(s: string): string {
  return (s || "level")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "level";
}

function formatDateHu(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Egy levél PDF-export HTML-tartalmának összeállítása. */
function buildPrintableHtml(m: MailMessage): string {
  const subject = escapeHtml(m.subject || "(nincs tárgy)");
  const from = escapeHtml(m.from || "");
  const to = escapeHtml(m.to || "");
  const cc = (m as any).cc ? escapeHtml(String((m as any).cc)) : "";
  const date = m.date ? escapeHtml(formatDateHu(new Date(m.date))) : "";

  // Ha a levélnek nincs HTML törzse, a sima szöveget `<pre>`-be tördeljük.
  const body = m.html
    ? m.html
    : `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${escapeHtml(m.text || "")}</pre>`;

  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<base target="_blank">
<title>${subject}</title>
<style>
  /* Nyomtatás-barát alap. A levél saját CSS-e (a body alatt) felülírhatja
     ezeket — ez szándékos, hogy a formázás 1:1 megmaradjon. */
  @page { size: A4; margin: 18mm 16mm; }
  html, body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    color: #111;
    background: #fff;
    font-size: 12pt;
    line-height: 1.45;
  }
  a { color: #0a58ca; text-decoration: underline; }
  img { max-width: 100% !important; height: auto !important; }
  table { border-collapse: collapse; }
  blockquote {
    border-left: 3px solid #ccc;
    margin: 0.6em 0;
    padding: 0.2em 0 0.2em 0.9em;
    color: #444;
  }
  /* Nyomtatáskor a hosszú elemek ne csonkoljanak rondán. */
  pre, blockquote, table, img { break-inside: avoid; page-break-inside: avoid; }

  .mw-pdf-header {
    border-bottom: 2px solid #222;
    padding-bottom: 10px;
    margin-bottom: 16px;
  }
  .mw-pdf-subject {
    font-size: 18pt;
    font-weight: 600;
    margin: 0 0 8px 0;
    line-height: 1.25;
  }
  .mw-pdf-meta {
    width: 100%;
    font-size: 10.5pt;
    color: #333;
  }
  .mw-pdf-meta td {
    padding: 1px 0;
    vertical-align: top;
  }
  .mw-pdf-meta td.k {
    width: 90px;
    color: #666;
    font-weight: 500;
  }
  .mw-pdf-body { margin-top: 4px; }
</style>
</head>
<body>
  <div class="mw-pdf-header">
    <h1 class="mw-pdf-subject">${subject}</h1>
    <table class="mw-pdf-meta">
      <tr><td class="k">Feladó</td><td>${from}</td></tr>
      <tr><td class="k">Címzett</td><td>${to}</td></tr>
      ${cc ? `<tr><td class="k">Másolat</td><td>${cc}</td></tr>` : ""}
      ${date ? `<tr><td class="k">Dátum</td><td>${date}</td></tr>` : ""}
    </table>
  </div>
  <div class="mw-pdf-body">
    ${body}
  </div>
</body>
</html>`;
}

/** Megvárja, hogy az iframe-ben lévő képek betöltődjenek (vagy hibára fussanak). */
function waitForImages(doc: Document, timeoutMs = 5000): Promise<void> {
  const imgs = Array.from(doc.images);
  if (imgs.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let pending = imgs.length;
    const done = () => { if (--pending <= 0) resolve(); };
    imgs.forEach((img) => {
      if (img.complete) { done(); return; }
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
    // Biztonsági timeout — ne maradjon ott örökre, ha egy kép külső hosztról
    // lassan jön / blokkolva van.
    setTimeout(() => resolve(), timeoutMs);
  });
}

/**
 * Megnyitja a böngésző natív nyomtatás-dialógusát a megadott levél tartalmával,
 * ahol a felhasználó a „PDF-ként mentés" opcióval menteni tudja a levelet.
 *
 * A javasolt fájlnév a tárgy alapján generálódik (nem-ASCII karakterek megmaradnak,
 * fájlrendszer-tiltott karakterek aláhúzásra cserélve).
 */
export async function exportEmailToPdf(message: MailMessage): Promise<void> {
  const html = buildPrintableHtml(message);

  // Off-screen iframe — láthatatlan, de méretes, hogy a layout korrekten
  // számolódjon. (display:none-os iframe-ben pl. a font-betöltés megkésik.)
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.zIndex = "-1";
  // A javasolt fájlnév megjelenik a nyomtatási dialógusban (Chrome/Edge),
  // mert a `document.title` lesz a default fájlnév „PDF-ként mentés"-kor.
  // (A `name` attribútum nem módosítja, de a `title` igen — lentebb állítjuk.)
  iframe.name = `mw-pdf-${Date.now()}`;
  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    iframe.addEventListener("load", () => resolve(), { once: true });
    iframe.addEventListener("error", () => reject(new Error("iframe load error")), { once: true });
    // srcdoc-on keresztül töltjük be a teljes HTML-t (sandbox NÉLKÜL — a
    // print()-hez ugyanis hozzá kell férnünk a `contentWindow`-hoz).
    iframe.srcdoc = html;
  });

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    document.body.removeChild(iframe);
    throw new Error("Nem sikerült előkészíteni a nyomtatási előnézetet.");
  }

  // A doc.title a „Mentés PDF-ként" alapértelmezett fájlnevét adja Chrome-ban.
  doc.title = safeFilename(message.subject || "level");

  await waitForImages(doc);

  // Az `afterprint` után takarítunk. Ha a felhasználó megszakítja, akkor is
  // lefut (Chrome / Safari mindkét esetben tüzeli).
  const cleanup = () => {
    try { win.removeEventListener("afterprint", cleanup); } catch {}
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch {}
    }, 200);
  };
  win.addEventListener("afterprint", cleanup);

  // A focus + print sorrend Safari-on is megbízhatóan nyitja a dialógust.
  try { win.focus(); } catch {}
  win.print();

  // Failsafe: ha valamiért az `afterprint` nem sülne el (régi WebKit),
  // 60 mp után mindenképp eltávolítjuk az iframe-et.
  setTimeout(cleanup, 60_000);
}
