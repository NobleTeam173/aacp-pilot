# Stripe Integration — Remaining Setup

This file is the single source of truth for completing the Stripe integration on the AACP™ Career Navigator
(careers.aviationaerospacecompetency.com). Payments use Stripe Checkout with the **embedded form**
(`ui_mode: "form"`, Checkout Form SDK) and Stripe API version **`2026-03-25.dahlia`**.

Status (2026-11-23): code updated; **not live yet** — the Worker has no Stripe secrets and Stripe has no
webhook endpoint for Career Navigator, so checkout currently returns "Payments are not available yet".

---

## Values to Replace

The following values are placeholders and must be updated before going live.

**Files containing placeholders:**
- [public/career-navigator.html](public/career-navigator.html) — `STRIPE_PK` (then run `npm run build` so `dist/` picks it up)

| Field | Current Value | What to Set |
|-------|--------------|-------------|
| `STRIPE_PK` (publishable key) | `pk_live_...` | The **publishable** key of the same Stripe account as `STRIPE_SECRET_KEY` (Noble D Business Limited, `acct_1UcCdE…`): Dashboard → Developers → [API keys](https://dashboard.stripe.com/apikeys). The previous value was a **test** key from a different account (`acct_1UcBhc…`) and cannot open sessions created by this account. |

`sample_only` parameters already have real values and were kept:

| Field | Value | Notes |
|-------|-------|-------|
| `mode` | `subscription` | All three Career Navigator plans are recurring. |
| `line_items[0][price]` | From the plan's Worker secret (see below) | Real Price IDs — set the secrets. |
| `line_items[0][quantity]` | `1` | — |

---

## Configured Parameters

These parameters were configured in Checkout Studio and are already set correctly.

**Files containing these parameters:**
- [worker.js](worker.js) — `handleNavigatorCheckout()` (Checkout Session params) and `stripeRequestNested()` (`Stripe-Version` header)

| Parameter | Value |
|-----------|-------|
| `ui_mode` | `form` |
| `billing_address_collection` | `auto` |
| `phone_number_collection[enabled]` | `false` |
| `automatic_tax[enabled]` | `false` |
| `payment_method_collection` | `always` (subscription mode only) |
| `submit_type` | `auto` |
| `saved_payment_method_options[payment_method_save]` | `enabled` |
| `tax_id_collection[enabled]` | `true` |
| `tax_id_collection[required]` | `never` |
| `name_collection[individual][enabled]` / `[optional]` | `true` / `true` |
| `name_collection[business][enabled]` / `[optional]` | `true` / `true` |
| `integration_identifier` | `custom_embedded_web_0001` |

Removed because they are no longer configured: `allow_promotion_codes`, `origin_context`, and the
hosted-page `success_url` / `cancel_url` (replaced by `return_url`, below).

**Client appearance** (Checkout Studio) is in [public/career-navigator.html](public/career-navigator.html) as
`STRIPE_CHECKOUT_APPEARANCE`: theme `stripe`, labels `auto`, inputs `spaced`, borderRadius `4px`,
colorBackground `#ffffff`, colorDanger `#df1b41`, colorPrimary `#0570de`, colorSuccess `#00c853`,
colorText `#30313d`, fontFamily `default`, fontSizeBase `16px`, spacingUnit `4px`.

Other session values (integration plumbing, not Checkout Studio): `return_url` (Career Navigator page with
`?payment=success&session_id={CHECKOUT_SESSION_ID}`; only careers.aviationaerospacecompetency.com or
localhost:3000 is accepted from the client), `customer`, `metadata[user_id|plan|invite_code_id]`, trial
settings (`subscription_data[trial_end]` for Premium Student = Aug 31; 7-day trial for Career Advisor) and
invite-code `discounts`.

---

## Setup

### 1. Worker secrets (Cloudflare Worker `aacp-backend`)

Set each with `npx wrangler secret put <NAME> --config wrangler.toml` (you'll be prompted for the value — don't put keys in code or in this file):

| Secret | Value |
|--------|-------|
| `STRIPE_SECRET_KEY` | Secret key (`sk_live_…`) or, better, a **restricted key** (`rk_live_…`) with write access to Checkout Sessions and Customers, from the same account as `STRIPE_PK`. |
| `STRIPE_NAVIGATOR_PRICE_STUDENT` | `price_1Uf9sm6f5fXzbpPK54zV01jY` — "Student AACP Career Navigator", **$49.99 CAD / year** (matches the plan and the Premium card) |
| `STRIPE_NAVIGATOR_PRICE_INVITED` | `price_1UfA1L6f5fXzbpPKbg1tjOgI` — "Career Navigator Student Referral", $7.99 CAD / month |
| `STRIPE_NAVIGATOR_PRICE_ADVISOR` | `price_1Uf9r36f5fXzbpPKFrthQUl9` — "Guidance Counsellor", $14.99 CAD / month. (An older duplicate `price_1UcFjc6f5fXzbpPKAVNSVDE4`, also $14.99/month, exists — confirm which you want and archive the other.) |
| `STRIPE_NAVIGATOR_WEBHOOK_SECRET` | The webhook signing secret (`whsec_…`) from step 2. |

Price IDs above were read from the live account on 2026-11-23.

### 2. Webhook endpoint (Stripe Dashboard)

Stripe currently has **no** webhook endpoints. In [Workbench → Webhooks](https://dashboard.stripe.com/workbench/webhooks) add:

- **URL:** `https://api.aviationaerospacecompetency.com/navigator/webhook`
- **Events:** `checkout.session.completed` (the only event the Worker handles today)

Copy its signing secret into `STRIPE_NAVIGATOR_WEBHOOK_SECRET`.

### 3. Publishable key and deploy

1. Replace `STRIPE_PK` (see *Values to Replace*), run `npm run build`.
2. Deploy the page (S3 + CloudFront) and the Worker (`npx wrangler deploy --config wrangler.toml`).

### 4. Tax

Checkout Studio sets `automatic_tax: false`, so **no GST is collected**. The Plans tab currently says
"Alberta GST applied at checkout" — either update that wording or turn Stripe Tax on (add a Canada
registration in [Stripe Tax](https://dashboard.stripe.com/tax) and change the Checkout Studio setting).

---

## Project structure (files changed — no new files besides this one)

- [worker.js](worker.js) — `handleNavigatorCheckout()` now creates a `ui_mode: "form"` session and returns
  `{ client_secret, session_id }`; `stripeRequestNested()` pins `Stripe-Version: 2026-03-25.dahlia`;
  checkout and `GET /navigator/subscription` read the signed-in user from `user.sub` (they used `user.id`,
  which access tokens don't contain, so checkout failed with "User not found" and the subscription
  endpoint always reported "free"); checkout returns 503 instead of crashing when `STRIPE_SECRET_KEY` is missing.
- [public/career-navigator.html](public/career-navigator.html) — loads Stripe.js from
  `https://js.stripe.com/dahlia/stripe.js` (never bundled or self-hosted — PCI), adds the checkout panel
  (`#checkout-form`), and `initiateCheckout()` mounts the embedded form instead of redirecting.

## How it works

1. A signed-in user picks a plan (Plans / My Career Plan). `initiateCheckout(plan, inviteCode?)` calls
   `POST /navigator/checkout` with `{ plan, invite_code?, return_url }`.
2. The Worker finds or creates the Stripe Customer, applies any invite-code coupon, and creates the
   Checkout Session; it returns the `client_secret`.
3. The page calls `stripe.initCheckoutFormSdk({ clientSecret, appearance })`, mounts
   `checkout.createForm({ layout: 'expanded' })` in the checkout panel, and on the form's `confirm`
   event calls `actions.confirm({ formConfirmEvent })`.
4. On success Stripe returns the customer to `return_url` (`?payment=success`) and the page shows a
   confirmation toast.
5. Stripe sends `checkout.session.completed` to `/navigator/webhook`; the Worker verifies the signature,
   upserts `navigator_subscriptions` (plan becomes Premium), and records invite redemptions.

## Testing

Use a sandbox / test-mode key pair from one account (`sk_test_…` / `pk_test_…`) and test-mode Price IDs
first. Test cards (any future expiry, any CVC, any postal code):

| Scenario | Card |
|----------|------|
| Success | `4242 4242 4242 4242` |
| Requires 3D Secure | `4000 0025 0000 3155` |
| Declined | `4000 0000 0000 9995` |

Test webhooks with the [Stripe CLI](https://docs.stripe.com/stripe-cli):
`stripe listen --forward-to https://api.aviationaerospacecompetency.com/navigator/webhook`

## Next steps

- **Subscription changes:** the Worker only handles `checkout.session.completed`. Cancellations, failed
  renewals and plan changes (`customer.subscription.updated` / `customer.subscription.deleted`,
  `invoice.payment_failed`) are not processed, so a cancelled subscription stays Premium in Career
  Navigator. Add handlers before relying on recurring billing.
- Archive unused prices/products in the Dashboard (see the duplicate $14.99 price).
- Consider a Customer Portal link so subscribers can manage or cancel their plan.

## Resources

- [Stripe Support](https://support.stripe.com)
- [Stripe MCP](https://docs.stripe.com/mcp)
- [Checkout custom (form) integration docs](https://docs.stripe.com/payments/checkout)
