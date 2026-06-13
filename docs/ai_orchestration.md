# AACP AI Orchestration

This document defines the AI agent interfaces for AACP and the orchestration flow for the MVP.

## VR telemetry integration
- Capture immersive training and simulation telemetry through Unity or WebXR APIs.
- Ingest motion, task event, timing, accuracy, error, and environment context data for competency evaluation.
- Use telemetry as a primary input for automated CompetencyIndex generation.
- Keep the standard Competency Evaluator path automated; only exceptional regulatory or anomaly cases should escalate for human attention.

## Agents

### Career Coach

**Input**
- `user_id`: UUID
- `user_profile`: object with demographics, role interests, learning preferences
- `cohort_id`: UUID
- `current_competencies`: list of competency progress objects
- `assessment_status`: list of assessment and evidence states
- `readiness_index`: current readiness index summary
- `career_paths`: list of target role or role family summaries
- `context`: optional text, request type, or user question

**Output**
- `recommendations`: array of advisory actions
  - `title`
  - `description`
  - `type` (`skill`, `training`, `assessment`, `badge`, `next_step`)
  - `confidence`: number or label
  - `related_competency_ids`
- `motivation`: short coaching message
- `rationale`: explanation of why the recommendation was made
- `sources`: optional references to standards or guidance

**Rules**
- Provide only advisory guidance, not authoritative regulatory decisions.
- Emphasize next practical steps for youth development.
- Use cohort context and role aspirations where available.
- Surface confidence and flag items requiring human review.
- Do not recommend specific licensing actions without coach validation.

### Competency Evaluator

**Input**
- `assessment_id`: UUID
- `user_id`: UUID
- `competency_id`: UUID
- `competency_rubric`: list of rubric levels and criteria
- `vr_telemetry_events`: array of VR session or simulator telemetry captures from Unity/WebXR instrumentation (motion, task events, timing, errors)
- `evidence_items`: list of evidence metadata and text summaries
- `assessment_history`: past results for the same competency or user
- `context`: assessment objective or evaluation prompt

**Output**
- `evaluation`: object with
  - `recommended_level`
  - `competencyIndex`
  - `confidence`
  - `strengths`
  - `weaknesses`
- `suggested_rubric_level`: rubric reference
- `rationale`: explanation of evaluation decision
- `flags`: list of concerns such as regulatory sensitivity or telemetry anomalies

**Rules**
- Use VR telemetry and rubric criteria as the primary evaluation basis.
- Produce an automated competency index without requiring human review in the standard telemetry flow.
- Flag only regulatory-sensitive or anomalous outputs for human attention.
- Avoid statutory or licensing judgments.
- Keep trace of rationale for auditability.

### Workforce Analyst

**Input**
- `cohort_id`: UUID
- `role_family_ids`: array of UUIDs
- `competency_indexes`: aggregated competency index and readiness data
- `demand_signals`: employer need summaries or role requirement profiles
- `timeframe`: optional reporting window
- `context`: analytic objective or question

**Output**
- `cohort_summary`: readiness distribution and gap metrics
- `trend_insights`: time-series changes in readiness or competency attainment
- `gap_map`: gaps by role family and competency cluster
- `risk_flags`: areas of pipeline weakness or regulatory sensitivity
- `recommendations`: suggested analytic actions or cohort interventions
- `rationale`: data-driven explanation

**Rules**
- Focus on cohort-level analytics for employer and leadership audiences.
- Do not present individual youth performance beyond aggregated or anonymized summaries unless authorized.
- Highlight gaps and trends, not individual judgments.
- Keep outputs grounded in available data and avoid overreach.

### Matching Engine

**Input**
- `user_id`: UUID
- `role_id`: UUID
- `cohort_id`: UUID
- `readiness_index`: numeric value
- `competency_profile`: required vs actual competency alignments
- `employer_requirements`: role-specific requirement metadata
- `match_preferences`: optional candidate or employer preferences
- `context`: matching objective or scenario

**Output**
- `match_score`: numeric or percentile
- `fit_summary`: text describing alignment strength and key gaps
- `recommendations`: next actions to improve match or move to candidate status
- `status`: `candidate`, `recommended`, `matched`, `rejected`
- `rationale`: reasons behind the match decision
- `flags`: items for coach or employer review

**Rules**
- Present matches as advisory recommendations.
- Base scoring on readiness, competency alignment, and employer needs.
- Flag candidates needing regulatory or coach review before final placement.
- Avoid representing the match as a hiring decision.

## Orchestration flow

### High-level flow

1. **User context collection**
   - Gather youth profile, cohort membership, competencies, assessments, VR telemetry, readiness, and target roles.
2. **Competency evaluation**
   - Trigger the Competency Evaluator when assessments or evidence are submitted.
   - Store recommended levels and flags.
3. **Readiness calculation**
   - Use evaluated competency outcomes and rubric levels to update the user readiness index.
4. **Matching recommendations**
   - Run the Matching Engine with updated readiness and employer role requirements.
   - Create candidate recommendations and flag gaps.
5. **Career coaching**
   - Feed personal progress, readiness, and match state into the Career Coach.
   - Provide youth-facing guidance and next steps.
6. **Workforce analytics**
   - Periodically run the Workforce Analyst on cohort-level data.
   - Generate dashboard insights, trends, and gap maps.

### Flow diagram

- `Assessment/Evidence/VR telemetry submitted` → `Competency Evaluator`
- `Competency Evaluator` → `Competency Index` update
- `Competency Index` + `Readiness Index` calculation → `Readiness Index`
- `Readiness Index` + `Employer Requirements` → `Matching Engine`
- `Readiness Index` + `Assessment Status` + `Profile` → `Career Coach`
- `Cohort data` + `Demand signals` → `Workforce Analyst`

### Orchestration rules

- All AI outputs are advisory and must include rationale.
- Low-confidence or regulatory-sensitive outputs should be marked for human review.
- The system should log agent inputs and outputs for traceability.
- Use a central orchestration service to route data and preserve audit context.

## Service interface proposals

### Career Coach service

```ts
interface CareerCoachInput {
  userId: string;
  userProfile: Record<string, unknown>;
  cohortId?: string;
  currentCompetencies: Array<{ competencyId: string; status: string; level?: string }>;
  assessmentStatus: Array<{ assessmentId: string; status: string }>;
  readinessIndex?: number;
  careerPaths?: Array<{ roleId: string; name: string }>;
  context?: string;
}

interface CareerCoachOutput {
  recommendations: Array<{
    title: string;
    description: string;
    type: 'skill' | 'training' | 'assessment' | 'badge' | 'next_step';
    confidence?: number;
    relatedCompetencyIds?: string[];
  }>;
  motivation: string;
  rationale: string;
  sources?: string[];
  needsHumanReview?: boolean;
}

interface CareerCoachService {
  evaluate(input: CareerCoachInput): Promise<CareerCoachOutput>;
}
```

### Competency Evaluator service

```ts
interface CompetencyEvaluatorInput {
  assessmentId: string;
  userId: string;
  competencyId: string;
  competencyRubric: Array<{ level: string; criteria: string }>;
  vrTelemetryEvents?: Array<{ eventId: string; timestamp: string; details: Record<string, unknown> }>;
  evidenceItems?: Array<{ id: string; type: string; summary: string }>;
  assessmentHistory?: Array<{ assessmentId: string; result: string }>;
  context?: string;
}

interface CompetencyEvaluatorOutput {
  recommendedLevel: string;
  competencyIndex?: number;
  confidence?: number;
  strengths: string[];
  weaknesses: string[];
  suggestedRubricLevel?: string;
  rationale: string;
  flags?: string[];
}

interface CompetencyEvaluatorService {
  evaluate(input: CompetencyEvaluatorInput): Promise<CompetencyEvaluatorOutput>;
}
```

### Workforce Analyst service

```ts
interface WorkforceAnalystInput {
  cohortId: string;
  roleFamilyIds?: string[];
  competencyIndexes: Array<{ competencyId: string; averageIndex: number }>;
  demandSignals?: Array<{ roleId: string; demandLevel: string }>;
  timeframe?: string;
  context?: string;
}

interface WorkforceAnalystOutput {
  cohortSummary: {
    participantCount: number;
    averageReadinessIndex: number;
    readinessBands: Record<string, number>;
  };
  trendInsights: Array<{ date: string; readinessAverage: number }>;
  gapMap: Array<{ roleFamilyId: string; gapScore: number; averageReadinessIndex: number }>;
  riskFlags: string[];
  recommendations: string[];
  rationale: string;
}

interface WorkforceAnalystService {
  analyze(input: WorkforceAnalystInput): Promise<WorkforceAnalystOutput>;
}
```

### Matching Engine service

```ts
interface MatchingEngineInput {
  userId: string;
  roleId: string;
  cohortId: string;
  readinessIndex: number;
  competencyProfile: Array<{ competencyId: string; proficiency: string }>;
  employerRequirements?: Array<{ competencyId: string; importance: number }>;
  matchPreferences?: Record<string, unknown>;
  context?: string;
}

interface MatchingEngineOutput {
  matchScore: number;
  fitSummary: string;
  recommendations: string[];
  status: 'candidate' | 'recommended' | 'matched' | 'rejected';
  rationale: string;
  flags?: string[];
}

interface MatchingEngineService {
  match(input: MatchingEngineInput): Promise<MatchingEngineOutput>;
}
```

## Summary

This document defines the four AI agent interfaces, the orchestration flow, and the service contracts for the AACP MVP. All agent outputs are advisory, should include rationale, and must support human review for low-confidence or regulatory-sensitive cases.
