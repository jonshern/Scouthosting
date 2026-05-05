// POST /api/v1/push/register — register a device token for push.
// Body: { token, provider?, deviceLabel?, platform? }.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";

export const runtime = "nodejs";

export const POST = withBearerAuth(async (req: NextRequest, { user }) => {
  let body: {
    token?: string;
    provider?: string;
    deviceLabel?: string;
    platform?: string;
  };
  try {
    body = (await req.json()) as never;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const token = String(body.token || "").trim();
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });
  const provider = ["expo", "webpush", "apns", "fcm"].includes(String(body.provider))
    ? String(body.provider)
    : "expo";

  // Upsert by unique token. Re-registering the same token from another
  // user moves it (one device → one user at a time).
  const row = await prisma.pushDevice.upsert({
    where: { token },
    create: {
      userId: user.id,
      token,
      provider,
      deviceLabel: body.deviceLabel ? String(body.deviceLabel).slice(0, 80) : null,
      platform: body.platform ? String(body.platform).slice(0, 16) : null,
    },
    update: {
      userId: user.id,
      provider,
      deviceLabel: body.deviceLabel ? String(body.deviceLabel).slice(0, 80) : null,
      platform: body.platform ? String(body.platform).slice(0, 16) : null,
      retiredAt: null,
      retiredReason: null,
    },
  });
  return NextResponse.json({ id: row.id });
});
