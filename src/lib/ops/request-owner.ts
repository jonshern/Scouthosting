// Which unit and which signed-in person a failed request belonged to,
// so the owner console's errors view can say "Troop 12, this parent"
// for errors Next reports through onRequestError (src/instrumentation.ts).
// Best effort: anything that fails here leaves the field empty.

import { classifyHost } from "@/lib/tenancy/resolve";
import { prisma } from "@/lib/db";

type RawHeaders = Record<string, string | string[] | undefined>;

export function slugFromPath(path: string): string | null {
  const m = /^\/o\/([a-z0-9-]+)(?:[/?]|$)/i.exec(path);
  return m ? m[1].toLowerCase() : null;
}

function toHeaders(raw: RawHeaders): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    h.set(k, Array.isArray(v) ? v.join(", ") : v);
  }
  return h;
}

export async function requestOwner(
  path: string,
  raw: RawHeaders,
): Promise<{ orgSlug: string | null; userId: string | null }> {
  const headers = toHeaders(raw);
  let orgSlug = slugFromPath(path);
  if (!orgSlug) {
    const c = classifyHost(headers.get("host"));
    if (c.kind === "tenant") orgSlug = c.slug;
    else if (c.kind === "custom") {
      orgSlug =
        (await prisma.org.findUnique({ where: { customDomain: c.customDomain }, select: { slug: true } }))?.slug ?? null;
    }
  }
  let userId: string | null = null;
  if (headers.get("cookie")) {
    const { auth } = await import("@/lib/auth/auth");
    userId = (await auth.api.getSession({ headers }).catch(() => null))?.user.id ?? null;
  }
  return { orgSlug, userId };
}
