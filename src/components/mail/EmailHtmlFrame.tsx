import { useEffect, useRef, useState } from "react";

type Props = {
  html: string;
  className?: string;
};

/**
 * Beérkező email HTML törzsének izolált renderelése `<iframe srcDoc>`-ba.
 *
 * Miért iframe?
 * - A levelek saját `<style>` blokkjai és inline stílusai gyakran feltételezik,
 *   hogy ők egy üres `<body>`-ban élnek. Ha a `prose` / Tailwind reset alá
 *   ágyazva renderelnénk őket egy `<div>`-be, a Tailwind utility-k és a `prose`
 *   plugin csendben felülírnák a szöveg színét, méretét, listák stílusát,
 *   stb. — emiatt sok beérkező levél „puszta szövegként" jelent meg, holott
 *   eredetileg formázott volt.
 * - Az `<iframe>` saját document-tel rendelkezik, így a tartalmazó alkalmazás
 *   CSS-e nem szivárog be, és a levél stílusa torzítatlan marad — pont mint
 *   az Apple Mail / Gmail web nézetében.
 *
 * Biztonság:
 * - `sandbox=""` (üres token list): nincs script, nincs form submit, nincs
 *   top-navigation, nincs same-origin → a levél nem férhet hozzá a renderer
 *   process-hez vagy az alkalmazás cookie-jaihoz.
 * - Az iframe-ben futó kód nem éri el az ablak `parent`-jét.
 *
 * Méretezés:
 * - Az iframe magasságát a betöltött body `scrollHeight`-jához igazítjuk és
 *   ResizeObserver-rel követjük (képek lazy-load, stb.). Így nem kell belső
 *   görgetés a levélen — ugyanúgy görgethető a teljes nézet, ahogy eddig is
 *   szokták a felhasználók.
 */
export function EmailHtmlFrame({ html, className }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  // A beágyazott dokumentumot egy minimális reset + szellős alap-tipográfia
  // wrap-pelt köré tesszük, hogy a `<body>` margók és a default linkszín a
  // levelekben jól nézzen ki, ha az adott levél nem ad sajátot.
  const srcDoc = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    color: #1c1c1e;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  img, table, video { max-width: 100%; }
  img { height: auto; }
  table { border-collapse: collapse; }
  a { color: #0a64dc; }
  blockquote {
    border-left: 3px solid #d0d0d5;
    margin: 0 0 0 0.5em;
    padding: 0 0 0 0.75em;
    color: #555;
  }
  pre { white-space: pre-wrap; }
</style>
</head>
<body>${html}</body>
</html>`;

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    let observer: ResizeObserver | null = null;
    const update = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      const next = Math.max(
        doc.body.scrollHeight,
        doc.documentElement.scrollHeight,
      );
      // +2 px védelem a görgetősáv ellen kerekítési hibák esetén.
      setHeight(next + 2);
    };
    const onLoad = () => {
      update();
      const doc = iframe.contentDocument;
      if (doc && "ResizeObserver" in window) {
        observer = new ResizeObserver(update);
        observer.observe(doc.body);
      }
      // Képek később töltődhetnek be, frissítsünk akkor is.
      doc?.querySelectorAll("img").forEach((img) => {
        if (!img.complete) img.addEventListener("load", update, { once: true });
      });
    };
    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, [srcDoc]);

  return (
    <iframe
      ref={ref}
      title="email-body"
      // Sandbox: minden képesség kikapcsolva. Scriptek nem futnak, a frame
      // nem nyithat ablakot, nem küldhet form-ot, nem érheti el a parent-et.
      sandbox=""
      srcDoc={srcDoc}
      style={{ width: "100%", height, border: "0", display: "block" }}
      className={className}
    />
  );
}
