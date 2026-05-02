// Analytics tag helpers.
//
// Two surfaces, one privacy-conscious shape:
//
//   1. First-party telemetry beacon (everywhere). A ~1KB inline
//      <script> that fires a `page-view` POST to /__telemetry on load
//      and listens for [data-track] clicks. Records flow through
//      lib/analytics.js → AuditLog. No third-party, no cookies, no
//      cross-site identifiers.
//
//   2. Plausible (opt-in, marketing only). When ANALYTICS_PROVIDER=
//      plausible is set AND PLAUSIBLE_DOMAIN is configured, we inject
//      Plausible's cookieless script on apex marketing pages only.
//      Tenant subdomains and admin never load a third-party script —
//      that's a hard architectural rule, not a setting.
//
// Both helpers return raw HTML strings that get spliced into responses
// by the middleware in server/index.js. They're safe to call on every
// request — the env reads are cached.

const PLAUSIBLE_DEFAULT_SRC = "https://plausible.io/js/script.js";

let _cached;
function readConfig() {
  if (_cached) return _cached;
  const provider = (process.env.ANALYTICS_PROVIDER || "").toLowerCase();
  _cached = {
    provider,
    plausibleDomain: process.env.PLAUSIBLE_DOMAIN || "",
    plausibleSrc: process.env.PLAUSIBLE_SCRIPT_URL || PLAUSIBLE_DEFAULT_SRC,
    ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || "",
  };
  return _cached;
}

/**
 * Reset the cached config. Tests use this to swap env vars between
 * cases; production never calls it.
 */
export function _resetForTests() {
  _cached = null;
}

/**
 * Marketing-only third-party tag. Returns "" unless the operator
 * explicitly opts in.
 *
 * Opt-in shapes:
 *   ANALYTICS_PROVIDER=plausible PLAUSIBLE_DOMAIN=compass.app
 *   ANALYTICS_PROVIDER=ga4       GA4_MEASUREMENT_ID=G-XXXXXXX
 */
export function marketingTag() {
  const cfg = readConfig();
  if (cfg.provider === "plausible" && cfg.plausibleDomain) {
    // Plausible's official cookieless script. data-domain is required;
    // the defer attribute keeps it off the critical path.
    const domain = escapeAttr(cfg.plausibleDomain);
    const src = escapeAttr(cfg.plausibleSrc);
    return `\n<script defer data-domain="${domain}" src="${src}"></script>\n`;
  }
  if (cfg.provider === "ga4" && cfg.ga4MeasurementId) {
    // GA4 with anonymizeIp. The user explicitly asked for this; we
    // still recommend Plausible by default in the README.
    const id = escapeAttr(cfg.ga4MeasurementId);
    return `\n<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${id}', { anonymize_ip: true });
</script>\n`;
  }
  return "";
}

/**
 * First-party telemetry beacon. Fires a page-view on load, listens
 * for clicks on [data-track] elements, and forwards uncaught errors
 * + unhandled promise rejections so the operator can see where
 * things break in the field. POSTs to /__telemetry with a tiny JSON
 * body — no cookies, no third-party requests.
 *
 * `surface` distinguishes the originating layer in AuditLog:
 *   "marketing" — apex/www public pages
 *   "tenant"    — *.compass.app public site
 *   "admin"     — leader-side admin app
 *
 * The script is intentionally tiny and inline so it ships in the same
 * response as the page (no extra round trip).
 */
export function firstPartyTag({ surface = "marketing" } = {}) {
  const safeSurface = JSON.stringify(String(surface));
  return `
<script>
(function(){
  var SURFACE = ${safeSurface};
  // De-dupe identical errors within a single page-load so a runaway
  // setInterval doesn't flood AuditLog with the same row.
  var seen = Object.create(null);
  function send(event, extra){
    try{
      var body = JSON.stringify(Object.assign({
        event: event,
        path: location.pathname + location.search,
        surface: SURFACE,
        ts: Date.now(),
      }, extra || {}));
      if (navigator.sendBeacon){
        navigator.sendBeacon('/__telemetry', new Blob([body], {type:'application/json'}));
      } else {
        fetch('/__telemetry', {method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true,credentials:'same-origin'}).catch(function(){});
      }
    }catch(e){}
  }
  function clip(s, n){ s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }
  function reportError(kind, msg, src, line, col, stack){
    var key = kind + '|' + msg + '|' + src + ':' + line + ':' + col;
    if (seen[key]) return;
    seen[key] = 1;
    send('client-error', {
      kind: kind,
      message: clip(msg, 240),
      source: clip(src, 240),
      line: line || 0,
      col: col || 0,
      stack: clip(stack, 800),
      ua: clip(navigator.userAgent, 200),
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive'){
    setTimeout(function(){ send('page-view'); }, 0);
  } else {
    document.addEventListener('DOMContentLoaded', function(){ send('page-view'); });
  }
  document.addEventListener('click', function(e){
    var t = e.target && e.target.closest && e.target.closest('[data-track]');
    if (!t) return;
    send('element-clicked', { label: t.getAttribute('data-track') || null });
  }, true);

  window.addEventListener('error', function(e){
    var src = (e && (e.filename || (e.target && (e.target.src || e.target.href)))) || '';
    var stack = e && e.error && e.error.stack || '';
    reportError('error', e && e.message || 'unknown', src, e && e.lineno, e && e.colno, stack);
  });
  window.addEventListener('unhandledrejection', function(e){
    var reason = e && e.reason;
    var msg = reason && (reason.message || String(reason)) || 'unhandledrejection';
    var stack = reason && reason.stack || '';
    reportError('unhandledrejection', msg, '', 0, 0, stack);
  });

  // Surface non-2xx fetches as well so the operator sees real
  // server-side failures, not just JS errors. Wraps once; idempotent.
  if (window.fetch && !window.fetch.__compassWrapped){
    var origFetch = window.fetch;
    var wrapped = function(input, init){
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      return origFetch.apply(this, arguments).then(function(res){
        if (!res.ok && url.indexOf('/__telemetry') === -1){
          send('fetch-failed', { status: res.status, url: clip(url, 240) });
        }
        return res;
      });
    };
    wrapped.__compassWrapped = true;
    window.fetch = wrapped;
  }
})();
</script>
`;
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
