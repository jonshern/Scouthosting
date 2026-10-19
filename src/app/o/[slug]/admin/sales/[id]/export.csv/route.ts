// Consolidated council export — one row per (order, item). Treasurers
// hand this to the council popcorn coordinator (or import into the
// council's tooling).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { buildCsv, csvHeaders } from "@/lib/csv";
import { centsToDollars } from "@/lib/treasury/money";
import { organizerStandingOk } from "@/lib/admin/guard";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { user } = await getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await organizerStandingOk(user.id))) {
    return NextResponse.json({ error: "two_step_required" }, { status: 403 });
  }
  const campaign = await prisma.salesCampaign.findUnique({
    where: { id, orgId: org.id },
  });
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const orders = await prisma.salesOrder.findMany({
    where: { orgId: org.id, campaignId: campaign.id },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: "asc" },
  });

  const dek = org.encryptedDek ? unwrapDekWithMaster(org) : null;
  const orgId = org.id;
  const memberCache = new Map<string, string>();
  async function nameOf(memberId: string): Promise<string> {
    if (memberCache.has(memberId)) return memberCache.get(memberId)!;
    if (!dek) return "(encrypted)";
    const m = await prisma.member.findUnique({ where: { id: memberId } });
    if (!m) return "(removed)";
    const pii = decryptMemberPii(m, dek, orgId);
    const name = `${pii.firstName} ${pii.lastName}`.trim();
    memberCache.set(memberId, name);
    return name;
  }

  const headerRow: readonly string[] = [
    "Order ID",
    "Order Date",
    "Status",
    "Source",
    "Scout",
    "Buyer Name",
    "Buyer Email",
    "Buyer Phone",
    "Buyer Address",
    "Product SKU",
    "Product Name",
    "Quantity",
    "Unit Price",
    "Line Total",
  ];
  const rows: unknown[][] = [];
  for (const o of orders) {
    const scoutName = o.scoutMemberId ? await nameOf(o.scoutMemberId) : "";
    for (const item of o.items) {
      rows.push([
        o.id,
        o.createdAt.toISOString().slice(0, 10),
        o.status,
        o.source,
        scoutName,
        o.buyerName,
        o.buyerEmail ?? "",
        o.buyerPhone ?? "",
        o.buyerAddress ?? "",
        item.product.sku,
        item.product.name,
        item.quantity,
        centsToDollars(item.priceCentsAtOrder),
        centsToDollars(item.priceCentsAtOrder * item.quantity),
      ]);
    }
  }

  const body = buildCsv(headerRow, rows);
  const safeName = campaign.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(body, { headers: csvHeaders(`${slug}-${safeName}-orders.csv`) });
}
