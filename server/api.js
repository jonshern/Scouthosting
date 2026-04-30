// JSON API for the mobile app + future external clients. Mounted at
// /api/v1.
//
// Auth: every protected route accepts EITHER a Lucia session cookie (web
// fallback) OR an Authorization: Bearer <token> header (mobile). The
// resolveApiUser middleware unifies both into req.apiUser.
//
// Org scoping: most chat resources belong to a specific Channel which
// belongs to a specific Org. We resolve the channel first, then check
// the caller has an OrgMembership in that org. Cross-org requests fail
// with 404 (not 403) so we don't leak channel existence.

import { Router } from "express";
import { prisma } from "../lib/db.js";
import { lucia } from "../lib/auth.js";
import { issueToken, verifyToken, revokeToken } from "../lib/apiToken.js";
import {
  assertChannelTwoDeep,
  checkChannelTwoDeep,
} from "../lib/chat.js";
import { publishMessage, subscribe as subscribeRealtime } from "../lib/realtime.js";

export const apiRouter = Router();

const MESSAGE_PAGE = 50;

/* ------------------------------------------------------------------ */
/* Auth middleware                                                     */
/* ------------------------------------------------------------------ */

async function resolveApiUser(req, res, next) {
  // Bearer-token path first (mobile / external). EventSource can't
  // set Authorization headers, so we also accept ?access_token= in
  // the query string for SSE — same hash check, same storage.
  const headerAuth = req.headers.authorization || "";
  const queryToken = typeof req.query.access_token === "string" ? req.query.access_token : "";
  const bearerLike = /^Bearer\s+/i.test(headerAuth)
    ? headerAuth
    : queryToken
      ? `Bearer ${queryToken}`
      : "";
  if (bearerLike) {
    const v = await verifyToken(bearerLike, prisma);
    if (!v) return res.status(401).json({ error: "invalid_token" });
    const user = await prisma.user.findUnique({
      where: { id: v.userId },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) return res.status(401).json({ error: "invalid_token" });
    req.apiUser = user;
    req.apiTokenId = v.tokenId;
    return next();
  }
  // Cookie session path (web).
  if (req.user) {
    req.apiUser = req.user;
    return next();
  }
  return res.status(401).json({ error: "unauthenticated" });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function membershipFor(userId, orgId) {
  return prisma.orgMembership.findFirst({
    where: { userId, orgId },
    select: { role: true, yptCurrentUntil: true },
  });
}

function serializeChannel(c, { membership } = {}) {
  return {
    id: c.id,
    orgId: c.orgId,
    kind: c.kind,
    name: c.name,
    patrolName: c.patrolName,
    eventId: c.eventId,
    isSuspended: c.isSuspended,
    suspendedReason: c.suspendedReason,
    archivedAt: c.archivedAt,
    isLeaderOnly: c.kind === "leaders",
    canPost: !c.isSuspended && !c.archivedAt,
    youAreModerator: membership?.role === "leader" || membership?.role === "admin",
    updatedAt: c.updatedAt,
  };
}

function serializeMessage(m, opts = {}) {
  const reactions = serializeReactions(m.reactions, opts.viewerUserId);
  return {
    id: m.id,
    channelId: m.channelId,
    body: m.deletedAt ? null : m.body,
    deleted: !!m.deletedAt,
    pinned: m.pinned,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    author: m.author
      ? { id: m.author.id, displayName: m.author.displayName }
      : null,
    attachment: m.deletedAt ? null : serializeAttachment(m.attachmentJson, opts.viewerUserId),
    reactions,
  };
}

// Privacy-conscious attachment serializer. For polls we expose option
// counts + whether the viewer voted; we deliberately don't ship the
// raw userId arrays so peer-pressure dynamics don't surface in the
// client. A future leader-only "who voted what" view can pull the raw
// votes server-side.
function serializeAttachment(att, viewerUserId) {
  if (!att || typeof att !== "object") return null;
  if (att.kind !== "poll") return att;
  return {
    kind: "poll",
    question: att.question,
    closesAt: att.closesAt || null,
    allowMulti: !!att.allowMulti,
    options: (att.options || []).map((o) => ({
      id: o.id,
      label: o.label,
      count: (o.votes || []).length,
      youVoted: !!viewerUserId && (o.votes || []).includes(viewerUserId),
    })),
  };
}

// Group raw Reaction rows into one bucket per emoji with a count and a
// `youReacted` flag the client can use to highlight the user's own
// reactions. Stable order: most-popular first, ties broken by emoji
// codepoint so the client doesn't bounce on equal-weight emojis.
function serializeReactions(rows, viewerUserId) {
  if (!rows || !rows.length) return [];
  const buckets = new Map();
  for (const r of rows) {
    if (!buckets.has(r.emoji)) {
      buckets.set(r.emoji, { emoji: r.emoji, count: 0, youReacted: false });
    }
    const b = buckets.get(r.emoji);
    b.count += 1;
    if (viewerUserId && r.userId === viewerUserId) b.youReacted = true;
  }
  return [...buckets.values()].sort((a, b) =>
    b.count - a.count || a.emoji.localeCompare(b.emoji),
  );
}

/* ------------------------------------------------------------------ */
/* Token exchange                                                      */
/* ------------------------------------------------------------------ */

// POST /api/v1/auth/token — requires the Lucia session cookie. Mints a
// fresh bearer token and returns the raw value EXACTLY ONCE. The mobile
// app deep-links here after web sign-in and stores the raw value in
// secure storage.
apiRouter.post("/auth/token", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "unauthenticated" });
  const name = (req.body?.name || req.headers["user-agent"] || "Mobile device").toString();
  const t = await issueToken(req.user.id, name, prisma);
  res.json({
    id: t.id,
    name: t.name,
    token: t.raw,
    createdAt: t.createdAt,
  });
});

// DELETE /api/v1/auth/token/:id — revoke. Either the session OR the
// token itself can be used to call this.
apiRouter.delete("/auth/token/:id", resolveApiUser, async (req, res) => {
  const t = await prisma.apiToken.findFirst({
    where: { id: req.params.id, userId: req.apiUser.id },
    select: { id: true },
  });
  if (!t) return res.status(404).json({ error: "not_found" });
  await revokeToken(t.id, prisma);
  res.json({ ok: true });
});

// GET /api/v1/auth/me — sanity-check endpoint mobile uses on launch to
// confirm the stored token still resolves.
apiRouter.get("/auth/me", resolveApiUser, async (req, res) => {
  const memberships = await prisma.orgMembership.findMany({
    where: { userId: req.apiUser.id },
    select: { orgId: true, role: true, org: { select: { displayName: true, slug: true } } },
  });
  res.json({
    user: {
      id: req.apiUser.id,
      email: req.apiUser.email,
      displayName: req.apiUser.displayName,
    },
    memberships: memberships.map((m) => ({
      orgId: m.orgId,
      orgName: m.org.displayName,
      orgSlug: m.org.slug,
      role: m.role,
    })),
  });
});

/* ------------------------------------------------------------------ */
/* Channels                                                            */
/* ------------------------------------------------------------------ */

// GET /api/v1/channels?orgId=... — visible to the user in that org.
// Visibility = ChannelMember exists OR channel.kind=troop (everyone in
// the org is in the troop channel by default).
apiRouter.get("/channels", resolveApiUser, async (req, res) => {
  const orgId = String(req.query.orgId || "");
  if (!orgId) return res.status(400).json({ error: "orgId_required" });
  const membership = await membershipFor(req.apiUser.id, orgId);
  if (!membership) return res.status(404).json({ error: "not_a_member" });

  const channels = await prisma.channel.findMany({
    where: {
      orgId,
      archivedAt: null,
      OR: [
        { members: { some: { userId: req.apiUser.id } } },
        { kind: "troop" },
        // Leaders see everything except suspended event channels.
        ...(membership.role === "leader" || membership.role === "admin" ? [{ orgId }] : []),
      ],
    },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  res.json({
    channels: channels.map((c) => serializeChannel(c, { membership })),
  });
});

// GET /api/v1/channels/:id — channel + last page of messages.
apiRouter.get("/channels/:id", resolveApiUser, async (req, res) => {
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id },
  });
  if (!channel) return res.status(404).json({ error: "not_found" });

  const membership = await membershipFor(req.apiUser.id, channel.orgId);
  if (!membership) return res.status(404).json({ error: "not_found" });

  // Leader-only channels gate by role; everything else just needs
  // ChannelMember OR (kind=troop and you're an org member).
  if (channel.kind === "leaders" && membership.role !== "leader" && membership.role !== "admin") {
    return res.status(404).json({ error: "not_found" });
  }
  if (channel.kind !== "troop" && channel.kind !== "leaders") {
    const member = await prisma.channelMember.findFirst({
      where: { channelId: channel.id, userId: req.apiUser.id },
    });
    if (!member && membership.role !== "leader" && membership.role !== "admin") {
      return res.status(404).json({ error: "not_found" });
    }
  }

  const messages = await prisma.message.findMany({
    where: { channelId: channel.id },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_PAGE,
    include: {
      author: { select: { id: true, displayName: true } },
      reactions: { select: { emoji: true, userId: true } },
    },
  });

  res.json({
    channel: serializeChannel(channel, { membership }),
    messages: messages.reverse().map((m) => serializeMessage(m, { viewerUserId: req.apiUser.id })),
    hasMore: messages.length === MESSAGE_PAGE,
  });
});

// GET /api/v1/channels/:id/messages?before=<msgId> — older page.
apiRouter.get("/channels/:id/messages", resolveApiUser, async (req, res) => {
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id },
    select: { id: true, orgId: true, kind: true },
  });
  if (!channel) return res.status(404).json({ error: "not_found" });
  const membership = await membershipFor(req.apiUser.id, channel.orgId);
  if (!membership) return res.status(404).json({ error: "not_found" });

  let cursor;
  if (req.query.before) {
    const beforeMsg = await prisma.message.findFirst({
      where: { id: String(req.query.before), channelId: channel.id },
      select: { createdAt: true },
    });
    if (beforeMsg) cursor = { createdAt: { lt: beforeMsg.createdAt } };
  }

  const messages = await prisma.message.findMany({
    where: { channelId: channel.id, ...(cursor || {}) },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_PAGE,
    include: {
      author: { select: { id: true, displayName: true } },
      reactions: { select: { emoji: true, userId: true } },
    },
  });

  res.json({
    messages: messages.reverse().map((m) => serializeMessage(m, { viewerUserId: req.apiUser.id })),
    hasMore: messages.length === MESSAGE_PAGE,
  });
});

// POST /api/v1/channels/:id/messages — send. Passes through the YPT guard.
apiRouter.post("/channels/:id/messages", resolveApiUser, async (req, res) => {
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id },
  });
  if (!channel) return res.status(404).json({ error: "not_found" });
  if (channel.archivedAt) return res.status(409).json({ error: "archived" });

  const membership = await membershipFor(req.apiUser.id, channel.orgId);
  if (!membership) return res.status(404).json({ error: "not_found" });

  // Caller must be in the channel (or a leader/admin).
  if (channel.kind !== "troop" && membership.role !== "leader" && membership.role !== "admin") {
    const member = await prisma.channelMember.findFirst({
      where: { channelId: channel.id, userId: req.apiUser.id },
      select: { id: true },
    });
    if (!member) return res.status(403).json({ error: "not_in_channel" });
  }

  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "empty_body" });
  if (body.length > 10_000) return res.status(400).json({ error: "body_too_long" });

  // YPT two-deep guard. If the channel doesn't currently meet the bar,
  // assertChannelTwoDeep auto-suspends it as a side effect and throws.
  try {
    await assertChannelTwoDeep(channel.id, {
      prismaClient: prisma,
      org: { id: channel.orgId, displayName: "" },
      user: req.apiUser,
    });
  } catch (e) {
    if (e.code === "CHANNEL_SUSPENDED") {
      return res.status(409).json({
        error: "channel_suspended",
        reason: e.reason,
      });
    }
    throw e;
  }

  if (channel.isSuspended) {
    return res.status(409).json({
      error: "channel_suspended",
      reason: channel.suspendedReason,
    });
  }

  // Optional inline attachment — for v1 this is the poll attachment.
  // Future shapes (RSVP card, photo) reuse the same column.
  const attachment = parseAttachmentJson(req.body?.attachment);

  const message = await prisma.message.create({
    data: {
      channelId: channel.id,
      authorId: req.apiUser.id,
      body,
      attachmentJson: attachment,
    },
    include: {
      author: { select: { id: true, displayName: true } },
      reactions: { select: { emoji: true, userId: true } },
    },
  });
  const dto = serializeMessage(message, { viewerUserId: req.apiUser.id });
  // Fan out to every SSE subscriber on this channel. Best-effort —
  // failures inside subscribers don't bubble up to the POST response.
  try {
    publishMessage(channel.id, dto);
  } catch (e) {
    console.warn(`[realtime] publishMessage failed: ${e.message}`);
  }
  res.status(201).json({ message: dto });
});

/* ------------------------------------------------------------------ */
/* Reactions                                                           */
/* ------------------------------------------------------------------ */

const MAX_EMOJI_LEN = 32;

// POST /api/v1/messages/:id/reactions — toggle a reaction. Body:
// { emoji: "👍" }. Idempotent: if the (message, user, emoji) row
// exists we delete it (un-react); otherwise we create it.
apiRouter.post("/messages/:id/reactions", resolveApiUser, async (req, res) => {
  const emoji = String(req.body?.emoji || "").trim().slice(0, MAX_EMOJI_LEN);
  if (!emoji) return res.status(400).json({ error: "missing_emoji" });

  const message = await prisma.message.findUnique({
    where: { id: req.params.id },
    select: { id: true, channelId: true, deletedAt: true },
  });
  if (!message) return res.status(404).json({ error: "not_found" });
  if (message.deletedAt) return res.status(409).json({ error: "deleted" });

  // Authorize the viewer against the channel's org.
  const channel = await prisma.channel.findUnique({
    where: { id: message.channelId },
    select: { id: true, orgId: true, kind: true, archivedAt: true, isSuspended: true },
  });
  if (!channel || channel.archivedAt) return res.status(404).json({ error: "not_found" });
  const membership = await membershipFor(req.apiUser.id, channel.orgId);
  if (!membership) return res.status(404).json({ error: "not_found" });
  if (channel.kind === "leaders" && membership.role !== "leader" && membership.role !== "admin") {
    return res.status(404).json({ error: "not_found" });
  }
  if (channel.kind !== "troop" && channel.kind !== "leaders") {
    const member = await prisma.channelMember.findFirst({
      where: { channelId: channel.id, userId: req.apiUser.id },
      select: { id: true },
    });
    if (!member && membership.role !== "leader" && membership.role !== "admin") {
      return res.status(404).json({ error: "not_found" });
    }
  }
  // Reactions are read-only on suspended channels — don't let a member
  // pile-react during a YPT incident.
  if (channel.isSuspended) {
    return res.status(409).json({ error: "channel_suspended", reason: channel.suspendedReason });
  }

  const existing = await prisma.reaction.findUnique({
    where: {
      messageId_userId_emoji: {
        messageId: message.id,
        userId: req.apiUser.id,
        emoji,
      },
    },
    select: { messageId: true },
  });
  if (existing) {
    await prisma.reaction.delete({
      where: {
        messageId_userId_emoji: { messageId: message.id, userId: req.apiUser.id, emoji },
      },
    });
  } else {
    await prisma.reaction.create({
      data: { messageId: message.id, userId: req.apiUser.id, emoji },
    });
  }

  // Re-fetch the full message + reactions and fan out so every SSE
  // subscriber updates the bucket counts.
  const fresh = await prisma.message.findUnique({
    where: { id: message.id },
    include: {
      author: { select: { id: true, displayName: true } },
      reactions: { select: { emoji: true, userId: true } },
    },
  });
  const dto = serializeMessage(fresh, { viewerUserId: req.apiUser.id });
  try {
    publishMessage(channel.id, dto);
  } catch (e) {
    console.warn(`[realtime] publishMessage failed: ${e.message}`);
  }
  res.json({ message: dto });
});

/* ------------------------------------------------------------------ */
/* Polls                                                               */
/* ------------------------------------------------------------------ */

// Poll attachment shape (lives in Message.attachmentJson):
//   {
//     kind: "poll",
//     question: string,
//     options: [{ id: string, label: string, votes: string[] /* userIds */ }],
//     closesAt: ISO string | null,
//     allowMulti: boolean,
//   }
//
// Votes mutate the JSON in-place. Server is the source of truth; the
// client gets the updated message DTO via the SSE channel.

const POLL_MAX_OPTIONS = 12;
const POLL_MAX_QUESTION_LEN = 280;
const POLL_MAX_OPTION_LEN = 80;

function parseAttachmentJson(raw) {
  if (raw == null) return null;
  // Accept either an inline object or a stringified JSON for ergonomics
  // (the web client sends an object; multipart-form clients might send
  // a string).
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== "object") return null;
  if (obj.kind === "poll") return normalizePollAttachment(obj);
  return null;
}

function normalizePollAttachment(obj) {
  const question = String(obj.question || "").trim().slice(0, POLL_MAX_QUESTION_LEN);
  const optionsRaw = Array.isArray(obj.options) ? obj.options.slice(0, POLL_MAX_OPTIONS) : [];
  const options = optionsRaw
    .map((o, i) => {
      const label = typeof o === "string"
        ? o
        : String(o?.label ?? "");
      const trimmed = label.trim().slice(0, POLL_MAX_OPTION_LEN);
      if (!trimmed) return null;
      return {
        id: typeof o?.id === "string" && /^[A-Za-z0-9_-]+$/.test(o.id) ? o.id : `o${i + 1}`,
        label: trimmed,
        votes: [],
      };
    })
    .filter(Boolean);
  if (!question || options.length < 2) return null;
  return {
    kind: "poll",
    question,
    options,
    closesAt: obj.closesAt ? String(obj.closesAt) : null,
    allowMulti: !!obj.allowMulti,
  };
}

// POST /api/v1/messages/:id/poll/vote — { optionId }. Toggles the
// caller's vote on the named option. Honors poll.allowMulti and
// poll.closesAt.
apiRouter.post("/messages/:id/poll/vote", resolveApiUser, async (req, res) => {
  const optionId = String(req.body?.optionId || "").trim();
  if (!optionId) return res.status(400).json({ error: "missing_option" });

  const message = await prisma.message.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      channelId: true,
      attachmentJson: true,
      deletedAt: true,
    },
  });
  if (!message || message.deletedAt) return res.status(404).json({ error: "not_found" });
  const poll = message.attachmentJson;
  if (!poll || poll.kind !== "poll") {
    return res.status(409).json({ error: "not_a_poll" });
  }
  if (poll.closesAt && new Date(poll.closesAt) < new Date()) {
    return res.status(409).json({ error: "poll_closed" });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: message.channelId },
    select: { id: true, orgId: true, kind: true, archivedAt: true, isSuspended: true },
  });
  if (!channel || channel.archivedAt) return res.status(404).json({ error: "not_found" });
  const membership = await membershipFor(req.apiUser.id, channel.orgId);
  if (!membership) return res.status(404).json({ error: "not_found" });
  if (channel.isSuspended) {
    return res.status(409).json({ error: "channel_suspended", reason: channel.suspendedReason });
  }

  // Mutate the in-memory copy then write back.
  const target = (poll.options || []).find((o) => o.id === optionId);
  if (!target) return res.status(404).json({ error: "unknown_option" });
  const userId = req.apiUser.id;
  const had = (target.votes || []).includes(userId);
  if (had) {
    target.votes = (target.votes || []).filter((v) => v !== userId);
  } else {
    if (!poll.allowMulti) {
      // Pull the user out of every other option first (single-vote mode).
      for (const o of poll.options) {
        if (o.id !== optionId) o.votes = (o.votes || []).filter((v) => v !== userId);
      }
    }
    target.votes = [...(target.votes || []), userId];
  }

  const fresh = await prisma.message.update({
    where: { id: message.id },
    data: { attachmentJson: poll },
    include: {
      author: { select: { id: true, displayName: true } },
      reactions: { select: { emoji: true, userId: true } },
    },
  });
  const dto = serializeMessage(fresh, { viewerUserId: userId });
  try { publishMessage(channel.id, dto); } catch { /* ignore */ }
  res.json({ message: dto });
});

/* ------------------------------------------------------------------ */
/* SSE stream                                                          */
/* ------------------------------------------------------------------ */

const SSE_HEARTBEAT_MS = 25_000;

// GET /api/v1/channels/:id/stream — Server-Sent Events keyed by channelId.
// Auth via Lucia session OR ?access_token=<bearer> (EventSource can't set
// headers). Heartbeat every 25 seconds prevents proxies + Cloudflare from
// closing the connection. On disconnect we clean up the in-process
// subscriber.
apiRouter.get("/channels/:id/stream", resolveApiUser, async (req, res) => {
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id },
    select: { id: true, orgId: true, kind: true, archivedAt: true },
  });
  if (!channel) return res.status(404).json({ error: "not_found" });

  const membership = await membershipFor(req.apiUser.id, channel.orgId);
  if (!membership) return res.status(404).json({ error: "not_found" });

  if (channel.kind === "leaders" && membership.role !== "leader" && membership.role !== "admin") {
    return res.status(404).json({ error: "not_found" });
  }
  if (channel.kind !== "troop" && channel.kind !== "leaders") {
    const member = await prisma.channelMember.findFirst({
      where: { channelId: channel.id, userId: req.apiUser.id },
    });
    if (!member && membership.role !== "leader" && membership.role !== "admin") {
      return res.status(404).json({ error: "not_found" });
    }
  }

  // SSE preamble. Disable nginx-style proxy buffering with X-Accel-Buffering.
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  // Initial event so the client knows the subscription is live.
  res.write(`event: hello\ndata: ${JSON.stringify({ channelId: channel.id })}\n\n`);

  const send = (eventName, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const unsubscribe = subscribeRealtime(channel.id, (event) => {
    send(event.type, event);
  });

  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    // Comment-only event keeps the connection warm without firing a
    // client-side message handler. SSE comments start with ":" per spec.
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, SSE_HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
});

// JSON 404 fallthrough — catches /api/v1/* paths the router didn't handle.
apiRouter.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});
