import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { CustomPageForm } from "@/components/admin/CustomPageForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function NewCustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <section className="space-y-10">
      <AdminPageHeader kicker="Site" title="New page" />
      <CustomPageForm orgSlug={slug} csrf={<CsrfTokenInput />} />
    </section>
  );
}
