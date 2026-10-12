// Youth protection (YPT) end to end.
//
//  1. Email: any broadcast that reaches a youth member also goes to the
//     youth's linked parent/guardian, so no adult emails a scout alone.
//  2. Chat two-deep: a channel holding a youth and fewer than two
//     YPT-current adult leaders is paused on the first post attempt,
//     can't be unpaused until a second current leader joins, and works
//     again once it has.
//
// Chat channels/memberships and org roles are set up in the DB
// (helpers/db.ts) because the app has no screens for them.

import { expect, test } from "@playwright/test";
import { TENANT, addMember, freshPage, signIn, signUp, uid } from "./helpers/flows";
import { createChannel, db, grantRole } from "./helpers/db";

test.describe("youth protection", () => {
  test("an email to a youth always copies the linked parent", async ({ page }) => {
    const tag = uid();
    const patrol = `Owls${tag}`;
    const parentEmail = `ypt-parent-${tag}@example.invalid`;
    const youthEmail = `ypt-youth-${tag}@example.invalid`;

    await signIn(page);
    await addMember(page, { firstName: "Gwen", lastName: `Guardian${tag}`, email: parentEmail, isYouth: false });
    await addMember(page, {
      firstName: "Yuri",
      lastName: `Youth${tag}`,
      email: youthEmail,
      isYouth: true,
      patrol,
      parentEmails: [parentEmail],
    });

    // Only the youth is in the patrol; the parent rides along.
    await page.goto(`${TENANT}/admin/email`);
    await page.getByLabel("Subject").fill(`Owls dry run ${tag}`);
    await page.getByLabel("Body").fill("Meet at the trailhead.");
    await page.locator("#audienceKind").selectOption("patrol");
    await page.locator("#audiencePatrol").selectOption(patrol);
    await page.locator("#dryRun").check();
    await page.getByRole("button", { name: /send broadcast/i }).click();
    await expect(page.getByRole("status")).toContainText("Would send to 2 recipients.");

    // Real send, then the log lists both addresses.
    await page.goto(`${TENANT}/admin/email`);
    const subject = `Owls trip ${tag}`;
    await page.getByLabel("Subject").fill(subject);
    await page.getByLabel("Body").fill("Packing list attached.");
    await page.locator("#audienceKind").selectOption("patrol");
    await page.locator("#audiencePatrol").selectOption(patrol);
    await page.getByRole("button", { name: /send broadcast/i }).click();
    await expect(page.getByRole("status")).toContainText("Sent to 2/2");

    await page.reload();
    await page.getByRole("link", { name: subject }).click();
    await expect(page.getByText(youthEmail)).toBeVisible();
    await expect(page.getByText(parentEmail)).toBeVisible();
  });

  test("youth-only audience also reaches every linked parent", async ({ page }) => {
    const tag = uid();
    const parentEmail = `ypt-parent2-${tag}@example.invalid`;
    await signIn(page);
    await addMember(page, { firstName: "Hal", lastName: `Guardian${tag}`, email: parentEmail, isYouth: false });
    await addMember(page, {
      firstName: "Ivy",
      lastName: `Youth${tag}`,
      email: `ypt-youth2-${tag}@example.invalid`,
      isYouth: true,
      parentEmails: [parentEmail],
    });

    await page.goto(`${TENANT}/admin/email`);
    const subject = `Youth-only ${tag}`;
    await page.getByLabel("Subject").fill(subject);
    await page.getByLabel("Body").fill("Youth announcement.");
    await page.locator("#audienceKind").selectOption("youth");
    await page.getByRole("button", { name: /send broadcast/i }).click();
    await expect(page.getByRole("status")).toContainText("Sent to");
    await page.reload();
    await page.getByRole("link", { name: subject }).click();
    // The adult parent is on a youth-only send because their child is.
    await expect(page.getByText(parentEmail)).toBeVisible();
  });

  test("chat with a youth needs two YPT-current leaders", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const tag = uid();
    const leaderA = `ypt-leader-a-${tag}@example.invalid`;
    const leaderB = `ypt-leader-b-${tag}@example.invalid`;
    const scout = `ypt-scout-${tag}@example.invalid`;

    // Accounts.
    const a = await freshPage(browser);
    await signUp(a.page, "Leader Alpha", leaderA);
    await grantRole(leaderA, "leader", { yptCurrent: true });
    const s = await freshPage(browser);
    await signUp(s.page, "Scout Sierra", scout);
    await grantRole(scout, "scout");
    const b = await freshPage(browser);
    await signUp(b.page, "Leader Bravo", leaderB);
    await grantRole(leaderB, "leader", { yptCurrent: true });
    await b.ctx.close();

    const channelName = `YPT probe ${tag}`;
    const channelId = await createChannel({ name: channelName, memberEmails: [leaderA, scout] });

    // One adult + one youth: the first post is refused and pauses the channel.
    await a.page.goto(`${TENANT}/chat?channel=${channelId}`);
    await expect(a.page.getByRole("heading", { name: channelName })).toBeVisible();
    await a.page.getByLabel("Message body").fill("Hi Sierra, just us here.");
    await a.page.getByRole("button", { name: /^send$/i }).click();
    await expect(a.page.locator('p[role="alert"]')).toHaveText("Channel paused: only-one-current-adult.");
    await a.page.reload();
    await expect(a.page.getByText("Paused: only-one-current-adult").first()).toBeVisible();
    await expect(a.page.getByLabel("Message body")).toHaveCount(0);
    await expect(a.page.getByText("Hi Sierra, just us here.")).toHaveCount(0);

    // The scout sees the pause too and can't post either.
    await s.page.goto(`${TENANT}/chat?channel=${channelId}`);
    await expect(s.page.getByText(/paused while we re-establish two-deep/i)).toBeVisible();
    await expect(s.page.getByLabel("Message body")).toHaveCount(0);

    // Admin can't lift the pause while only one leader is present.
    await signIn(page);
    await page.goto(`${TENANT}/admin/channels`);
    const row = page.locator("li.card").filter({ hasText: channelName });
    await row.getByRole("button", { name: "Unsuspend" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("add a second YPT-current adult leader");
    await expect(row).toContainText("Paused: only-one-current-adult");

    // Second YPT-current leader joins; unpause works; posting resumes.
    await db().channelMember.create({
      data: {
        channelId,
        userId: (await db().user.findUniqueOrThrow({ where: { email: leaderB } })).id,
        addedAutomatically: false,
      },
    });
    await page.goto(`${TENANT}/admin/channels`);
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST"),
      row.getByRole("button", { name: "Unsuspend" }).click(),
    ]);
    // The list refreshes in place, without a reload.
    await expect(row).not.toContainText("Paused:");
    await expect(row.getByRole("button", { name: "Unsuspend" })).toHaveCount(0);

    await a.page.goto(`${TENANT}/chat?channel=${channelId}`);
    await expect(a.page.getByText(/two-deep restored/i)).toBeVisible();
    const body = `Troop meeting moved to 7pm ${tag}`;
    await a.page.getByLabel("Message body").fill(body);
    await a.page.getByRole("button", { name: /^send$/i }).click();
    await expect(a.page.getByTestId("chat-messages")).toContainText(body);

    await s.page.goto(`${TENANT}/chat?channel=${channelId}`);
    await expect(s.page.getByText(body)).toBeVisible();

    await a.ctx.close();
    await s.ctx.close();
  });

  test("a youth can't reach the leader DM inbox", async ({ browser }) => {
    const { ctx, page } = await freshPage(browser);
    const email = `ypt-dm-scout-${uid()}@example.invalid`;
    await signUp(page, "Scout Tango", email);
    await grantRole(email, "scout");
    await page.goto(`${TENANT}/admin/dm`);
    await expect(page.getByRole("heading", { name: "Not authorized" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Direct messages" })).toHaveCount(0);
    await ctx.close();
  });
});
