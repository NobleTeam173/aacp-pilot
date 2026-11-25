# CLAUDE Integration and MFA Notes

## MFA requirements
- Admin and coach accounts are treated as higher-risk roles and require multi-factor authentication by default.
- The backend supports explicit MFA lifecycle endpoints under `/auth/mfa`.

### MFA endpoints
- `POST /auth/mfa/setup`
  - Initiates MFA setup for a user.
  - Request body: `{ email, password }`
  - Response: `{ secret, message }`
- `POST /auth/mfa/confirm`
  - Confirms the MFA token and enables MFA for the account.
  - Request body: `{ email, password, token }`
  - Response: `{ success: true, message }`
- `POST /auth/mfa/disable`
  - Disables MFA for the account.
  - Request body: `{ email, password, otp? }`
  - Response: `{ success: true, message }`

## Test mode configuration
- To support integration testing without requiring live MFA tokens, the backend can bypass MFA enforcement using the environment flag:
  - `AACP_AUTH_TEST_MODE=true`
- When this flag is enabled:
  - Admin and coach users may log in with email/password alone.
  - MFA setup and token enforcement are skipped for login.

## Audit log endpoint
- Admin-only audit retrieval is exposed at `/audit/logs`.
- This route is protected by RBAC and requires a valid admin access token.
- Query parameters supported:
  - `userId`
  - `action`
  - `entityType`

## Notes
- Use `AACP_AUTH_TEST_MODE=true` only in test or development environments.
- Production deployments should keep MFA enforcement enabled for admin and coach accounts.

## Career Navigator guardrail (main AACP must not touch Career Navigator)
Career Navigator (careers.aviationaerospacecompetency.com, `/navigator/*` on the Cloudflare Worker) shares the D1 database `aacp-db` with the main AACP site. On 2026-11-25 a main-AACP test-account cleanup deleted real Career Navigator accounts; they had to be recovered from D1 Time Travel.

- **Database guard** (`scripts/d1-navigator-guard.sql`, applied to live D1): every Career Navigator user is registered in `navigator_accounts` (automatically for role `navigator` and for anyone with `navigator_*` rows; older accounts use role `participant`). Triggers abort any DELETE of a registered user, any change of their role, and any DELETE from a `navigator_*` table. A whole statement fails if it would touch even one Career Navigator row, so cleanups must exclude them.
- **Session guard** (`.claude/settings.json` → `scripts/hooks/navigator-guard.cjs`): blocks commands that delete `navigator_*` data, drop the guard, touch `navigator_guard_override`, or run `wrangler d1 time-travel restore`.
- **Rules for every session:**
  - Main AACP cleanups target main roles only (`youth`/`employer`/`postsecondary`/main-site `participant` with `status = 'pending'`) and must `LEFT JOIN navigator_accounts` to exclude Career Navigator users.
  - Export the rows (`wrangler d1 export` or a SELECT saved to a file) before any DELETE on shared tables.
  - Never drop or bypass the guard. Intentional Career Navigator deletions (e.g. a user's erasure request) are done by the owner with a time-limited override, as documented in the SQL file.
