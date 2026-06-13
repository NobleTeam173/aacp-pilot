# AACP API Specification

This API spec defines the core endpoints for the AACP MVP backend.

## Backend structure proposal

- Backend framework: **Express.js** with TypeScript
- API style: REST
- Database: PostgreSQL
- ORM/DB layer: Prisma or TypeORM for schema-driven models
- Auth: JWT / OAuth2-ready middleware
- Validation: Zod or Joi for request payloads
- Directory layout:
  - `src/backend/src/index.ts` — app entrypoint
  - `src/backend/src/routes/` — route definitions
  - `src/backend/src/controllers/` — request handlers
  - `src/backend/src/services/` — business logic
  - `src/backend/src/models/` — Prisma/schema or entities
  - `src/backend/src/middleware/` — auth, validation, error handling
  - `src/backend/src/utils/` — shared helpers

Rationale:
- Express is simple to scaffold for an MVP and pairs well with TypeScript.
- REST endpoints align to the identified core entities and expected client workflows.
- Prisma provides fast iteration with PostgreSQL and schema-driven migrations.

## Core endpoints

### `GET /users`
List users.

Query parameters:
- `role` (optional): filter by user role (`youth`, `coach`, `employer`, `admin`)
- `cohortId` (optional): filter users by cohort membership

Response:
- `200 OK` with list of user objects

### `POST /users`
Create a new user.

Body:
- `email`: string
- `name`: string
- `role`: string
- `organization`: string, optional
- `profile_data`: object, optional

Response:
- `201 Created` with created user

### `GET /users/{id}`
Retrieve a single user.

Response:
- `200 OK` with user object
- `404 Not Found` if missing

### `GET /cohorts`
List cohorts.

Query parameters:
- `name` (optional)

Response:
- `200 OK` with list of cohorts

### `POST /cohorts`
Create a cohort.

Body:
- `name`: string
- `description`: string, optional
- `start_date`: string (ISO date), optional
- `end_date`: string (ISO date), optional
- `metadata`: object, optional

Response:
- `201 Created` with cohort object

### `GET /cohorts/{id}`
Retrieve cohort details.

Response:
- `200 OK` with cohort object
- `404 Not Found`

### `GET /roles`
List roles.

Query parameters:
- `roleFamilyId` (optional)

Response:
- `200 OK` with list of roles

### `POST /roles`
Create a role.

Body:
- `role_family_id`: UUID
- `name`: string
- `slug`: string
- `description`: string, optional
- `regulatory_reference`: string, optional
- `metadata`: object, optional

Response:
- `201 Created` with role object

### `GET /roles/{id}`
Retrieve a single role.

Response:
- `200 OK`
- `404 Not Found`

### `GET /competencies`
List competencies.

Query parameters:
- `roleFamilyId`, `roleId`, `code`, `category`

Response:
- `200 OK` with list of competencies

### `POST /competencies`
Create a competency.

Body:
- `role_family_id`: UUID
- `role_id`: UUID, optional
- `code`: string
- `title`: string
- `description`: string, optional
- `category`: string, optional
- `level`: string, optional
- `regulatory_reference`: string, optional
- `metadata`: object, optional

Response:
- `201 Created` with competency object

### `GET /competencies/{id}`
Retrieve competency details.

Response:
- `200 OK`
- `404 Not Found`

### `GET /assessments`
List assessments.

Query parameters:
- `userId`, `cohortId`, `competencyId`, `status`

Response:
- `200 OK` with list of assessments

### `POST /assessments`
Create an assessment.

Body:
- `user_id`: UUID
- `cohort_id`: UUID
- `competency_id`: UUID
- `status`: string, optional
- `notes`: string, optional
- `metadata`: object, optional

Response:
- `201 Created` with assessment object

### `GET /assessments/{id}`
Retrieve assessment details.

Response:
- `200 OK`
- `404 Not Found`

### `GET /evidence`
List evidence.

Query parameters:
- `assessmentId`, `userId`, `status`

Response:
- `200 OK` with list of evidence records

### `POST /evidence`
Create evidence for an assessment.

Body:
- `assessment_id`: UUID
- `user_id`: UUID
- `title`: string
- `type`: string
- `description`: string, optional
- `uri`: string, optional
- `metadata`: object, optional

Response:
- `201 Created` with evidence object

### `GET /evidence/{id}`
Retrieve an evidence record.

Response:
- `200 OK`
- `404 Not Found`

### `GET /readiness-index`
List readiness indices.

Query parameters:
- `userId`, `cohortId`, `roleId`

Response:
- `200 OK` with list of readiness index records

### `POST /readiness-index`
Create or update a readiness index.

Body:
- `user_id`: UUID
- `cohort_id`: UUID
- `role_id`: UUID
- `index`: number (0–100)
- `level`: string, optional
- `source`: string, optional
- `rationale`: string, optional
- `metadata`: object, optional

Response:
- `201 Created` or `200 OK`

### `GET /competencies/{id}/index`
Retrieve a competency index.

Response:
- `200 OK` with competency index object
  - `competencyId`
  - `userId`
  - `cohortId`
  - `competencyIndex`
  - `confidence`
  - `rationale`
  - `source`
  - `calculatedAt`
- `404 Not Found`

### `GET /matches`
List matches.

Query parameters:
- `userId`, `roleId`, `cohortId`, `status`

Response:
- `200 OK` with match list

### `POST /matches`
Create a match recommendation.

Body:
- `user_id`: UUID
- `role_id`: UUID
- `cohort_id`: UUID
- `match_score`: number, optional
- `status`: string, optional
- `source`: string, optional
- `reason`: string, optional
- `metadata`: object, optional

Response:
- `201 Created` with match object

### `GET /matches/{id}`
Retrieve a match record.

Response:
- `200 OK`
- `404 Not Found`

## Dashboard endpoints

### `GET /dashboards/employer`
Employer-facing cohort dashboard data.

Query parameters:
- `cohortId` (optional): filter to a cohort
- `roleFamilyId` (optional): filter to a role family
- `timeframe` (optional): `30d`, `90d`, or `all`

Response:
- `200 OK` with employer dashboard payload

Payload structure:
- `summary`
  - `cohortId`
  - `participantCount`
  - `averageReadinessIndex`
  - `readinessBands`
    - `high`
    - `medium`
    - `low`
- `readinessTrends`
  - `period`
  - `averageReadinessIndex`
- `gapMapByRoleFamily`
  - `roleFamilyId`
  - `roleFamilyName`
  - `gapScore`
  - `averageReadinessIndex`
  - `topCompetencyGaps`
- `topMatches`
  - `userId`
  - `roleId`
  - `roleName`
  - `matchScore`
  - `readinessIndex`
  - `keyGaps`
  - `status`
- `regulatoryFlags`
  - `flagType`
  - `count`
  - `description`
- `recentActivity`
  - `type`
  - `title`
  - `date`
  - `status`
  - `details`

### `GET /dashboards/youth`
Youth-facing personal dashboard.

Query parameters:
- `userId` (optional if authenticated)
- `cohortId` (optional)

Response:
- `200 OK` with youth dashboard payload

Payload structure:
- `progress`
  - `readinessIndex`
  - `competencyCompleted`
  - `competencyInProgress`
  - `competencyPendingReview`
  - `targetRole`
- `badges`
  - `badgeId`
  - `title`
  - `description`
  - `earnedAt`
- `nextSteps`
  - `stepId`
  - `title`
  - `description`
  - `type`
  - `dueDate`

### `GET /dashboards/coach`
Coach-facing oversight dashboard.

Query parameters:
- `cohortId` (optional)
- `status` (optional): `pending`, `reviewed`, `flagged`
- `reviewerId` (optional)

Response:
- `200 OK` with coach dashboard payload

Payload structure:
- `reviewQueue`
  - `assessmentId`
  - `userId`
  - `userName`
  - `competencyTitle`
  - `status`
  - `submittedAt`
- `cohortReadiness`
  - `roleFamilyId`
  - `roleFamilyName`
  - `averageReadinessIndex`
  - `participantCount`
- `participantOverview`
  - `userId`
  - `userName`
  - `currentScore`
  - `openItems`
  - `lastActivity`
- `regulatoryReviewItems`
  - `itemId`
  - `itemType`
  - `reason`
  - `submittedAt`
- `actionItems`
  - `actionId`
  - `title`
  - `description`
  - `dueDate`

## Notes
- This spec is intentionally minimal for MVP scope.
- Authentication and authorization should be layered via middleware.
- Request validation should enforce entity relationships and required fields.
- Additional endpoints can be added later for `CohortMembership`, `CompetencyRubric`, `AuditLog`, and `ConsentRecord` if needed.
