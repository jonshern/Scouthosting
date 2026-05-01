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

import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/db.js";
import { lucia } from "../lib/auth.js";
import { moveFromTemp } from "../lib/storage.js";
import { issueToken, verifyToken, revokeToken } from "../lib/apiToken.js";
import {
  assertChannelTwoDeep,
  checkChannelTwoDeep,
} from "../lib/chat.js";
import { publishMessage, subscribe as subscribeRealtime } from "../lib/realtime.js";
import { canPostToChannel } from "../lib/chatPermissions.js";
import { logger } from "../lib/log.js";

const log = logger.child("api");

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
  if (att.kind === "poll") {
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
  if (att.kind === "rsvp") {
    // Skeleton — enrichRsvpAttachments() fills in event meta + tally +
    // myResponse via a follow-up DB pass. Until enrichment runs, the
    // client just sees `kind: "rsvp"` + eventId.
    return { kind: "rsvp", eventId: att.eventId };
  }
  if (att.kind === "photo") {
    // Skeleton — enrichPhotoAttachments() fills in url + mimeType +
    // dimensions. Until enrichment runs, just photoId + caption.
    return {
      kind: "photo",
      photoId: att.photoId,
      caption: att.caption || null,
    };
  }
  return att;
}

/**
 * Walks a list of serialized messages and patches every rsvp attachment
 * with live event meta + tally counts + the viewer's current response.
 * Single round-trip per query (groupBy + findMany in parallel) so a
 * page of 50 messages doesn't fan out to 100+ tiny queries.
 */
async function enrichAttachments(messages, orgId, viewerUserId) {
  await Promise.all([
    enrichRsvpAttachments(messages, orgId, viewerUserId),
    enrichPhotoAttachments(messages, orgId),
  ]);
  return messages;
}

async function enrichRsvpAttachments(messages, orgId, viewerUserId) {
  const eventIds = new Set();
  for (const m of messages) {
    if (m.attachment?.kind === "rsvp" && m.attachment.eventId) {
      eventIds.add(m.attachment.eventId);
    }
  }
  if (!eventIds.size) return messages;

  const ids = [...eventIds];
  const [events, tallies, myRsvps] = await Promise.all([
    prisma.event.findMany({
      where: { id: { in: ids }, orgId },
      select: { id: true, title: true, startsAt: true, endsAt: true, location: true, cost: true },
    }),
    prisma.rsvp.groupBy({
      by: ["eventId", "response"],
      where: { eventId: { in: ids }, orgId },
      _count: { _all: true },
    }),
    viewerUserId
      ? prisma.rsvp.findMany({
          where: { eventId: { in: ids }, orgId, userId: viewerUserId },
          select: { eventId: true, response: true },
        })
      : Promise.resolve([]),
  ]);
  const eventMap = new Map(events.map((e) => [e.id, e]));
  const tallyMap = new Map();
  for (const t of tallies) {
    if (!tallyMap.has(t.eventId)) tallyMap.set(t.eventId, { yes: 0, maybe: 0, no: 0 });
    const bucket = tallyMap.get(t.eventId);
    if (t.response === "yes") bucket.yes = t._count._all;
    else if (t.response === "maybe") bucket.maybe = t._count._all;
    else if (t.response === "no") bucket.no = t._count._all;
  }
  const myMap = new Map(myRsvps.map((r) => [r.eventId, r.response]));

  for (const m of messages) {
    if (m.attachment?.kind !== "rsvp") continue;
    const ev = eventMap.get(m.attachment.eventId);
    const tally = tallyMap.get(m.attachment.eventId) || { yes: 0, maybe: 0, no: 0 };
    if (!ev) {
      // Event was deleted after the embed was posted. Surface a tombstone
      // rather than a 404 — the chat history remains readable.
      m.attachment = {
        kind: "rsvp",
        eventId: m.attachment.eventId,
        deleted: true,
        tally,
        myResponse: myMap.get(m.attachment.eventId) || null,
      };
      continue;
    }
    m.attachment = {
      kind: "rsvp",
      eventId: ev.id,
      deleted: false,
      title: ev.title,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      location: ev.location,
      cost: ev.cost,
      tally,
      myResponse: myMap.get(ev.id) || null,
    };
  }
  return messages;
}

/**
 * Patches every kind:"photo" attachment with the linked Photo's
 * filename + mime + dimensions. Same single-round-trip shape as
 * enrichRsvpAttachments. Photos that have been deleted (or never
 * existed) render as { kind:"photo", deleted:true } so the chat
 * history doesn't break.
 */
async function enrichPhotoAttachments(messages, orgId) {
  const photoIds = new Set();
  for (const m of messages) {
    if (m.attachment?.kind === "photo" && m.attachment.photoId) {
      photoIds.add(m.attachment.photoId);
    }
  }
  if (!photoIds.size) return messages;

  const photos = await prisma.photo.findMany({
    where: { id: { in: [...photoIds] }, orgId },
    select: { id: true, filename: true, mimeType: true, width: true, height: true, sizeBytes: true },
  });
  const map = new Map(photos.map((p) => [p.id, p]));
  for (const m of messages) {
    if (m.attachment?.kind !== "photo") continue;
    const p = map.get(m.attachment.photoId);
    if (!p) {
      m.attachment = { kind: "photo", photoId: m.attachment.photoId, deleted: true };
      continue;
    }
    m.attachment = {
      kind: "photo",
      photoId: p.id,
      url: `/uploads/${p.filename}`,
      mimeType: p.mimeType,
      width: p.width,
      height: p.height,
      sizeBytes: p.sizeBytes,
      caption: m.attachment.caption || null,
      deleted: false,
    };
  }
  return messages;
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

// GET /api/v1/orgs/:orgId/dashboard — view-model for the mobile home
// screen. Reuses lib/dashboard so server-rendered admin and the mobile
// app stay aligned.
apiRouter.get("/orgs/:orgId/dashboard", resolveApiUser, async (req, res) => {
  const membership = await membershipFor(req.apiUser.id, req.params.orgId);
  if (!membership) return res.status(404).json({ error: "not_found" });
  const { buildDashboardModel } = await import("../lib/dashboard.js");
  const model = await buildDashboardModel({ prisma, orgId: req.params.orgId });
  res.json(model);
});

// POST /api/v1/support — file a SupportTicket from the mobile app.
// Same shape as the web /help form; 201 with the ticket id on success.
apiRouter.post("/support", resolveApiUser, async (req, res) => {
  const subject = String(req.body?.subject || "").trim().slice(0, 200);
  const body = String(req.body?.body || "").trim().slice(0, 5000);
  const category = String(req.body?.category || "question");
  const orgId = req.body?.orgId ? String(req.body.orgId) : null;
  if (!subject || !body) return res.status(400).json({ error: "subject_and_body_required" });
  const ticket = await prisma.supportTicket.create({
    data: {
      orgId,
      userId: req.apiUser.id,
      fromEmail: req.apiUser.email,
      fromName: req.apiUser.displayName,
      subject,
      body,
      category,
      priority: category === "abuse" ? "urgent" : "normal",
    },
  });
  res.status(201).json({ id: ticket.id });
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

  const serialized = messages.reverse().map((m) => serializeMessage(m, { viewerUserId: req.apiUser.id }));
  await enrichAttachments(serialized, channel.orgId, req.apiUser.id);
  res.json({
    channel: serializeChannel(channel, { membership }),
    messages: serialized,
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

  const serialized = messages.reverse().map((m) => serializeMessage(m, { viewerUserId: req.apiUser.id }));
  await enrichAttachments(serialized, channel.orgId, req.apiUser.id);
  res.json({
    messages: serialized,
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

  // Resolve the channel-membership row + Member directory entry once,
  // then defer the policy decision to lib/chatPermissions.canPostToChannel.
  const isLeader = membership.role === "leader" || membership.role === "admin";
  const [channelMembership, member] = await Promise.all([
    isLeader
      ? Promise.resolve(null)
      : prisma.channelMember.findFirst({
          where: { channelId: channel.id, userId: req.apiUser.id },
          select: { id: true },
        }),
    isLeader || !req.apiUser.email
      ? Promise.resolve(null)
      : prisma.member.findFirst({
          where: { orgId: channel.orgId, email: req.apiUser.email.toLowerCase() },
          select: { patrol: true },
        }),
  ]);
  const decision = canPostToChannel(channel, {
    role: membership.role,
    isLeader,
    channelMembership,
    member,
  });
  if (!decision.ok) {
    if (decision.reason === "suspended") {
      return res.status(409).json({
        error: "channel_suspended",
        reason: channel.suspendedReason,
      });
    }
    if (decision.reason === "archived") {
      return res.status(409).json({ error: "archived" });
    }
    return res.status(403).json({ error: decision.reason });
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

  // Optional inline attachment — poll, rsvp, or photo. The same column
  // carries any of them.
  const attachment = parseAttachmentJson(req.body?.attachment);

  // For kind=photo, validate that the photo belongs to this org and is
  // still orphan (not yet linked). Reject otherwise so a malicious
  // client can't claim someone else's photo.
  if (attachment?.kind === "photo") {
    const photo = await prisma.photo.findFirst({
      where: { id: attachment.photoId, orgId: channel.orgId },
      select: { id: true, messageId: true, uploaderUserId: true },
    });
    if (!photo) return res.status(404).json({ error: "photo_not_found" });
    if (photo.messageId) return res.status(409).json({ error: "photo_already_linked" });
    if (photo.uploaderUserId && photo.uploaderUserId !== req.apiUser.id) {
      return res.status(403).json({ error: "photo_not_yours" });
    }
  }

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

  // Link the photo to the freshly-created message so /uploads/:filename
  // can authorize via channel membership and so the photo gets cleaned
  // up if the message is later deleted.
  if (attachment?.kind === "photo") {
    await prisma.photo.update({
      where: { id: attachment.photoId },
      data: { messageId: message.id },
    });
  }
  const dto = serializeMessage(message, { viewerUserId: req.apiUser.id });
  await enrichAttachments([dto], channel.orgId, req.apiUser.id);
  // Fan out to every SSE subscriber on this channel. Best-effort —
  // failures inside subscribers don't bubble up to the POST response.
  // NOTE: the SSE fan-out uses the *poster's* viewer perspective for
  // myResponse — that's intentional for v1 since each subscriber will
  // re-fetch on its next page load and see its own perspective. A
  // perfect fix is to fan out the un-enriched DTO and let each client
  // enrich locally; deferred until the SSE event volume justifies it.
  try {
    publishMessage(channel.id, dto);
  } catch (e) {
    log.warn("realtime publish failed", { err: e });
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
  await enrichAttachments([dto], channel.orgId, req.apiUser.id);
  try {
    publishMessage(channel.id, dto);
  } catch (e) {
    log.warn("realtime publish failed", { err: e });
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
  if (obj.kind === "rsvp") return normalizeRsvpAttachment(obj);
  if (obj.kind === "photo") return normalizePhotoAttachment(obj);
  return null;
}

function normalizeRsvpAttachment(obj) {
  const eventId = typeof obj.eventId === "string" ? obj.eventId.trim() : "";
  if (!eventId) return null;
  return { kind: "rsvp", eventId };
}

function normalizePhotoAttachment(obj) {
  const photoId = typeof obj.photoId === "string" ? obj.photoId.trim() : "";
  if (!photoId) return null;
  const caption = typeof obj.caption === "string" ? obj.caption.trim().slice(0, 280) : "";
  return { kind: "photo", photoId, caption };
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
  await enrichAttachments([dto], channel.orgId, userId);
  try { publishMessage(channel.id, dto); } catch { /* ignore */ }
  res.json({ message: dto });
});

/* ------------------------------------------------------------------ */
/* Upcoming-events list (chat composer's RSVP picker)                  */
/* ------------------------------------------------------------------ */

// GET /api/v1/orgs/:orgId/upcoming-events — minimal shape for the
// "pick an event to RSVP-embed" picker. Limited to next 60 days,
// 25 events. Auth: any org member (ChannelMember check would be
// per-channel; this is a cross-channel picker so we only require
// org-level membership).
apiRouter.get("/orgs/:orgId/upcoming-events", resolveApiUser, async (req, res) => {
  const orgId = req.params.orgId;
  const membership = await membershipFor(req.apiUser.id, orgId);
  if (!membership) return res.status(404).json({ error: "not_a_member" });

  const now = new Date();
  const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({
    where: {
      orgId,
      startsAt: { gte: now, lte: horizon },
    },
    orderBy: { startsAt: "asc" },
    take: 25,
    select: { id: true, title: true, startsAt: true, location: true },
  });
  res.json({ events });
});

// GET /api/v1/orgs/:orgId/events?from=...&to=... — richer shape for
// the mobile Calendar screen. Returns up to 60 events in the requested
// window with category + RSVP totals + the viewer's RSVP. Categories
// resolve to the lib/eventCategories palette key so the mobile client
// renders the same colours as the web.
apiRouter.get("/orgs/:orgId/events", resolveApiUser, async (req, res) => {
  const orgId = req.params.orgId;
  const membership = await membershipFor(req.apiUser.id, orgId);
  if (!membership) return res.status(404).json({ error: "not_a_member" });

  const fromMs = req.query?.from ? Date.parse(String(req.query.from)) : Date.now();
  const toMs = req.query?.to
    ? Date.parse(String(req.query.to))
    : Date.now() + 90 * 24 * 60 * 60 * 1000;
  const from = new Date(isNaN(fromMs) ? Date.now() : fromMs);
  const to = new Date(isNaN(toMs) ? Date.now() + 90 * 24 * 60 * 60 * 1000 : toMs);

  const events = await prisma.event.findMany({
    where: { orgId, startsAt: { gte: from, lte: to } },
    orderBy: { startsAt: "asc" },
    take: 60,
    select: {
      id: true, title: true, startsAt: true, endsAt: true,
      location: true, category: true, capacity: true, cost: true,
      _count: { select: { rsvps: true } },
    },
  });

  const ids = events.map((e) => e.id);
  const [yesByEvent, mineByEvent] = ids.length
    ? await Promise.all([
        prisma.rsvp.groupBy({
          by: ["eventId"],
          where: { orgId, response: "yes", eventId: { in: ids } },
          _count: { _all: true },
        }),
        prisma.rsvp.findMany({
          where: { orgId, eventId: { in: ids }, userId: req.apiUser.id },
          select: { eventId: true, response: true },
        }),
      ])
    : [[], []];
  const yesMap = new Map(yesByEvent.map((r) => [r.eventId, r._count._all]));
  const mineMap = new Map(mineByEvent.map((r) => [r.eventId, r.response]));

  const { categoryMeta } = await import("../lib/eventCategories.js");
  res.json({
    events: events.map((e) => {
      const meta = e.category ? categoryMeta(e.category) : null;
      return {
        id: e.id,
        title: e.title,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        location: e.location,
        category: e.category,
        categoryLabel: meta?.label || null,
        color: meta?.color || "primary",
        capacity: e.capacity,
        costCents: e.cost ? e.cost * 100 : null,
        rsvpYesCount: yesMap.get(e.id) || 0,
        rsvpTotalCount: e._count.rsvps,
        myRsvp: mineMap.get(e.id) || null,
      };
    }),
  });
});

/* ------------------------------------------------------------------ */
/* RSVP embeds                                                          */
/* ------------------------------------------------------------------ */

const RSVP_RESPONSES = ["yes", "maybe", "no"];

// POST /api/v1/messages/:id/rsvp — body: { response: 'yes'|'maybe'|'no' }.
// Upserts the Rsvp row for the (eventId, userId). Idempotent on
// re-tap of the same response (no-op + 200). Re-tapping a different
// response updates in place. Fans the updated message DTO over SSE.
apiRouter.post("/messages/:id/rsvp", resolveApiUser, async (req, res) => {
  const response = String(req.body?.response || "").trim().toLowerCase();
  if (!RSVP_RESPONSES.includes(response)) {
    return res.status(400).json({ error: "invalid_response" });
  }

  const message = await prisma.message.findUnique({
    where: { id: req.params.id },
    select: { id: true, channelId: true, attachmentJson: true, deletedAt: true },
  });
  if (!message || message.deletedAt) return res.status(404).json({ error: "not_found" });
  const att = message.attachmentJson;
  if (!att || att.kind !== "rsvp" || !att.eventId) {
    return res.status(409).json({ error: "not_an_rsvp" });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: message.channelId },
    select: { id: true, orgId: true, archivedAt: true, isSuspended: true, kind: true },
  });
  if (!channel || channel.archivedAt) return res.status(404).json({ error: "not_found" });
  const membership = await membershipFor(req.apiUser.id, channel.orgId);
  if (!membership) return res.status(404).json({ error: "not_found" });
  if (channel.isSuspended) {
    return res.status(409).json({ error: "channel_suspended", reason: channel.suspendedReason });
  }

  // Confirm the linked event still exists + is in this org.
  const event = await prisma.event.findFirst({
    where: { id: att.eventId, orgId: channel.orgId },
    select: { id: true },
  });
  if (!event) return res.status(404).json({ error: "event_deleted" });

  const displayName = req.apiUser.displayName || req.apiUser.email || "Unknown";
  await prisma.rsvp.upsert({
    where: {
      eventId_userId: { eventId: event.id, userId: req.apiUser.id },
    },
    create: {
      orgId: channel.orgId,
      eventId: event.id,
      userId: req.apiUser.id,
      name: displayName,
      email: req.apiUser.email || null,
      response,
    },
    update: { response, name: displayName },
  });

  // Re-fetch the message + reactions and serialize + enrich.
  const fresh = await prisma.message.findUnique({
    where: { id: message.id },
    include: {
      author: { select: { id: true, displayName: true } },
      reactions: { select: { emoji: true, userId: true } },
    },
  });
  const dto = serializeMessage(fresh, { viewerUserId: req.apiUser.id });
  await enrichAttachments([dto], channel.orgId, req.apiUser.id);
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

/* ------------------------------------------------------------------ */
/* Photo attachments                                                   */
/* ------------------------------------------------------------------ */

const PHOTO_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"]);

const photoUpload = multer({
  dest: process.env.UPLOAD_TMP || "/tmp/compass-uploads",
  limits: { fileSize: PHOTO_MAX_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    if (!PHOTO_MIMES.has(file.mimetype)) {
      return cb(new Error("Unsupported file type"));
    }
    cb(null, true);
  },
});

// POST /api/v1/channels/:id/photos — multipart single file. Creates an
// orphan Photo row (messageId=null), moves the temp file to per-org
// storage, and returns { id, filename }. The client then sends a normal
// /messages POST with attachment={kind:"photo", photoId}; we link them
// at send time. Orphan photos older than 1 hour get garbage-collected
// by a future janitor (deferred — first-pass: orphans accumulate but
// don't hurt anyone).
apiRouter.post("/channels/:id/photos", resolveApiUser, photoUpload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });

  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id },
    select: { id: true, orgId: true, kind: true, archivedAt: true, isSuspended: true },
  });
  if (!channel || channel.archivedAt) return res.status(404).json({ error: "not_found" });
  const membership = await membershipFor(req.apiUser.id, channel.orgId);
  if (!membership) return res.status(404).json({ error: "not_found" });
  if (channel.isSuspended) return res.status(409).json({ error: "channel_suspended" });

  // Generate a per-org filename. Keeps the original extension but uses
  // a random cuid-ish core so listing the storage directory doesn't
  // leak filenames or upload order.
  const ext = (path.extname(req.file.originalname) || ".jpg").toLowerCase().slice(0, 8);
  const filename = `${crypto.randomBytes(16).toString("hex")}${ext}`;
  await moveFromTemp(channel.orgId, filename, req.file.path);

  const photo = await prisma.photo.create({
    data: {
      orgId: channel.orgId,
      filename,
      originalName: req.file.originalname?.slice(0, 200) || null,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      uploaderUserId: req.apiUser.id,
    },
    select: { id: true, filename: true, mimeType: true, sizeBytes: true },
  });

  res.status(201).json({ photo });
});

// JSON 404 fallthrough — catches /api/v1/* paths the router didn't handle.
apiRouter.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});
