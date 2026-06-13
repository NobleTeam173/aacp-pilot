# AACP Authentication and RBAC

This document defines the authentication endpoints, role-based access control rules, and a proposed authentication flow for the AACP MVP.

## Auth endpoints

### `POST /auth/register`
Create a new user account.

Request body:
- `email`: string, required
- `password`: string, required
- `name`: string, required
- `role`: string, required (`youth`, `coach`, `employer`, `admin`)
- `organization`: string, optional
- `cohort_id`: UUID, optional

Response:
- `201 Created` with user profile and auth token metadata
- `400 Bad Request` if input is invalid
- `409 Conflict` if email already exists

### `POST /auth/login`
Authenticate an existing user.

Request body:
- `email`: string, required
- `password`: string, required

Response:
- `200 OK` with access token and refresh token
- `400 Bad Request` if input is invalid
- `401 Unauthorized` if credentials are wrong

### `POST /auth/logout`
Invalidate the current user session.

Request body:
- `refresh_token`: string, required

Response:
- `200 OK` on success
- `400 Bad Request` if token is missing or invalid

### `POST /auth/refresh`
Exchange a valid refresh token for a new access token.

Request body:
- `refresh_token`: string, required

Response:
- `200 OK` with a new `access_token` and optional `refresh_token`
- `400 Bad Request` if token is missing or invalid
- `401 Unauthorized` if refresh token is expired or revoked

## RBAC rules

### Role capabilities

| Role | Allowed actions | Notes |
|---|---|---|
| `youth` | View own dashboard and profile, submit evidence, view own assessments and readiness/index data, receive career coaching guidance | Cannot access employer or coach dashboards or manage other users |
| `coach` | View cohort dashboards, review participant evidence, update assessment results, validate evidence, assign tasks, add coaching guidance, access assigned cohort member data | Cannot manage admin-only settings or employer-specific export capabilities |
| `employer` | View anonymized readiness/index analytics, review match recommendations, access employer pipeline reports, export role-family readiness data | Cannot modify youth assessments or coach review decisions, cannot access raw youth-level records unless explicitly authorized |
| `admin` | Full access to manage users, cohorts, roles, competency frameworks, consent records, audit logs, RBAC policies, and system settings | Has unrestricted access for pilot administration |

### Resource-level access patterns

- `/dashboards/employer` → `employer`, `admin`, optionally `airport leadership` mapped to `employer`
- `/dashboards/coach` → `coach`, `admin`
- `/dashboards/youth` → `youth`, `admin`
- `/users` → `admin` can list and manage all users; `coach` can list assigned cohort participants; `youth` can view own user record
- `/cohorts` → `admin` can manage cohorts; `coach` can view assigned cohorts; `employer` can view cohorts connected to their role demand; `youth` can view own cohort
- `/roles` and `/competencies` → `admin` can manage; `coach` and `employer` can read
- `/assessments`, `/evidence`, `/readiness-index`, `/matches` → `coach` and `admin` can manage; `youth` can create and view their own; `employer` can view aggregated or candidate match data, not raw youth records unless authorized

### Enforcement principles

- Use role claims in the authenticated token to gate endpoint access.
- Apply object ownership checks for youth data: a youth may only access their own assessments, evidence, readiness, and dashboard.
- Apply cohort and role-family scope checks for coach and employer access.
- Admin has a bypass capability for management and audit functions.
- Log authorization failures in `AuditLog` for review.

## Proposed auth flow

### MVP recommendation: JWT-based auth with refresh tokens and MFA support

Use JWT for stateless session management while supporting multi-factor authentication for sensitive users.

Flow:
1. User registers via `POST /auth/register`.
2. On success, backend may require MFA setup for coach and admin roles and optionally for employers.
3. User authenticates via `POST /auth/login`.
4. On success, backend returns:
   - `access_token` (short-lived JWT, e.g. 15 minutes)
   - `refresh_token` (longer-lived, e.g. 7 days)
   - `token_type`: `Bearer`
   - `mfa_required`: boolean when second-factor verification is pending
5. Client stores tokens securely and uses `Authorization: Bearer <access_token>` on API requests.
6. When the access token expires, client calls `POST /auth/refresh` to obtain a new access token.
7. `POST /auth/logout` invalidates the refresh token and optionally blacklists the current access token.
8. If MFA is required, a second step such as TOTP or SMS OTP is performed before issuing tokens.

### MFA support

- Support TOTP (Time-Based One-Time Password) as the preferred second factor.
- Optionally support SMS or email OTP for pilot flexibility.
- Enforce MFA for admin and coach roles, and optionally for employer accounts.
- Store MFA enrollment status securely and require verification during login.

### OAuth2 support for later phases

For a pilot, OAuth2 can be introduced later as an additional option.
- Use OAuth2 Authorization Code flow with PKCE for web/mobile clients.
- Map external identity providers to AACP user roles and local accounts.
- Keep the same RBAC model once users are authenticated.

### Token contents

The JWT payload should include:
- `sub`: user ID
- `email`
- `role`
- `cohort_id` or list of assigned cohort IDs
- `exp`: expiration timestamp
- `iat`: issued-at timestamp

### Refresh token handling

- Store refresh tokens in the database or token store with a user association.
- Allow token revocation on logout or suspicious activity.
- Use a refresh route such as `POST /auth/refresh` to issue new access tokens.

## Notes

- Keep auth infrastructure minimal for MVP and avoid unnecessary complexity.
- Implement RBAC at both route and data access layers.
- Treat all auth decisions as security-sensitive and log them.
