// Origin-auth middleware.
//
// When ORIGIN_AUTH_SECRET is set, every incoming request must carry a
// matching X-Origin-Auth header — Cloudflare injects it via a Transform
// Rule (see infra/gcp/cloudflare.tf). Without it the request is rejected
// with 403, so anyone hitting the *.run.app URL directly fails the gate.
//
// Skipped in dev (when the env var isn't set) so local development
// continues to work without Cloudflare in front.

import crypto from "node:crypto";

const SECRET = process.env.ORIGIN_AUTH_SECRET || "";

export function originAuth(req, res, next) {
  if (!SECRET) return next(); // dev / unset → no-op

  const got = req.headers["x-origin-auth"] || "";
  if (got.length !== SECRET.length) {
    return res.status(403).type("text/plain").send("Forbidden");
  }
  // Constant-time compare to avoid timing attacks.
  const a = Buffer.from(got);
  const b = Buffer.from(SECRET);
  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(403).type("text/plain").send("Forbidden");
  }
  next();
}
