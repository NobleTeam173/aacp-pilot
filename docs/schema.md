# AACP Core Data Model

This document defines the AACP MVP core data model and a PostgreSQL schema draft.

## Entities

### User
- `id`: UUID, primary key
- `email`: text, unique, not null
- `name`: text, not null
- `role`: text, not null (`youth`, `coach`, `employer`, `admin`)
- `organization`: text, nullable
- `profile_data`: jsonb, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- one-to-many with `CohortMembership`
- one-to-many with `Assessment`
- one-to-many with `Evidence`
- one-to-many with `CompetencyIndex`
- one-to-many with `ReadinessIndex`
- one-to-many with `Match`
- one-to-many with `AuditLog`
- one-to-many with `ConsentRecord`

### Cohort
- `id`: UUID, primary key
- `name`: text, not null
- `description`: text, nullable
- `start_date`: date, nullable
- `end_date`: date, nullable
- `metadata`: jsonb, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- one-to-many with `CohortMembership`
- one-to-many with `Competency`
- one-to-many with `Assessment`
- one-to-many with `CompetencyIndex`
- one-to-many with `ReadinessIndex`
- one-to-many with `Match`

### CohortMembership
- `id`: UUID, primary key
- `cohort_id`: UUID, foreign key references `Cohort(id)`
- `user_id`: UUID, foreign key references `User(id)`
- `role`: text, nullable
- `joined_at`: timestamptz, not null, default now()
- `status`: text, not null, default 'active'

Relationships:
- many-to-one to `Cohort`
- many-to-one to `User`

### RoleFamily
- `id`: UUID, primary key
- `name`: text, not null
- `description`: text, nullable
- `regulatory_reference`: text, nullable
- `metadata`: jsonb, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- one-to-many with `Role`
- one-to-many with `Competency`

### Role
- `id`: UUID, primary key
- `role_family_id`: UUID, foreign key references `RoleFamily(id)`
- `name`: text, not null
- `slug`: text, unique, not null
- `description`: text, nullable
- `regulatory_reference`: text, nullable
- `metadata`: jsonb, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- many-to-one with `RoleFamily`
- one-to-many with `Competency`
- one-to-many with `Match`

### Competency
- `id`: UUID, primary key
- `role_family_id`: UUID, foreign key references `RoleFamily(id)`
- `role_id`: UUID, foreign key references `Role(id)`, nullable
- `code`: text, unique, not null
- `title`: text, not null
- `description`: text, nullable
- `category`: text, nullable
- `level`: text, nullable
- `regulatory_reference`: text, nullable
- `metadata`: jsonb, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- many-to-one with `RoleFamily`
- many-to-one with `Role`
- one-to-many with `CompetencyRubric`
- one-to-many with `Assessment`

### CompetencyRubric
- `id`: UUID, primary key
- `competency_id`: UUID, foreign key references `Competency(id)`
- `level`: text, not null
- `criteria`: text, not null
- `guidance`: text, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- many-to-one with `Competency`

### Assessment
- `id`: UUID, primary key
- `user_id`: UUID, foreign key references `User(id)`
- `cohort_id`: UUID, foreign key references `Cohort(id)`
- `competency_id`: UUID, foreign key references `Competency(id)`
- `assessment_date`: timestamptz, not null, default now()
- `status`: text, not null, default 'draft' (`draft`, `submitted`, `reviewed`, `approved`, `rejected`)
- `notes`: text, nullable
- `metadata`: jsonb, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- many-to-one with `User`
- many-to-one with `Cohort`
- many-to-one with `Competency`
- one-to-many with `AssessmentResult`
- one-to-many with `Evidence`

### AssessmentResult
- `id`: UUID, primary key
- `assessment_id`: UUID, foreign key references `Assessment(id)`
- `rubric_id`: UUID, foreign key references `CompetencyRubric(id)`
- `score`: numeric, nullable
- `confidence`: numeric, nullable
- `reviewer_id`: UUID, foreign key references `User(id)`
- `review_date`: timestamptz, nullable
- `comment`: text, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- many-to-one with `Assessment`
- many-to-one with `CompetencyRubric`
- many-to-one with `User` as reviewer

### Evidence
- `id`: UUID, primary key
- `assessment_id`: UUID, foreign key references `Assessment(id)`
- `user_id`: UUID, foreign key references `User(id)`
- `title`: text, not null
- `description`: text, nullable
- `type`: text, not null (`document`, `video`, `link`, `image`, `other`)
- `uri`: text, nullable
- `metadata`: jsonb, nullable
- `status`: text, not null, default 'pending' (`pending`, `approved`, `rejected`)
- `submitted_at`: timestamptz, not null, default now()
- `reviewed_at`: timestamptz, nullable
- `reviewer_id`: UUID, foreign key references `User(id)`, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- many-to-one with `Assessment`
- many-to-one with `User`
- many-to-one with `User` as reviewer

### CompetencyIndex
- `id`: UUID, primary key
- `user_id`: UUID, foreign key references `User(id)`
- `cohort_id`: UUID, foreign key references `Cohort(id)`
- `competency_id`: UUID, foreign key references `Competency(id)`
- `assessment_id`: UUID, foreign key references `Assessment(id)`, nullable
- `index`: numeric, not null
- `source`: text, nullable (`assessment`, `ai`, `coach`)
- `calculated_at`: timestamptz, not null, default now()
- `rationale`: text, nullable
- `metadata`: jsonb, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- many-to-one with `User`
- many-to-one with `Cohort`
- many-to-one with `Competency`
- many-to-one with `Assessment`

### ReadinessIndex
- `id`: UUID, primary key
- `user_id`: UUID, foreign key references `User(id)`
- `cohort_id`: UUID, foreign key references `Cohort(id)`
- `role_id`: UUID, foreign key references `Role(id)`
- `index`: numeric, not null
- `level`: text, nullable
- `source`: text, nullable (`assessment`, `ai`, `coach`)
- `calculated_at`: timestamptz, not null, default now()
- `rationale`: text, nullable
- `metadata`: jsonb, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- many-to-one with `User`
- many-to-one with `Cohort`
- many-to-one with `Role`

### Match
- `id`: UUID, primary key
- `user_id`: UUID, foreign key references `User(id)`
- `role_id`: UUID, foreign key references `Role(id)`
- `cohort_id`: UUID, foreign key references `Cohort(id)`
- `match_score`: numeric, nullable
- `status`: text, not null, default 'candidate' (`candidate`, `recommended`, `matched`, `rejected`)
- `source`: text, nullable (`ai`, `coach`, `employer`)
- `reason`: text, nullable
- `metadata`: jsonb, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- many-to-one with `User`
- many-to-one with `Role`
- many-to-one with `Cohort`

### AuditLog
- `id`: UUID, primary key
- `user_id`: UUID, foreign key references `User(id)`
- `action`: text, not null
- `entity_type`: text, not null
- `entity_id`: UUID, nullable
- `details`: jsonb, nullable
- `ip_address`: text, nullable
- `created_at`: timestamptz, not null, default now()

Relationships:
- many-to-one with `User`

### ConsentRecord
- `id`: UUID, primary key
- `user_id`: UUID, foreign key references `User(id)`
- `consent_type`: text, not null
- `status`: text, not null (`granted`, `withdrawn`)
- `granted_at`: timestamptz, nullable
- `withdrawn_at`: timestamptz, nullable
- `source`: text, nullable
- `details`: jsonb, nullable
- `created_at`: timestamptz, not null, default now()
- `updated_at`: timestamptz, not null, default now()

Relationships:
- many-to-one with `User`

## PostgreSQL schema draft

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE "User" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  organization TEXT,
  profile_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE Cohort (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE CohortMembership (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cohort_id UUID NOT NULL REFERENCES Cohort(id),
  user_id UUID NOT NULL REFERENCES "User"(id),
  role TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE RoleFamily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  regulatory_reference TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE Role (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_family_id UUID NOT NULL REFERENCES RoleFamily(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  regulatory_reference TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE Competency (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_family_id UUID NOT NULL REFERENCES RoleFamily(id),
  role_id UUID REFERENCES Role(id),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  level TEXT,
  regulatory_reference TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE CompetencyRubric (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competency_id UUID NOT NULL REFERENCES Competency(id),
  level TEXT NOT NULL,
  criteria TEXT NOT NULL,
  guidance TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE Assessment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES "User"(id),
  cohort_id UUID NOT NULL REFERENCES Cohort(id),
  competency_id UUID NOT NULL REFERENCES Competency(id),
  assessment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE AssessmentResult (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID NOT NULL REFERENCES Assessment(id),
  rubric_id UUID NOT NULL REFERENCES CompetencyRubric(id),
  score NUMERIC,
  confidence NUMERIC,
  reviewer_id UUID REFERENCES "User"(id),
  review_date TIMESTAMPTZ,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE Evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID NOT NULL REFERENCES Assessment(id),
  user_id UUID NOT NULL REFERENCES "User"(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  uri TEXT,
  metadata JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewer_id UUID REFERENCES "User"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE CompetencyIndex (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES "User"(id),
  cohort_id UUID NOT NULL REFERENCES Cohort(id),
  competency_id UUID NOT NULL REFERENCES Competency(id),
  assessment_id UUID REFERENCES Assessment(id),
  index NUMERIC NOT NULL,
  source TEXT,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rationale TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ReadinessIndex (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES "User"(id),
  cohort_id UUID NOT NULL REFERENCES Cohort(id),
  role_id UUID NOT NULL REFERENCES Role(id),
  index NUMERIC NOT NULL,
  level TEXT,
  source TEXT,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rationale TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE Match (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES "User"(id),
  role_id UUID NOT NULL REFERENCES Role(id),
  cohort_id UUID NOT NULL REFERENCES Cohort(id),
  match_score NUMERIC,
  status TEXT NOT NULL DEFAULT 'candidate',
  source TEXT,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE AuditLog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES "User"(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ConsentRecord (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES "User"(id),
  consent_type TEXT NOT NULL,
  status TEXT NOT NULL,
  granted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  source TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Notes
- This schema is a draft for the MVP data model.
- Relationships focus on the core workflow: participants, assessments, evidence review, readiness calculation, and matching.
- Consent and audit records are included to support privacy and governance.
- No migration files were created yet; waiting for confirmation.
