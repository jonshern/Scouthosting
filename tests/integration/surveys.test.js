import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { app } from "../../server/index.js";
import { prisma } from "../../lib/db.js";
import { resetDb, getCsrf, TEST_ORG_SLUG } from "./_setup.js";

const request = supertest(app);
const HOST = `${TEST_ORG_SLUG}.localhost`;

beforeAll(() => {
  delete process.env.ORIGIN_AUTH_SECRET;
});

describe("survey submit", () => {
  beforeEach(resetDb);

  it("anonymous can submit an 'anyone' survey; response stored with typed answers", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    const survey = await prisma.survey.create({
      data: {
        orgId: org.id,
        slug: "feedback",
        title: "Feedback",
        audience: "anyone",
        questions: [
          { id: "q1", type: "scale", label: "Rating", required: true },
          { id: "q2", type: "yesno", label: "Would attend again?", required: false },
          { id: "q3", type: "text", label: "Notes", required: false },
        ],
      },
    });

    const { cookie, csrf } = await getCsrf(request, "/surveys/feedback");
    const r = await request
      .post("/surveys/feedback")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .type("form")
      .send({
        name: "Anon",
        email: "anon@test.invalid",
        q1: "5",
        q2: "yes",
        q3: "Best campout yet.",
        csrf,
      });
    expect(r.status).toBe(200);

    const responses = await prisma.surveyResponse.findMany({ where: { surveyId: survey.id } });
    expect(responses).toHaveLength(1);
    expect(responses[0].answers.q1).toBe(5);
    expect(responses[0].answers.q2).toBe(true);
    expect(responses[0].answers.q3).toBe("Best campout yet.");
  });

  it("members-only survey redirects anonymous viewers to /login", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    await prisma.survey.create({
      data: {
        orgId: org.id,
        slug: "internal",
        title: "Internal",
        audience: "members",
        questions: [],
      },
    });
    const r = await request.get("/surveys/internal").set("Host", HOST);
    expect(r.status).toBe(302);
    expect(r.headers.location).toContain("/login?next=/surveys/internal");
  });

  it("submit without CSRF → 403", async () => {
    const org = await prisma.org.findUnique({ where: { slug: TEST_ORG_SLUG } });
    await prisma.survey.create({
      data: {
        orgId: org.id,
        slug: "open",
        title: "Open",
        audience: "anyone",
        questions: [{ id: "q1", type: "text", label: "?", required: false }],
      },
    });
    const r = await request
      .post("/surveys/open")
      .set("Host", HOST)
      .type("form")
      .send({ name: "x", email: "x@y.test", q1: "anything" });
    expect(r.status).toBe(403);
  });
});
