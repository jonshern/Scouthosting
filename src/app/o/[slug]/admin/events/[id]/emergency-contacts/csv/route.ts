// CSV export of an event's emergency contact list. Same data as the
// printable page, one row per attendee. Guardian columns are flattened
// into "Guardian 1 / Guardian 2" pairs (most rosters have at most two).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { emergencyContactsForEvent } from "@/lib/events/emergency-contacts";
import { buildCsv, csvHeaders } from "@/lib/csv";

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

  const event = await prisma.event.findUnique({
    where: { id, orgId: org.id },
    select: { id: true, title: true, startsAt: true },
  });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const contacts = await emergencyContactsForEvent(org, event.id);

  const header = [
    "First name",
    "Last name",
    "Type",
    "Patrol",
    "Direct phone",
    "Direct email",
    "Guardian 1 name",
    "Guardian 1 phone",
    "Guardian 1 email",
    "Guardian 2 name",
    "Guardian 2 phone",
    "Guardian 2 email",
    "Notes",
  ] as const;

  const rows = contacts.map((c) => [
    c.scoutFirstName,
    c.scoutLastName,
    c.isYouth ? "Youth" : "Adult",
    c.patrol ?? "",
    c.scoutPhone ?? "",
    c.scoutEmail ?? "",
    c.guardians[0]?.name ?? "",
    c.guardians[0]?.phone ?? "",
    c.guardians[0]?.email ?? "",
    c.guardians[1]?.name ?? "",
    c.guardians[1]?.phone ?? "",
    c.guardians[1]?.email ?? "",
    c.notes ?? "",
  ]);

  const body = buildCsv(header, rows);
  const safeTitle = event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
  const date = event.startsAt.toISOString().slice(0, 10);
  const filename = `emergency-contacts-${safeTitle}-${date}.csv`;
  return new NextResponse(body, { headers: csvHeaders(filename) });
}
