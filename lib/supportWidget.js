// Floating support widget.
//
// A small bottom-right "Need help?" button that opens a modal with a
// short form (subject + body + category) and POSTs to /help — the
// existing form handler in server/index.js that creates a SupportTicket
// the super-admin sees in /__super.
//
// Renders inline (HTML + CSS + JS in one snippet) so it can be
// injected by middleware without an extra round-trip. Designed to be
// safe on every surface — uses the shared `--surface-dark` / `--accent`
// CSS custom properties so it picks up whatever palette the page set.
//
// Auto-attaches context from the page so the operator sees what the
// user was looking at without having to ask:
//   - current path
//   - surface (marketing / tenant / admin)
//   - signed-in user (server-rendered into the form)
//   - a fresh CSRF token (server-rendered)

const escapeAttr = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

/**
 * Returns the floating-widget HTML for injection just before </body>.
 *
 * @param {Object} opts
 * @param {string} opts.surface     "marketing" | "tenant" | "admin"
 * @param {string} [opts.csrfToken] CSRF token. When present, the form
 *                                  POSTs same-origin and gets through
 *                                  csrfProtect; when absent (anonymous
 *                                  marketing visitors), the form posts
 *                                  to /help which the existing handler
 *                                  also accepts without a session.
 * @param {Object} [opts.user]      { email, displayName } if known.
 */
export function supportWidget({ surface = "marketing", csrfToken = "", user = null } = {}) {
  const u = user || {};
  const email = escapeAttr(u.email || "");
  const name = escapeAttr(u.displayName || "");
  const csrf = escapeAttr(csrfToken);
  const safeSurface = escapeAttr(surface);
  return `
<div id="cmp-support-root" data-surface="${safeSurface}" aria-live="polite">
  <button type="button" id="cmp-support-toggle" aria-expanded="false" aria-controls="cmp-support-panel" aria-label="Open support">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <span>Need help?</span>
  </button>
  <form id="cmp-support-panel" method="post" action="/help" hidden>
    ${csrf ? `<input type="hidden" name="csrf" value="${csrf}">` : ""}
    <input type="hidden" name="_surface" value="${safeSurface}">
    <input type="hidden" name="_path" id="cmp-support-path" value="">
    <header>
      <strong>How can we help?</strong>
      <button type="button" id="cmp-support-close" aria-label="Close">×</button>
    </header>
    <label>
      Email
      <input name="email" type="email" required value="${email}" autocomplete="email">
    </label>
    <label>
      Name
      <input name="name" type="text" value="${name}" autocomplete="name">
    </label>
    <label>
      Category
      <select name="category">
        <option value="question">Question</option>
        <option value="bug">Something is broken</option>
        <option value="billing">Billing</option>
        <option value="feature">Feature request</option>
        <option value="abuse">Abuse / safety</option>
        <option value="other">Other</option>
      </select>
    </label>
    <label>
      Subject
      <input name="subject" type="text" required maxlength="200" placeholder="Short summary">
    </label>
    <label>
      What's going on?
      <textarea name="body" required maxlength="5000" rows="4" placeholder="A few sentences is plenty. Include the URL if it's a bug."></textarea>
    </label>
    <footer>
      <small>We reply within one business day. For urgent youth-safety concerns, contact your council directly.</small>
      <button type="submit">Send →</button>
    </footer>
  </form>
</div>
<style>
  #cmp-support-root { position: fixed; right: 18px; bottom: 18px; z-index: 9999; font-family: var(--font-ui, "Inter Tight", system-ui, sans-serif); }
  #cmp-support-toggle {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 11px 16px; border-radius: 999px;
    background: var(--surface-dark, #0f172a); color: var(--bg, #fff);
    border: 1px solid var(--surface-dark, #0f172a);
    font-size: 13px; font-weight: 600; cursor: pointer;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.18);
  }
  #cmp-support-toggle:hover, #cmp-support-toggle:focus-visible {
    transform: translateY(-1px); outline: none;
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.24);
  }
  #cmp-support-toggle svg { color: var(--accent, #1d4ed8); }
  #cmp-support-panel {
    position: absolute; right: 0; bottom: 56px; width: 340px;
    background: var(--surface, #fff); color: var(--ink, #0f172a);
    border: 1px solid var(--line, #e2e8f0); border-radius: 14px;
    padding: 16px 16px 14px;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
    display: flex; flex-direction: column; gap: 10px;
  }
  #cmp-support-panel header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
  #cmp-support-panel header strong { font-family: var(--font-display, serif); font-weight: 500; font-size: 17px; letter-spacing: -0.01em; }
  #cmp-support-close { background: transparent; border: none; color: var(--ink-muted, #64748b); font-size: 22px; line-height: 1; cursor: pointer; padding: 0 4px; }
  #cmp-support-panel label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--ink-muted, #64748b); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
  #cmp-support-panel input,
  #cmp-support-panel select,
  #cmp-support-panel textarea {
    font-family: inherit; font-size: 13px; padding: 8px 10px;
    border: 1px solid var(--line, #e2e8f0); border-radius: 7px;
    background: var(--surface, #fff); color: var(--ink, #0f172a);
    text-transform: none; letter-spacing: normal; font-weight: 400;
  }
  #cmp-support-panel input:focus, #cmp-support-panel select:focus, #cmp-support-panel textarea:focus { outline: 2px solid var(--accent, #1d4ed8); outline-offset: 1px; border-color: var(--accent, #1d4ed8); }
  #cmp-support-panel textarea { resize: vertical; min-height: 80px; font-family: inherit; }
  #cmp-support-panel footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 4px; }
  #cmp-support-panel footer small { font-size: 10.5px; color: var(--ink-muted, #64748b); line-height: 1.4; }
  #cmp-support-panel footer button {
    background: var(--ink, #0f172a); color: var(--surface, #fff);
    border: none; padding: 9px 14px; border-radius: 8px;
    font-size: 12px; font-weight: 600; cursor: pointer;
    white-space: nowrap;
  }
  #cmp-support-panel footer button:hover { filter: brightness(0.92); }
  @media print { #cmp-support-root { display: none; } }
</style>
<script>
(function(){
  var toggle = document.getElementById('cmp-support-toggle');
  var panel  = document.getElementById('cmp-support-panel');
  var close  = document.getElementById('cmp-support-close');
  var path   = document.getElementById('cmp-support-path');
  if (!toggle || !panel) return;
  function open(){ panel.hidden = false; toggle.setAttribute('aria-expanded','true'); if (path){ path.value = location.pathname + location.search; } var f = panel.querySelector('input[name="subject"]'); f && f.focus(); }
  function shut(){ panel.hidden = true;  toggle.setAttribute('aria-expanded','false'); }
  toggle.addEventListener('click', function(){ panel.hidden ? open() : shut(); });
  close && close.addEventListener('click', shut);
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !panel.hidden) shut(); });
})();
</script>
`;
}
