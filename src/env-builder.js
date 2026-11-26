// Builds the `env` object that worker.js expects from Cloudflare bindings.
// On AWS every binding becomes a plain process.env variable.
import { DB } from './db-shim.js';

export function buildEnv() {
  return {
    DB,
    // Static files are served by CloudFront on AWS — requests for assets
    // never reach this server. Return 404 for any fallthrough.
    ASSETS: {
      fetch: () => new Response('Not Found', { status: 404 }),
    },
    ANTHROPIC_API_KEY:            process.env.ANTHROPIC_API_KEY,
    RESEND_API_KEY:               process.env.RESEND_API_KEY,
    AACP_ADMIN_EMAIL:             process.env.AACP_ADMIN_EMAIL,
    AACP_SUPER_ADMIN_EMAIL:       process.env.AACP_SUPER_ADMIN_EMAIL,
    AACP_SUPER_ADMIN_PASSWORD:    process.env.AACP_SUPER_ADMIN_PASSWORD,
    AACP_ACCESS_TOKEN_SECRET:     process.env.AACP_ACCESS_TOKEN_SECRET,
    AACP_REFRESH_TOKEN_SECRET:    process.env.AACP_REFRESH_TOKEN_SECRET,
    AACP_AUTH_TEST_MODE:          process.env.AACP_AUTH_TEST_MODE,
    AACP_PUBLIC_ORIGIN:           process.env.AACP_PUBLIC_ORIGIN,
    // Career Navigator consent records are stored only here (AWS ca-central-1 RDS).
    // The Cloudflare Worker reaches /auth/navigator-consent/* with this shared key.
    CONSENT_STORE_ROLE:           'store',
    CONSENT_STORE_KEY:            process.env.CONSENT_STORE_KEY,
    // Career Navigator payments (served from AWS Canada); unset until Stripe goes live.
    STRIPE_SECRET_KEY:                process.env.STRIPE_SECRET_KEY,
    STRIPE_NAVIGATOR_PRICE_STUDENT:   process.env.STRIPE_NAVIGATOR_PRICE_STUDENT,
    STRIPE_NAVIGATOR_PRICE_INVITED:   process.env.STRIPE_NAVIGATOR_PRICE_INVITED,
    STRIPE_NAVIGATOR_PRICE_ADVISOR:   process.env.STRIPE_NAVIGATOR_PRICE_ADVISOR,
    STRIPE_NAVIGATOR_WEBHOOK_SECRET:  process.env.STRIPE_NAVIGATOR_WEBHOOK_SECRET,
  };
}
