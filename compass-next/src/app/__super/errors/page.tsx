// /__super/errors — recent ErrorLog rows. The error tracker writes
// here from any captureError() callsite.

import { prisma } from "@/lib/db";

export default async function SuperErrorsPage() {
  const errors = await prisma.errorLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      fingerprint: true,
      errorName: true,
      message: true,
      method: true,
      path: true,
      orgId: true,
      release: true,
      environment: true,
    },
  });

  return (
    <section>
      <h2 className="font-display text-xl mb-4">Recent errors ({errors.length})</h2>
      {errors.length === 0 ? (
        <p className="text-ink-muted">No errors recorded.</p>
      ) : (
        <ul className="space-y-3">
          {errors.map((e) => (
            <li key={e.id} className="card text-sm">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-mono text-xs text-ink-muted">
                  {e.createdAt.toISOString()}
                </span>
                <span className="font-medium">{e.errorName || "Error"}</span>
                {e.method && e.path ? (
                  <span className="text-xs text-ink-muted">
                    {e.method} {e.path}
                  </span>
                ) : null}
              </div>
              <p className="text-sm">{e.message}</p>
              <p className="mt-1 text-xs text-ink-muted">
                fingerprint: <span className="font-mono">{e.fingerprint.slice(0, 12)}</span>
                {e.release ? ` · release ${e.release}` : ""}
                {e.environment ? ` · env ${e.environment}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
