import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canManageTreasury } from "@/lib/auth/treasury-access";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { buildCsv, csvHeaders } from "@/lib/csv";
import { centsToDollars } from "@/lib/treasury/money";
import { organizerStandingOk } from "@/lib/admin/guard";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { user } = await getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canManageTreasury(user, org.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await organizerStandingOk(user.id))) {
    return NextResponse.json({ error: "two_step_required" }, { status: 403 });
  }
  const url = new URL(req.url);
  const fund = url.searchParams.get("fund");
  const member = url.searchParams.get("member");
  const type = url.searchParams.get("type");

  const rows = await prisma.transaction.findMany({
    where: {
      orgId: org.id,
      ...(fund ? { fundId: fund } : {}),
      ...(member ? { memberId: member } : {}),
      ...(type ? { type } : {}),
    },
    orderBy: [{ postedAt: "desc" }],
    include: { fund: true },
    take: 5000,
  });

  const memberIds = [...new Set(rows.map((r) => r.memberId).filter(Boolean) as string[])];
  const labels = new Map<string, string>();
  if (org.encryptedDek && memberIds.length > 0) {
    const dek = unwrapDekWithMaster(org);
    const members = await prisma.member.findMany({ where: { id: { in: memberIds } } });
    for (const m of members) {
      const pii = decryptMemberPii(m, dek, org.id);
      labels.set(m.id, `${pii.firstName} ${pii.lastName}`.trim());
    }
  }

  const body = buildCsv(
    ["Posted", "Fund", "Type", "Member", "Description", "Amount", "TxnId", "Reverses"],
    rows.map((r) => [
      r.postedAt.toISOString(),
      r.fund.name,
      r.type,
      r.memberId ? labels.get(r.memberId) ?? "" : "",
      r.description,
      centsToDollars(r.amountCents),
      r.id,
      r.reversesId ?? "",
    ]),
  );
  return new NextResponse(body, { headers: csvHeaders(`${slug}-ledger.csv`) });
}
