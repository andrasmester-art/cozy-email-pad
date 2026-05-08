// Builds a quoted reply/forward body that survives the Tiptap rich-text
// editor's schema. The original HTML is converted to plain text with line
// breaks preserved, then each line is wrapped in a `<p>` so the editor
// renders it as a normal paragraph instead of collapsing everything into
// one italic blob inside a `<blockquote>`.
import type { MailMessage } from "./mailBridge";

function htmlToTextLines(html: string): string[] {
  if (typeof window === "undefined") return [html];
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  // Replace <br> and block-level closings with newline markers
  tmp.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  const blockTags = ["p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"];
  blockTags.forEach((tag) => {
    tmp.querySelectorAll(tag).forEach((el) => {
      el.append("\n");
    });
  });
  const text = (tmp.textContent || "").replace(/\u00a0/g, " ");
  return text.split(/\r?\n/);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function linesToParagraphs(lines: string[]): string {
  // Trim leading/trailing blank lines, but preserve blanks in between as empty <p>
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  const trimmed = lines.slice(start, end);
  return trimmed
    .map((l) => {
      const t = escapeHtml(l).trim();
      return t ? `<p>${t}</p>` : `<p><br></p>`;
    })
    .join("");
}

function buildQuoted(m: MailMessage, headerHtml: string): string {
  const source = m.html && m.html.trim() ? m.html : (m.text ? m.text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string)) : "");
  const lines = m.html && m.html.trim()
    ? htmlToTextLines(m.html)
    : (m.text || "").split(/\r?\n/);
  const body = linesToParagraphs(lines);
  // NOTE: not wrapping in <blockquote> because Tiptap renders blockquote
  // contents in italic and indented, which is what made the user's quoted
  // text "fall apart" visually. Plain paragraphs render cleanly and the
  // user can still edit/format them.
  return `<p></p>${headerHtml}${body}<p></p>`;
}

export function buildReplyQuote(m: MailMessage): string {
  const header = `<p><em>${escapeHtml(m.from)} írta:</em></p>`;
  return buildQuoted(m, header);
}

export function buildForwardQuote(m: MailMessage): string {
  const meta = [
    `<strong>Feladó:</strong> ${escapeHtml(m.from || "")}`,
    m.to ? `<strong>Címzett:</strong> ${escapeHtml(m.to)}` : "",
    m.subject ? `<strong>Tárgy:</strong> ${escapeHtml(m.subject)}` : "",
    m.date ? `<strong>Dátum:</strong> ${escapeHtml(String(m.date))}` : "",
  ].filter(Boolean).join("<br>");
  const header = `<p>---------- Továbbított üzenet ----------</p><p>${meta}</p>`;
  return buildQuoted(m, header);
}
