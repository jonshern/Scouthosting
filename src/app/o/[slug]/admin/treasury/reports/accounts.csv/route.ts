import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canManageTreasury } from "@/lib/auth/treasury-access";
import { accountBalancesReport } from "@/lib/treasury/reports";
import { buildCsv, csvHeaders } from "@/lib/csv";
import { centsToDollars } from "@/lib/treasury/money";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { user } = await getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canManageTreasury(user, org.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const rows = await accountBalancesReport(org, { onlyNonZero: false });
  return new NextResponse(
    buildCsv(
      ["Member", "Patrol", "Balance"],
      rows.map((r) => [r.scoutName, r.patrol ?? "", centsToDollars(r.balanceCents)]),
    ),
    { headers: csvHeaders(`${slug}-account-balances.csv`) },
  );
}
