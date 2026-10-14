// /o/[slug]/admin/members/[id] — full-page member detail. Renders
// the same body as the drawer overlay; the drawer just wraps it in
// a fixed-position panel.

import {
  MemberDetailBody,
  isMemberTab,
  type MemberTab,
} from "@/components/admin/MemberDetailBody";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function AdminMemberEdit({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, id } = await params;
  await requireAdminPage(slug);
  const sp = await searchParams;
  const tab: MemberTab = isMemberTab(sp.tab) ? sp.tab : "profile";

  return (
    <MemberDetailBody
      slug={slug}
      memberId={id}
      tab={tab}
      buildTabHref={(t) => `/o/${slug}/admin/members/${id}?tab=${t}`}
      variant="page"
    />
  );
}
