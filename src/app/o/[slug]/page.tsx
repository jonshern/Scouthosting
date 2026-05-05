import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { renderMarkdownLite } from "@/lib/markdown";
import { readCustomBlocks } from "@/lib/homepage/sections";

export default async function OrgHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({
    where: { slug },
    include: {
      announcements: { orderBy: { createdAt: "desc" }, take: 3 },
      page: true,
    },
  });
  if (!org) notFound();
  const heroHeadline = org.page?.heroHeadline ?? `${org.unitType} ${org.unitNumber}`;
  const heroLede =
    org.page?.heroLede ??
    org.tagline ??
    `${org.charterOrg} • ${org.city}, ${org.state}`;
  const blocks = readCustomBlocks(org.page);
  return (
    <section className="mx-auto max-w-content px-6 py-16">
      <h1 className="font-display text-4xl md:text-5xl font-semibold">{heroHeadline}</h1>
      {heroLede && (
        <div
          className="mt-2 text-ink-muted prose prose-stone"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: renderMarkdownLite(heroLede) }}
        />
      )}

      {blocks.length > 0 && (
        <div className="mt-12 space-y-10">
          {blocks.map((raw) => {
            const b = raw as Record<string, string> & { type: string };
            if (b.type === "text") {
              return (
                <section key={b.id}>
                  {b.title && (
                    <h2 className="font-display text-2xl font-semibold">{b.title}</h2>
                  )}
                  {b.body && (
                    <div
                      className="mt-2 prose prose-stone"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: renderMarkdownLite(b.body) }}
                    />
                  )}
                </section>
              );
            }
            if (b.type === "image") {
              return (
                <figure key={b.id}>
                  {b.filename && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/uploads/${b.filename}`}
                      alt={b.alt || ""}
                      className="w-full rounded-md"
                    />
                  )}
                  {b.caption && (
                    <figcaption className="mt-1 text-sm text-ink-muted">
                      {b.caption}
                    </figcaption>
                  )}
                </figure>
              );
            }
            if (b.type === "cta") {
              return (
                <section key={b.id} className="card">
                  {b.title && (
                    <h2 className="font-display text-2xl font-semibold">{b.title}</h2>
                  )}
                  {b.body && <p className="mt-2 text-ink-muted">{b.body}</p>}
                  {b.buttonLabel && b.buttonLink && (
                    <a href={b.buttonLink} className="btn-primary mt-3 inline-block">
                      {b.buttonLabel}
                    </a>
                  )}
                </section>
              );
            }
            return null;
          })}
        </div>
      )}

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">Meetings</h2>
          <p className="mt-2 text-ink-muted">
            {org.meetingDay} at {org.meetingTime}.
            {org.meetingLocation && <> {org.meetingLocation}.</>}
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">Recent announcements</h2>
          <ul className="mt-2 space-y-3">
            {org.announcements.length === 0 && (
              <li className="text-ink-muted">Nothing posted yet.</li>
            )}
            {org.announcements.map((a) => (
              <li key={a.id} className="card">
                <div className="font-medium">{a.title}</div>
                <div className="mt-1 text-sm text-ink-muted">
                  {new Date(a.createdAt).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
