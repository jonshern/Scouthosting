// Marketing home — layout ported from design-handoff/marketing-balanced.jsx,
// Slate & Sky / "balanced" palette. Copy is written short and plain, the
// way Jon talks (voice notes in bluecard marketing/README.md).

import Link from "next/link";
import { PRICES, PRICE_LINE, YEARLY_SAVINGS_USD } from "@/lib/billing/pricing";

const FEATURES = [
  {
    num: "01",
    kw: "Calendar",
    title: "RSVPs, permission slips and rides in one spot.",
    body: "Post the campout, attach the slip, collect the money, sort out carpools. No PDF emails.",
    accent: "#1d4ed8",
  },
  {
    num: "02",
    kw: "Website",
    title: "A troop website that doesn't look like 2008.",
    body: "Pick a theme, add your troop number, done. Scouts can edit it at a meeting.",
    accent: "#f59e0b",
  },
  {
    num: "03",
    kw: "Security",
    title: "Kids' info stays locked down.",
    body: "It's encrypted, every admin action is logged, and leaders use two-step sign-in.",
    accent: "#0f172a",
  },
  {
    num: "04",
    kw: "Messages",
    title: "Email and push from one place.",
    body: "Send the Sunday update or the 7am cancellation. A parent is copied on anything sent to a scout, and every message is logged.",
    accent: "#475569",
  },
];

const STATS = [
  { n: PRICES.year.short, l: "a year per unit", c: "#1d4ed8" },
  { n: PRICES.month.short, l: "a month, if you'd rather", c: "#0891b2" },
  { n: "1 month", l: "free, no card", c: "#f59e0b" },
  { n: "$0", l: "per scout", c: "#475569" },
];

const IMPORT_SOURCES = [
  "TroopWebHost",
  "ScoutLander",
  "TroopTrack",
  "Wix / Squarespace",
  "Google Sites",
  "CSV / Excel",
];

function PhotoTile({ tone, label }: { tone: string; label: string }) {
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-md"
      style={{ background: `linear-gradient(135deg, ${tone}, ${tone}aa 60%, #0f172a)` }}
    >
      <svg
        viewBox="0 0 100 75"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full opacity-30"
      >
        <polygon points="0,55 30,32 60,48 100,38 100,75 0,75" fill="#0f172a" />
      </svg>
      <span className="absolute bottom-3 left-4 text-xs font-medium uppercase tracking-[0.16em] text-white/85">
        {label}
      </span>
    </div>
  );
}

export default function MarketingHome() {
  return (
    <>
      {/* Hero — kicker masthead + oversized italic headline */}
      <section className="mx-auto max-w-content px-6 pt-6 pb-14">
        <div className="border-t-2 border-ink pt-4 flex flex-wrap justify-between gap-2 text-[11px] uppercase tracking-[0.12em] text-slate-soft mb-8">
          <span>For troops, packs and crews</span>
          <span>Independent · Not affiliated with any scouting organization</span>
        </div>

        <div className="grid gap-12 md:grid-cols-[1.3fr_0.7fr] items-end">
          <h1 className="font-display font-normal leading-[0.92] tracking-[-0.035em] text-[64px] md:text-[96px] lg:text-[116px]">
            Your troop,
            <br />
            without the
            <br />
            <span className="inline bg-sky text-white italic font-medium px-3 md:px-4 py-1">
              reply-all.
            </span>
          </h1>
          <div>
            <p className="text-slate-soft text-[17px] leading-[1.55] mb-6">
              Calendar, website, photos and a family app for your troop. Built
              by a scout dad who got tired of chasing RSVPs.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/start" className="btn-primary text-base px-5 py-3">
                Start your free month →
              </Link>
              <Link href="/plans" className="btn-secondary text-base px-5 py-3">
                See pricing
              </Link>
            </div>
          </div>
        </div>

        {/* Hero photo strip — colored top borders matching the design */}
        <div className="mt-12 grid gap-2 md:grid-cols-[2fr_1fr_1fr] h-[260px] md:h-[360px]">
          <div className="border-t-[5px] border-sky overflow-hidden rounded-md">
            <PhotoTile tone="#0891b2" label="Canoe trip" />
          </div>
          <div className="border-t-[5px] border-sky overflow-hidden rounded-md">
            <PhotoTile tone="#1d4ed8" label="Troop meeting" />
          </div>
          <div className="border-t-[5px] border-plum overflow-hidden rounded-md">
            <PhotoTile tone="#f59e0b" label="Campfire" />
          </div>
        </div>
      </section>

      {/* Stats strip — dark slate band with spectrum top-borders */}
      <section className="bg-surface-dark text-white">
        <div className="mx-auto max-w-content px-6 py-12 grid gap-6 md:grid-cols-4">
          {STATS.map((s) => (
            <div
              key={s.n}
              className="pt-5 border-t-[3px]"
              style={{ borderColor: s.c }}
            >
              <div className="font-display text-[44px] md:text-[56px] font-normal leading-none tracking-[-0.025em]">
                {s.n}
              </div>
              <div className="mt-2 text-xs uppercase tracking-[0.04em] text-white/70">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features — editorial blocks alternating image/text */}
      <section className="mx-auto max-w-content px-6 py-20">
        <div className="mb-12">
          <h2 className="font-display text-[40px] md:text-[56px] font-normal leading-none tracking-[-0.025em] max-w-3xl">
            The stuff you{" "}
            <em className="text-sky font-normal">actually use.</em>
          </h2>
        </div>

        {FEATURES.map((f, i) => {
          const reversed = i % 2 === 1;
          return (
            <div
              key={f.num}
              className={`grid gap-10 items-center py-10 border-t-2 border-ink ${
                reversed ? "md:grid-cols-[1.3fr_1fr]" : "md:grid-cols-[1fr_1.3fr]"
              }`}
            >
              <div
                className={`relative h-[260px] md:h-[360px] rounded-md overflow-hidden ${
                  reversed ? "md:order-2" : ""
                }`}
              >
                <PhotoTile tone={f.accent} label={f.kw} />
                <span
                  className="absolute top-4 left-4 text-[11px] font-bold tracking-[0.12em] uppercase rounded-sm px-2.5 py-1 text-white"
                  style={{ background: f.accent }}
                >
                  {f.kw}
                </span>
              </div>
              <div className={reversed ? "md:order-1" : ""}>
                <div
                  className="font-display italic text-[64px] md:text-[88px] font-normal leading-[0.9] tracking-[-0.03em] mb-4"
                  style={{ color: f.accent }}
                >
                  {f.num}
                </div>
                <h3 className="font-display text-[28px] md:text-[40px] font-normal leading-[1.1] tracking-[-0.02em] mb-4">
                  {f.title}
                </h3>
                <p className="text-slate-soft text-base leading-relaxed">{f.body}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* Migration band */}
      <section className="border-y-2 border-ink bg-surface-alt">
        <div className="mx-auto max-w-content px-6 py-16 grid gap-12 md:grid-cols-[1fr_1.4fr] items-center">
          <div>
            <h3 className="font-display text-[32px] md:text-[44px] font-normal leading-[1.05] tracking-[-0.025em] mb-4">
              Bring your <em className="text-sky font-normal">old site</em> with you.
            </h3>
            <p className="text-slate-soft text-[15px] leading-relaxed">
              Send us what you have, even a folder of spreadsheets, and we&apos;ll
              help move it over.
            </p>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
            {IMPORT_SOURCES.map((src) => (
              <div
                key={src}
                className="bg-surface-alt border border-line rounded-md px-4 py-3 text-[13px] font-medium flex items-center gap-2.5"
              >
                <span aria-hidden className="h-2 w-2 rounded-full bg-sky shrink-0" />
                {src}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — one plan, paid yearly or monthly (lib/billing/pricing.ts) */}
      <section className="mx-auto max-w-content px-6 py-20">
        <div className="mb-12">
          <h2 className="font-display text-[40px] md:text-[56px] font-normal leading-none tracking-[-0.025em] max-w-4xl">
            One price per unit.{" "}
            <em className="text-sky font-normal">No per-scout fees.</em>
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <div className="rounded-xl border-2 border-line bg-surface-alt p-8 flex flex-col">
            <div className="font-display italic text-[24px] text-sky mb-2">Every unit</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-display text-[56px] font-normal leading-none tracking-[-0.03em]">
                  {PRICES.year.short}
                </div>
                <div className="text-xs text-slate-muted mt-1">per year · saves ${YEARLY_SAVINGS_USD}</div>
              </div>
              <div>
                <div className="font-display text-[56px] font-normal leading-none tracking-[-0.03em]">
                  {PRICES.month.short}
                </div>
                <div className="text-xs text-slate-muted mt-1">per month</div>
              </div>
            </div>
            <p className="text-sm text-slate-soft mt-6 mb-7 pb-6 border-b border-line">
              First month free, no card. Covers Compass, Waypoint and Lantern.
              Cancel any time.
            </p>
            <Link href="/start" className="btn-primary w-full justify-center mt-auto">
              Start your free month →
            </Link>
          </div>

          <div className="rounded-xl border-2 border-ink bg-surface-dark text-white p-8">
            <div className="font-display italic text-[24px] text-sky mb-2">Everything included</div>
            <ul className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
              {[
                "Troop website",
                "Calendar, RSVPs and permission slips",
                "Email from your own domain",
                "Photos (15 GB)",
                "Carpools, forms and dues",
                "Patrol and committee chats",
                "Family phone app",
                "Badges and badge days (Waypoint)",
                "Path to Eagle (Lantern)",
                "Help moving your old site",
              ].map((f) => (
                <li key={f} className="flex gap-2.5 leading-snug text-white/90">
                  <span className="text-sky font-bold shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-7 text-center text-[13px] text-slate-muted">
          {PRICE_LINE}. No per-scout or setup fees.
        </p>
      </section>

      {/* Old vs new — comparison band on dark forest */}
      <section className="bg-surface-dark text-white">
        <div className="mx-auto max-w-content px-6 py-20">
          <div className="mb-10">
            <h2 className="font-display text-[40px] md:text-[56px] font-normal leading-none tracking-[-0.025em] max-w-3xl">
              Your website is the first thing{" "}
              <em className="text-sky font-normal">new families see.</em>
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-[1.6] text-white/75">
              Parents compare you to the soccer club and the Y. If the site looks
              old, some of them won&apos;t show up to the first meeting.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* OLD — TroopWebHost-style */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-white/55">
                  Today · Old hosting platform
                </span>
              </div>
              <div className="overflow-hidden rounded-lg border border-white/15 bg-white text-ink">
                <div className="flex items-center gap-1.5 border-b border-[#b0b5b9] bg-[#dcdfe2] px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fb6964]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fdc14b]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#34c64c]" />
                  <span className="ml-2 flex-1 truncate rounded bg-white px-2 py-0.5 font-mono text-[10px] text-[#666]">
                    https://www.oldhostingplatform.com/Troop12/Index.htm
                  </span>
                </div>
                <div className="bg-white font-[Arial,Helvetica,sans-serif] text-[12px] text-black">
                  <div
                    className="flex items-center justify-between border-b-2 border-[#1a2f10] px-4 py-2 text-[#ffe]"
                    style={{ background: "linear-gradient(180deg,#4a6e3a,#2f4d24)" }}
                  >
                    <span
                      className="font-[Times,serif] text-[20px] font-bold italic"
                      style={{ textShadow: "1px 1px 2px rgba(0,0,0,0.4)" }}
                    >
                      Troop 12 — Anytown, USA
                    </span>
                    <span className="text-[10px]">Login | Help</span>
                  </div>
                  <div className="border-b border-[#c0c0a8] bg-[#e8e8d8] px-3 py-1 text-[11px] text-[#444]">
                    Home &gt; Welcome
                  </div>
                  <div className="grid grid-cols-[150px_1fr] min-h-[280px]">
                    <div className="border-r border-[#c8c8b0] bg-[#f0eed8] p-2.5 text-[11px]">
                      <div className="mb-2 font-bold text-[#234]">MAIN MENU</div>
                      {[
                        "Home",
                        "About Our Troop",
                        "Calendar",
                        "Photo Gallery",
                        "Eagle Scouts",
                        "Documents",
                        "Forms",
                        "Contact Us",
                        "Members Only",
                      ].map((l) => (
                        <div
                          key={l}
                          className="cursor-pointer py-0.5 text-[11px] text-[#0050a0] underline"
                        >
                          » {l}
                        </div>
                      ))}
                    </div>
                    <div className="p-3.5">
                      <div className="mb-2 border-b-2 border-[#2f4d24] pb-1 font-[Times,serif] text-[16px] font-bold text-[#2f4d24]">
                        Welcome to Troop 12!
                      </div>
                      <p className="my-1.5 text-[11px] leading-[1.5]">
                        Troop 12 has been serving Anytown since 1972. We meet
                        every Tuesday at 7:00 PM at St. Mark&apos;s Community
                        Church. New scouts are always welcome — please contact
                        our Scoutmaster for more information.
                      </p>
                      <div className="my-2 border border-[#d4b850] bg-[#fffacc] px-2 py-1 text-[11px]">
                        <strong className="text-[#a05010]">NEW!</strong> Spring
                        Campout signup is now open. Permission slip{" "}
                        <span className="text-[#0050a0] underline">
                          (click here)
                        </span>{" "}
                        must be returned by Friday.
                      </div>
                      <div className="mt-3 mb-1 border-b border-[#2f4d24] font-[Times,serif] text-[13px] font-bold text-[#2f4d24]">
                        Upcoming Events
                      </div>
                      <table className="w-full border-collapse text-[11px]">
                        <tbody>
                          {[
                            ["03/21/26", "Spring Campout — Birch Lake"],
                            ["03/25/26", "Troop Meeting"],
                            ["04/04/26", "Eagle Project — Jamie"],
                          ].map(([d, n], i) => (
                            <tr
                              key={d}
                              className={i % 2 ? "bg-[#f8f8e8]" : "bg-white"}
                            >
                              <td className="border-b border-dotted border-[#aaa] px-1.5 py-0.5 font-mono">
                                {d}
                              </td>
                              <td className="border-b border-dotted border-[#aaa] px-1.5 py-0.5 text-[#0050a0] underline">
                                {n}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="border-t-2 border-[#1a2f10] bg-[#2f4d24] px-3.5 py-1.5 text-center text-[10px] text-[#cdcdb8]">
                    Powered by OldHostingPlatform.com — © 2009-2026 ·
                    best viewed in IE7+
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/70">
                <span className="font-bold text-red-500">●</span> Broken on
                phones. One shared password for the roster. Photos in a public
                Drive folder.
              </p>
            </div>

            {/* NEW — Compass */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 rounded-full bg-sky" />
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-sky">
                  Compass · next Tuesday
                </span>
              </div>
              <div className="overflow-hidden rounded-lg border border-white/15 bg-white text-ink">
                <div className="flex items-center gap-1.5 border-b border-line bg-surface-alt px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fb6964]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fdc14b]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#34c64c]" />
                  <span className="ml-2 flex-1 rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-muted">
                    troop12.compass.app
                  </span>
                </div>
                <div className="min-h-[280px] bg-bg p-4">
                  <div className="mb-3.5 flex items-center justify-between">
                    <div className="font-display text-[16px] font-medium">
                      Troop 12 ·{" "}
                      <span className="italic text-slate-soft">Anytown</span>
                    </div>
                    <div className="flex gap-2.5 text-[10px] text-slate-soft">
                      <span>About</span>
                      <span>Calendar</span>
                      <span>Photos</span>
                      <span>Join</span>
                    </div>
                  </div>
                  <div className="relative mb-3 overflow-hidden rounded-lg bg-surface-dark p-4 text-white">
                    <span
                      aria-hidden
                      className="absolute -right-2 -top-2 h-20 w-20 rounded-full bg-sky opacity-25"
                    />
                    <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-sky">
                      This Friday
                    </div>
                    <div className="mb-1.5 font-display text-[20px] font-normal leading-tight">
                      Spring Campout —
                      <br />
                      Birch Lake State Park
                    </div>
                    <div className="mb-2 text-[10px] text-white/70">
                      Fri 5:30 PM · 18 going · permission slip + $35
                      due Thursday
                    </div>
                    <div className="inline-block rounded bg-sky px-2.5 py-1 text-[10px] font-semibold text-white">
                      Sign · RSVP · Pay →
                    </div>
                  </div>
                  <div className="mb-3 grid grid-cols-3 gap-1.5">
                    {["#1d4ed8", "#0891b2", "#f59e0b"].map((c, i) => (
                      <div
                        key={c}
                        className="relative aspect-[4/3] overflow-hidden rounded"
                        style={{ background: `linear-gradient(135deg, ${c}, ${c}99)` }}
                      >
                        <svg
                          viewBox="0 0 100 75"
                          preserveAspectRatio="xMidYMid slice"
                          className="absolute inset-0 h-full w-full opacity-40"
                        >
                          <polygon
                            points={`0,${50 + i * 4} 30,${30 + i * 3} 60,${45 - i * 2} 100,${35 + i * 4} 100,75 0,75`}
                            fill="#0f172a"
                          />
                        </svg>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-line pt-2 text-[10px] text-slate-muted">
                    <span>Hosted with Compass</span>
                    <span>HTTPS · SSO · Privacy controls</span>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/85">
                <span className="font-bold text-sky">●</span> Works on
                phones. Private roster. Encrypted, with every admin action
                logged.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-content px-6 py-24 text-center">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky text-white text-[11px] font-bold tracking-[0.14em] uppercase mb-6">
          First month free
        </span>
        <h2 className="font-display text-[44px] md:text-[72px] font-normal leading-[0.98] tracking-[-0.03em] max-w-3xl mx-auto mb-8">
          Get your troop set up{" "}
          <em className="text-sky font-normal">before next week&apos;s meeting.</em>
        </h2>
        <div className="flex flex-wrap gap-3 justify-center mb-6">
          <Link href="/start" className="btn-primary text-[15px] px-7 py-4 rounded-full">
            Start free trial →
          </Link>
          <Link
            href="mailto:hello@scoutingcompass.com"
            className="btn-secondary text-[15px] px-7 py-4 rounded-full"
          >
            Talk to a person
          </Link>
        </div>
        <p className="text-[13px] text-slate-muted">
          No card. Cancel any time.
        </p>
      </section>
    </>
  );
}
