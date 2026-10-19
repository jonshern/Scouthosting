// /super-admin/architecture — operator-facing snapshot of the stack +
// the security posture. Renders straight off src/content/architecture.ts
// so the docs and the running system agree by construction. Live values
// (master-key configured, per-org coverage) are computed at request time.

import { prisma } from "@/lib/db";
import {
  ENCRYPTED_FIELDS,
  PLAINTEXT_BY_DESIGN,
  STACK_MANIFEST,
  VERIFY_RUNBOOK,
} from "@/content/architecture";
import { masterKeyConfigured } from "@/lib/encryption";

export const dynamic = "force-dynamic";

type CoverageRow = {
  slug: string;
  displayName: string;
  hasVault: boolean;
  keyVersion: number;
  keyRotatedAt: Date | null;
  recoveryFingerprint: string | null;
  recoveryAcknowledgedAt: Date | null;
  members: number;
  membersEncrypted: number;
  photos: number;
  photosEncrypted: number;
};

async function loadCoverage(): Promise<CoverageRow[]> {
  const orgs = await prisma.org.findMany({
    select: {
      id: true,
      slug: true,
      displayName: true,
      encryptedDek: true,
      keyVersion: true,
      keyRotatedAt: true,
      recoveryVerifier: true,
      recoveryAcknowledgedAt: true,
    },
    orderBy: { slug: "asc" },
  });
  const rows: CoverageRow[] = [];
  for (const o of orgs) {
    const [members, membersEncrypted, photos, photosEncrypted] = await Promise.all([
      prisma.member.count({ where: { orgId: o.id, deletedAt: null } }),
      prisma.member.count({
        where: { orgId: o.id, deletedAt: null, encFirstName: { not: null } },
      }),
      prisma.photo.count({ where: { orgId: o.id } }),
      prisma.photo.count({ where: { orgId: o.id, encrypted: true } }),
    ]);
    rows.push({
      slug: o.slug,
      displayName: o.displayName,
      hasVault: !!o.encryptedDek,
      keyVersion: o.keyVersion,
      keyRotatedAt: o.keyRotatedAt,
      recoveryFingerprint: o.recoveryVerifier ? o.recoveryVerifier.slice(0, 8) : null,
      recoveryAcknowledgedAt: o.recoveryAcknowledgedAt,
      members,
      membersEncrypted,
      photos,
      photosEncrypted,
    });
  }
  return rows;
}

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export default async function ArchitecturePage() {
  const coverage = await loadCoverage();
  const masterKey = masterKeyConfigured();

  return (
    <section className="space-y-10">
      <header>
        <h2 className="font-display font-semibold text-2xl">Architecture &amp; Security</h2>
        <p className="text-ink-muted text-sm mt-1">
          Live view of what Compass runs on and how member data is protected.
        </p>
      </header>

      <section className="space-y-3">
        <h3 className="font-display font-semibold text-xl">Stack</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-ink-muted/15">
              <tr>
                <th className="py-2 pr-4">Layer</th>
                <th className="pr-4">Tool</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {STACK_MANIFEST.map((s) => (
                <tr key={s.layer} className="border-b border-ink-muted/10">
                  <td className="py-2 pr-4 align-top">{s.layer}</td>
                  <td className="pr-4 align-top font-medium">{s.tool}</td>
                  <td className="text-ink-muted align-top">{s.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre className="text-xs leading-snug bg-ink-muted/5 rounded p-4 overflow-x-auto">
{`        ┌────────────────┐         ┌─────────────────┐
        │ Web (Next.js)  │◀──HTTP──▶│ Mobile (Expo)   │
        └─┬──────────────┘         └─────────────────┘
          │ server actions / route handlers
          ▼
        ┌────────────────┐
        │ Postgres 16     │ ← encrypted bytea columns (Member, Photo)
        └─┬──────────────┘
          │ pg-boss queue rows
          ▼
        ┌────────────────┐         ┌─────────────────┐
        │ Worker (jobs)  │◀────────│ Object storage  │ (encrypted blobs)
        └────────────────┘         └─────────────────┘`}
        </pre>
      </section>

      <section className="space-y-4">
        <h3 className="font-display font-semibold text-xl">Security</h3>

        <div className="card flex items-center justify-between">
          <div>
            <div className="font-medium">MASTER_KEY env var</div>
            <div className="text-xs text-ink-muted">
              Wraps every per-org DEK. Required in production; ephemeral fallback in dev/test.
            </div>
          </div>
          <span
            className={
              "px-2 py-1 rounded text-xs font-medium " +
              (masterKey ? "bg-done-soft text-done-text" : "bg-attention-soft text-attention-text")
            }
          >
            {masterKey ? "configured" : "ephemeral / unset"}
          </span>
        </div>

        <div>
          <h4 className="font-medium mb-2">Encrypted fields</h4>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-ink-muted/15">
              <tr>
                <th className="py-2 pr-4">Model</th>
                <th className="pr-4">Field</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {ENCRYPTED_FIELDS.map((f) => (
                <tr key={`${f.model}.${f.field}`} className="border-b border-ink-muted/10">
                  <td className="py-2 pr-4">{f.model}</td>
                  <td className="pr-4 font-medium">{f.field}</td>
                  <td className="text-ink-muted">{f.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h4 className="font-medium mb-2">Plaintext by design</h4>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-ink-muted/15">
              <tr>
                <th className="py-2 pr-4">Model</th>
                <th className="pr-4">Field</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {PLAINTEXT_BY_DESIGN.map((f) => (
                <tr key={`${f.model}.${f.field}`} className="border-b border-ink-muted/10">
                  <td className="py-2 pr-4">{f.model}</td>
                  <td className="pr-4 font-medium">{f.field}</td>
                  <td className="text-ink-muted">{f.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h4 className="font-medium mb-2">Per-org coverage</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-ink-muted/15">
                <tr>
                  <th className="py-2 pr-4">Org</th>
                  <th className="pr-4">Vault</th>
                  <th className="pr-4">Key v</th>
                  <th className="pr-4">Recovery</th>
                  <th className="pr-4">Members enc</th>
                  <th>Photos enc</th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((c) => (
                  <tr key={c.slug} className="border-b border-ink-muted/10">
                    <td className="py-2 pr-4 align-top">
                      <div className="font-medium">{c.displayName}</div>
                      <div className="text-xs text-ink-muted">{c.slug}</div>
                    </td>
                    <td className="pr-4 align-top">
                      <span
                        className={
                          "px-2 py-0.5 rounded text-xs " +
                          (c.hasVault ? "bg-done-soft text-done-text" : "bg-danger-soft text-danger")
                        }
                      >
                        {c.hasVault ? "yes" : "missing"}
                      </span>
                    </td>
                    <td className="pr-4 align-top">{c.keyVersion}</td>
                    <td className="pr-4 align-top text-xs">
                      {c.recoveryFingerprint ? (
                        <>
                          <code>{c.recoveryFingerprint}…</code>
                          <div className="text-ink-muted">
                            {c.recoveryAcknowledgedAt ? "acknowledged" : "not acked"}
                          </div>
                        </>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="pr-4 align-top">
                      {c.membersEncrypted} / {c.members} ({pct(c.membersEncrypted, c.members)})
                    </td>
                    <td className="align-top">
                      {c.photosEncrypted} / {c.photos} ({pct(c.photosEncrypted, c.photos)})
                    </td>
                  </tr>
                ))}
                {coverage.length === 0 && (
                  <tr>
                    <td className="py-3 text-ink-muted" colSpan={6}>
                      No orgs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-2">How to verify</h4>
          <ol className="space-y-3 text-sm">
            {VERIFY_RUNBOOK.map((r, i) => (
              <li key={i} className="card">
                <div className="font-medium">
                  {i + 1}. {r.step}
                </div>
                {r.cmd && (
                  <pre className="mt-2 text-xs bg-ink-muted/10 p-2 rounded overflow-x-auto">{r.cmd}</pre>
                )}
                <div className="text-xs text-ink-muted mt-2">{r.expect}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </section>
  );
}
