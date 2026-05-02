// Marketing chat widget.
//
// Intentionally distinct from lib/supportWidget.js — that one targets
// signed-in tenants and admins (Bug / Billing / Feature-request / Abuse
// categories). The marketing surface gets a leaner "talk to the
// founders" chat-styled prompt: just a name + email + message, framed
// like an inbound chat bubble. Same /help endpoint underneath so
// messages still show up in /__super; the `_surface=marketing` and
// `category=sales` hints flag them in the inbox.
//
// Renders inline (HTML + CSS + JS in one snippet) like supportWidget
// so the middleware can splice it before </body> in a single pass.

const escapeAttr = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

/**
 * Returns the floating marketing-chat HTML for injection just before </body>.
 *
 * @param {Object} opts
 * @param {string} [opts.csrfToken] CSRF token (unauth marketing visitors get "").
 */
export function marketingWidget({ csrfToken = "" } = {}) {
  const csrf = escapeAttr(csrfToken);
  return `
<div id="cmp-mkt-root" aria-live="polite">
  <button type="button" id="cmp-mkt-toggle" aria-expanded="false" aria-controls="cmp-mkt-panel" aria-label="Chat with us">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    <span>Chat with us</span>
  </button>
  <div id="cmp-mkt-panel" hidden>
    <header>
      <div>
        <strong>Got questions?</strong>
        <small>We usually reply within a day.</small>
      </div>
      <button type="button" id="cmp-mkt-close" aria-label="Close">×</button>
    </header>
    <div class="cmp-mkt-thread" aria-label="Conversation">
      <div class="cmp-mkt-bubble cmp-mkt-bubble--them">
        Hey 👋 — happy to answer questions about Compass before you sign up.
        Pricing, what we do (and don't do), how we compare to Scoutbook —
        whatever's on your mind.
      </div>
    </div>
    <form id="cmp-mkt-form" method="post" action="/help">
      ${csrf ? `<input type="hidden" name="csrf" value="${csrf}">` : ""}
      <input type="hidden" name="_surface" value="marketing">
      <input type="hidden" name="category" value="sales">
      <input type="hidden" name="subject" value="Marketing-chat inbound">
      <input type="hidden" name="_path" id="cmp-mkt-path" value="">
      <label class="cmp-mkt-row">
        <span>Email</span>
        <input name="email" type="email" required autocomplete="email" placeholder="you@example.com">
      </label>
      <label class="cmp-mkt-row">
        <span>Name</span>
        <input name="name" type="text" autocomplete="name" placeholder="Optional">
      </label>
      <label class="cmp-mkt-row">
        <span class="sr-only">Message</span>
        <textarea name="body" required maxlength="5000" rows="3" placeholder="Type your question…"></textarea>
      </label>
      <button type="submit">Send →</button>
    </form>
  </div>
</div>
<style>
  #cmp-mkt-root { position: fixed; right: 18px; bottom: 18px; z-index: 9999; font-family: var(--font-ui, "Inter Tight", system-ui, sans-serif); }
  #cmp-mkt-toggle {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 11px 16px; border-radius: 999px;
    background: var(--accent, #1d4ed8); color: var(--bg, #fff);
    border: 1px solid var(--accent, #1d4ed8);
    font-size: 13px; font-weight: 600; cursor: pointer;
    box-shadow: 0 4px 16px rgba(29, 78, 216, 0.28);
  }
  #cmp-mkt-toggle:hover, #cmp-mkt-toggle:focus-visible {
    transform: translateY(-1px); outline: none;
    box-shadow: 0 6px 20px rgba(29, 78, 216, 0.36);
  }
  #cmp-mkt-panel {
    position: absolute; right: 0; bottom: 56px; width: 340px;
    background: var(--surface, #fff); color: var(--ink, #0f172a);
    border: 1px solid var(--line, #e2e8f0); border-radius: 14px;
    padding: 0;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  #cmp-mkt-panel[hidden] { display: none; }
  #cmp-mkt-panel header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 16px; border-bottom: 1px solid var(--line, #e2e8f0);
    background: var(--surface-soft, #f8fafc);
  }
  #cmp-mkt-panel header strong { font-family: var(--font-display, serif); font-weight: 500; font-size: 16px; letter-spacing: -0.01em; display: block; }
  #cmp-mkt-panel header small { font-size: 11px; color: var(--ink-muted, #64748b); }
  #cmp-mkt-close { background: transparent; border: none; color: var(--ink-muted, #64748b); font-size: 22px; line-height: 1; cursor: pointer; padding: 0 4px; }
  .cmp-mkt-thread { padding: 14px 16px 4px; max-height: 220px; overflow-y: auto; }
  .cmp-mkt-bubble {
    font-size: 13px; line-height: 1.5; padding: 10px 12px;
    border-radius: 12px; max-width: 88%;
  }
  .cmp-mkt-bubble--them { background: var(--surface-soft, #f1f5f9); color: var(--ink, #0f172a); border-bottom-left-radius: 4px; }
  #cmp-mkt-form { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px 14px; border-top: 1px solid var(--line, #e2e8f0); }
  .cmp-mkt-row { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--ink-muted, #64748b); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
  .cmp-mkt-row .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
  #cmp-mkt-form input,
  #cmp-mkt-form textarea {
    font-family: inherit; font-size: 13px; padding: 8px 10px;
    border: 1px solid var(--line, #e2e8f0); border-radius: 7px;
    background: var(--surface, #fff); color: var(--ink, #0f172a);
    text-transform: none; letter-spacing: normal; font-weight: 400;
  }
  #cmp-mkt-form textarea { resize: vertical; min-height: 64px; }
  #cmp-mkt-form input:focus, #cmp-mkt-form textarea:focus { outline: 2px solid var(--accent, #1d4ed8); outline-offset: 1px; border-color: var(--accent, #1d4ed8); }
  #cmp-mkt-form button[type="submit"] {
    background: var(--accent, #1d4ed8); color: #fff;
    border: none; padding: 10px 14px; border-radius: 8px;
    font-size: 13px; font-weight: 600; cursor: pointer;
    margin-top: 2px;
  }
  #cmp-mkt-form button[type="submit"]:hover { filter: brightness(0.94); }
  @media print { #cmp-mkt-root { display: none; } }
</style>
<script>
(function(){
  var toggle = document.getElementById('cmp-mkt-toggle');
  var panel  = document.getElementById('cmp-mkt-panel');
  var close  = document.getElementById('cmp-mkt-close');
  var path   = document.getElementById('cmp-mkt-path');
  if (!toggle || !panel) return;
  function open(){
    panel.hidden = false;
    toggle.setAttribute('aria-expanded','true');
    if (path) path.value = location.pathname + location.search;
    var f = panel.querySelector('textarea[name="body"]');
    f && f.focus();
  }
  function shut(){ panel.hidden = true; toggle.setAttribute('aria-expanded','false'); }
  toggle.addEventListener('click', function(){ panel.hidden ? open() : shut(); });
  close && close.addEventListener('click', shut);
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !panel.hidden) shut(); });
})();
</script>
`;
}
