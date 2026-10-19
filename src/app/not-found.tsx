import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { TENANT_HOST_HEADER } from "@/lib/tenancy/host-header";
import { marketingHrefFor } from "@/lib/tenancy/marketing-link";

// One 404 for every host. On a unit host whose unit doesn't exist it says
// so and points at the main site; anywhere else it's a missing page.
export default async function NotFound() {
  const slug = (await headers()).get(TENANT_HOST_HEADER);
  const unitMissing = slug
    ? !(await prisma.org.findUnique({ where: { slug }, select: { id: true } }).catch(() => ({ id: "" })))
    : false;

  return (
    <section className="mx-auto max-w-content px-6 py-24 text-center">
      <div className="eyebrow mb-3">404</div>
      {unitMissing ? (
        <>
          <h1 className="font-display text-4xl font-semibold">Site not found</h1>
          <p className="mt-3 text-ink-2">That address isn&apos;t a Compass site yet.</p>
          <a href={marketingHrefFor(slug, "/start")} className="btn-primary mt-8">
            Start a site
          </a>
        </>
      ) : (
        <>
          <h1 className="font-display text-4xl font-semibold">Page not found</h1>
          <p className="mt-3 text-ink-2">The link might be old, or there&apos;s a typo in the address.</p>
          <Link href="/" className="btn-primary mt-8">
            Go to the home page
          </Link>
        </>
      )}
    </section>
  );
}
