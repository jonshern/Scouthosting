// Security response headers. Mounted globally so every response carries
// them. Trusted Types and removing 'unsafe-inline' from script-src are
// still on the security backlog — both require refactoring the inline
// onsubmit/onclick handlers (and probably moving CSS into a stylesheet).
//
// What's set:
//   Content-Security-Policy
//     default-src 'self'
//     script-src  'self' 'unsafe-inline'        ← inline handlers; tighten later
//     style-src   'self' 'unsafe-inline' fonts.googleapis.com
//     font-src    'self' fonts.gstatic.com
//     img-src     'self' data: blob: https:     ← Google Maps + Scoutbook + uploads
//     connect-src 'self' https:                 ← Resend + Google APIs
//     form-action 'self'
//     frame-ancestors 'none'
//     base-uri    'self'
//     object-src  'none'
//   X-Content-Type-Options: nosniff
//   X-Frame-Options: DENY                       (defence in depth alongside CSP)
//   Referrer-Policy: strict-origin-when-cross-origin
//   Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
//   Cross-Origin-Opener-Policy: same-origin
//   Cross-Origin-Resource-Policy: same-origin
//   Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
//                              (production only — HSTS on a dev cert is awful)
//
// All header values are static strings so this middleware is essentially
// free at runtime.

const CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: blob: https:; " +
  "connect-src 'self' https:; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'; " +
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com; " +
  "base-uri 'self'; " +
  "object-src 'none'";

const PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()";

export function securityHeaders(req, res, next) {
  // Static headers — set once per response.
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

  // HSTS only in production, and only over HTTPS — issuing it over plain
  // HTTP (or on a self-signed dev cert) breaks subsequent dev sessions.
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  next();
}
