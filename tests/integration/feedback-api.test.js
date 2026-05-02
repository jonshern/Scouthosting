// Integration tests for /api/v1/feedback (the public roadmap board).
//
// Covers:
//   - submit + list (with mine/voted decoration)
//   - vote toggle (one-per-user, atomic with cached voteCount)
//   - comments thread
//   - org isolation (cross-org reads return 404, not 403)
//   - help-kind requests get routed to SupportTicket instead of polluting
//     the public roadmap

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { app } from "../../server/index.js";
import { prisma } from "../../lib/db.js";
import { issueToken } from "../../lib/apiToken.js";
import { resetDb, TEST_ORG_SLUG } from "./_setup.js";

const request = supertest(app);

beforeAll(() => {
  delete process.env.ORIGIN_AUTH_SECRET;
});

/**
 * Create a user, an OrgMembership, and an API token for that user.
 * Returns { user, token: 'compass_pat_...' }.
 */
async function seedUser({ email, displayName, orgId, role = "leader" }) {
  const user = await prisma.user.create({
    data: { email, displayName, emailVerified: true },
  });
  await prisma.orgMembership.create({
    data: { userId: user.id, orgId, role },
  });
  const t = await issueToken(user.id, `${displayName} test token`, prisma);
  return { user, token: t.raw };
}

describe("/api/v1/feedback", () => {
  beforeEach(resetDb);

  it("POST /feedback creates an org-scoped request and lists with mine=true", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "Leader L.",
      orgId: org.id,
      role: "leader",
    });

    const create = await request
      .post("/api/v1/feedback")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orgId: org.id,
        kind: "feature",
        scope: "org",
        title: "Bulk-mark RSVPs after the fact",
        body: "Half my scouts forget to RSVP and just show up.",
        category: "Events",
      });
    expect(create.status).toBe(201);
    expect(create.body.request.title).toContain("Bulk-mark RSVPs");
    expect(create.body.request.status).toBe("submitted");
    expect(create.body.request.voteCount).toBe(0);

    const list = await request
      .get(`/api/v1/feedback?orgId=${org.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.requests).toHaveLength(1);
    expect(list.body.requests[0].mine).toBe(true);
    expect(list.body.requests[0].voted).toBe(false);
  });

  it("POST /feedback validates title and body lengths", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "v@test.invalid",
      displayName: "V",
      orgId: org.id,
    });

    const noTitle = await request
      .post("/api/v1/feedback")
      .set("Authorization", `Bearer ${token}`)
      .send({ orgId: org.id, body: "long enough body" });
    expect(noTitle.status).toBe(400);
    expect(noTitle.body.error).toBe("title_required");

    const noBody = await request
      .post("/api/v1/feedback")
      .set("Authorization", `Bearer ${token}`)
      .send({ orgId: org.id, title: "Has a title" });
    expect(noBody.status).toBe(400);
    expect(noBody.body.error).toBe("body_required");
  });

  it("POST /feedback rejects org-scope when caller is not a member", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    // Outsider has a User but no OrgMembership in TEST_ORG_SLUG.
    const outsider = await prisma.user.create({
      data: { email: "outsider@test.invalid", displayName: "Outsider", emailVerified: true },
    });
    const t = await issueToken(outsider.id, "outsider", prisma);

    const r = await request
      .post("/api/v1/feedback")
      .set("Authorization", `Bearer ${t.raw}`)
      .send({
        orgId: org.id,
        kind: "feature",
        scope: "org",
        title: "Test",
        body: "Test body",
      });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("not_a_member");
  });

  it("POST /feedback with kind=help routes to SupportTicket, not the roadmap", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "stuck@test.invalid",
      displayName: "Stuck Leader",
      orgId: org.id,
    });

    const r = await request
      .post("/api/v1/feedback")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orgId: org.id,
        kind: "help",
        scope: "org",
        title: "Calendar export is broken",
        body: "Clicking iCal export 500s.",
      });
    expect(r.status).toBe(201);
    expect(r.body.routed).toBe("support");
    expect(r.body.ticket.id).toBeTruthy();

    // Roadmap should be empty.
    const roadmap = await prisma.feedbackRequest.count();
    expect(roadmap).toBe(0);
    // Support ticket should exist.
    const tickets = await prisma.supportTicket.count();
    expect(tickets).toBe(1);
  });

  it("POST /feedback/:id/vote toggles vote and keeps voteCount in sync", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "voter@test.invalid",
      displayName: "Voter",
      orgId: org.id,
    });

    const created = await request
      .post("/api/v1/feedback")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orgId: org.id,
        kind: "feature",
        scope: "org",
        title: "Vote target",
        body: "Body for the vote target row.",
      });
    const id = created.body.request.id;

    const up = await request
      .post(`/api/v1/feedback/${id}/vote`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(up.status).toBe(200);
    expect(up.body.voted).toBe(true);
    expect(up.body.voteCount).toBe(1);

    // Toggle again — same caller, same request.
    const down = await request
      .post(`/api/v1/feedback/${id}/vote`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(down.status).toBe(200);
    expect(down.body.voted).toBe(false);
    expect(down.body.voteCount).toBe(0);
  });

  it("decorates list rows with voted=true after the caller votes", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token: a } = await seedUser({
      email: "author@test.invalid",
      displayName: "Author",
      orgId: org.id,
    });
    const { token: b } = await seedUser({
      email: "voter@test.invalid",
      displayName: "Voter",
      orgId: org.id,
    });

    const created = await request
      .post("/api/v1/feedback")
      .set("Authorization", `Bearer ${a}`)
      .send({
        orgId: org.id,
        scope: "org",
        title: "Co-vote target",
        body: "Body.",
      });
    const id = created.body.request.id;

    await request
      .post(`/api/v1/feedback/${id}/vote`)
      .set("Authorization", `Bearer ${b}`)
      .send({});

    const list = await request
      .get(`/api/v1/feedback?orgId=${org.id}`)
      .set("Authorization", `Bearer ${b}`);
    expect(list.body.requests[0].mine).toBe(false); // b didn't author
    expect(list.body.requests[0].voted).toBe(true);

    const listAsA = await request
      .get(`/api/v1/feedback?orgId=${org.id}`)
      .set("Authorization", `Bearer ${a}`);
    expect(listAsA.body.requests[0].mine).toBe(true);
    expect(listAsA.body.requests[0].voted).toBe(false);
  });

  it("hides org-scoped requests from non-members (cross-org returns 404)", async () => {
    const orgA = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const orgB = await prisma.org.create({
      data: {
        slug: "otherorg",
        unitType: "Troop",
        unitNumber: "12",
        displayName: "Other Org",
        charterOrg: "x",
        city: "y",
        state: "Z",
        scoutmasterName: "z",
        scoutmasterEmail: "z@x.invalid",
      },
    });

    const { token: aTok } = await seedUser({
      email: "a@test.invalid",
      displayName: "A",
      orgId: orgA.id,
    });
    const { token: bTok } = await seedUser({
      email: "b@test.invalid",
      displayName: "B",
      orgId: orgB.id,
    });

    // A submits a request in their own org.
    const created = await request
      .post("/api/v1/feedback")
      .set("Authorization", `Bearer ${aTok}`)
      .send({
        orgId: orgA.id,
        scope: "org",
        title: "Private to A",
        body: "Body.",
      });
    const id = created.body.request.id;

    // B (non-member of orgA) tries to read the org A list — gets 404.
    const list = await request
      .get(`/api/v1/feedback?orgId=${orgA.id}`)
      .set("Authorization", `Bearer ${bTok}`);
    expect(list.status).toBe(404);

    // B tries to vote on A's row — also 404.
    const vote = await request
      .post(`/api/v1/feedback/${id}/vote`)
      .set("Authorization", `Bearer ${bTok}`)
      .send({});
    expect(vote.status).toBe(404);
  });

  it("global-scope requests are visible to any authenticated user across orgs", async () => {
    const orgA = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const orgB = await prisma.org.create({
      data: {
        slug: "globalpeer",
        unitType: "Troop",
        unitNumber: "88",
        displayName: "Peer Org",
        charterOrg: "x",
        city: "y",
        state: "Z",
        scoutmasterName: "z",
        scoutmasterEmail: "z@x.invalid",
      },
    });
    const { token: aTok } = await seedUser({
      email: "a@test.invalid",
      displayName: "A",
      orgId: orgA.id,
    });
    const { token: bTok } = await seedUser({
      email: "b@test.invalid",
      displayName: "B",
      orgId: orgB.id,
    });

    await request
      .post("/api/v1/feedback")
      .set("Authorization", `Bearer ${aTok}`)
      .send({
        scope: "global",
        title: "Global feature request",
        body: "Should be visible from any org.",
      });

    const list = await request
      .get("/api/v1/feedback?scope=global")
      .set("Authorization", `Bearer ${bTok}`);
    expect(list.status).toBe(200);
    expect(list.body.requests).toHaveLength(1);
    expect(list.body.requests[0].title).toContain("Global");
    expect(list.body.requests[0].mine).toBe(false);
  });

  it("comments thread accepts replies and lists in chronological order", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "commenter@test.invalid",
      displayName: "Commenter",
      orgId: org.id,
    });

    const created = await request
      .post("/api/v1/feedback")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orgId: org.id,
        scope: "org",
        title: "Discussable item",
        body: "Body.",
      });
    const id = created.body.request.id;

    // Anonymous (no comments yet).
    const empty = await request
      .get(`/api/v1/feedback/${id}/comments`)
      .set("Authorization", `Bearer ${token}`);
    expect(empty.status).toBe(200);
    expect(empty.body.comments).toEqual([]);

    // Add two comments — the second should sort after the first.
    const c1 = await request
      .post(`/api/v1/feedback/${id}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "First take" });
    expect(c1.status).toBe(201);

    // Tiny gap so timestamps differ even on fast machines.
    await new Promise((r) => setTimeout(r, 10));

    const c2 = await request
      .post(`/api/v1/feedback/${id}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Follow-up thought" });
    expect(c2.status).toBe(201);

    const list = await request
      .get(`/api/v1/feedback/${id}/comments`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.comments).toHaveLength(2);
    expect(list.body.comments[0].body).toBe("First take");
    expect(list.body.comments[1].body).toBe("Follow-up thought");
    expect(list.body.comments.every((c) => c.isOperator === false)).toBe(true);
  });

  it("requires a non-trivial comment body", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "x@test.invalid",
      displayName: "X",
      orgId: org.id,
    });
    const created = await request
      .post("/api/v1/feedback")
      .set("Authorization", `Bearer ${token}`)
      .send({ orgId: org.id, scope: "org", title: "Title", body: "Body." });
    const id = created.body.request.id;

    const r = await request
      .post(`/api/v1/feedback/${id}/comments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("body_required");
  });

  it("requires an Authorization header (no anonymous reads)", async () => {
    const r = await request.get("/api/v1/feedback");
    expect(r.status).toBe(401);
  });

  it("defaults orgId to the tenant subdomain context when omitted", async () => {
    // admin/feedback.html (served on tenant subdomain) calls
    // /api/v1/feedback with no ?orgId= and expects to get its own
    // org's rows back. The tenant resolver populates req.org from the
    // Host header; the GET handler falls back to req.org.id.
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "Leader",
      orgId: org.id,
      role: "leader",
    });
    await prisma.feedbackRequest.create({
      data: {
        orgId: org.id,
        title: "Tenant-default request",
        body: "Should be visible without ?orgId=",
        scope: "org",
      },
    });

    const r = await request
      .get("/api/v1/feedback")
      .set("Host", `${TEST_ORG_SLUG}.localhost`)
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.requests.some((req) => req.title === "Tenant-default request")).toBe(true);
  });

  it("POST defaults orgId to the tenant subdomain context for org-scope submits", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const { token } = await seedUser({
      email: "leader@test.invalid",
      displayName: "Leader",
      orgId: org.id,
      role: "leader",
    });

    const r = await request
      .post("/api/v1/feedback")
      .set("Host", `${TEST_ORG_SLUG}.localhost`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        scope: "org",
        title: "Cookie-authed submit without orgId",
        body: "Picks up org from Host header.",
      });
    expect(r.status).toBe(201);
    const created = await prisma.feedbackRequest.findFirst({
      where: { title: "Cookie-authed submit without orgId" },
    });
    expect(created.orgId).toBe(org.id);
  });
});
