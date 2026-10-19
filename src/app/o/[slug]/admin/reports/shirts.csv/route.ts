import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { shirtSizeReport } from "@/lib/reports/roster";
import { buildCsv, csvHeaders } from "@/lib/csv";
import { organizerStandingOk } from "@/lib/admin/guard";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
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
  const rows = await shirtSizeReport(org);
  const body = buildCsv(
    ["Name", "Type", "Patrol", "Shirt size"],
    rows.map((r) => [r.name, r.isYouth ? "Youth" : "Adult", r.patrol ?? "", r.shirtSize ?? ""]),
  );
  return new NextResponse(body, { headers: csvHeaders(`${slug}-shirts.csv`) });
}
