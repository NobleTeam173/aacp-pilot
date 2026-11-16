# Stripe Integration — Remaining Setup

This file is the single source of truth for completing the Stripe integration on the Career Navigator.

---

## Values to Replace

The following `sample_only` parameters have real values in production code but should be verified before going live.

**File:** `worker.js` → `handleNavigatorCheckout()`

| Field | Current Value | What to Set |
|-------|--------------|-------------|
| `success_url` | `https://careers.aviationaerospacecompetency.com/career-navigator.html?payment=success` | Update if the domain changes or you add a dedicated success page. Keep `?payment=success` so the page shows a confirmation toast. |
| `cancel_url` | `https://careers.aviationaerospacecompetency.com/career-navigator.html?payment=cancelled` | Update if the domain changes. |
| `line_items[0][price]` | Resolved at runtime from wrangler secrets (`STRIPE_NAVIGATOR_PRICE_STUDENT`, `STRIPE_NAVIGATOR_PRICE_INVITED`, `STRIPE_NAVIGATOR_PRICE_ADVISOR`) | ✅ Already using real Price IDs — just ensure the secrets are set (see below). |

---

## Configured Parameters

These parameters were set in Checkout Studio and are already applied in `worker.js`.

**File:** `worker.js` → `handleNavigatorCheckout()` params array

| Parameter | Value |
|-----------|-------|
| `ui_mode` | `hosted_page` |
| `billing_address_collection` | `auto` |
| `phone_number_collection[enabled]` | `false` |
| `automatic_tax[enabled]` | `true` — Stripe Tax calculates and collects GST/HST automatically |
| `allow_promotion_codes` | `true` |
| `payment_method_collection` | `always` (subscription mode) |
| `submit_type` | `auto` |
| `saved_payment_method_options[payment_method_save]` | `enabled` |
| `tax_id_collection[enabled]` | `true` |
| `tax_id_collection[required]` | `if_supported` |
| `name_collection[individual][enabled]` | `true` |
| `name_collection[individual][optional]` | `true` |
| `integration_identifier` | `hosted_web_0002` |
| `origin_context` | `web` |

---

## Required Secrets

Set these via `npx wrangler secret put <NAME>` before the worker can process payments:

```
STRIPE_SECRET_KEY                   # sk_live_... or sk_test_...
STRIPE_NAVIGATOR_WEBHOOK_SECRET     # whsec_... from Stripe Dashboard → Webhooks
STRIPE_NAVIGATOR_PRICE_STUDENT      # price_... for $9.99/mo Premium Student
STRIPE_NAVIGATOR_PRICE_INVITED      # price_... for $7.99/mo Advisor-Invited
STRIPE_NAVIGATOR_PRICE_ADVISOR      # price_... for $14.99/mo Career Advisor
```

---

## Stripe Dashboard Setup

### 1. Create the three products and prices

In [Stripe Dashboard → Products](https://dashboard.stripe.com/products), create:

| Product | Price | Billing |
|---------|-------|---------|
| Career Navigator — Premium Student | $9.99 CAD/month | Recurring |
| Career Navigator — Advisor-Invited | $7.99 CAD/month | Recurring |
| Career Navigator — Career Advisor | $14.99 CAD/month | Recurring |

Copy each Price ID (starts with `price_`) and set the corresponding wrangler secret.

### 2. Register the webhook endpoint

In [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/workbench/webhooks):

- **Endpoint URL:** `https://api.aviationaerospacecompetency.com/navigator/webhook`
- **Events to listen for:**
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

After saving, copy the **Signing secret** (`whsec_...`) and set `STRIPE_NAVIGATOR_WEBHOOK_SECRET`.

### 3. Note on `automatic_tax`

`automatic_tax` is enabled (`true`). Stripe will automatically calculate and collect GST/HST at checkout. Ensure your Stripe account has [Stripe Tax](https://dashboard.stripe.com/tax) enabled with a Canada tax registration added before going live.

---

## How the Integration Works

1. User clicks a plan CTA on the Career Navigator Plans tab.
2. Frontend calls `POST /navigator/checkout` with `{ plan, invite_code?, success_url, cancel_url }`.
3. Worker resolves/creates a Stripe Customer, looks up the Price ID from secrets, optionally applies an invite code coupon, then calls `stripe.checkout.sessions.create(...)` via the Stripe REST API.
4. Worker returns `{ url }` → frontend redirects to `session.url` (Stripe-hosted page).
5. After payment, Stripe sends a `checkout.session.completed` webhook to `POST /navigator/webhook`.
6. Worker verifies the HMAC-SHA256 signature, upserts `navigator_subscriptions`, records invite redemptions, and writes to the audit log.
7. User is redirected to `success_url` with `?payment=success` — the page shows a confirmation toast.

---

## Testing

Use Stripe test mode keys (`sk_test_...`, `pk_test_...`). Test card numbers:

| Scenario | Card Number |
|----------|-------------|
| Successful payment | `4242 4242 4242 4242` |
| Requires authentication (3DS) | `4000 0025 0000 3155` |
| Payment declined | `4000 0000 0000 9995` |
| Insufficient funds | `4000 0000 0000 9995` |

Use any future expiry date, any 3-digit CVC, and any postal code.

Test webhooks locally with the [Stripe CLI](https://docs.stripe.com/stripe-cli):
```bash
stripe listen --forward-to https://api.aviationaerospacecompetency.com/navigator/webhook
```

---

## SDK Version Note

The integration calls the Stripe REST API directly (no Stripe Node.js SDK). The `ui_mode: hosted_page` value applies to Stripe SDK version 21.0.0+. Since this codebase uses raw HTTP calls to `api.stripe.com`, this is not version-dependent.

---

## Resources

- [Stripe Docs](https://docs.stripe.com)
- [Stripe Dashboard](https://dashboard.stripe.com)
- [Stripe Support](https://support.stripe.com)
- [Stripe MCP](https://docs.stripe.com/mcp)
