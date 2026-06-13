# AACP Privacy and Audit Design

This document defines privacy controls, consent handling, data retention, deletion, and audit logging for the AACP MVP.

## Privacy controls

### Consent management
- Capture explicit consent for personal data processing, evidence review, and VR telemetry use.
- Store consent events in `ConsentRecord` with:
  - `user_id`
  - `consent_type` (e.g. `data_processing`, `evidence_review`, `telemetry`)
  - `status` (`granted`, `withdrawn`)
  - `granted_at`
  - `withdrawn_at`
  - `source`
  - `details` (purpose, scope, retention, data categories)
- Present consent purpose statements clearly at onboarding and when new data uses are introduced.
- Support consent withdrawal and record the withdrawal event without deleting audit trails.

### Purpose statements
- Define and document the purpose for each data category:
  - profile and identity: user account management and dashboard personalization.
  - evidence and assessments: competency validation, coach review, and AI analysis.
  - VR telemetry: automated CompetencyIndex evaluation and training performance insights.
  - analytics and reporting: cohort readiness, gap mapping, and employer pipeline insights.
- Tie each consent record to a purpose statement and allow users to view active consent scopes.

### Data minimization and retention
- Collect only the minimum personal data required for the 50-participant pilot.
- Minimize persistent identifiers and pseudonymize or aggregate data where possible for analytics.
- Retain personal, identifiable records for a pilot-specific period, such as:
  - active cohort participation plus 2 years after pilot completion for regulatory review,
  - longer retention for audit logs and consent records as required by governing policies.
- Retain aggregated readiness/index data longer if it is de-identified and useful for analytics.
- Retention schedules should be configurable and documented in the system.

### Deletion and data subject rights
- Support deletion requests for youth participants and other users.
- When deletion is requested, remove or pseudonymize personal identifiers while preserving audit logs and necessary compliance data.
- Maintain a separate audit trail of deletion requests and actions taken.
- Honor consent withdrawal by stopping further use of withdrawn data for new processing and marking the consent record accordingly.

## Audit logging schema

### AuditLog entity
AACP audit logs should capture security, privacy, and data governance events.

Fields:
- `id`: UUID, primary key
- `user_id`: UUID, nullable if system or anonymous action
- `action`: text, not null (e.g. `login`, `data_access`, `consent_withdrawal`, `evidence_submission`, `token_refresh`, `rbac_denied`)
- `entity_type`: text, not null (e.g. `User`, `Assessment`, `Evidence`, `ConsentRecord`, `AuditLog`, `AuthToken`)
- `entity_id`: UUID, nullable
- `details`: jsonb, nullable (reason, source, contextual metadata)
- `ip_address`: text, nullable
- `source`: text, nullable (e.g. `web`, `api`, `mobile`, `vr_session`)
- `correlation_id`: text, nullable (for tracing multi-step flows)
- `outcome`: text, optional (`success`, `failure`, `warning`)
- `created_at`: timestamptz, not null, default now()

### Tracking requirements
- Log authorization decisions and RBAC denials.
- Log consent events, including grants, withdrawals, and changes to purpose or scope.
- Log data access to sensitive records, especially youth data and evidence reviews.
- Log privacy-sensitive events such as deletion requests and data export actions.
- Log AI-related decisions when they affect readiness or matching, including the rationale reference.
- Ensure audit logs are append-only and stored securely.

## Audit tracking and governance
- Correlate audit events with user context, request origin, and related entity IDs.
- Preserve audit records even if the underlying user or data record is deleted, while protecting privacy.
- Provide admin access to audit log views for compliance review, but limit direct export to authorized roles.
- Use audit logs as the source of truth for security incidents, consent history, and regulatory review.

## PIPEDA-aligned considerations
- Ensure consent is meaningful, specific, and informed.
- Restrict access to personal data with RBAC and least privilege.
- Log data access and processing in support of transparency and accountability.
- Secure audit logs and consent records as part of privacy-by-design.
