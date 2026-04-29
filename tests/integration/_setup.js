// Shared fixtures + helpers for integration tests.
//
// The whole test runner shares one Postgres database (DATABASE_URL).
// Each test calls `resetDb()` in beforeEach; we truncate the org-scoped
// tables and re-seed a minimal demo org. Sequential tests so ordering
// is deterministic; we set test.concurrent = false in the test files.

// Rate limiter is opt-out per request via env, so set it before any
// integration test (and any module that touches the limiter) runs.
process.env.DISABLE_RATE_LIMIT = "1";

import { prisma } from "../../lib/db.js";

export const TEST_ORG_SLUG = "testtroop";

/**
 * Wipe everything we touch and recreate a single deterministic org.
 * Ten tables get truncated; the org itself is re-upserted with stable
 * ids per slot so URLs are predictable.
 */
export async function resetDb() {
  // Order matters because Prisma cascades take care of children, but
  // these top-level tables keep state across test runs.
  await prisma.oaCandidate.deleteMany({});
  await prisma.oaElection.deleteMany({});
  await prisma.reimbursement.deleteMany({});
  await prisma.meritBadgeCounselor.deleteMany({});
  await prisma.carRideRider.deleteMany({});
  await prisma.carRide.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.subgroup.deleteMany({});
  await prisma.training.deleteMany({});
  await prisma.equipmentLoan.deleteMany({});
  await prisma.positionTerm.deleteMany({});
  await prisma.surveyResponse.deleteMany({});
  await prisma.survey.deleteMany({});
  await prisma.cohAward.deleteMany({});
  await prisma.eagleProject.deleteMany({});
  await prisma.eagleScout.deleteMany({});
  await prisma.gearItem.deleteMany({});
  await prisma.ingredient.deleteMany({});
  await prisma.meal.deleteMany({});
  await prisma.tripPlan.deleteMany({});
  await prisma.slotAssignment.deleteMany({});
  await prisma.signupSlot.deleteMany({});
  await prisma.rsvp.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.equipment.deleteMany({});
  await prisma.form.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.postPhoto.deleteMany({});
  await prisma.post.deleteMany({});
  await prisma.announcement.deleteMany({});
  await prisma.photo.deleteMany({});
  await prisma.album.deleteMany({});
  await prisma.member.deleteMany({});
  await prisma.customPage.deleteMany({});
  await prisma.page.deleteMany({});
  await prisma.mailLog.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.oAuthAccount.deleteMany({});
  await prisma.orgMembership.deleteMany({});
  await prisma.user.deleteMany({});
  // Delete all orgs (and their cascading children) so each test gets a
  // clean slate — including any secondary orgs a previous test created.
  await prisma.org.deleteMany({});

  const org = await prisma.org.create({
    data: {
      slug: TEST_ORG_SLUG,
      unitType: "Troop",
      unitNumber: "999",
      displayName: "Test Troop 999",
      charterOrg: "Test Charter",
      city: "Testville",
      state: "TS",
      scoutmasterName: "Test Scoutmaster",
      scoutmasterEmail: "sm@test.invalid",
      isDemo: true,
    },
  });
  return org;
}

/**
 * Drive the GET, scrape the cookie + CSRF token + (optionally) the
 * honeypot timestamp, and return them so the caller can issue
 * authenticated POSTs that pass both gates.
 */
export async function getCsrf(request, path = "/login") {
  const r = await request.get(path).set("Host", `${TEST_ORG_SLUG}.localhost`);
  const cookies = (r.headers["set-cookie"] || []).map((c) => c.split(";")[0]);
  const cookieHeader = cookies.join("; ");
  const m = (r.text || "").match(/name="csrf"\s+value="([^"]+)"/);
  if (!m) throw new Error("No CSRF token in response — server didn't render a form");
  const startedAt = (r.text || "").match(/name="form_started_at"\s+value="([^"]+)"/);
  return {
    cookie: cookieHeader,
    csrf: m[1],
    formStartedAt: startedAt ? startedAt[1] : null,
  };
}

/**
 * Sign up a user via /signup on the test org. Returns a cookie string
 * that carries both the CSRF cookie and the live session cookie.
 *
 * Bypasses the honeypot's minimum-fill-time check by signing a fresh
 * past timestamp — `lib/honeypot.js#_internal.sign(now - 5000)` is
 * accepted because the form looks at least 2 seconds old.
 */
export async function signUpUser(request, { email, password, displayName }) {
  const { cookie, csrf } = await getCsrf(request, "/signup");
  const { _internal } = await import("../../lib/honeypot.js");
  const formStartedAt = _internal.sign(Date.now() - 5000);
  const signup = await request
    .post("/signup")
    .set("Host", `${TEST_ORG_SLUG}.localhost`)
    .set("Cookie", cookie)
    .type("form")
    .send({ email, password, displayName, csrf, form_started_at: formStartedAt });
  // Merge the session Set-Cookie from the POST response with the
  // existing CSRF cookie. supertest doesn't keep a cookie jar across
  // requests, so we hand-roll it.
  const merged = mergeCookies([cookie, signup.headers["set-cookie"]]);
  return { cookie: merged, csrf };
}

function mergeCookies(layers) {
  const map = new Map();
  for (const layer of layers) {
    if (!layer) continue;
    const arr = Array.isArray(layer) ? layer : layer.split("; ").map((c) => c);
    for (const raw of arr) {
      const piece = String(raw).split(";")[0];
      const [k] = piece.split("=");
      if (k) map.set(k, piece);
    }
  }
  return [...map.values()].join("; ");
}

export { mergeCookies };
