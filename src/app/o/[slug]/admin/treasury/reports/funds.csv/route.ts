import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { fundBalancesReport } from "@/lib/treasury/reports";
import { buildCsv, csvHeaders } from "@/lib/csv";
import { centsToDollars } from "@/lib/treasury/money";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { user } = await getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
