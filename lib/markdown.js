// Tiny markdown renderer for CMS bodies (Page, Announcement, Post,
// Event description, comment, custom page). Supports:
//
//   - Headings: # / ## / ###
//   - Bold (**), italic (*)
//   - Links [text](http(s)://… or mailto:…)
//   - Unordered (- / *) and ordered (1.) lists
//   - Code fences (```) and inline code (`)
//   - Blockquotes (>)
//   - Hard line breaks (single \n inside a paragraph → <br>)
//
// Dependency-free on purpose. All input is HTML-escaped first; markdown
// transforms only operate on the escaped string, so we never reintroduce
// raw HTML. Code blocks get their literal content preserved (no further
// inline markdown applied inside).

const ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPE[c]);
}

// Restrict autolink/link URLs to a safe scheme set.
function safeUrl(url) {
  const trimmed = String(url || "").trim();
  if (!/^(https?:|mailto:|\/|#)/i.test(trimmed)) return null;
  return trimmed;
}

const CODE_OPEN = "MDCODE";
const CODE_CLOSE = "";

function inlineMarkdown(escaped) {
  // Pull inline code into placeholders so subsequent transforms can't
  // touch their contents (no inline markdown inside `code`). The
  // sentinel uses Private Use Area characters so it can't collide with
  // anything a user might type.
  const codes = [];
  let out = escaped.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = codes.push(code) - 1;
    return `${CODE_OPEN}${idx}${CODE_CLOSE}`;
  });

  // Links: [text](url). Markdown is already HTML-escaped, so the URL
  // arrives with &amp; etc. — we unescape just enough for the safety check.
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const decoded = url.replace(/&amp;/g, "&");
    const safe = safeUrl(decoded);
    if (!safe) return text;
    return `<a href="${escapeHtml(safe)}" rel="noopener noreferrer">${text}</a>`;
  });

  // Bold then italic. Order matters so ** doesn't get eaten by *.
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  out = out.replace(
    new RegExp(`${CODE_OPEN}(\\d+)${CODE_CLOSE}`, "g"),
    (_, n) => `<code>${codes[Number(n)]}</code>`,
  );
  return out;
}

// Convert "soft" newlines inside a paragraph to <br>, preserving inline.
function paragraphInline(text) {
  return inlineMarkdown(escapeHtml(text)).replace(/\n/g, "<br>");
}

export function renderMarkdown(input) {
  if (input == null) return "";
  const src = String(input).replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  const out = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // Blank line → paragraph separator
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Heading
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inlineMarkdown(escapeHtml(h[2].trim()))}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${paragraphInline(buf.join("\n"))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push(
        `<ul>${items.map((it) => `<li>${inlineMarkdown(escapeHtml(it))}</li>`).join("")}</ul>`,
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      out.push(
        `<ol>${items.map((it) => `<li>${inlineMarkdown(escapeHtml(it))}</li>`).join("")}</ol>`,
      );
      continue;
    }

    // Paragraph: greedy collect until blank line or block start.
    const buf = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${paragraphInline(buf.join("\n"))}</p>`);
  }

  return out.join("");
}
