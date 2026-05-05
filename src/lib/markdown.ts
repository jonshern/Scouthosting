/**
 * A deliberately tiny "almost markdown" renderer. Just enough to keep
 * the legacy CustomPage.body field renderable while we plan a real
 * markdown port. Handles:
 *   - paragraph breaks (blank line)
 *   - line breaks within a paragraph
 *   - escaping of HTML special characters
 *   - autolinking of bare http/https URLs
 *
 * Returns sanitized HTML. No raw HTML pass-through.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

const URL_RE = /\b(https?:\/\/[^\s<]+[^\s<.,!?;:'"])/g;

function autolink(s: string): string {
  return s.replace(URL_RE, (url) => {
    const safe = escapeHtml(url);
    return `<a href="${safe}" rel="noopener noreferrer" target="_blank">${safe}</a>`;
  });
}

export function renderMarkdownLite(input: string): string {
  if (!input) return "";
  const escaped = escapeHtml(input);
  const paragraphs = escaped.split(/\n\s*\n+/);
  const html = paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${autolink(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
  return html;
}
