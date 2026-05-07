import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageIcon } from "lucide-react";

type Props = {
  html: string;
  className?: string;
};

/**
 * A levélben hivatkozott TÁVOLI képeket (http/https) alapból blokkoljuk —
 * ez a klasszikus „remote content" védelem (tracking pixel, IP-leak, stb.),
 * pont mint az Apple Mail / Gmail. A `cid:` (inline csatolmány) és a
 * `data:` URI-k bent maradnak. A felhasználó egy gombbal tudja a levélhez
 * a távoli képeket engedélyezni.
 */
function blockRemoteImages(html: string): { html: string; blocked: number } {
  if (typeof window === "undefined") return { html, blocked: 0 };
  let blocked = 0;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  tmp.querySelectorAll("img").forEach((img) => {
    const src = (img.getAttribute("src") || "").trim();
    if (/^https?:\/\//i.test(src)) {
      img.setAttribute("data-blocked-src", src);
      img.removeAttribute("src");
      img.removeAttribute("srcset");
      blocked++;
    }
  });
  // Háttérképek (style="background-image:url(http...)")
  tmp.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const s = el.getAttribute("style") || "";
    if (/background(-image)?\s*:[^;]*url\(\s*['\"]?https?:/i.test(s)) {
      el.setAttribute("data-blocked-style", s);
      el.setAttribute(
        "style",
        s.replace(/background(-image)?\s*:[^;]*url\(\s*['\"]?https?:[^)]*\)[^;]*;?/gi, ""),
      );
      blocked++;
    }
  });
  return { html: tmp.innerHTML, blocked };
}

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
 * - `sandbox="allow-same-origin"`: nincs script, nincs form submit, nincs
 *   top-navigation. A `same-origin` itt csak azért kell, hogy a szülő oldal
 *   megbízhatóan le tudja mérni a `srcDoc` tartalom magasságát minden
 *   környezetben (különösen a böngészős preview-ban).
 * - Mivel script továbbra sem futhat a levélben, az iframe-ből nem lehet
 *   aktív kódot futtatni vagy a parent window-t vezérelni.
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
  const observerRef = useRef<ResizeObserver | null>(null);

  // A beágyazott dokumentumot egy minimális reset + szellős alap-tipográfia
  // wrap-pelt köré tesszük, hogy a `<body>` margók és a default linkszín a
  // levelekben jól nézzen ki, ha az adott levél nem ad sajátot.
  const srcDoc = `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
    font-size: 17px;
    line-height: 1.47;
    font-weight: 400;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color: #1c1c1e;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  p, div, li { margin-top: 0; }
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
  pre {
    white-space: pre-wrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 14px;
  }
</style>
</head>
<body>${html}</body>
</html>`;

  const updateHeight = useCallback(() => {
    const iframe = ref.current;
    const doc = iframe?.contentDocument;
    if (!doc?.body) return;

    const containerHeight = iframe.parentElement?.getBoundingClientRect().height ?? 0;

    const next = Math.max(
      containerHeight,
      doc.body.scrollHeight,
      doc.body.offsetHeight,
      doc.documentElement.scrollHeight,
      doc.documentElement.offsetHeight,
    );

    setHeight(Math.max(next + 2, 200));
  }, []);

  const attachObservers = useCallback(() => {
    const iframe = ref.current;
    const doc = iframe?.contentDocument;
    if (!doc?.body) return;

    observerRef.current?.disconnect();
    if ("ResizeObserver" in window) {
      observerRef.current = new ResizeObserver(updateHeight);
      observerRef.current.observe(doc.body);
      observerRef.current.observe(doc.documentElement);
    }

    doc.querySelectorAll("img").forEach((img) => {
      if (!img.complete) img.addEventListener("load", updateHeight, { once: true });
    });

    requestAnimationFrame(() => {
      updateHeight();
      requestAnimationFrame(updateHeight);
    });
  }, [updateHeight]);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;

    const onLoad = () => {
      attachObservers();
    };

    iframe.addEventListener("load", onLoad);

    if (iframe.contentDocument?.readyState === "complete") {
      attachObservers();
    }

    window.addEventListener("resize", updateHeight);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("resize", updateHeight);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [srcDoc, attachObservers, updateHeight]);

  return (
    <iframe
      ref={ref}
      title="email-body"
      // A preview-ban a teljes magasság méréséhez kell a same-origin hozzáférés.
      // Az allow-popups + allow-popups-to-escape-sandbox engedi, hogy a levélben
      // lévő linkek (target="_blank") új ablakban / a rendszer böngészőjében
      // megnyíljanak. Script / form továbbra sincs engedélyezve.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      style={{ width: "100%", height, border: "0", display: "block" }}
      className={className}
    />
  );
}
