import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canManageTreasury } from "@/lib/auth/treasury-access";
import { fundBalancesReport } from "@/lib/treasury/reports";
import { buildCsv, csvHeaders } from "@/lib/csv";
import { centsToDollars } from "@/lib/treasury/money";
import { organizerStandingOk } from "@/lib/admin/guard";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
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
  const now = new Date();
  const rows = await fundBalancesReport({
    org,
    fyStart: new Date(now.getFullYear(), 0, 1),
    fyEnd: new Date(now.getFullYear(), 11, 31),
  });
  return new NextResponse(
    buildCsv(
      ["Fund", "Code", "Balance", "FYTD income", "FYTD expense"],
      rows.map((r) => [r.name, r.code, centsToDollars(r.balanceCents), centsToDollars(r.fytdIncomeCents), centsToDollars(r.fytdExpenseCents)]),
    ),
    { headers: csvHeaders(`${slug}-fund-balances.csv`) },
  );
}
