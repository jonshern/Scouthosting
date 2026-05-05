// GET /t/o/[token].png — open-pixel. 1x1 transparent PNG; record
// MailEvent kind="open" if the token verifies.
//
// Token comes in as "<token>.png"; we strip the suffix.

import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyTrackingToken } from "@/lib/tracking/click-token";

export const runtime = "nodejs";

const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=",
  "base64",
);

export async function GET(req: NextRequest) {
  const last = req.nextUrl.pathname.split("/").pop() ?? "";
  const token = last.replace(/\.png$/i, "");
  const claims = verifyTrackingToken(token);
  if (claims && claims.kind === "open") {
    prisma.mailLog
      .findUnique({ where: { id: claims.mailLogId }, select: { orgId: true } })
      .then((log) => {
        if (!log) return;
        return prisma.mailEvent.create({
          data: {
            orgId: log.orgId,
            mailLogId: claims.mailLogId,
            recipient: claims.recipient,
            kind: "open",
          },
        });
      })
      .catch(() => {});
  }
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, max-age=0",
      "Content-Length": String(PIXEL.length),
    },
  });
}
