import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { yearOverYearReport } from "@/lib/treasury/reports";
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
  const rows = await yearOverYearReport({ org });
  return new NextResponse(
    buildCsv(
      ["Fiscal year", "Income", "Expense", "Net"],
      rows.map((r) => [
        r.label,
        centsToDollars(r.totalIncomeCents),
        centsToDollars(r.totalExpenseCents),
        centsToDollars(r.netCents),
      ]),
    ),
    { headers: csvHeaders(`${slug}-yoy.csv`) },
  );
}
