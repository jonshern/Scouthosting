// GET /super-admin/billing/payments.csv?mode=live|test — every recorded
// payment, for the owner's books. Route handlers don't pass through the
// console layout, so this checks the owner itself.

import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { classifyHost } from "@/lib/tenancy/resolve";

export const runtime = "nodejs";

function cell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  // Quote everything; neutralize spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  if (classifyHost((await headers()).get("host")).kind !== "apex") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { user } = await getSession();
  if (!user?.isSuperAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const livemode = req.nextUrl.searchParams.get("mode") === "live";
  const rows = await prisma.billingPayment.findMany({
    where: { livemode },
    orderBy: { paidAt: "asc" },
    include: { org: { select: { slug: true, displayName: true } } },
  });
  const lines = [
    ["paid_at", "unit", "slug", "amount", "currency", "stripe_invoice", "stripe_customer"].map(cell).join(","),
    ...rows.map((r) =>
      [
        r.paidAt.toISOString(),
        r.org?.displayName ?? "",
        r.org?.slug ?? "",
        (r.amountCents / 100).toFixed(2),
        r.currency,
        r.stripeInvoiceId,
        r.stripeCustomerId,
      ]
        .map(cell)
        .join(","),
    ),
  ];
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="compass-payments-${livemode ? "live" : "test"}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
