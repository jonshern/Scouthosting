// Getting people into a unit: a leader adds an adult to the roster and
// sends an invite, the parent follows the link to /join, makes an
// account, confirms the email and lands in the unit with family access;
// an admin then raises them to leader on their roster page.

import { expect, test } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TENANT,
  USER_PASSWORD,
  addMember,
  freshPage,
  showPasswordSignIn,
  signIn,
  skipPasskeyPrompt,
  uid,
} from "./helpers/flows";
import { confirmEmail, db, memberIdByEmail, orgId, userIdByEmail } from "./helpers/db";

test("a parent invited from the roster joins the unit, and an admin makes them a leader", async ({ page, browser }) => {
  const id = uid();
  const email = `invited+${id}@example.invalid`;

  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await addMember(page, { firstName: "Ivy", lastName: `Invite${id}`, email, isYouth: false });
  const memberId = await memberIdByEmail(email);

  await page.goto(`${TENANT}/admin/members/${memberId}`);
  const access = page.getByRole("region", { name: "Site access" });
  await expect(access).toContainText("Not joined yet");
  await access.getByRole("button", { name: "Send invite" }).click();
  await expect(access.getByRole("status")).toHaveText(`Invite sent to ${email}.`);

  // The parent, in their own browser.
  const { ctx, page: parent } = await freshPage(browser);
  await parent.goto(`${TENANT}/join`);
  await expect(parent.getByRole("heading", { name: /^Join / })).toBeVisible();
  await parent.getByRole("link", { name: "Create my account" }).click();
  await expect(parent).toHaveURL(/\/signup\?next=/);
  await parent.getByLabel("Your name").fill("Ivy Invite");
  await parent.getByLabel("Email").fill(email);
  await parent.getByLabel("Password").fill(USER_PASSWORD);
  await parent.getByLabel(/18 or older/).check();
  await parent.waitForTimeout(1700);
  await parent.getByRole("button", { name: /create account/i }).click();
  await skipPasskeyPrompt(parent);

  // Not confirmed yet: told exactly that, and not let in.
  await parent.goto(`${TENANT}/join`);
  await expect(parent.getByRole("heading", { name: "Confirm your email first" })).toBeVisible();

  // Following the emailed link confirms the address; the join page then lets them in.
  await confirmEmail(email);
  await parent.goto(`${TENANT}/join`);
  await expect(parent.getByRole("heading", { name: /^You're in / })).toBeVisible();
  await parent.getByRole("link", { name: "Chat" }).click();
  await expect(parent.getByText("Chat is for members of this unit.")).toHaveCount(0);
  await ctx.close();

  const userId = await userIdByEmail(email);
  const oid = await orgId();
  expect((await db().orgMembership.findUniqueOrThrow({ where: { userId_orgId: { userId, orgId: oid } } })).role).toBe(
    "parent",
  );

  // The admin sees they've joined and makes them a leader.
  await page.goto(`${TENANT}/admin/members/${memberId}`);
  await expect(access).toContainText("Joined · Family access");
  await access.getByLabel("Access level").selectOption("leader");
  await access.getByRole("button", { name: "Save" }).click();
  await expect(access.getByRole("status")).toHaveText("Now leader access.");
  expect((await db().orgMembership.findUniqueOrThrow({ where: { userId_orgId: { userId, orgId: oid } } })).role).toBe(
    "leader",
  );
});

test("someone not on the roster is told to ask a leader, and isn't let in", async ({ browser }) => {
  const id = uid();
  const email = `stranger+${id}@example.invalid`;
  const { ctx, page } = await freshPage(browser);
  await page.goto(`${TENANT}/signup`);
  await page.getByLabel("Your name").fill("Sam Stranger");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(USER_PASSWORD);
  await page.getByLabel(/18 or older/).check();
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /create account/i }).click();
  await skipPasskeyPrompt(page);
  await confirmEmail(email);

  await page.goto(`${TENANT}/join`);
  await expect(page.getByRole("heading", { name: "We couldn't find you on the roster" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  const userId = await userIdByEmail(email);
  expect(await db().orgMembership.count({ where: { userId } })).toBe(0);
  await ctx.close();
});

test("the join page offers sign-up and sign-in when signed out", async ({ browser }) => {
  const { ctx, page } = await freshPage(browser);
  await page.goto(`${TENANT}/join`);
  await page.getByRole("link", { name: "I already have one" }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await showPasswordSignIn(page);
  await ctx.close();
});
