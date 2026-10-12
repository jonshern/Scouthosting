// The Compass MCP server: tools Claude calls to answer "how is Emmett
// doing?". One McpServer is built per request for the adult the access
// token belongs to (lib/mcp/oauth/tokens.ts#verifyAccessToken); every
// tool re-reads which scouts that adult may see (lib/mcp/scouts.ts), so
// nothing is cached between requests.
//
// Read tools need the scouts:read scope; the two write tools need
// scouts:write and only act when called with confirm: true, after
// Claude has asked the adult in the chat.

import { McpServer, ResourceTemplate, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod4";
import { ApiError } from "@/lib/api/v1";
import { logger } from "@/lib/log";
import { SCOPE_READ, SCOPE_WRITE } from "./config";
import { itemIndex, loadCatalog, type CatalogItem } from "./catalog";
import { describeJourney } from "./journey";
import { accessibleScouts, pickScout, ScoutLookupError, type AccessibleScout, type McpUser } from "./scouts";
import { inTroop, journeyFor, lanternCustom, pendingSignoffs, progressFor, recentActivity, upcomingEvents } from "./scout-data";
import { WriteRefused, requirementKnown, rsvpForEvent, setRequirementStatus } from "./writes";
import { prisma } from "@/lib/db";
import { EventFullError } from "@/lib/rsvp/capacity";

const log = logger.child("mcp");

export const SERVER_INFO = { name: "compass", title: "Compass", version: "1.0.0" };

const INSTRUCTIONS = `Compass is a Scouts BSA troop app. These tools answer a parent's or leader's questions about their scouts: rank, merit badges, what's left for the next rank and for Eagle, recent progress, upcoming events and sign-offs waiting on a counselor.
- Start with how_is_scout_doing for open questions like "how is Emmett doing?". Pass the scout's first name; with one linked scout the name can be left out.
- Requirement ids look like badge:first-aid#3 or rank:tenderfoot#4a. "done" means the scout says it's done and it waits for a leader or counselor to sign off; "signed_off" is official.
- Some scouts are followed only in Lantern, the family's own trail app, with no troop on Compass. For them "checked" steps are the family's record, not a troop sign-off, and there are no events or sign-offs.
- mark_requirement and rsvp_event change data. Call them with confirm: false (or without confirm) first, show the person what will change, and only call again with confirm: true after they say yes.`;

type Ctx = { user: McpUser; scopes: string[] };

const text = (s: string, structured?: Record<string, unknown>): CallToolResult => ({
  content: [{ type: "text", text: s }],
  ...(structured ? { structuredContent: structured } : {}),
});
const problem = (s: string): CallToolResult => ({ content: [{ type: "text", text: s }], isError: true });

const date = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const when = (d: Date) => d.toISOString().replace(/:\d\d\.\d{3}Z$/, "Z");

function describeChoices(choices: AccessibleScout[]): string {
  return choices.length ? ` Scouts you can ask about: ${choices.map((s) => `${s.label} (${s.orgName})`).join(", ")}.` : "";
}

/** Run a tool body with scope + scout lookup errors turned into tool errors, never thrown at the transport. */
async function guarded(ctx: Ctx, scope: string, body: () => Promise<CallToolResult>): Promise<CallToolResult> {
  if (!ctx.scopes.includes(scope)) {
    return problem(
      scope === SCOPE_WRITE
        ? "This connection is read-only. Reconnect Compass in Claude and allow changes to use this."
        : "This connection can't read scouts.",
    );
  }
  try {
    return await body();
  } catch (err) {
    if (err instanceof ScoutLookupError) return problem(err.message + describeChoices(err.choices));
    if (err instanceof WriteRefused) return problem(err.message);
    if (err instanceof EventFullError) {
      return problem(err.spotsLeft > 0 ? `That event only has ${err.spotsLeft} spot${err.spotsLeft === 1 ? "" : "s"} left.` : "That event is full.");
    }
    if (err instanceof ApiError) {
      if (err.code === "org_suspended") return problem("This unit's Compass account is paused, so changes can't be saved right now.");
      return problem("You don't have access to that.");
    }
    log.error("tool failed", { err: err instanceof Error ? { name: err.name, message: err.message } : String(err) });
    return problem("Something went wrong in Compass. Try again in a minute.");
  }
}

async function scoutFor(ctx: Ctx, name: string | undefined): Promise<AccessibleScout> {
  return pickScout(await accessibleScouts(ctx.user), name);
}

const scoutView = (s: AccessibleScout) => ({
  id: s.id,
  name: s.label,
  unit: inTroop(s) ? s.orgName : null,
  lantern: !!s.journeyId,
  patrol: s.patrol,
  relation: s.relation === "family" ? "your scout" : "in a unit you lead",
});

const ScoutArg = z
  .string()
  .max(80)
  .optional()
  .describe("The scout's first name (e.g. \"Emmett\"), first name and last initial, or id. Leave out when the adult has one linked scout.");

function requirementList(item: CatalogItem) {
  return item.reqs.flatMap((r) =>
    r.subs.length
      ? r.subs.map((s) => ({ id: `${item.key}#${s.id}`, text: s.t, parent: `${r.n}. ${r.t}${r.choose ? ` (do ${r.choose})` : ""}` }))
      : /^[0-9]/.test(r.n)
        ? [{ id: `${item.key}#${r.n}`, text: r.t, parent: null as string | null }]
        : [],
  );
}

function findItem(query: string, custom: Record<string, CatalogItem> = {}): CatalogItem | null {
  const catalog = loadCatalog();
  const q = query.trim().toLowerCase();
  const idx = itemIndex(catalog);
  for (const c of Object.values(custom)) if (!idx.has(c.key)) idx.set(c.key, c);
  if (!idx.size) return null;
  const direct = idx.get(q) ?? idx.get(`badge:${q}`) ?? idx.get(`rank:${q}`);
  if (direct) return direct;
  const slug = q.replace(/\b(merit badge|rank)\b/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return idx.get(`badge:${slug}`) ?? idx.get(`rank:${slug}`) ?? [...idx.values()].find((i) => i.name.toLowerCase() === q) ?? null;
}

export function buildMcpServer(ctx: Ctx): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  server.registerTool(
    "list_scouts",
    {
      title: "List scouts",
      description: "The scouts this adult can ask about: their own children first, then scouts in units they lead.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      guarded(ctx, SCOPE_READ, async () => {
        const scouts = await accessibleScouts(ctx.user);
        if (!scouts.length) return text("No scouts are linked to this Compass account yet.", { scouts: [] });
        return text(scouts.map((s) => `${s.label}, ${inTroop(s) ? s.orgName : "followed in Lantern"}${s.patrol ? `, ${s.patrol} patrol` : ""} (${scoutView(s).relation})`).join("\n"), {
          scouts: scouts.map(scoutView),
        });
      }),
  );

  server.registerTool(
    "how_is_scout_doing",
    {
      title: "How is a scout doing?",
      description:
        "A short written summary of a scout's journey: current rank, progress toward the next rank, merit badges earned and in progress, Eagle-required badges left, what changed in the last 30 days, sign-offs waiting, and the next few events.",
      inputSchema: z.object({ scout: ScoutArg }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ scout }) =>
      guarded(ctx, SCOPE_READ, async () => {
        const s = await scoutFor(ctx, scout);
        const [journey, recent, pending, events] = await Promise.all([
          journeyFor(s),
          recentActivity(s, 30),
          pendingSignoffs(s),
          upcomingEvents(s, ctx.user.id, 30),
        ]);
        const parts = [describeJourney(s.firstName, journey)];
        parts.push(
          recent.length
            ? `Last 30 days (${recent.length} change${recent.length === 1 ? "" : "s"}):\n${recent
                .slice(0, 8)
                .map((r) => `- ${date(r.at)}: ${r.what}`)
                .join("\n")}`
            : "Nothing changed in the last 30 days.",
        );
        if (pending.length) {
          parts.push(
            `Waiting for a sign-off:\n${pending
              .map((p) => `- ${p.itemName}: ${p.requirements.length} requirement${p.requirements.length === 1 ? "" : "s"} (signs off: ${p.signsOff.join(", ")})`)
              .join("\n")}`,
          );
        }
        if (events.length) {
          parts.push(
            `Coming up:\n${events
              .slice(0, 5)
              .map((e) => `- ${date(e.startsAt)} ${e.title}${e.rsvp ? ` (RSVP: ${e.rsvp})` : " (no RSVP yet)"}${e.permissionSlipNeeded && !e.permissionSlipSigned ? ", permission slip not signed" : ""}`)
              .join("\n")}`,
          );
        }
        if (!inTroop(s)) parts.push(`${s.firstName} isn't in a unit on Compass, so there are no troop sign-offs or events to show.`);
        return text(`${s.label}, ${inTroop(s) ? s.orgName : "followed in Lantern"}\n\n${parts.join("\n\n")}`, {
          scout: scoutView(s),
          rank: journey.rank,
          nextRank: journey.nextRank && { ...journey.nextRank, left: journey.nextRank.left.slice(0, 25) },
          badgesEarned: journey.badgesEarned.length,
          badgesInProgress: journey.badgesInProgress.map((b) => ({ name: b.name, percent: b.percent, waiting: b.waiting, eagle: b.eagle })),
          eagle: journey.eagle && { earned: journey.eagle.earned, total: journey.eagle.total },
          trail: journey.trail && { steps: journey.trail.items.length, complete: journey.trail.items.filter((i) => i.complete).length, next: journey.trail.next },
          recentChanges: recent.length,
          waitingForSignOff: pending.reduce((n, p) => n + p.requirements.length, 0),
          upcomingEvents: events.length,
        });
      }),
  );

  server.registerTool(
    "get_journey",
    {
      title: "Scout's full journey",
      description:
        "Everything about a scout's advancement as data: current rank and where it came from, every requirement left for the next rank, every badge earned (with date and source), every badge in progress with percent and what's left, and the Eagle-required list with which ones are done.",
      inputSchema: z.object({ scout: ScoutArg }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ scout }) =>
      guarded(ctx, SCOPE_READ, async () => {
        const s = await scoutFor(ctx, scout);
        const j = await journeyFor(s);
        const payload = { scout: scoutView(s), ...j };
        return text(JSON.stringify(payload, null, 1), payload as unknown as Record<string, unknown>);
      }),
  );

  server.registerTool(
    "recent_activity",
    {
      title: "Recent progress",
      description: "What changed for a scout recently: requirements started, marked done or signed off, badges earned, court of honor awards. Newest first.",
      inputSchema: z.object({
        scout: ScoutArg,
        days: z.number().int().min(1).max(365).optional().describe("How far back to look. Default 30."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ scout, days }) =>
      guarded(ctx, SCOPE_READ, async () => {
        const s = await scoutFor(ctx, scout);
        const window = days ?? 30;
        const items = await recentActivity(s, window);
        const body = items.length ? items.map((i) => `${date(i.at)}: ${i.what}`).join("\n") : `No changes for ${s.firstName} in the last ${window} days.`;
        return text(body, { scout: scoutView(s), days: window, changes: items.map((i) => ({ at: when(i.at), what: i.what, requirementId: i.requirementId ?? null })) });
      }),
  );

  server.registerTool(
    "upcoming_events",
    {
      title: "Upcoming events",
      description:
        "Events in the scout's unit coming up (meetings, campouts, badge days), with the RSVP on file for the scout or for you, and whether a permission slip still needs signing. Event ids here are what rsvp_event takes.",
      inputSchema: z.object({
        scout: ScoutArg,
        days: z.number().int().min(1).max(180).optional().describe("How far ahead to look. Default 60."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ scout, days }) =>
      guarded(ctx, SCOPE_READ, async () => {
        const s = await scoutFor(ctx, scout);
        const window = days ?? 60;
        const events = await upcomingEvents(s, ctx.user.id, window);
        const body = events.length
          ? events
              .map(
                (e) =>
                  `${when(e.startsAt)} ${e.title}${e.location ? ` at ${e.location}` : ""}${e.badgeDay ? " [badge day]" : ""} — ${
                    e.rsvp ? `RSVP ${e.rsvp}${e.rsvpFor === "you" ? " (yours)" : ""}` : "no RSVP"
                  }${e.permissionSlipNeeded ? (e.permissionSlipSigned ? ", slip signed" : ", permission slip needed") : ""} (id ${e.id})`,
              )
              .join("\n")
          : inTroop(s)
            ? `Nothing on ${s.orgName}'s calendar in the next ${window} days.`
            : `${s.firstName} isn't in a unit on Compass, so there's no calendar to show.`;
        return text(body, {
          scout: scoutView(s),
          events: events.map((e) => ({ ...e, startsAt: when(e.startsAt), endsAt: e.endsAt ? when(e.endsAt) : null })),
        });
      }),
  );

  server.registerTool(
    "pending_signoffs",
    {
      title: "Waiting for a sign-off",
      description: "Requirements the scout has marked done that still need a counselor or leader to sign off, grouped by badge or rank, with who signs off.",
      inputSchema: z.object({ scout: ScoutArg }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ scout }) =>
      guarded(ctx, SCOPE_READ, async () => {
        const s = await scoutFor(ctx, scout);
        const pending = await pendingSignoffs(s);
        const body = pending.length
          ? pending
              .map(
                (p) =>
                  `${p.itemName} (signs off: ${p.signsOff.join(", ")}):\n${p.requirements
                    .map((r) => `- ${r.id}${r.text ? `: ${r.text}` : ""} (marked done ${date(r.markedDoneAt)})`)
                    .join("\n")}`,
              )
              .join("\n\n")
          : inTroop(s)
            ? `Nothing of ${s.firstName}'s is waiting for a sign-off.`
            : `${s.firstName} isn't in a unit on Compass, so nothing waits for a troop sign-off.`;
        return text(body, { scout: scoutView(s), pending: pending.map((p) => ({ ...p, requirements: p.requirements.map((r) => ({ ...r, markedDoneAt: when(r.markedDoneAt) })) })) });
      }),
  );

  server.registerTool(
    "get_requirements",
    {
      title: "Requirements for a rank or badge",
      description:
        "The requirements of one rank or merit badge (e.g. \"First Aid\", \"badge:plumbing\", \"Tenderfoot\"), with their ids, and the scout's status on each when a scout is named.",
      inputSchema: z.object({
        item: z.string().min(2).max(80).describe("Badge or rank name, or key like badge:first-aid / rank:star."),
        scout: z.string().max(80).optional().describe("Include this scout's status on each requirement."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ item, scout }) =>
      guarded(ctx, SCOPE_READ, async () => {
        const who = scout ? await scoutFor(ctx, scout) : null;
        const found = findItem(item, who ? await lanternCustom(who) : {});
        if (!found) {
          return problem(loadCatalog() ? `No rank or merit badge matches "${item}".` : "The requirement catalog isn't loaded on this Compass server.");
        }
        const reqs = requirementList(found);
        const statuses = new Map<string, { status: string; on: string | null }>();
        if (who) {
          const p = await progressFor(who, found.key);
          // Troop sign-offs win; a Lantern check counts as "checked".
          for (const l of p.lantern) statuses.set(l.requirementId, { status: "checked", on: l.doneOn });
          for (const t of p.troop) {
            if (t.status === "signed_off" || !statuses.has(t.requirementId)) {
              statuses.set(t.requirementId, { status: t.status, on: date(t.signedOffAt) });
            }
          }
          if (p.itemChecked) for (const r of reqs) if (!statuses.has(r.id)) statuses.set(r.id, { status: "checked", on: null });
        }
        const lines = reqs.map((r) => {
          const st = statuses.get(r.id);
          return `${r.id}: ${r.text}${who ? ` [${st?.status ?? "not_started"}${st?.on ? ` ${st.on}` : ""}]` : ""}`;
        });
        const header = `${found.name}${found.eagle ? " (Eagle-required)" : ""}${found.retired ? ` (discontinued ${found.retired})` : ""}${found.official ? `\n${found.official}` : ""}`;
        return text(`${header}\n${lines.join("\n")}`, {
          key: found.key,
          name: found.name,
          eagleRequired: !!found.eagle,
          ...(who ? { scout: scoutView(who) } : {}),
          requirements: reqs.map((r) => ({ ...r, status: who ? (statuses.get(r.id)?.status ?? "not_started") : undefined })),
        });
      }),
  );

  server.registerTool(
    "mark_requirement",
    {
      title: "Mark a requirement",
      description:
        "Record a scout's progress on one requirement: in_progress, done (the scout finished it; a counselor or leader still signs off) or not_started. It can't sign off. First call with confirm false to get a preview, ask the person, then call again with confirm true.",
      inputSchema: z.object({
        scout: ScoutArg,
        requirement: z.string().max(128).describe("Requirement id, e.g. badge:first-aid#3 or rank:tenderfoot#4a (get_requirements lists them)."),
        status: z.enum(["in_progress", "done", "not_started"]),
        note: z.string().max(2000).optional().describe("Optional note saved with it, e.g. where or when it was done."),
        confirm: z.boolean().optional().describe("true only after the person said yes to the preview."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ scout, requirement, status, note, confirm }) =>
      guarded(ctx, SCOPE_WRITE, async () => {
        const s = await scoutFor(ctx, scout);
        const custom = await lanternCustom(s);
        const known = requirementKnown(requirement, custom);
        if (!known.ok) return problem(known.reason);
        const label = `${requirement}${known.text ? ` ("${known.text}")` : ""}`;
        const lantern = !inTroop(s) || requirement.startsWith("custom:");
        if (lantern && status === "in_progress") {
          return problem(`${s.firstName}'s steps are tracked in Lantern, which only has checked or not. Use done or not_started.`);
        }
        const words = lantern
          ? { in_progress: "in progress", done: "checked off in Lantern", not_started: "not checked" }[status]
          : { in_progress: "in progress", done: "done (waiting for a sign-off)", not_started: "not started" }[status];
        if (confirm !== true) {
          return text(`Not saved yet. Ask the person: mark ${s.firstName}'s ${label} as ${words}?${note ? ` Note: "${note}".` : ""} If they say yes, call mark_requirement again with confirm: true.`, {
            preview: true,
            scout: scoutView(s),
            requirement,
            status,
          });
        }
        const r = await setRequirementStatus(ctx.user, s, requirement, status, note ?? null, custom);
        log.info("requirement marked", { userId: ctx.user.id, scoutId: s.id, requirement, status, changed: r.changed });
        return text(r.changed ? `Saved: ${s.firstName}'s ${label} is now ${words}.` : `No change: ${s.firstName}'s ${label} was already ${words}.`, {
          saved: r.changed,
          scout: scoutView(s),
          requirement,
          from: r.from,
          status,
        });
      }),
  );

  server.registerTool(
    "rsvp_event",
    {
      title: "RSVP to an event",
      description:
        "Set your own RSVP (the signed-in adult) for an event in your unit, the same as RSVPing in the Compass app. Paid events charge your family account as usual. First call with confirm false to get a preview, ask the person, then call again with confirm true.",
      inputSchema: z.object({
        event: z.string().max(64).describe("Event id from upcoming_events."),
        response: z.enum(["yes", "no", "maybe"]),
        guests: z.number().int().min(0).max(20).optional(),
        notes: z.string().max(1000).optional(),
        confirm: z.boolean().optional().describe("true only after the person said yes to the preview."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ event, response, guests, notes, confirm }) =>
      guarded(ctx, SCOPE_WRITE, async () => {
        const memberships = await prisma.orgMembership.findMany({ where: { userId: ctx.user.id }, select: { orgId: true } });
        const row = /^[A-Za-z0-9_-]+$/.test(event)
          ? await prisma.event.findFirst({
              where: { id: event, orgId: { in: memberships.map((m) => m.orgId) } },
              select: { id: true, orgId: true, title: true, startsAt: true, cost: true },
            })
          : null;
        if (!row) return problem("No such event in your units. upcoming_events lists the ids.");
        const what = `RSVP "${response}" to ${row.title} on ${date(row.startsAt)}${guests ? ` with ${guests} guest${guests === 1 ? "" : "s"}` : ""}${row.cost ? ` (cost $${row.cost})` : ""}`;
        if (confirm !== true) {
          return text(`Not saved yet. Ask the person: ${what}? If they say yes, call rsvp_event again with confirm: true.`, { preview: true, event: row.id, response });
        }
        const r = await rsvpForEvent(ctx.user, row, response, guests ?? 0, notes ?? null);
        log.info("rsvp via connector", { userId: ctx.user.id, eventId: row.id, response });
        return text(`Saved: ${what}.`, { saved: true, event: row.id, response: r.response, guests: r.guests });
      }),
  );

  // The catalog as resources, for clients that browse them.
  server.registerResource(
    "catalog",
    "compass://catalog",
    { title: "Requirement catalog", description: "Every rank and merit badge with its key (badge:<slug>, rank:<slug>).", mimeType: "application/json" },
    async (uri) => {
      const c = loadCatalog();
      const body = c
        ? { ranks: c.ranks.map((r) => ({ key: r.key, name: r.name })), badges: c.badges.map((b) => ({ key: b.key, name: b.name, eagleRequired: !!b.eagle, retired: b.retired ?? null })) }
        : { error: "catalog_not_loaded" };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body) }] };
    },
  );
  server.registerResource(
    "catalog-item",
    new ResourceTemplate("compass://catalog/{key}", { list: undefined }),
    { title: "Requirements for one rank or badge", description: "compass://catalog/badge:first-aid", mimeType: "application/json" },
    async (uri, vars) => {
      const key = decodeURIComponent(String(Array.isArray(vars.key) ? vars.key[0] : vars.key));
      const item = itemIndex(loadCatalog()).get(key);
      const body = item ? { key: item.key, name: item.name, eagleRequired: !!item.eagle, official: item.official ?? null, requirements: requirementList(item) } : { error: "not_found" };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body) }] };
    },
  );

  return server;
}
