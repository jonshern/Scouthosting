// "Site access" box on an adult's roster page: whether they've joined
// the unit on Compass, an invite button if not, and (for admins) their
// access level. Scouts never get accounts, so their page shows nothing.

import { getSession } from "@/lib/auth/session";
import { roleInOrg } from "@/lib/auth/role";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { AccessLevelForm, InviteMemberButton } from "@/components/admin/AccessForms";
import {
  ACCESS_HINT,
  ACCESS_LABEL,
  ACCESS_LEVELS,
  lastInvitedAt,
  memberAccess,
} from "@/lib/members/access";

export async function MemberAccessPanel({
  slug,
  org,
  member,
}: {
  slug: string;
  org: { id: string; ownerId: string | null };
  member: { id: string; email: string | null; isYouth: boolean; deletedAt: Date | null };
}) {
  if (member.isYouth || member.deletedAt) return null;
  const { user } = await getSession();
  const viewerIsAdmin = !!user && (user.isSuperAdmin || (await roleInOrg(user.id, org.id)) === "admin");
  const [access, invited] = await Promise.all([
    memberAccess(org, member.email),
    lastInvitedAt(org.id, member.id),
  ]);

  let body: React.ReactNode;
  if (!member.email) {
    body = <p className="text-sm text-muted">Add an email address above to invite them to the site.</p>;
  } else if (!access.joined) {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-ink-2">
          Not joined yet.{" "}
          {invited
            ? `Invited ${invited.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
            : "They'll get a link to make an account with this email."}
        </p>
        <InviteMemberButton
          orgSlug={slug}
          memberId={member.id}
          csrf={<CsrfTokenInput />}
          label={invited ? "Send again" : "Send invite"}
        />
      </div>
    );
  } else {
    const locked = access.isOwner || access.userId === user?.id;
    body = (
      <div className="space-y-2">
        <p className="text-sm text-ink-2">
          Joined · <strong>{ACCESS_LABEL[access.role]}</strong> access
          {access.isOwner ? " (unit owner)" : ""}.
        </p>
        {viewerIsAdmin && !locked ? (
          <AccessLevelForm
            orgSlug={slug}
            memberId={member.id}
            current={access.role}
            csrf={<CsrfTokenInput />}
            options={ACCESS_LEVELS.map((l) => ({ value: l, label: ACCESS_LABEL[l], hint: ACCESS_HINT[l] }))}
          />
        ) : null}
        {viewerIsAdmin && !locked ? (
          <p className="text-xs text-muted">
            Family: {ACCESS_HINT.parent} Leader: {ACCESS_HINT.leader} Admin: {ACCESS_HINT.admin}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section aria-label="Site access" className="card space-y-2">
      <div className="eyebrow">Site access</div>
      {body}
    </section>
  );
}
