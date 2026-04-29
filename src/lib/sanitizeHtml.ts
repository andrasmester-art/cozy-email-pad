// Centralised HTML sanitization for any user-authored email content
// (signatures, templates, pasted bodies). Uses DOMPurify with a safe,
// email-friendly allowlist and strips constructs that commonly cause layout
// breakage when injected into another rich-text container:
//   - <html>/<head>/<body> wrappers
//   - <style> blocks and inline event handlers
//   - <script>, <iframe>, <object>, <embed>, <form>
//   - position/fixed CSS that escapes the editor flow
import DOMPurify from "dompurify";

// Tags allowed in email bodies / signatures. Intentionally conservative.
const ALLOWED_TAGS = [
  "a", "abbr", "b", "blockquote", "br", "cite", "code", "div", "em",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol",
  "p", "pre", "s", "small", "span", "strong", "sub", "sup", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
];

const ALLOWED_ATTR = [
  "href", "title", "target", "rel",
  "src", "alt", "width", "height",
  "align", "valign",
  "colspan", "rowspan",
  "style", "class",
  // Preserve our signature + reply-quote markers so swap/strip and
  // signature-positioning logic keeps working through sanitization.
  // Also keep `data-align` so image alignment survives a round-trip.
  "data-mwsig", "data-mwquote", "data-align",
];

// Drop CSS declarations that could break the surrounding layout or be used
// for clickjacking. Applied after DOMPurify to keep things simple/portable.
const FORBIDDEN_STYLE_PATTERNS = [
  /position\s*:\s*(fixed|absolute|sticky)/i,
  /z-index\s*:/i,
  /(^|;)\s*top\s*:/i,
  /(^|;)\s*left\s*:/i,
  /(^|;)\s*right\s*:/i,
  /(^|;)\s*bottom\s*:/i,
  /expression\s*\(/i,
  /url\s*\(\s*["']?\s*javascript:/i,
  /-moz-binding/i,
];

function cleanInlineStyles(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const raw = el.getAttribute("style") || "";
    const kept = raw
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .filter((decl) => !FORBIDDEN_STYLE_PATTERNS.some((re) => re.test(decl)))
      .join("; ");
    if (kept) el.setAttribute("style", kept);
    else el.removeAttribute("style");
  });
}

export function sanitizeEmailHtml(input: string): string {
  if (!input) return "";

  // First pass: structural sanitization with DOMPurify.
  const cleaned = DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input", "button", "meta", "link", "base"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit", "srcset"],
    // Strip <html>/<head>/<body> shells from pasted email content
    WHOLE_DOCUMENT: false,
    RETURN_TRUSTED_TYPE: false,
  }) as string;

  // Second pass: scrub dangerous CSS that DOMPurify allows by default.
  if (typeof window === "undefined") return cleaned;
  const tmp = document.createElement("div");
  tmp.innerHTML = cleaned;
  cleanInlineStyles(tmp);

  // Force-safe attributes on links and images.
  tmp.querySelectorAll("a[href]").forEach((a) => {
    const href = (a.getAttribute("href") || "").trim();
    if (/^javascript:/i.test(href) || /^data:text\/html/i.test(href)) {
      a.removeAttribute("href");
    } else {
      a.setAttribute("rel", "noopener noreferrer");
      if (a.getAttribute("target") === "_blank") {
        a.setAttribute("rel", "noopener noreferrer");
      }
    }
  });
  tmp.querySelectorAll("img[src]").forEach((img) => {
    const src = (img.getAttribute("src") || "").trim();
    if (/^javascript:/i.test(src)) img.removeAttribute("src");
  });

  return tmp.innerHTML;
}
