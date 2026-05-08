# Treasury — design doc

Status: **proposed**, scope-only. No code lands until this doc is signed
off by the user. The roadmap ([ROADMAP.md](../ROADMAP.md)) calls
treasury the "wedge" — the highest-leverage non-Scoutbook gap, and the
piece that unblocks sales / fundraising. It is also explicitly multi-
quarter; the goal here is to fix the model and the surface area, not
to plan every screen.

## Goals

1. Be the single source of truth for **money owed and money held by the
   unit**, per member.
2. Replace the "treasurer's spreadsheet" without forcing an export to
   QuickBooks. The treasurer can run their year inside Compass.
3. Settle event participation **automatically** — RSVP yes + Event.cost
   posts to the member's subaccount.
4. Let parents **pay online** (Stripe; Square as follow-on) and see
   their balance in the parent My Scouts portal we just shipped.
5. Reconcile against bank statements without a CPA.

## Non-goals

- We are **not** a general ledger / accrual accounting system. No
  double-entry, no GAAP. Single-entry typed transactions against
  member subaccounts and unit funds.
- No 1099 / W-2 issuance. The unit's CO handles tax filings.
- No payroll.
- No multi-currency.
- No per-org Stripe Connect onboarding flow in v1; the unit pastes a
  Stripe API key (or we host a single platform Stripe account with
  Direct Charges in a later phase).

## Glossary

| Term | Meaning |
|---|---|
| **Subaccount** | A per-Member ledger. Positive balance = member owes nothing; negative balance = member owes the unit. |
| **Fund** | Unit-level bucket: `general`, `scout-accounts`, `popcorn`, `summer-camp`. Every transaction posts to exactly one fund; subaccount balances roll up under `scout-accounts`. |
| **Transaction** | Typed entry: `dues`, `event-charge`, `deposit`, `expense`, `transfer`, `refund`, `fundraiser-credit`, `manual`. |
| **Fiscal year** | Org-configurable, e.g. Sep 1 → Aug 31. Drives budget tabs and year-over-year reports. |
| **Budget** | Per-fiscal-year per-fund target (income / expense). |

## Schema (Prisma sketch)

```prisma
model Fund {
  id          String   @id @default(cuid())
  orgId       String
  code        String   // "general" | "scout-accounts" | custom slug
  name        String
  isSystem    Boolean  @default(false) // true for "scout-accounts"
  archived    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  org          Org           @relation(fields: [orgId], references: [id], onDelete: Cascade)
  transactions Transaction[]
  budgets      FundBudget[]

  @@unique([orgId, code])
  @@index([orgId, archived])
}

model MemberSubaccount {
  id          String   @id @default(cuid())
  orgId       String
  memberId    String   @unique
  // Cached running balance for fast reads. Recomputed on every
  // transaction; a cron job validates the cache vs. SUM(Transaction)
  // nightly and emails the operator on drift.
  balanceCents Int     @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  org    Org    @relation(fields: [orgId], references: [id], onDelete: Cascade)
  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([orgId])
}

model Transaction {
  id              String   @id @default(cuid())
  orgId           String
  fundId          String
  // For dues / event-charge / scout-account adjustments. Null for
  // unit-only entries like vendor expenses or fundraiser proceeds
  // before allocation.
  memberId        String?
  // Optional event link. Auto-charge populates this; refunds
  // preserve it for round-trip linkage.
  eventId         String?
  // Optional Reimbursement link.
  reimbursementId String?
  type            String   // dues | event-charge | deposit | expense | transfer-out | transfer-in | refund | fundraiser-credit | manual
  amountCents     Int      // positive = money in (or charge added), negative = money out
  description     String
  postedAt        DateTime @default(now())
  // Soft-delete only via reversal: insert an opposite-sign entry
  // referencing this id in `reversesId`. Keeps the audit trail intact.
  reversesId      String?
  // Stripe / bank-recon pointers
  stripePaymentIntentId String?
  bankImportRowId       String?
  createdById     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  org           Org             @relation(fields: [orgId], references: [id], onDelete: Cascade)
  fund          Fund            @relation(fields: [fundId], references: [id], onDelete: Restrict)
  member        Member?         @relation(fields: [memberId], references: [id], onDelete: SetNull)
  event         Event?          @relation(fields: [eventId], references: [id], onDelete: SetNull)
  reimbursement Reimbursement?  @relation(fields: [reimbursementId], references: [id], onDelete: SetNull)
  reverses      Transaction?    @relation("TransactionReversal", fields: [reversesId], references: [id], onDelete: SetNull)
  reversedBy    Transaction[]   @relation("TransactionReversal")

  @@index([orgId, postedAt])
  @@index([orgId, fundId, postedAt])
  @@index([orgId, memberId, postedAt])
  @@index([orgId, eventId])
}

model FiscalYear {
  id        String   @id @default(cuid())
  orgId     String
  label     String   // "FY 2026"
  startsOn  DateTime // date-only
  endsOn    DateTime
  closedAt  DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  org      Org           @relation(fields: [orgId], references: [id], onDelete: Cascade)
  budgets  FundBudget[]

  @@unique([orgId, label])
  @@index([orgId, startsOn])
}

model FundBudget {
  id            String  @id @default(cuid())
  orgId         String
  fiscalYearId  String
  fundId        String
  // Signed: positive expected income, negative expected expense.
  // A line per category isn't worth modelling in v1 — `notes` covers it.
  expectedCents Int
  notes         String?

  org        Org         @relation(fields: [orgId], references: [id], onDelete: Cascade)
  fund       Fund        @relation(fields: [fundId], references: [id], onDelete: Cascade)
  fiscalYear FiscalYear  @relation(fields: [fiscalYearId], references: [id], onDelete: Cascade)

  @@unique([fiscalYearId, fundId])
  @@index([orgId, fiscalYearId])
}

model BankImport {
  id           String   @id @default(cuid())
  orgId        String
  filename     String
  format       String   // "ofx" | "csv-generic" | "csv-chase" | ...
  uploadedById String?
  uploadedAt   DateTime @default(now())

  rows BankImportRow[]
}

model BankImportRow {
  id           String  @id @default(cuid())
  importId     String
  postedAt     DateTime
  amountCents  Int
  description  String
  // Once matched to a Transaction, transactionId is set + matchedAt.
  transactionId String?
  matchedAt     DateTime?

  import BankImport @relation(fields: [importId], references: [id], onDelete: Cascade)

  @@index([importId, matchedAt])
}
```

### Relation additions

`Org.funds`, `Org.transactions`, `Org.fiscalYears`, `Org.bankImports`,
`Member.subaccount` (1:1), `Event.transactions`, `Reimbursement.transactions`.

### Encryption / privacy

- Money is **not** encrypted. Treasurers need to query, sort, and
  aggregate by amount; encrypting the column would force JS-side
  rollups for every report and break the cached balance pattern.
- Member.firstName / lastName are still encrypted; balance reports
  decrypt names just like the existing roster page.
- `description` is plaintext but capped at 500 chars and never
  includes card numbers (Stripe handles that).

## Cached balance invariant

The `MemberSubaccount.balanceCents` cache is computed by

```sql
SUM(Transaction.amountCents)
WHERE memberId = ? AND fundId = scout-accounts.id AND reversedById IS NULL
```

We update the cache in the same Prisma transaction that writes the
journal entry. A nightly job recomputes from scratch and emails the
operator if any cache row is wrong (drift > 0). This trades a small
amount of write complexity for cheap reads on the parent portal.

## Workflows

### 1. Member subaccounts (foundational)

- `Org.provisionTreasury()` — one-time idempotent bootstrap that
  creates two system funds (`general`, `scout-accounts`) and a
  subaccount per existing Member.
- New Member creation auto-creates their subaccount (Prisma `create`
  hook, or explicit on the leader's "Add member" path).
- Opening balance import: CSV upload of `(memberFirstName,
  memberLastName, openingBalance, asOfDate)` → for each row, post a
  `manual` transaction backdated to `asOfDate` for the matched
  Member. Conflicts (no match, ambiguous match) get a row-by-row
  resolution UI before commit.

### 2. Transactions surface

`/admin/treasury/ledger` — the journal view. Filters: fund, member,
type, event, date range. CSV export. The ledger row is the unit of
truth; everything else is a curated view.

`/admin/treasury/posting` — the most common workflows:

- **Charge a member**: pick member, fund (default scout-accounts),
  amount, description, optional event link.
- **Credit a member**: same, opposite sign.
- **Bulk dues**: pick a member set (patrol / all youth / all adults),
  amount, description.
- **Refund**: pick a transaction, post the opposite sign with a
  `reversesId` pointer.

### 3. Auto-charge event participants

When an Event has `cost` set and a member's RSVP transitions to
`response = "yes"`:

1. Look up an existing Transaction with `(eventId, memberId,
   type=event-charge, reversedById=null)`. If none, post a new one
   for `Event.cost` against scout-accounts.
2. RSVP transitions away from "yes" → post a reversal with
   `reversesId` linking the original.

The transition fires from the existing RSVP server actions (signed-in
path) and the public `/rsvp/[token]` route. We keep the original
ergonomics: RSVPing is one click; the charge appears in the parent's
view next time they reload.

A leader-toggleable per-event "auto-charge" switch defaults **on**
when `Event.cost > 0`. Off lets the treasurer charge by hand
post-event (e.g. campouts that bill by miles driven).

### 4. Online member payments — Stripe

Stack: Stripe Checkout (hosted page), webhook ingestion via Resend's
existing `/api/webhooks/stripe` (new route) for `checkout.session.completed`
and `payment_intent.succeeded`. Each successful payment posts:

- A `deposit` Transaction in `general` fund (or `scout-accounts` for
  pure-self-pay) with the gross amount.
- A `manual` reversal for the Stripe processing fee, posted to a
  `stripe-fees` system fund (also auto-created at provision time).

Parent flow:

1. Parent on `/account/my-scouts` clicks **Pay $42 toward
   Patrol-Box-Repair-2026**. (We surface a "make a payment" link per
   org subaccount when balance is non-zero.)
2. Server creates a Stripe Checkout Session with the org's secret
   key; success_url returns to `/account/my-scouts?paid=ok`.
3. Webhook posts the deposit transaction; the cached balance updates;
   parent sees zero on next reload.

We won't build mobile in-app payments in v1 — Stripe Checkout works
fine in the iOS / Android in-app browser.

Per-org Stripe configuration: leaders paste a **restricted Stripe
secret key** at `/admin/treasury/settings`. We never store full live
keys; the form validates the key prefix and scope and we encrypt
storage with the per-org DEK. Connect onboarding (platform-managed
Stripe accounts) is a follow-up.

### 5. Reimbursement → ledger wire-up

The existing `/admin/reimbursements` queue already approves expenses.
On approval, post a `expense` Transaction against the chosen fund;
on rejection, no row. The reimbursement keeps a 1:1 link
(`Transaction.reimbursementId`) so the queue can show "this reimbursement
hit the ledger as txn-abc on 2026-04-12".

### 6. Bank reconciliation + deposits

`/admin/treasury/reconcile` — drag a CSV from any of the supported
banks (or generic OFX) into the page. We parse, dedupe, and present a
two-column UI:

| Bank row | Suggested match | Action |
|---|---|---|
| `2026-04-12 -$57.40 "Walmart 419"` | Reimbursement #42 (approved $57.40) | Match / Skip |
| `2026-04-12 +$210.00 "Smith family"` | None | Manual: pick Member, fund, type |

Matched rows write `bankImportRowId` on the Transaction so the
auditor can prove the unit's books agree with the bank statement.

Initial bank format support: generic CSV column-mapper + Chase/BoA/
USAA presets. OFX as a stretch goal.

### 7. Reports

Each is a server-rendered report off the journal table; CSV download
sibling routes mirror the existing pattern from the quick-wins batch.

- **Account detail (per member)** — every transaction that touched
  this member, with running balance.
- **Account balances (whole troop)** — every Member with
  `balanceCents != 0`, sorted by absolute balance.
- **Fund balances** — current balance per fund, with FYTD income +
  expense.
- **Budget vs. actual** — per-fund table for the active fiscal year.
- **Year-over-year** — single page totals by fund across the last 4
  fiscal years.

### 8. "Send members their balances" email

Treasurer cron / one-shot button on `/admin/treasury/balances`. For
every Member with `balanceCents != 0`:

- Resolve parents via `Member.parentIds`, drop adults who have no
  parents linked.
- Build a per-recipient HTML email with the running balance, the
  last 5 transactions, and a "pay online" link if Stripe is wired.
- Send through the existing mail driver. List-Unsubscribe header
  points at the family's existing unsub token (we don't allow
  unsubscribing from a treasurer email; instead a manage-preferences
  link points to /account/notifications).

## Audit / safety

- Every Transaction write goes through `audit({ entityType:
  "Transaction", action })`. The audit viewer we just shipped picks
  it up automatically.
- `Transaction` rows are **never deleted**. Reversal-only via
  `reversesId`. The ledger view shows reversed pairs collapsed.
- A nightly job recomputes balances from scratch and emails the
  operator on cache drift. Drift in production is a P1.
- Money writes are wrapped in a Prisma `$transaction` that updates
  the cached balance and inserts the journal entry atomically.

## Phasing

**Phase 1 — Foundation** (the only phase to start with code):
- Schema + migration
- Provisioning (`Org.provisionTreasury`)
- Manual posting UI (charge / credit / bulk)
- Per-member detail report
- Audit hookup

**Phase 2 — Auto-charge + parent visibility**:
- Event auto-charge on RSVP transitions
- Reimbursement → ledger wire
- Parent My Scouts: balance card + 5 most recent transactions

**Phase 3 — Online payments**:
- Stripe key config + Checkout flow
- Webhook ingestion
- "Pay online" link in the parent portal

**Phase 4 — Reports + reconciliation**:
- Fund balances, account balances, budget vs actual, YoY
- "Send balances" email
- CSV bank import + match-up UI
- Bank format presets

Phases 1–2 unblock sales / fundraising. Phase 3 unblocks the public
order page in sales. Phase 4 is the long tail.

## Open questions

1. **Stripe Connect vs. per-org keys.** Connect is friendlier and
   lets us absorb the platform cost; per-org keys are simpler in v1.
   Recommend per-org for Phase 3, Connect after the first
   ~10 paying orgs as a separate workstream.
2. **Subaccounts for adults.** TWH treats them as full members.
   We'll do the same: every Member gets a subaccount, but the
   default surface only highlights non-zero rows.
3. **Cash bank imports.** A unit that runs cash-only never imports a
   bank file. Reconciliation collapses to manual matching; that's
   fine.
4. **Year-end close.** Auto-create next year's fiscal record on
   `endsOn`? Recommend manual ("Close FY 2026 → Start FY 2027" wizard)
   for v1; auto-creation hides surprises.
