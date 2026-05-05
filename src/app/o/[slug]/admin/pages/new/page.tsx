import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { CustomPageForm } from "@/components/admin/CustomPageForm";

export default async function NewCustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <section className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">New page</h1>
      <CustomPageForm orgSlug={slug} csrf={<CsrfTokenInput />} />
    </section>
  );
}
