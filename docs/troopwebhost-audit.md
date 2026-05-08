# TroopWebHost ↔ Compass feature audit

Cross-reference of every feature on
https://www.troopwebhost.org/help.aspx?ID=468 against what Compass ships
today. The Scoutbook overlap column flags which TWH features duplicate
official BSA Scoutbook / Internet Advancement / My.Scouting (so we can
see what we'd be reinventing vs. owning).

Strategic conclusions are in `ROADMAP.md`.

**Legend** — Compass: ✅ full · 🟡 partial · ❌ none · ➖ N/A
· **SB overlap**: 🔴 high (Scoutbook is the system of record) ·
🟠 medium (related data lives there) · 🟢 none

---

## 1. Getting started / core system

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Welcome / first visit / onboarding | 🟡 | 🟢 | Have signup + invite codes; no guided onboarding tour |
| Page format / navigation | ✅ | 🟢 | Admin sidebar + member nav |
| Hubs (centralized dashboards) | 🟡 | 🟢 | Admin home + activity feed; no per-area "hubs" pattern |
| Logging on | ✅ | 🟢 | Email+pass, Google/Apple OAuth, magic link, TOTP MFA |

## 2. Data migration / imports

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Upload ScoutbookPlus roster | ❌ | 🔴 | No SB API integration |
| Upload ScoutbookPlus advancement | ❌ | 🔴 | No SB advancement sync |
| Upload participation history | ❌ | 🟢 | |
| Upload Scouts / Adults (CSV) | ✅ | 🟢 | `src/lib/roster/import.ts` — flexible header mapping |
| Upload advancement records | ❌ | 🔴 | |
| Upload events | ❌ | 🟢 | No bulk event import |
| Upload TroopTrack scouts/adults | ❌ | 🟢 | |
| Upload My.Scouting roster | ❌ | 🟠 | Council roster source |
| Upload training records | ❌ | 🟠 | YPT comes from My.Scouting |
| Upload TroopMaster training | ❌ | 🟠 | |

## 3. Linked sites / multi-unit (boy + girl troops)

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Family Scouting (linked B/G troops) | ❌ | 🟢 | One Org per unit, no linkage |
| Adult members shared across linked sites | ❌ | 🟢 | |
| Shared event locations / types | ❌ | 🟢 | |
| Shared events / calendar across linked | ❌ | 🟢 | |

## 4. User management & security

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| User roles / permissions | ✅ | 🟢 | scout / parent / leader / admin + scope-based perms |
| Add / update user IDs | ✅ | 🟢 | |
| Send users their IDs | ❌ | 🟢 | No bulk credential mailer |
| Auto-send new user IDs | ❌ | 🟢 | |
| Delete a user | ✅ | 🟢 | Soft delete + 30-day purge |
| View user permissions | 🟡 | 🟢 | RBAC defined in code; no admin-facing matrix UI |
| Configure user roles | 🟡 | 🟢 | Roles fixed in code, not user-editable |
| Assign tasks to roles | ❌ | 🟢 | TWH has fine-grained task→role mapping |
| Set default user role | 🟡 | 🟢 | Defaults applied at provisioning |

**Compass extras here**: per-org encryption (DEK + MASTER_KEY + recovery
code), TOTP MFA + backup codes, API tokens, CSRF, signed
RSVP/unsubscribe tokens, two-deep rule enforcement in chat.

## 5. Public pages / website

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Home page layout & editing | ✅ | 🟢 | Hero + GrapesJS canvas blocks |
| Add photos to public site | ✅ | 🟢 | Public album visibility flag |
| Banner image | ✅ | 🟢 | Site settings |
| Contact us | 🟡 | 🟢 | Have feedback form, no contact directory |
| Announcements | ✅ | 🟢 | Pinned + expiring |
| Surveys | 🟡 | 🟢 | Builder + responses; no analytics |
| Resource links | 🟡 | 🟢 | Via Forms (URL or file) |
| About our troop / leader bios | 🟡 | 🟢 | Custom Pages can do this; no canned template |
| Forms & documents | ✅ | 🟢 | Upload, categories, visibility |
| Photo gallery | ✅ | 🟢 | Albums, encrypted storage |
| Video gallery | ✅ | 🟢 | YouTube/Vimeo embeds |
| Custom pages | ✅ | 🟢 | GrapesJS + version history |
| SEO tools | 🟡 | 🟢 | OG tags + canonical; no sitemap.xml/robots customization |
| Hyperlinks / design ideas | ✅ | 🟢 | |
| Custom CSS | ❌ | 🟢 | Color tokens only |

## 6. Mobile app

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Mobile app | ✅ | 🟢 | Expo/RN — Home, Calendar, Activity, Photos, Chat, DMs, Profile |
| Security (mobile) | ✅ | 🟢 | OAuth deep-link + bearer tokens |
| Data sync | 🟡 | 🟢 | REST polling, no offline cache |
| Push notifications | ✅ | 🟢 | Expo push; DM reminders |

## 7. My Stuff (personal portal)

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| My Stuff hub | 🟡 | 🟢 | `/account/*` covers profile/security/tokens; no consolidated hub |
| Change password | ✅ | 🟢 | |
| My personal information | ✅ | 🟢 | |
| My skills & interests | 🟡 | 🟢 | Stored on Member; no self-edit UI |
| My scouts (parent's children) | ❌ | 🟠 | Big gap for parents |
| My account (balances) | ❌ | 🟢 | No member finance |
| Buy stuff from troop | ❌ | 🟢 | No store |
| On-line payments | ❌ | 🟢 | No member-facing payments |
| Request expense reimbursement | ✅ | 🟢 | Reimbursement queue |
| Sign up for events | ✅ | 🟢 | RSVP |
| Sign up for shifts | ✅ | 🟢 | Signup slots |
| Surveys (member-facing) | ✅ | 🟢 | |
| Subscribe to calendar | ✅ | 🟢 | `/calendar.ical` RFC 5545 + RRULE |
| My rank advancement | ❌ | 🔴 | Lives in Scoutbook |
| My merit badges | ❌ | 🔴 | |
| My Venturing / Sea Scouts | ❌ | 🔴 | |
| My library materials / equipment | ❌ | 🟢 | No personal loan view |
| My fundraiser sales / prize / personal URL | ❌ | 🟢 | No sales |
| My training history | ❌ | 🟠 | YPT field on Member only |
| My MB assignments | ❌ | 🔴 | |
| Approve MB sign-off requests | ❌ | 🔴 | |

## 8. Email & communication

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Send email | ✅ | 🟢 | Markdown composer, audience filters |
| Send email to group | ✅ | 🟢 | Per-patrol, adults/youth, custom |
| Email relays | ❌ | 🟢 | No external forwarding |
| Quick text message (SMS) | ✅ | 🟢 | SMS broadcast w/ opt-in + click tracking |
| Maintain email groups | 🟡 | 🟢 | Audience built dynamically; no saved groups |
| My email / view all email | 🟡 | 🟢 | Admin sees MailLog history; no per-user inbox |
| Reply all | ❌ | 🟢 | One-way broadcasts |
| Delivery status | ✅ | 🟢 | Resend webhooks → opens/clicks/bounces |
| Blocked email addresses | ✅ | 🟢 | Bounce/complaint flag → auto-suppress |
| Gmail integration | ➖ | 🟢 | We use Resend |
| Automated newsletter | ✅ | 🟢 | Composer + cron schedule |
| Configure email settings | ✅ | 🟢 | Per-member commPreference |
| SMS troubleshooting | ➖ | 🟢 | |
| Group chat / channels | ✅ | 🟢 | **Compass extra** — TWH has Forum only |
| Direct messages | ✅ | 🟢 | **Compass extra** with leader oversight |
| DM digest / DM reminders | ✅ | 🟢 | **Compass extra** |

## 9. Scout forum / community

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Forum topics / posts / moderation | 🟡 | 🟢 | We have Activity feed (posts/comments/reactions), not threaded forum |

## 10. Membership management

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Membership hub | 🟡 | 🟢 | `/admin/members` directory |
| New scout registration | 🟡 | 🟠 | Add Member form; no BSA application flow |
| Transfer scouts between units | ❌ | 🟠 | |
| Active scouts / adults lists | ✅ | 🟢 | Filterable directory |
| Relationships (family) | ✅ | 🟢 | parentIds[] (encrypted) |
| Deactivate entire family | 🟡 | 🟢 | Per-member soft delete |
| Patrol assignments | ✅ | 🟢 | |
| Crew / Ship assignments | 🟡 | 🟢 | UnitType enum supports it |
| Swim test | ❌ | 🟠 | |
| Medical form dates / expiration | ❌ | 🟠 | |
| Affirmation date | ❌ | 🟠 | |
| BSA ID (scout & adult) | 🟡 | 🟠 | `scoutbookUserId` field exists, generic BSA ID not modeled |
| Shirt sizes | ❌ | 🟢 | |
| Inactive alumni | ✅ | 🟢 | `alumni` status |
| Patrols / Crews / Ships management | ✅ | 🟢 | |
| Boy + Girl Troops linkage | ❌ | 🟢 | |
| Leadership positions (define) | ✅ | 🟢 | PositionTerm |
| Scout / adult leadership tracking | ✅ | 🟢 | |
| Scout leadership mass update | 🟡 | 🟢 | One-by-one only |
| Dynamic subgroups | 🟡 | 🟢 | Audience filters cover broadcast use |
| Training records | 🟡 | 🟠 | Training model exists, YPT only used in practice |
| Safeguarding Youth (YPT) | ✅ | 🟠 | Cron reminders, expiry tracking |
| Skills & interests | ✅ | 🟢 | |
| Advance grade level (bulk promote) | ❌ | 🟢 | |
| Member leaves / returns / scout→adult | 🟡 | 🟢 | Status changes manual |
| Merge duplicate members | ❌ | 🟢 | |
| Export roster to Excel / Troop Awards | 🟡 | 🟢 | No formal export UI |

## 11. Membership reports

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Scout / adult / leader directories | 🟡 | 🟢 | On-screen directory, no formatted reports |
| Troop contact list | 🟡 | 🟢 | |
| Emergency contact list | ❌ | 🟠 | Big gap for outings |
| Patrol roster (w/ contacts) | 🟡 | 🟢 | |
| MB counselors by name / by badge | ✅ | 🟢 | `/admin/merit-badge-counselors` |
| Swim test results | ❌ | 🟠 | |
| Allergies / dietary restrictions report | 🟡 | 🟢 | dietaryFlags[] on Member; no report view, used in trip planner |
| Scout↔parent cross reference | 🟡 | 🟢 | Data present, no report |
| Birthday lists (scouts/adults) | ❌ | 🟢 | birthdate stored, no report |
| Scouts by age | ❌ | 🟢 | |
| Shirt sizes report | ❌ | 🟢 | |
| Medical form submission/expiration | ❌ | 🟠 | |
| Adult leaders needing YPT / SYT | ✅ | 🟠 | YPT page |
| Expired / required training reports | 🟡 | 🟠 | YPT only |
| NYLT eligibility | ❌ | 🔴 | |
| Unfilled leadership positions | ❌ | 🟢 | |
| Upcoming BSA renewals / registrations | ❌ | 🔴 | Lives in My.Scouting |

## 12. Advancement (TWH's biggest section — and Scoutbook's core)

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Advancement hub / settings | 🟡 | 🔴 | Eagle/OA/COH pages only |
| Enter rank history | ❌ | 🔴 | |
| Rank tracking (individual) | 🟡 | 🔴 | Eagle only via EagleScout model |
| Rank requirements catalog | ❌ | 🔴 | |
| Eagle palms | ❌ | 🔴 | |
| Merit badge tracking (individual) | ❌ | 🔴 | MB counselors yes, MB progress no |
| Awards (individual) | 🟡 | 🔴 | CohAward (court of honor) only |
| Venturing / Sea Scout advancement | ❌ | 🔴 | |
| Bulk-enter rank requirements | ❌ | 🔴 | |
| Bulk-enter MB requirements | ❌ | 🔴 | |
| Approve MB / rank sign-off requests | ❌ | 🔴 | |
| Adult awards / achievements | ❌ | 🔴 | |
| Service stars | ❌ | 🔴 | |
| Award types / pending awards | 🟡 | 🔴 | CohAward `state` covers pending |
| Requirements earned at event | ❌ | 🔴 | TWH ties advancement→event participation |
| Credit for outside activity | ❌ | 🔴 | |
| Scoutbook Plus integration | ❌ | 🔴 | We link out only (`scoutbookUserId`) |
| ScoutNET awards file | ❌ | 🔴 | |
| Set award date | 🟡 | 🔴 | CohAward.date |
| Blue cards / award cards | ❌ | 🔴 | |
| MB resources catalog | ❌ | 🔴 | |
| MB counselors directory | ✅ | 🟠 | |
| Export rank requirements / status | ❌ | 🔴 | |

## 13. Advancement reports (~47 reports)

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Pending awards (and by patrol, counts, labels) | 🟡 | 🔴 | CohAward query exists; no formatted reports |
| **Council Advancement Report (Internet Advancement)** | ❌ | 🔴 | The legally required upload to council |
| Sign-off requests report | ❌ | 🔴 | |
| Per-rank requirement reports (Tenderfoot/2C/1C/Eagle by scout & by patrol) | ❌ | 🔴 | |
| Outdoor requirements thru 1C | ❌ | 🔴 | |
| Eagle MB status (incl. outdoor MB) | 🟡 | 🔴 | Eagle page tracks status loosely |
| Leadership rank requirement status | ❌ | 🔴 | |
| Uncompleted rank/MB requirements (by scout, by requirement) | ❌ | 🔴 | |
| Camping MB nights | ❌ | 🔴 | Event credits model has campingNights but no MB rollup |
| Venturing / Sea Scout requirements (and uncompleted) | ❌ | 🔴 | |
| Scouts ready for SM Conf / BOR | ❌ | 🔴 | |
| Rank status by age / by tenure / history | ❌ | 🔴 | |
| MB history / in progress (by scout/badge/counselor) | ❌ | 🔴 | |
| Eagle Roll Call | 🟡 | 🔴 | Eagle list exists |
| OA roster / eligibility / advancement dates | 🟡 | 🟠 | OA elections page; no eligibility computation |
| National Outdoor Awards | ❌ | 🔴 | |
| World Conservation Award | ❌ | 🔴 | |
| Scouting history | ❌ | 🔴 | |
| Board of Review report | ❌ | 🔴 | |
| Progress to next rank | ❌ | 🔴 | |

> **All 47 advancement reports are 🔴 high overlap with Scoutbook.**
> Building these is rebuilding Scoutbook/IA. Strategic question: do we
> link out to Scoutbook for these, or build a sync? Roadmap answer:
> deep-link out now, opportunistic read-only sync later.

## 14. Events & calendar

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Events hub / master calendar | ✅ | 🟢 | |
| Email invitation | 🟡 | 🟢 | Broadcast email can announce, no per-event invite flow |
| Event reminders | ❌ | 🟢 | Cron stub, not wired |
| Event locations DB | 🟡 | 🟢 | Per-event location field, no shared catalog |
| Merge duplicate locations | ❌ | 🟢 | |
| Maintain events | ✅ | 🟢 | |
| Event types / activity types | 🟡 | 🟢 | category enum, simpler than TWH |
| Dress codes | ❌ | 🟢 | |
| Event documents | ❌ | 🟢 | Could reuse Forms; not linked |
| Copy event / monthly recurrence | ✅ | 🟢 | RFC 5545 RRULE — better than TWH's "copy monthly" |
| National holidays | ❌ | 🟢 | |
| **Electronic permission slips** | ❌ | 🟠 | Big gap; TWH does parental signature |
| Permission reminders | ❌ | 🟠 | |
| Sign up members for event | ✅ | 🟢 | RSVP + admin override |
| Take attendance | 🟡 | 🟠 | RSVP doubles as attendance; no check-in flow |
| Patrol attendance | 🟡 | 🟢 | |
| Shifts (volunteer slots) | ✅ | 🟢 | SignupSlot + waitlist + auto-promote |
| Shift attendance | 🟡 | 🟢 | |
| Export events / participation | ❌ | 🟢 | |

## 15. Event reports (~24 reports)

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Participant list (w/ BSA IDs) | 🟡 | 🟠 | RSVP list view |
| Emergency contacts for event | ❌ | 🟠 | High value, missing |
| Permission slip status / needed | ❌ | 🟠 | |
| Non-participant / undecided lists | 🟡 | 🟢 | |
| Tour permit worksheet | ❌ | 🟠 | BSA dropped tour permits in 2017, replaced with activity consent |
| Upcoming events detail / summary | ✅ | 🟢 | Public events API + admin view |
| Event compliance / shift compliance | ❌ | 🟢 | |
| Participation % by event type | ❌ | 🟢 | |
| Annual / cumulative / date-range participation | ❌ | 🟢 | |
| Most recent participation | ❌ | 🟢 | |
| Attendance totals by event | ❌ | 🟢 | |
| Community service report | 🟡 | 🟠 | Event grants serviceHours; admin/credits is stub |
| Shift signup list / detail / hours per person | 🟡 | 🟢 | Data present, no report |
| Family shift participation | ❌ | 🟢 | |

## 16. Forms & documents

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Form categories | ✅ | 🟢 | |
| Maintain forms & documents | ✅ | 🟢 | URL or file upload, encrypted |

## 17. Inventory / equipment

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Maintain inventory | 🟡 | 🟢 | Equipment model |
| Upload inventory bulk | ❌ | 🟢 | |
| Categories / locations | 🟡 | 🟢 | |
| **Check-in / check-out** | ❌ | 🟢 | Only via trip gear assignments, not loan tracking |
| Quick check-in | ❌ | 🟢 | |

## 18. Photos & video

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Upload / search / download / delete photos | ✅ | 🟢 | Encrypted storage |
| Video links | ✅ | 🟢 | Embed parser |
| Photo gallery access control | ✅ | 🟢 | Public/members/leaders + chat-photo auth |

**Compass extras**: photo encryption, chat photo attachments, mobile uploader.

## 19. Sales / fundraising (TWH ~19 features)

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Sales campaigns / merchandise / prizes | ❌ | 🟢 | |
| Public orders / payments / incomplete orders | ❌ | 🟢 | |
| Booth sales / merchandise booths | ❌ | 🟢 | |
| Member orders / delivered quantities | ❌ | 🟢 | |
| Top sellers / consolidated orders / item detail | ❌ | 🟢 | |
| Merchandise inventory | ❌ | 🟢 | |

> Entire popcorn / camp-card / fundraising surface is missing. Zero
> Scoutbook overlap — pure TWH territory.

## 20. Financial / accounting (TWH's largest section, ~105 features)

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Troop accounts / member subaccounts | ❌ | 🟢 | |
| Personal subaccount balances & transfer rules | ❌ | 🟢 | |
| Transaction types / fiscal years | ❌ | 🟢 | |
| Financial hub | ❌ | 🟢 | |
| Upload member starting balances | ❌ | 🟢 | |
| Event balances / fund balances | ❌ | 🟢 | |
| Budget template / event & fundraiser budgets / actuals | ❌ | 🟢 | |
| Fund categories / funds / fund accounting | ❌ | 🟢 | |
| Individual & group transactions | ❌ | 🟢 | |
| Audit trail | 🟡 | 🟢 | AuditLog schema present, minimal use |
| Auto-charge event participants | ❌ | 🟢 | |
| Sending account balances | ❌ | 🟢 | |
| **PayPal / Square online payments** | ❌ | 🟢 | Stripe is org-billing only, not member payments |
| Expense reimbursement (settings + review) | ✅ | 🟢 | `/admin/reimbursements` |
| Refunds | ✅ | 🟢 | `/admin/refunds` |
| Bank reconciliation / deposits | ❌ | 🟢 | |
| Summer camp deposits | ❌ | 🟢 | |
| Dues | ❌ | 🟢 | |
| Transfer funds | ❌ | 🟢 | |
| Campouts (cost tracking) | 🟡 | 🟢 | Trip ingredient costs, no transactional ledger |
| Fundraisers | ❌ | 🟢 | |
| Note payments for events | ❌ | 🟢 | |
| Account balances / financial history / budget reports | ❌ | 🟢 | |
| Individual account detail / summary | ❌ | 🟢 | |
| Recent deposits to member accounts | ❌ | 🟢 | |

> **Treasury is the single biggest functional gap vs. TWH.** Zero
> Scoutbook overlap — Scoutbook does not do accounting. This is the
> roadmap's "next" track.

## 21. Rechartering

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Recharter years / worksheet | ❌ | 🔴 | Internet Recharter is a My.Scouting/SB function |
| Troop information for recharter | 🟡 | 🔴 | Org has unit info; no recharter export |

## 22. Journey to Excellence

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| JTE preparation / events / leadership training | ❌ | 🟠 | |
| JTE recharter years / report / worksheet | ❌ | 🟠 | JTE relies on Scoutbook advancement counts |

## 23. Administration & configuration

| TWH feature | Compass | SB | Notes |
|---|---|---|---|
| Site appearance / theme | ✅ | 🟢 | Logo + color tokens |
| Custom CSS | ❌ | 🟢 | |
| User forum / enhancement requests / support | 🟡 | 🟢 | Support ticket form, no public forum |
| **Database backup** | 🟡 | 🟢 | Server-side via Postgres tooling; no admin self-serve |
| Renew subscription | ✅ | 🟢 | Stripe billing portal |
| Menu configuration / quick menus / disable items | ❌ | 🟢 | Sidebar is hardcoded |
| Override public access | 🟡 | 🟢 | Per-resource visibility flags |
| Permission / menu / role-task reports | ❌ | 🟢 | |

---

## Compass features TWH doesn't have

Differentiators we keep widening (see `ROADMAP.md`):

- Per-org field-level encryption (DEK + MASTER_KEY + recovery code)
- TOTP MFA + backup codes
- Native group chat + DMs with two-deep enforcement + leader oversight
- Trip meal planner (recipes, dietary conflict detection, shopping list)
- Carpool / car rides volunteer board
- Modern mobile app with push notifications
- iCal feed with full RFC 5545 RRULE recurrence
- GrapesJS visual page CMS with version history
- Resend webhook delivery tracking (opens, clicks, bounces, complaints)
  for both email and SMS
- DM digest + DM reminder cron
- Newsletter with auto-injected upcoming events + recent posts
- API tokens for mobile/integrations
- Multi-tenancy via Host header + custom domain support

---

## Headline numbers

| Bucket | TWH | Full ✅ | Partial 🟡 | Missing ❌ | SB-overlap missing 🔴 |
|---|---|---|---|---|---|
| Migration / imports | 12 | 1 | 0 | 11 | 6 |
| Multi-unit / linked sites | 6 | 0 | 0 | 6 | 0 |
| User / security | 14 | 6 | 4 | 4 | 0 |
| Public pages | 18 | 11 | 5 | 2 | 0 |
| Mobile | 3 | 2 | 1 | 0 | 0 |
| My Stuff | 27 | 4 | 4 | 19 | 7 |
| Email / comms | 15 | 9 | 4 | 2 | 0 |
| Forum | 4 | 0 | 1 | 3 | 0 |
| Membership | 47 | 11 | 14 | 22 | ~5 |
| Membership reports | 30 | 2 | 8 | 20 | ~3 |
| **Advancement** | 27 | 1 | 5 | 21 | **21** |
| **Advancement reports** | 47 | 0 | 4 | 43 | **43** |
| Events | 23 | 8 | 7 | 8 | ~1 |
| Event reports | 24 | 1 | 6 | 17 | ~2 |
| Forms | 3 | 2 | 0 | 1 | 0 |
| Inventory | 7 | 0 | 3 | 4 | 0 |
| Photos / video | 7 | 7 | 0 | 0 | 0 |
| Sales | 19 | 0 | 0 | 19 | 0 |
| **Financial** | 105 | 2 | 3 | 100 | 0 |
| Rechartering | 4 | 0 | 1 | 3 | **3** |
| JTE | 7 | 0 | 0 | 7 | 0 (related) |
| Admin config | 24 | 4 | 4 | 16 | 0 |
| **Total** | **~470** | **~71** | **~74** | **~325** | **~85** |

(Some TWH "features" are sub-pages of one capability, so the deduped
total is closer to 470 than the literal 588 bullet count.)

---

Source: TroopWebHost help index at
https://www.troopwebhost.org/help.aspx?ID=468 — fetched 2026-05-07.
Compass codebase as of `main` at the same date.
