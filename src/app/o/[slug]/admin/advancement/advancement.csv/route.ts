import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { unitAdvancement } from "@/lib/advancement/unit";
import { buildCsv, csvHeaders } from "@/lib/csv";
import { organizerStandingOk } from "@/lib/admin/guard";

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export async function GET(
  req: Request,
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
  const patrol = new URL(req.url).searchParams.get("patrol")?.trim().slice(0, 50) || null;
  const data = await unitAdvancement(org, { patrol });
  const body = buildCsv(
    ["Scout", "Patrol", "Rank", "Rank since", "Next rank", "Next rank done", "Next rank total", "Merit badges earned", "Eagle-required earned", "Working on", "Waiting for sign-off"],
    data.scouts.map((s) => {
      const n = s.summary.nextRank;
      return [
        s.name,
        s.patrol ?? "",
        s.summary.rank?.name ?? "",
        ymd(s.summary.rank?.since),
        n?.name ?? "",
        n?.total ? String(n.completed) : "",
        n?.total ? String(n.total) : "",
        String(s.summary.badgesEarned.length),
        String(s.summary.badgesEarned.filter((b) => b.eagle).length),
        s.summary.badgesInProgress.map((b) => b.name).join("; "),
        String(s.waiting),
      ];
    }),
  );
  return new NextResponse(body, { headers: csvHeaders(`${slug}-advancement.csv`) });
}
