"use client";

// 12-step setup checklist per design_handoff_compass_cms/setup.jsx.
// Progress is persisted to localStorage scoped per-org so the demo
// state survives a refresh without requiring a DB migration. (A
// future iteration can promote this to a server-side `Org.setupProgress
// Json?` column if multi-device sync is needed.)

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Task = { t: string };
type Step = {
  id: string;
  num: number;
  label: string;
  time: string;
  desc: string;
  depends?: number;
  optional?: boolean;
  href?: string; // jump-to-section link in the admin
  tasks: Task[];
};

const SETUP_STEPS: Step[] = [
  {
    id: "plan",
    num: 1,
    label: "Planning",
    time: "30 min",
    desc: "Decide who's running the site and what features matter.",
    tasks: [
      { t: "Meet with committee — set goals, owners, schedule" },
      { t: "Pick data sources for roster, advancement, accounting" },
      { t: "Decide if scouts can request requirement sign-offs in-app" },
      { t: "Decide on credit card payments + who pays the fees" },
      { t: "Decide whether adults submit reimbursements through the site" },
      { t: "If you run boy + girl troops, decide one site or two" },
    ],
  },
  {
    id: "roster1",
    num: 2,
    label: "Initial roster",
    time: "20 min",
    depends: 1,
    href: "/members",
    desc: "Get your setup leaders into the system so they can help.",
    tasks: [
      { t: "Upload membership data, OR…" },
      { t: "Manually add the leaders helping set up the site" },
    ],
  },
  {
    id: "security",
    num: 3,
    label: "Security",
    time: "10 min",
    depends: 2,
    href: "/security",
    desc: "Promote your setup crew to admins.",
    tasks: [
      { t: "Assign roles (Scoutmaster, Committee, Treasurer, Webmaster…)" },
      { t: "Send invite emails with first-time login links" },
    ],
  },
  {
    id: "roster",
    num: 4,
    label: "Full roster",
    time: "1 hour",
    depends: 3,
    href: "/members",
    desc: "Add everyone — scouts, adults, patrols, training.",
    tasks: [
      { t: "Add remaining members (or invite parents to self-register)" },
      { t: "Set up patrols and patrol membership" },
      { t: "Enter current scout & adult leader positions" },
      { t: "Upload adult training (YPT, position-specific)" },
      { t: "Create dynamic subgroups (e.g. 'going to Philmont')" },
      { t: "Ask leaders to fill in their About Me + photo" },
    ],
  },
  {
    id: "site",
    num: 5,
    label: "Public site",
    time: "45 min",
    depends: 3,
    href: "/site",
    desc: "Make your unit look great to prospective families.",
    tasks: [
      { t: "Upload a banner image" },
      { t: "Edit Home + About Our Troop" },
      { t: "Create custom pages — history, FAQ, leaders" },
      { t: "Post your first announcement" },
      { t: "Upload troop forms (medical, permission slips, etc.)" },
      { t: "Add resource links" },
    ],
  },
  {
    id: "calendar",
    num: 6,
    label: "Calendar",
    time: "30 min",
    depends: 3,
    href: "/events",
    desc: "Get the year on the books and locations saved.",
    tasks: [
      { t: "Customize event types" },
      { t: "Enter event locations (meeting place, camps, trailheads)" },
      { t: "Enter past events you'll attach photos or expenses to" },
      { t: "Enter upcoming events — use Copy Event for recurring ones" },
      { t: "Show leaders how to take attendance from the mobile app" },
    ],
  },
  {
    id: "photos",
    num: 7,
    label: "Photos & video",
    time: "15 min",
    depends: 6,
    href: "/photos",
    desc: "Showcase what scouting actually looks like.",
    tasks: [
      { t: "Upload photos from past events" },
      { t: "Link YouTube videos to the Video Gallery" },
    ],
  },
  {
    id: "adv",
    num: 8,
    label: "Advancement",
    time: "1 hour",
    depends: 4,
    href: "/scoutbook",
    desc: "Track ranks, merit badges, requirement sign-offs.",
    tasks: [
      { t: "Upload (or enter) advancement data per scout" },
      { t: "Enter participation — camping nights, service hours, hiking miles" },
      { t: "Review advancement settings" },
      { t: "Assign merit badge counselors" },
      { t: "Train leaders to sign off on requirements" },
    ],
  },
  {
    id: "inv",
    num: 9,
    label: "Inventory & library",
    time: "30 min",
    depends: 3,
    optional: true,
    href: "/equipment",
    desc: "Stop losing handbooks and lanterns.",
    tasks: [
      { t: "Enter library materials" },
      { t: "Enter troop equipment" },
      { t: "Check out anything currently with members" },
      { t: "Show leaders how to check items in/out from the app" },
    ],
  },
  {
    id: "money",
    num: 10,
    label: "Accounting",
    time: "1 hour",
    depends: 4,
    optional: true,
    href: "/treasury",
    desc: "Move from a spreadsheet to a real ledger.",
    tasks: [
      { t: "Set up troop accounts + starting balances" },
      { t: "Set up personal subaccounts for fundraising proceeds" },
      { t: "Upload (or enter) member balances" },
      { t: "Connect Square or PayPal for credit cards" },
      { t: "Review expense reimbursement settings" },
      { t: "Begin monthly reconciliation" },
    ],
  },
  {
    id: "fund",
    num: 11,
    label: "Fundraisers",
    time: "30 min",
    depends: 4,
    optional: true,
    href: "/sales",
    desc: "Run popcorn, wreaths, mulch — without the spreadsheet.",
    tasks: [
      { t: "Set up sales campaign + merchandise" },
      { t: "Train scouts on online ordering" },
      { t: "Train fundraising leads on Booth Sales" },
    ],
  },
  {
    id: "rollout",
    num: 12,
    label: "Roll out",
    time: "ongoing",
    depends: 4,
    desc: "Get everyone using it.",
    tasks: [
      { t: "Send invite emails to all members" },
      { t: "Walk through the site at a troop meeting" },
      { t: "Train families on the mobile app — events, permissions, RSVPs" },
      { t: "Train scouts on requesting requirement sign-offs" },
      { t: "Add ongoing site care to a committee meeting" },
    ],
  },
];

function storageKey(orgSlug: string) {
  return `compass:setup:${orgSlug}`;
}

export function SetupChecklist({ orgSlug }: { orgSlug: string }) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey(orgSlug));
      if (raw) setChecks(JSON.parse(raw));
    } catch {
      /* ignore parse errors */
    }
    setHydrated(true);
  }, [orgSlug]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey(orgSlug), JSON.stringify(checks));
    } catch {
      /* quota exceeded — ignore */
    }
  }, [checks, hydrated, orgSlug]);

  const stats = useMemo(() => {
    const total = SETUP_STEPS.reduce((n, s) => n + s.tasks.length, 0);
    const done = SETUP_STEPS.reduce(
      (n, s) =>
        n + s.tasks.filter((t) => checks[`${s.id}:${t.t}`]).length,
      0,
    );
    const pct = Math.round((done / total) * 100);
    const required = SETUP_STEPS.filter((s) => !s.optional);
    const requiredDone = required.filter((s) =>
      s.tasks.every((t) => checks[`${s.id}:${t.t}`]),
    );
    return { total, done, pct, requiredDone: requiredDone.length, required: required.length };
  }, [checks]);

  function toggle(stepId: string, taskText: string) {
    const k = `${stepId}:${taskText}`;
    setChecks((cur) => ({ ...cur, [k]: !cur[k] }));
  }

  function reset() {
    if (
      typeof window !== "undefined" &&
      window.confirm("Reset all setup checks?")
    ) {
      setChecks({});
    }
  }

  return (
    <div className="space-y-4">
      {/* Progress hero */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="grid gap-5 md:grid-cols-[1fr_auto_auto] items-center">
          <div>
            <div className="font-display font-semibold text-lg text-ink">
              You're <strong>{stats.pct}%</strong> set up
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
              <div
                className="h-full bg-accent transition-[width] duration-300"
                style={{ width: `${stats.pct}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-slate-muted">
              {stats.done} of {stats.total} tasks complete ·{" "}
              {stats.requiredDone} of {stats.required} required steps done
            </div>
          </div>
          <div className="border-l border-line pl-5">
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Steps
            </div>
            <div className="font-display font-semibold text-2xl text-ink">
              {SETUP_STEPS.length}
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            className="btn-secondary text-xs"
            title="Reset all checks (this browser only)"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-md border border-attention/30 bg-attention-soft p-3 text-xs text-attention-text">
        <strong>Heads up:</strong> Progress is saved in this browser. To track
        across the committee, share the relevant page links with your co-leads.
      </div>

      <ul className="space-y-2.5">
        {SETUP_STEPS.map((s) => {
          const stepDone = s.tasks.filter(
            (t) => checks[`${s.id}:${t.t}`],
          ).length;
          const allDone = stepDone === s.tasks.length;
          const dep = s.depends
            ? SETUP_STEPS.find((x) => x.num === s.depends)
            : undefined;
          const depDone =
            !dep || dep.tasks.every((t) => checks[`${dep.id}:${t.t}`]);

          return (
            <li
              key={s.id}
              className={
                "rounded-xl border border-line bg-surface overflow-hidden " +
                (depDone ? "" : "opacity-55")
              }
            >
              <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 p-4">
                <div
                  className={
                    "h-9 w-9 rounded-full grid place-items-center font-display font-semibold text-base " +
                    (allDone
                      ? "bg-success text-white"
                      : depDone
                        ? "bg-accent-soft text-accent"
                        : "bg-surface-alt text-slate-muted")
                  }
                  aria-hidden
                >
                  {allDone ? "✓" : s.num}
                </div>
                <div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-display font-semibold text-lg text-ink">
                      {s.label}
                    </span>
                    {s.optional ? (
                      <span className="tag">optional</span>
                    ) : null}
                    {dep && !depDone ? (
                      <span className="tag text-slate-muted">
                        after step {s.depends}
                      </span>
                    ) : null}
                    {s.href ? (
                      <Link
                        href={`/o/${orgSlug}/admin${s.href}`}
                        className="text-xs text-sky hover:text-ink"
                      >
                        Open →
                      </Link>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-slate-soft">{s.desc}</div>
                </div>
                <span className="tag font-mono">{s.time}</span>
                <span className="text-xs text-slate-muted min-w-[44px] text-right">
                  {stepDone}/{s.tasks.length}
                </span>
              </div>

              {depDone ? (
                <ul className="border-t border-line px-4 py-2">
                  {s.tasks.map((task, i) => {
                    const k = `${s.id}:${task.t}`;
                    const done = !!checks[k];
                    return (
                      <li
                        key={i}
                        onClick={() => toggle(s.id, task.t)}
                        className={
                          "flex items-start gap-3 py-2 cursor-pointer " +
                          (i < s.tasks.length - 1
                            ? "border-b border-dashed border-line"
                            : "")
                        }
                      >
                        <span
                          className={
                            "mt-0.5 h-[18px] w-[18px] rounded grid place-items-center text-[11px] text-white shrink-0 " +
                            (done
                              ? "bg-success border border-success"
                              : "bg-transparent border border-line-strong")
                          }
                          aria-hidden
                        >
                          {done ? "✓" : ""}
                        </span>
                        <span
                          className={
                            "text-sm " +
                            (done
                              ? "text-slate-muted line-through"
                              : "text-ink")
                          }
                        >
                          {task.t}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
