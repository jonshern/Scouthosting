import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { app } from "../../server/index.js";
import { prisma } from "../../lib/db.js";
import { resetDb, getCsrf, signUpUser, mergeCookies, TEST_ORG_SLUG } from "./_setup.js";

const request = supertest(app);
const HOST = `${TEST_ORG_SLUG}.localhost`;

beforeAll(() => {
  delete process.env.ORIGIN_AUTH_SECRET;
});

describe("posts + comments", () => {
  beforeEach(resetDb);

  it("public post is visible at /posts and /posts/:id without login", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const post = await prisma.post.create({
      data: {
        orgId: org.id,
        title: "Camporee recap",
        body: "What a weekend.",
        visibility: "public",
      },
    });

    const list = await request.get("/posts").set("Host", HOST);
    expect(list.status).toBe(200);
    expect(list.text).toContain("Camporee recap");

    const detail = await request.get(`/posts/${post.id}`).set("Host", HOST);
    expect(detail.status).toBe(200);
    expect(detail.text).toContain("What a weekend");
  });

  it("members-only post redirects anonymous viewers to /login", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const post = await prisma.post.create({
      data: {
        orgId: org.id,
        title: "Internal",
        body: "secret",
        visibility: "members",
      },
    });

    const r = await request.get(`/posts/${post.id}`).set("Host", HOST);
    expect(r.status).toBe(302);
    expect(r.headers.location).toContain("/login?next=");
  });

  it("posting a comment requires login; signed-in user's comment shows up", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const post = await prisma.post.create({
      data: { orgId: org.id, title: "Trip", body: "x", visibility: "public" },
    });

    // Anonymous → 302 to /login
    const anon = await request
      .post(`/posts/${post.id}/comments`)
      .set("Host", HOST)
      .type("form")
      .send({ body: "Anon attempt" });
    // CSRF runs first; with no token this is 403 not 302 — fine; either
    // way the comment never lands.
    expect([302, 403]).toContain(anon.status);
    expect(await prisma.comment.count()).toBe(0);

    // Sign up as a parent user, then post a comment.
    const { cookie } = await signUpUser(request, {
      email: "parent@test.invalid",
      password: "this-is-a-strong-pw",
      displayName: "Parent",
    });

    // /posts/:id when signed-in renders the comment form (with the CSRF
    // token already injected via csrfHtmlInjector). Anonymous viewers
    // see "Sign in to comment" with no form, so we must hit the page
    // with the session cookie attached.
    const detail = await request
      .get(`/posts/${post.id}`)
      .set("Host", HOST)
      .set("Cookie", cookie);
    const m = detail.text.match(/name="csrf"\s+value="([^"]+)"/);
    expect(m, "comment form should render with CSRF token").toBeTruthy();
    const csrf = m[1];

    const r = await request
      .post(`/posts/${post.id}/comments`)
      .set("Host", HOST)
      .set("Cookie", cookie)
      .type("form")
      .send({ body: "Great trip!", csrf });
    expect(r.status).toBe(302);

    const comments = await prisma.comment.findMany();
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("Great trip!");
  });
});
