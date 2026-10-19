// Marketing home, in the suite's Modern Clean look (src/styles/tokens.ts).

import Link from "next/link";
import { PRICES, PRICE_LINE, YEARLY_SAVINGS_USD } from "@/lib/billing/pricing";
import { freePeriod } from "@/lib/billing/trial";
import { supportEmail } from "@/lib/support";
import { PhotoPlaceholder } from "@/components/ui/PhotoPlaceholder";

const FEATURES = [
  {
    num: "01",
    kw: "Calendar",
    title: "A calendar that handles RSVPs, money, and rides.",
    body: "Publish a campout, attach the permission slip, accept payment, and assign carpools — without a single PDF email.",
  },
  {
    num: "02",
    kw: "Website",
    title: "A public homepage that recruits new families.",
    body: "Pick from six templates, drop in your troop number, and you're live on a custom subdomain. Scouts can edit it during a Tuesday meeting.",
  },
  {
    num: "03",
    kw: "Security",
    title: "Encryption, audit logs, and tested backups.",
    body: "AES-256 field-level encryption, per-org keys, argon2id for passphrases. Tamper-evident audit log on every admin action. Encrypted backups every day, plus one before every update, and we practice restoring them.",
  },
  {
    num: "04",
    kw: "Communication",
    title: "Email, push, and text — one composer.",
    body: "Send a Sunday email digest, a mobile push for the 7am cancellation, or an SMS broadcast when a campout reroutes. Threaded replies, two-deep enforced, every message logged. No more “did you get the flier?”",
  },
];

const STATS = [
  { n: "AES-256", l: "encryption at rest & in transit" },
  { n: "2-step", l: "sign-in for every leader and admin" },
  { n: "Daily", l: "encrypted off-site backups" },
  { n: PRICES.year.short, l: `per unit, per year (or ${PRICES.month.long})` },
];

const IMPORT_SOURCES = [
  "TroopWebHost",
  "ScoutLander",
  "TroopTrack",
  "Wix / Squarespace",
  "Google Sites",
  "CSV / Excel",
  "Scoutbook export",
  "Internet Advancement",
  "A shared Drive folder",
];

export default function MarketingHome() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-content px-6 pt-16 pb-14 md:pt-20">
        <div className="mb-10 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          <span>Volume 1 · Issue 04</span>
          <span className="hidden md:block">The Compass Field Notes</span>
          <span className="hidden md:block">Modern Software for Volunteer Units</span>
          <span className="hidden md:block">Independent · Not affiliated with BSA</span>
        </div>

        <div className="grid items-center gap-12 md:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col gap-6">
            <span className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2">
              <span aria-hidden className="h-2 w-2 rounded-full bg-done" />
              Security · ease of use · every feature you need
            </span>
            <h1 className="text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] md:text-[64px]">
              Modern, secure software{" "}
              <span className="text-muted">for your scouting unit.</span>
            </h1>
            <p className="max-w-[540px] text-[19px] leading-[1.55] text-ink-2">
              A calendar, public site, photo library, and parent app — designed
              for the volunteer leaders who keep things running. Sign in with
              Google or Apple, encrypted by default, and built to play nicely
              with Scouting.org and Scoutbook.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/start" className="btn-primary min-h-[48px] px-5 text-[15px]">
                Start free →
              </Link>
              <Link href="/plans" className="btn-secondary min-h-[48px] px-5 text-[15px]">
                See every feature
              </Link>
            </div>
          </div>
          <div className="aspect-[5/4]">
            <PhotoPlaceholder label="Troop meeting" />
          </div>
        </div>

      </section>

      {/* Stats strip */}
      <section className="mx-auto max-w-content px-6">
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.n} className="flex flex-col gap-1.5 bg-surface p-6">
              <div className="text-[32px] font-semibold leading-none tracking-[-0.025em] md:text-[40px]">
                {s.n}
              </div>
              <div className="text-[13px] text-muted">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features — editorial blocks alternating image/text */}
      <section className="mx-auto max-w-content px-6 py-20">
        <div className="mb-12">
          <div className="eyebrow mb-3">
            § The Product
          </div>
          <h2 className="text-[32px] md:text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] max-w-3xl">
            Built around the four things{" "}
            <span className="text-muted">volunteers actually need.</span>
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <article key={f.num} className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-6">
              <div className="h-[200px]">
                <PhotoPlaceholder label={f.kw} />
              </div>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[12px] font-medium text-muted">{f.num}</span>
                <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-soft-text">
                  {f.kw}
                </span>
              </div>
              <h3 className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] md:text-[26px]">
                {f.title}
              </h3>
              <p className="text-[15px] leading-relaxed text-ink-2">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Migration band */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-content px-6 py-16 grid gap-12 md:grid-cols-[1fr_1.4fr] items-center">
          <div>
            <div className="eyebrow mb-3">
              § Migration
            </div>
            <h3 className="text-[28px] md:text-[36px] font-semibold leading-[1.1] tracking-[-0.03em] mb-4">
              Bring your <span className="text-muted">18 years</span> of troop
              history with you.
            </h3>
            <p className="text-slate-soft text-[15px] leading-relaxed">
              We import from TroopWebHost, ScoutLander, TroopTrack, and a folder
              of CSVs you found on the old committee chair&apos;s laptop.
              White-glove migration is included on every plan — book a 30-minute
              call and we&apos;ll have you running by Sunday.
            </p>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
            {IMPORT_SOURCES.map((src) => (
              <div
                key={src}
                className="bg-surface border border-line rounded-md px-4 py-3 text-[13px] font-medium flex items-center gap-2.5"
              >
                <span aria-hidden className="h-2 w-2 rounded-full bg-accent shrink-0" />
                {src}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — one plan, paid yearly or monthly (lib/billing/pricing.ts) */}
      <section className="mx-auto max-w-content px-6 py-20">
        <div className="mb-12">
          <div className="eyebrow mb-3">
            § Pricing
          </div>
          <h2 className="text-[32px] md:text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] max-w-4xl">
            One price per unit — pack, troop, crew, ship, or post.{" "}
            <span className="text-muted">No per-scout</span> fees, ever.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <div className="rounded-xl border border-line bg-surface p-8 flex flex-col">
            <div className="text-lg font-semibold mb-4">Every unit</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[48px] font-semibold leading-none tracking-[-0.035em]">
                  {PRICES.year.short}
                </div>
                <div className="text-xs text-slate-muted mt-1">per year · saves ${YEARLY_SAVINGS_USD}</div>
              </div>
              <div>
                <div className="text-[48px] font-semibold leading-none tracking-[-0.035em]">
                  {PRICES.month.short}
                </div>
                <div className="text-xs text-slate-muted mt-1">per month</div>
              </div>
            </div>
            <p className="text-sm text-slate-soft mt-6 mb-7 pb-6 border-b border-line">
              {freePeriod()} free, no card needed. Keep it and it renews automatically;
              cancel any time. One subscription covers Compass, Waypoint and Lantern.
              Merit badge counselors use Waypoint free.
            </p>
            <Link href="/start" className="btn-primary w-full justify-center mt-auto">
              Start free →
            </Link>
          </div>

          <div className="rounded-xl bg-ink text-white p-8">
            <div className="text-lg font-semibold mb-4">Everything included</div>
            <ul className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
              {[
                "Public website + custom subdomain",
                "Calendar with RSVPs, permission slips, and Stripe payments",
                "Email digests sent from your domain",
                "Photo library (15 GB) with per-scout privacy",
                "Carpool & ride coordination",
                "Forms, surveys & online dues",
                "Group chat for dens, patrols, and committees",
                "Two-deep enforced on every message",
                "Push notifications and the family app",
                "Merit badge counseling and badge days (Waypoint)",
                "Each scout's path to Eagle (Lantern)",
                "White-glove migration from your old site",
              ].map((f) => (
                <li key={f} className="flex gap-2.5 leading-snug text-white">
                  <span className="text-on-ink-muted font-semibold shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-7 text-center text-[13px] text-slate-muted">
          {PRICE_LINE} · No per-scout, per-leader, or setup fees · Stripe fees
          passed through at cost.
        </p>
      </section>

      {/* Old vs new: the comparison panel */}
      <section className="mx-auto max-w-content px-6"><div className="rounded-2xl bg-ink text-white">
        <div className="mx-auto max-w-content px-6 py-14 md:px-12">
          <div className="mb-10">
            <div className="eyebrow mb-3 !text-on-ink-muted">
              § The status quo
            </div>
            <h2 className="text-[32px] md:text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] max-w-3xl">
              The site your families see{" "}
              <span className="text-on-ink-muted">is your front door.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-[1.6] text-on-ink-muted">
              Recruiting families compare your unit to the soccer club, the Y, the
              music school. If your homepage looks like a 2008 phpBB install,
              you&apos;re losing scouts before the first parent night.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* OLD — TroopWebHost-style */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 rounded-full bg-danger" />
                <span className="eyebrow !text-on-ink-muted">
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
                <span className="font-bold text-danger">●</span> Broken on
                phones. No HTTPS-only enforcement. Tables for layout. Member
                roster behind a single shared password. Photos uploaded to a
                public Google Drive folder.
              </p>
            </div>

            {/* NEW — Compass */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 rounded-full bg-done" />
                <span className="eyebrow !text-on-ink-muted">
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
                    <div className="font-display text-[16px] font-semibold">
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
                    <div className="mb-1.5 font-display text-[20px] font-semibold leading-tight">
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
                <span className="font-bold text-sky">●</span> Mobile-first.
                HTTPS-only. Encrypted at rest & in transit. Daily encrypted
                backups. Role-based access with audit logs. Migrates from your
                old hosting in an afternoon.
              </p>
            </div>
          </div>
        </div>
      </div></section>

      {/* CTA */}
      <section className="mx-auto max-w-content px-6 py-24 text-center">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-soft text-accent-soft-text text-[13px] font-medium mb-6">
          {freePeriod()} free
        </span>
        <h2 className="text-[36px] md:text-[52px] font-semibold leading-[1.05] tracking-[-0.035em] max-w-3xl mx-auto mb-8">
          Set up your troop&apos;s home base{" "}
          <span className="text-muted">before next week&apos;s meeting.</span>
        </h2>
        <div className="flex flex-wrap gap-3 justify-center mb-6">
          <Link href="/start" className="btn-primary min-h-[48px] px-6 text-[15px]">
            Start free trial →
          </Link>
          <Link
            href={`mailto:${supportEmail()}`}
            className="btn-secondary min-h-[48px] px-6 text-[15px]"
          >
            Talk to a person
          </Link>
        </div>
        <p className="text-[13px] text-slate-muted">
          No credit card · cancel anytime · we&apos;ll migrate your old site for free
        </p>
      </section>
    </>
  );
}
