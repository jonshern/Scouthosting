import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { EventForm } from "@/components/admin/EventForm";

export default async function NewEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <section className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">New event</h1>
      <EventForm orgSlug={slug} csrf={<CsrfTokenInput />} />
    </section>
  );
}
