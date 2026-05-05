// /o/[slug]/chat — chat surface. Lists channels the user is a
// member of, opens the most recent on first load.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { ChatComposer } from "@/components/chat/ChatComposer";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/chat`);

  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;

  const channels = await prisma.channel.findMany({
    where: {
      orgId: org.id,
      members: { some: { userId: user.id } },
      archivedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      kind: true,
      isSuspended: true,
      suspendedReason: true,
    },
  });

  const sp = await searchParams;
  const activeId = sp.channel || channels[0]?.id;
  const activeChannel = activeId
    ? channels.find((c) => c.id === activeId) || null
    : null;

  const messages = activeChannel
    ? await prisma.message.findMany({
        where: { channelId: activeChannel.id, deletedAt: null },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          body: true,
          createdAt: true,
          authorId: true,
          author: { select: { displayName: true } },
        },
      })
    : [];

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display text-3xl mb-6">Chat</h1>
      <div className="grid grid-cols-[200px_1fr] gap-6">
        <aside>
          <h2 className="text-xs uppercase tracking-wide text-ink-muted mb-2">
            Channels
          </h2>
          <ul className="space-y-1">
            {channels.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/o/${slug}/chat?channel=${c.id}`}
                  className={`block px-2 py-1 rounded text-sm ${
                    c.id === activeChannel?.id ? "bg-accent-soft" : "hover:bg-ink-muted/5"
                  }`}
                >
                  {c.name}
                  {c.isSuspended ? (
                    <span className="ml-1 text-xs text-amber-700">paused</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <section>
          {!activeChannel ? (
            <p className="text-ink-muted">Pick a channel.</p>
          ) : (
            <>
              <header className="mb-4 pb-3 border-b border-ink-muted/15">
                <h2 className="font-display text-xl">{activeChannel.name}</h2>
                {activeChannel.isSuspended && (
                  <p className="text-xs text-amber-700 mt-1">
                    Paused: {activeChannel.suspendedReason ?? "two-deep failed"}
                  </p>
                )}
              </header>
              <ul className="space-y-3" data-testid="chat-messages">
                {messages.map((m) => (
                  <li key={m.id} className="text-sm" data-testid="chat-message">
                    {m.authorId ? (
                      <>
                        <span className="font-medium">
                          {m.author?.displayName ?? "Someone"}
                        </span>
                        <span className="ml-2 text-xs text-ink-muted">
                          {m.createdAt.toLocaleString()}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-ink-muted italic">system</span>
                    )}
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ul>
              <ChatComposer
                channelId={activeChannel.id}
                csrf={<CsrfTokenInput />}
                disabled={activeChannel.isSuspended ?? false}
                disabledReason={
                  activeChannel.isSuspended
                    ? `Paused: ${activeChannel.suspendedReason ?? "two-deep failed"}`
                    : undefined
                }
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
