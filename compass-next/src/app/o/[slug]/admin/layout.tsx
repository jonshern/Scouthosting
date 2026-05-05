import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin`);
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) {
    return (
      <section className="mx-auto max-w-content px-6 py-16">
        <h1 className="font-display text-2xl font-semibold">Not authorized</h1>
        <p className="mt-2 text-ink-muted">Ask a leader to grant you admin access.</p>
      </section>
    );
  }
  return (
    <div className="bg-bone-dark/40 min-h-screen">
      <div className="mx-auto max-w-content px-6 py-8 grid gap-8 md:grid-cols-[200px_1fr]">
        <aside aria-label="Admin">
          <div className="font-display font-semibold mb-4">Admin</div>
          <nav className="flex flex-col gap-2 text-sm">
            <Link href={`/o/${slug}/admin`}>Overview</Link>
            <Link href={`/o/${slug}/admin/announcements`}>Announcements</Link>
            <Link href={`/o/${slug}/admin/site`}>Site hero</Link>
            <Link href={`/o/${slug}/admin/pages`}>Pages</Link>
            <Link href={`/o/${slug}/admin/events`}>Events</Link>
            <Link href={`/o/${slug}/admin/photos`}>Photos</Link>
            <Link href={`/o/${slug}/admin/posts`}>Posts</Link>
            <Link href={`/o/${slug}/admin/email`}>Group email</Link>
            <Link href={`/o/${slug}/admin/members`}>Members</Link>
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
