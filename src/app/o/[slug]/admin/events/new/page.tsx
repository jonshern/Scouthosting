import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { EventForm } from "@/components/admin/EventForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function NewEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <section className="space-y-10">
      <AdminPageHeader kicker="Calendar" title="New event" />
      <EventForm orgSlug={slug} csrf={<CsrfTokenInput />} />
    </section>
  );
}
