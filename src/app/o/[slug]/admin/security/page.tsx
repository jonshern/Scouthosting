// /o/[slug]/admin/security — per-org encryption status + verification
// guidance for leaders. The destructive operations (rotate passphrase,
// regenerate recovery code) live behind dedicated server actions in a
// follow-up; this page is the always-visible status surface.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export default async function OrgSecurityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({
    where: { slug },
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
  });
  if (!org) notFound();

  const [memberCount, encryptedMembers, photoCount, encryptedPhotos] = await Promise.all([
    prisma.member.count({ where: { orgId: org.id, deletedAt: null } }),
    prisma.member.count({
      where: { orgId: org.id, deletedAt: null, encFirstName: { not: null } },
    }),
    prisma.photo.count({ where: { orgId: org.id } }),
    prisma.photo.count({ where: { orgId: org.id, encrypted: true } }),
  ]);

  const vaultOk = !!org.encryptedDek;

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Settings"
        title="Security"
        description={`How ${org.displayName}'s roster and photo data is protected.`}
      />

      <div className="card space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-medium">Encryption vault</div>
          <span
            className={
              "px-2 py-0.5 rounded text-xs " +
              (vaultOk ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")
            }
          >
            {vaultOk ? "active" : "missing"}
          </span>
        </div>
        <dl className="text-sm grid grid-cols-2 gap-y-1">
          <dt className="text-slate-muted">Key version</dt>
          <dd>{org.keyVersion}</dd>
          <dt className="text-slate-muted">Last rotated</dt>
          <dd>{org.keyRotatedAt ? new Date(org.keyRotatedAt).toLocaleString() : "—"}</dd>
          <dt className="text-slate-muted">Recovery code fingerprint</dt>
          <dd>
            {org.recoveryVerifier ? (
              <code className="text-xs">{org.recoveryVerifier.slice(0, 8)}…</code>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-slate-muted">Recovery code stored?</dt>
          <dd>
            {org.recoveryAcknowledgedAt
              ? `Confirmed ${new Date(org.recoveryAcknowledgedAt).toLocaleDateString()}`
              : "Not yet acknowledged"}
          </dd>
        </dl>
      </div>

      <div className="card space-y-3">
        <div className="font-medium">What&apos;s encrypted</div>
        <ul className="text-sm list-disc pl-5 space-y-1">
          <li>
            <strong>Member names, phone, address.</strong> {encryptedMembers} of {memberCount}{" "}
            members are encrypted.
          </li>
          <li>
            <strong>Photos.</strong> {encryptedPhotos} of {photoCount} photos are encrypted on disk.
          </li>
          <li>
            <strong>Email stays plaintext on purpose</strong> so the system can still send
            broadcasts, magic-link sign-ins, and chat membership lookups without you having to
            unlock anything.
          </li>
        </ul>
      </div>

      <div className="card space-y-3">
        <div className="font-medium">How to verify (leader-friendly)</div>
        <ol className="text-sm list-decimal pl-5 space-y-2">
          <li>
            Edit a member, change their phone number, save. Watch the network panel — the request
            sends a phone number, but the row in the database stores ciphertext.
          </li>
          <li>
            Upload a photo, then download the file directly from the server&apos;s storage area
            (your hosting provider&apos;s console). Open it in a viewer — the file won&apos;t open
            because it&apos;s ciphertext until Compass decrypts it on serve.
          </li>
          <li>
            Sign in elsewhere and visit a roster page. Names render correctly, proving the round-
            trip works for authorized users.
          </li>
        </ol>
      </div>

      <div className="card space-y-2 text-sm">
        <div className="font-medium">Recovery code</div>
        <p>
          The recovery code we generated when this site was created is your backup if you ever
          need to re-key the vault (for example, if your hosting provider rotates the master key
          unexpectedly). It is shown <strong>once</strong> and never stored on our servers.
        </p>
        <p className="text-slate-soft">
          Lost yours? File a support request and we&apos;ll generate a new one. The current code
          stops working when a new one is issued.
        </p>
      </div>
    </section>
  );
}
