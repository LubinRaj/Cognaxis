# Security Control Model

Last reviewed: 7 September 2026

This document summarizes the security boundaries implemented by Cognaxis and the evidence expected for each boundary.

## Protected data

| Data class | Scope |
|---|---|
| Personal reflections, messages, summaries, memories, attachments, check-ins, insights, and locations | Account owner only |
| Organization reflections, summaries, attachments, membership, invitations, settings, and audit events | Active organization members according to role |
| Platform account, status, usage, organization, and audit metadata | Active super administrators |
| Authentication tokens, invitation secrets, API keys, and service credentials | Restricted processing only |

## Trust boundaries

1. The browser authenticates through Firebase and is otherwise untrusted.
2. Cloud Run verifies identity, validates input, and authorizes scope before application work.
3. Firestore and Storage are accessed through the authorized backend using a dedicated runtime identity.
4. Gemini receives only authorized, minimized evidence and has no independent database or cloud authority.
5. Deployment configuration is protected through IAM, Secret Manager, API restrictions, and release verification.

## Control matrix

| Surface | Implemented controls | Verification |
|---|---|---|
| Authentication | Firebase-managed sign-in and session lifecycle; backend ID-token verification; verified-email and active-account gates | Authentication unit, integration, and browser journeys |
| Personal data | UID derived from verified token; owner-rooted paths; authorization before reads and writes | Cross-user API and repository tests |
| Firestore clients | Deny-all direct-client Security Rules | Firebase emulator rules tests |
| Organizations | Active membership checks; centralized owner/admin/member/viewer policy; transactional revalidation | Role-matrix and cross-organization tests |
| Invitations | Random expiring secret, digest storage, one-time transactional acceptance, sanitized browser handling | Service, repository, and browser tests |
| Semantic retrieval | Scope authorization before search; scope-rooted memory; source and citation validation | Personal and organization retrieval tests |
| Gemini | Server-only invocation; minimized authorized context; structured-output validation; safe rendering | Model contract, provenance, and prompt-boundary tests |
| Attachments and voice | Type and size controls; authorized Storage access; transient voice handling | Limit, isolation, transcription, and cleanup tests |
| Check-ins and insights | Explicit self-report schemas; deterministic metrics; authorized evidence | Signal, dashboard, and insight tests |
| Location | Explicit user action; server-enforced precision; personal scope | Component, service, and privacy tests |
| Platform administration | Live super-admin authorization; recent authentication; metadata-only responses; transactional audit | Admin API, service, and privacy tests |
| Web/API | Exact-origin policy, secure headers, private caching, validation, request bounds, rate limits, sanitized errors | Middleware, header, validation, and browser tests |
| Secrets and cloud identity | Secret Manager delivery, keyless runtime identity, least-privilege IAM, no client secret exposure | Repository checks, bundle inspection, and deployment review |
| Deletion | Cascading removal or invalidation of primary and derived records | Service, repository, API, and browser tests |

## Release requirements

- Authentication and tenant-isolation tests pass.
- Firestore Security Rules and required indexes are deployed.
- No credentials or private production data are present in source, bundles, logs, or test artifacts.
- Runtime identity and Secret Manager access follow least privilege.
- High and Critical dependency findings are resolved or explicitly reviewed before release.
- Production configuration is verified using the Cloud Setup Checklist.
