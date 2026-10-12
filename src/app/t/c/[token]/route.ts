// GET /t/c/[token]?to=<encoded-url> — click-tracking redirect.
// Verifies the token (URL hash matches embedded), records a
// MailEvent kind="click", then 302s to the destination.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyTrackingToken } from "@/lib/tracking/click-token";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.pathname.split("/").pop() ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!to) return NextResponse.json({ error: "missing_destination" }, { status: 400 });

  const claims = verifyTrackingToken(token, { url: to });
  if (!claims || claims.kind !== "click") {
    // Bad or expired token. The token is what proves we wrote this
    // link, so don't redirect blind (anyone could send a link through
    // the troop's domain to a phishing page); show where it goes and
    // let the reader decide.
    return leavingPage(to);
  }

  // MailEvent requires orgId — read it off the parent MailLog.
  prisma.mailLog
    .findUnique({ where: { id: claims.mailLogId }, select: { orgId: true } })
    .then((log) => {
      if (!log) return;
      return prisma.mailEvent.create({
        data: {
          orgId: log.orgId,
          mailLogId: claims.mailLogId,
          recipient: claims.recipient,
          kind: "click",
          url: to,
        },
      });
    })
    .catch(() => {});

  return NextResponse.redirect(to);
}

function leavingPage(to: string): Response {
  let dest: URL | null = null;
  try {
    dest = new URL(to);
  } catch {}
  const ok = dest && (dest.protocol === "https:" || dest.protocol === "http:");
  const esc = (v: string) =>
    v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const body = ok
    ? `<p>This link has expired. It goes to:</p><p><strong>${esc(dest!.host)}</strong></p><p><a href="${esc(dest!.toString())}" rel="noopener noreferrer">Continue to ${esc(dest!.host)}</a></p>`
    : `<p>This link isn't valid.</p>`;
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Leaving Compass</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">${body}</body>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
