// Public-site announcement banner.
//
// Renders the most-recent pinned, non-expired Announcement as a banner
// at the top of every public page on an org's subdomain. Server
// component — best-effort lookup; if the query throws we render
// nothing (never block the page on the banner).

import { prisma } from "@/lib/db";

type Props = { orgId: string };

export async function AnnouncementBanner({ orgId }: Props) {
  let banner: { id: string; title: string; body: string } | null = null;
  try {
    banner = await prisma.announcement.findFirst({
      where: {
        orgId,
        pinned: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { publishedAt: "desc" },
      select: { id: true, title: true, body: true },
    });
  } catch {
    return null;
  }

  if (!banner) return null;

  const previewBody = banner.body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  return (
    <aside
      className="site-banner"
      role="status"
      style={{
        background: "linear-gradient(135deg, var(--primary, #0f172a), var(--accent, #1d4ed8))",
        color: "#fff",
        padding: "0.65rem 1rem",
        textAlign: "center",
        fontSize: "0.92rem",
        borderBottom: "1.5px solid #0f172a",
      }}
    >
      <strong style={{ fontWeight: 700 }}>{banner.title}</strong>
      {previewBody && <span style={{ opacity: 0.92, marginLeft: "0.5rem" }}>{previewBody}</span>}
    </aside>
  );
}
