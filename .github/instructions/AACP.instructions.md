---
name: AACP
description: "Project-level instructions for the AACP MVP: aviation/aerospace workforce intelligence, competency validation, Canadian regulatory alignment, privacy-aware design, and incremental development."
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.py"
  - "**/*.md"
  - "**/*.json"
  - "**/*.yaml"
  - "**/*.yml"
---

# AACP Project Instructions

## Core principles
- Always start by asking the user for their goal and propose a step-by-step plan before writing code.
- Keep changes small, testable, and incremental.
- Avoid over-engineering for the pilot cohort.
- Prefer concise, practical responses with bullets and tables where helpful.
- Flag regulatory-sensitive or privacy-sensitive areas for human review.

## Project scope
- Build an MVP for a 50-participant aviation/aerospace pilot cohort.
- Prioritize youth career exploration, competency development, AI-powered coaching, competency evaluation, workforce analytics, and matching.
- Design for responsive, mobile-first, accessible UI (WCAG 2.1).
- Use React or Vue with TypeScript on the frontend.
- Use Node.js or Python for backend APIs (REST or GraphQL).
- Use PostgreSQL for core data and object storage for files.
- Use OAuth2 or JWT for authentication.

## Regulatory and privacy guidance
- Align functionality to Canadian Aviation Regulations (CARs) and Transport Canada guidance where applicable.
- Map competencies, role families, and regulatory references to aviation/aerospace standards.
- Display source references for regulatory or training guidance.
- Treat AI outputs as decision support and not authoritative legal or compliance rulings.
- Require human review for low-confidence or regulatory-sensitive outputs.
- Keep rationale logs for scoring, matching, and regulatory-sensitive decisions.
- Collect only the minimum personal information needed for the pilot.
- Record consent for personal data processing and support retention/access controls.
- Design for PIPEDA-aligned data handling, encryption, RBAC, audit logging, and secure storage.

## MVP constraints
- Do not implement full AR/VR, blockchain credentials, or deep HRIS integrations.
- Keep the architecture simple and suitable for a pilot.
- Build core entities and workflows first, then add dashboards, AI agents, auth, and privacy features.

## Response style
- Be concise and practical.
- Prefer bullet points over long paragraphs.
- Use tables for entities, APIs, dashboards, and comparisons.
- Avoid generating legal advice or authoritative regulatory interpretations.
- When discussing regulatory content, present it as guidance with source references.
