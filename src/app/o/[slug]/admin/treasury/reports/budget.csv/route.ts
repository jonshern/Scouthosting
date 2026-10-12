import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canManageTreasury } from "@/lib/auth/treasury-access";
import { budgetVsActualReport } from "@/lib/treasury/reports";
import { buildCsv, csvHeaders } from "@/lib/csv";
import { centsToDollars } from "@/lib/treasury/money";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const fyId = url.searchParams.get("fy");
  if (!fyId) return NextResponse.json({ error: "missing_fy" }, { status: 400 });
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { user } = await getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canManageTreasury(user, org.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const rows = await budgetVsActualReport({ org, fiscalYearId: fyId });
  return new NextResponse(
    buildCsv(
      ["Fund", "Expected", "Actual", "Delta", "Notes"],
      rows.map((r) => [
        r.fundName,
        centsToDollars(r.expectedCents),
        centsToDollars(r.actualCents),
        centsToDollars(r.actualCents - r.expectedCents),
        r.notes ?? "",
      ]),
    ),
    { headers: csvHeaders(`${slug}-budget-vs-actual.csv`) },
  );
}
