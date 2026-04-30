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

export const apiRouter = Router();

const MESSAGE_PAGE = 50;

/* ------------------------------------------------------------------ */
/* Auth middleware                                                     */
/* ------------------------------------------------------------------ */

async function resolveApiUser(req, res, next) {
  // Bearer-token path first (mobile / external).
  const auth = req.headers.authorization || "";
  if (/^Bearer\s+/i.test(auth)) {
    const v = await verifyToken(auth, prisma);
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

function serializeMessage(m) {
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
  };
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
    include: { author: { select: { id: true, displayName: true } } },
  });

  res.json({
    channel: serializeChannel(channel, { membership }),
    messages: messages.reverse().map(serializeMessage),
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
    include: { author: { select: { id: true, displayName: true } } },
  });

  res.json({
    messages: messages.reverse().map(serializeMessage),
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

  const message = await prisma.message.create({
    data: {
      channelId: channel.id,
      authorId: req.apiUser.id,
      body,
    },
    include: { author: { select: { id: true, displayName: true } } },
  });
  res.status(201).json({ message: serializeMessage(message) });
});

// JSON 404 fallthrough — catches /api/v1/* paths the router didn't handle.
apiRouter.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});
