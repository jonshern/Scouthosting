import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { healthFormExpires, healthFormReport, type HealthState } from "@/lib/members/health-forms";
import { buildCsv, csvHeaders } from "@/lib/csv";
import { organizerStandingOk } from "@/lib/admin/guard";

const WORDS: Record<HealthState, string> = { current: "Current", expiring: "Expiring soon", expired: "Expired", missing: "Missing" };
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

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
  const rows = await healthFormReport(org);
  const body = buildCsv(
    ["Name", "Type", "Patrol", "Parts A and B dated", "Good through", "Status", "Doctor's exam dated", "Good through", "Status"],
    rows.map((r) => [
      r.name,
      r.isYouth ? "Youth" : "Adult",
      r.patrol ?? "",
      ymd(r.formOn),
      r.formOn ? ymd(healthFormExpires(r.formOn)) : "",
      WORDS[r.form],
      ymd(r.examOn),
      r.examOn ? ymd(healthFormExpires(r.examOn)) : "",
      WORDS[r.exam],
    ]),
  );
  return new NextResponse(body, { headers: csvHeaders(`${slug}-health-forms.csv`) });
}
