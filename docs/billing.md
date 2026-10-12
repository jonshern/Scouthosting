# Sign-up, free trial and billing

How a new unit finds Compass, tries it for 30 days, and keeps paying if
it likes it. One subscription per unit covers the whole family: Compass,
Waypoint and Summit all read the same unit's status.

## How it works

1. **Sign up.** Every "Start your free trial" button (the Compass
   marketing pages, the family landing page in `jonshern/bluecard`
   `marketing/landing/`) goes to `/start`. The person creates an adult
   account (email, Google or Apple), then names their unit. That creates
   the unit with them as admin and owner, shows the unit's recovery code
   once, and starts a 30-day trial with no card
   (`src/lib/provision/self-serve.ts`, `TRIAL_DAYS` in
   `src/lib/billing/trial.ts`). Admins are then asked to turn on two-step
   sign-in, as for every admin.
2. **Trial.** The admin pages show how many days are left, warning in
   the last week. `Admin → Billing` (`/o/<slug>/admin/billing`) has
   **Add a card**, which opens Stripe Checkout. If they subscribe during
   the trial, Checkout passes the trial's end date to Stripe as
   `trial_end`, so nothing is charged until the day the trial would have
   ended. (Stripe needs at least 48 hours of trial left; in the last two
   days the first charge is immediate.)
3. **Renewal.** Stripe bills the card every period and retries failed
   payments. **Manage billing** opens Stripe's customer portal for card
   changes, invoices and canceling.
4. **Trial ends unpaid, or the subscription is canceled.** The admin
   pages close (except Billing and Security) until someone subscribes.
   Nothing is deleted, and the public site and members' pages stay up.
   A failed payment gets a 7-day grace period first.

Stripe's webhooks are the only thing that changes a unit's subscription
fields (`src/lib/billing/stripe.ts#syncFromStripeEvent`). Waypoint and
Summit read the same state with
`GET /api/v1/orgs/<slug>/subscription` (any member's token), which returns
`status`, `trialDaysLeft`, `trialEndsAt`, `currentPeriodEnd`,
`cancelAtPeriodEnd`, `subscribed` and `locked`.

**Billing is off until Stripe is set up.** With no real keys
(`isConfigured()` wants an `sk_`/`rk_` key and a `price_` ID), the trial
still counts down but nothing locks, since there is no way to pay. Units
made before self-serve sign-up have no trial end date and are never
locked; demo units are never billed.

## Setting up Stripe (one time)

Stripe charges a fee per payment; there's no monthly fee for the account.

1. Create an account at <https://dashboard.stripe.com/register>. Stay in
   **Test mode** (toggle top right) until you've tried it end to end.
2. **Product and price.** Product catalog → Add product. Name it
   "Compass unit subscription", recurring, and set the price and period
   you want (the marketing pages currently say Standard $99 and Premium
   $119). Copy the price's ID (`price_…`).
3. **API key.** Developers → API keys → copy the **Secret key**
   (`sk_test_…`). A restricted key (`rk_…`) with write access to Checkout
   Sessions, Customer portal and Subscriptions also works.
4. **Customer portal.** Settings → Billing → Customer portal → Activate,
   and allow customers to update payment methods, see invoices and cancel.
5. **Emails.** Settings → Customer emails: turn on receipts, failed
   payment emails, and "Send emails about upcoming renewals". Under
   Subscriptions → Manage failed payments, keep Smart Retries on.
6. **Webhook.** Developers → Webhooks → Add endpoint at
   `https://<your Compass host>/api/webhooks/stripe` with these events:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`, `invoice.payment_succeeded`. Copy its
   **Signing secret** (`whsec_…`).

### Where the keys go

| Value | Local (`.env`) | Cloud (GCP) |
|---|---|---|
| Secret key | `STRIPE_SECRET_KEY` | Secret `core-<env>-stripe-secret-key` |
| Webhook signing secret | `STRIPE_WEBHOOK_SECRET` | Secret `core-<env>-stripe-webhook-secret` |
| Price ID | `STRIPE_PRICE_ID` | `stripe_price_ids = { prod = "price_…" }` in `infra/terraform.tfvars` |
| Price shown on the billing page (optional) | `BILLING_PRICE_LABEL`, e.g. `$99 a year` | not wired yet |

For a cloud secret:
`printf '%s' "$KEY" | gcloud secrets versions add core-prod-stripe-secret-key --data-file=-`,
then redeploy.

### Trying it locally

1. Put the three test values in `.env` and restart `make dev`.
2. Forward webhooks to your machine with the Stripe CLI:
   `stripe login`, then
   `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
   It prints a `whsec_…` for this session; use that as
   `STRIPE_WEBHOOK_SECRET` while testing.
3. Go to `http://localhost:3000/start`, sign up, create a unit, then
   Billing → Add a card. Use card `4242 4242 4242 4242`, any future date,
   any CVC. Back on Billing it should say "Subscribed" with the renewal
   date at the end of the trial.
4. To see the end of a trial without waiting, set the unit's
   `trialEndsAt` to the past in the database; the admin pages close and
   Billing offers Subscribe. In Stripe, a test clock can fast-forward a
   subscription to its first charge.

Going live: switch the dashboard to Live mode, repeat steps 2 to 6 there
(live keys and IDs are different), and replace the three values.

## Runbook

| Situation | What to do |
|---|---|
| Unit paid but still shows the trial or the lock | Stripe → Developers → Webhooks → the endpoint → look for failed deliveries and **Resend**. A 401 means `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint's signing secret. The unit's audit log shows each `billing.*` event that was applied |
| A unit needs more time | Super-admin: set the org's `trialEndsAt` later in the database (it only matters while the status is `trialing`). If they already subscribed, extend the trial on the subscription in the Stripe dashboard instead |
| Refund or cancel for a unit | Do it in the Stripe dashboard; the webhook updates Compass |
| Turn billing off | Unset `STRIPE_PRICE_ID` (or the key). Nothing locks; the trial banner still shows |
| Rotate the Stripe key | Roll the key in Stripe, add the new secret version, redeploy, then expire the old key |
