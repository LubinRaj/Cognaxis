# Phase 1 Evidence Checklist

Status legend: `TODO`, `IN PROGRESS`, `PASS`, `BLOCKED`, `NOT APPLICABLE`

Evidence must demonstrate the work without publishing credentials, tokens, personal account details, billing information, private data, or sensitive project identifiers.

| ID | Evidence | Status | Artifact or note |
|---|---|---|---|
| P1-01 | Dedicated Google Cloud project exists and billing is linked | TODO | Record sanitized project overview |
| P1-02 | Budget alerts and cost guardrails configured | TODO | Sanitized settings screenshot |
| P1-03 | Required APIs enabled and unnecessary APIs excluded | TODO | Sanitized API inventory |
| P1-04 | Firebase is attached to the same Cloud project | TODO | Sanitized project-link evidence |
| P1-05 | Google Sign-In configured with approved domains | TODO | Sanitized Authentication settings |
| P1-06 | Firestore production location and deny-by-default baseline selected | TODO | Location decision and rules evidence |
| P1-07 | Dedicated keyless Cloud Run runtime service account created | TODO | IAM view without account identifiers |
| P1-08 | Runtime has least-privilege Firestore access | TODO | Sanitized role binding |
| P1-09 | Secret Manager secret exists and runtime access is secret-specific | TODO | Secret metadata only; never value |
| P1-10 | No user-managed service-account keys exist for the runtime | TODO | Sanitized key inventory |
| P1-11 | AI Studio constitution v1.1 installed | TODO | Screenshot with version and recognizable text |
| P1-12 | AI Studio produces a security preflight before code | TODO | Exported/screenshot response using synthetic feature |
| P1-13 | Personal/organization architecture approved | IN PROGRESS | `docs/architecture/SECURITY_ARCHITECTURE.md` |
| P1-14 | Threat model reviewed and accepted | IN PROGRESS | `docs/security/THREAT_MODEL.md` |
| P1-15 | Security test plan reviewed and accepted | IN PROGRESS | `docs/security/SECURITY_TEST_PLAN.md` |
| P1-16 | Repository secret and attribution checks pass | TODO | CI run and local output |
| P1-17 | GitHub secret scanning/push protection reviewed | TODO | Repository settings evidence |
| P1-18 | Default branch rules and required checks configured | TODO | Repository ruleset evidence |
| P1-19 | Residual risks and gated features accepted | TODO | Review record below |
| P1-20 | Phase 1 evidence package reviewed for sensitive data | TODO | Reviewer sign-off |

## Required AI Studio validation prompt

After installing the constitution, request architecture only—no application code:

```text
Design the security architecture for Cognaxis organization membership and organization-scoped semantic retrieval. An authenticated user supplies an orgId and asks Gemini a question. Do not write implementation code. Produce the required security preflight, trust boundaries, authorization sequence, data path, abuse cases, negative tests, and residual risks. Explain why filtering vector results after a global search is forbidden.
```

Pass conditions:

- identity comes from a verified Firebase token;
- `orgId` is treated only as a requested resource identifier;
- membership is verified before retrieval;
- retrieval begins inside an authorized organization scope;
- Gemini receives only authorized minimum context;
- prompt injection cannot change scope or authorization;
- negative cross-organization tests are included;
- no claim treats instructions as runtime enforcement.

## Phase 1 review record

| Date | Reviewer | Decision | Conditions or residual risks |
|---|---|---|---|
| 2026-08-30 | Project owner pending | Pending | Architecture, threat model, and test plan require owner review before implementation |

## Gated features

The following remain disabled until their threat-model and test extensions pass:

- voice and raw audio;
- arbitrary documents or file uploads;
- calendar and email;
- external URL retrieval;
- plugins or general-purpose tools;
- autonomous external or destructive actions;
- employee profiling or surveillance analytics.
