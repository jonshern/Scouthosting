// Reports hub. Each report is a small server-rendered table that
// decrypts the roster PII it needs and nothing else. The hub itself
// is one page with anchored sections so a leader can scroll and
// print, with each section having a CSV export under .../csv.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  dietaryReport,
  birthdayReport,
  shirtSizeReport,
  scoutsByAgeReport,
} from "@/lib/reports/roster";
import { Pill, PrintButton } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Roster reports" };

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const [dietary, birthdays, shirts, ages] = await Promise.all([
    dietaryReport(org),
    birthdayReport(org),
    shirtSizeReport(org),
    scoutsByAgeReport(org),
  ]);

  // Age bucket distribution for a quick at-a-glance summary.
  const ageBuckets = new Map<string, number>();
  for (const r of ages) {
    const key =
      r.ageYears == null
        ? "Unknown"
        : r.ageYears < 11
          ? "≤10"
          : r.ageYears < 14
            ? "11–13"
            : r.ageYears < 16
              ? "14–15"
              : r.ageYears < 18
                ? "16–17"
                : "18+";
    ageBuckets.set(key, (ageBuckets.get(key) ?? 0) + 1);
  }

  return (
    <section className="space-y-12">
      <AdminPageHeader
        kicker="Reports"
        title="Roster reports"
        description="Reads off the encrypted roster fields. Use the print view for paper handouts; CSVs are also linked under each section."
        actions={<PrintButton>Print all</PrintButton>}
      />

      <nav className="flex flex-wrap gap-3 text-sm print:hidden">
        <Link href="#dietary" className="rounded-md border border-line px-3 py-1.5 hover:border-sky">
          Allergies / dietary ({dietary.length})
        </Link>
        <Link href="#birthdays" className="rounded-md border border-line px-3 py-1.5 hover:border-sky">
          Birthdays ({birthdays.length})
        </Link>
        <Link href="#shirts" className="rounded-md border border-line px-3 py-1.5 hover:border-sky">
          Shirt sizes
        </Link>
        <Link href="#ages" className="rounded-md border border-line px-3 py-1.5 hover:border-sky">
          Scouts by age ({ages.length})
        </Link>
      </nav>

      <Section
        id="dietary"
        title="Allergies & dietary flags"
        empty="No members have dietary flags or allergy notes on file."
        csv={`/o/${slug}/admin/reports/dietary.csv`}
        rows={dietary}
        columns={[
          { header: "Name", cell: (r) => r.name },
          { header: "Type", cell: (r) => (r.isYouth ? "Youth" : "Adult") },
          { header: "Patrol", cell: (r) => r.patrol ?? "—" },
          {
            header: "Flags",
            cell: (r) =>
              r.flags.length === 0 ? (
                <span className="text-slate-muted">—</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {r.flags.map((f, i) => (
                    <Pill key={i} tone="amber">{f}</Pill>
                  ))}
                </span>
              ),
          },
          { header: "Notes", cell: (r) => r.notes ?? "" },
        ]}
      />

      <Section
        id="birthdays"
        title="Upcoming birthdays"
        empty="No members have a birthdate on file."
        csv={`/o/${slug}/admin/reports/birthdays.csv`}
        rows={birthdays}
        columns={[
          { header: "Name", cell: (r) => r.name },
          { header: "Type", cell: (r) => (r.isYouth ? "Youth" : "Adult") },
          { header: "Patrol", cell: (r) => r.patrol ?? "—" },
          {
            header: "Birthday",
            cell: (r) =>
              r.birthdate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
          },
          { header: "Age now", cell: (r) => r.ageNow },
          {
            header: "Next",
            cell: (r) =>
              r.nextBirthday.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              }),
          },
        ]}
      />

      <Section
        id="shirts"
        title="Shirt sizes"
        empty="No members on file."
        csv={`/o/${slug}/admin/reports/shirts.csv`}
        rows={shirts}
        columns={[
          { header: "Name", cell: (r) => r.name },
          { header: "Type", cell: (r) => (r.isYouth ? "Youth" : "Adult") },
          { header: "Patrol", cell: (r) => r.patrol ?? "—" },
          {
            header: "Size",
            cell: (r) =>
              r.shirtSize ? (
                <Pill tone="accent">{r.shirtSize}</Pill>
              ) : (
                <span className="text-slate-muted">—</span>
              ),
          },
        ]}
      />

      <div id="ages" className="space-y-4">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink">
            Scouts by age
          </h2>
          <a
            href={`/o/${slug}/admin/reports/ages.csv`}
            className="text-sm text-slate-soft hover:text-sky print:hidden"
          >
            Download CSV →
          </a>
        </header>
        {ageBuckets.size > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs">
            {[...ageBuckets.entries()]
              .sort()
              .map(([k, v]) => (
                <Pill key={k} tone="neutral">
                  {k} · {v}
                </Pill>
              ))}
          </div>
        ) : null}
        <Section
          id="ages-table"
          title=""
          empty="No youth members on file."
          csv={null}
          rows={ages}
          columns={[
            { header: "Name", cell: (r) => r.name },
            { header: "Patrol", cell: (r) => r.patrol ?? "—" },
            { header: "Age", cell: (r) => r.ageYears ?? "—" },
            {
              header: "Birthdate",
              cell: (r) =>
                r.birthdate
                  ? r.birthdate.toLocaleDateString()
                  : "—",
            },
          ]}
        />
      </div>
    </section>
  );
}

type Column<T> = { header: string; cell: (row: T) => React.ReactNode };

function Section<T>({
  id,
  title,
  empty,
  csv,
  rows,
  columns,
}: {
  id: string;
  title: string;
  empty: string;
  csv: string | null;
  rows: T[];
  columns: Column<T>[];
}) {
  return (
    <div id={id} className="space-y-3">
      {title ? (
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink">{title}</h2>
          {csv ? (
            <a
              href={csv}
              className="text-sm text-slate-soft hover:text-sky print:hidden"
            >
              Download CSV →
            </a>
          ) : null}
        </header>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-slate-muted">{empty}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              <tr>
                {columns.map((c, i) => (
                  <th key={i} className="px-4 py-2 font-semibold">
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c, j) => (
                    <td key={j} className="px-4 py-3 align-top text-slate-soft">
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
