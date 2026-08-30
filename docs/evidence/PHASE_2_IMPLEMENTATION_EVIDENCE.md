# Phase 2 Implementation Evidence

Status legend: `IMPLEMENTED`, `TESTED`, `CONFIGURED EXTERNALLY`, `DEFERRED`, `BLOCKED`

This record distinguishes source implementation from cloud configuration and observed runtime evidence. It must not be used to claim that unconfigured cloud controls are active.

| Requirement or control | Status | Current evidence |
|---|---|---|
| Firebase Google Sign-In UI and SDK token lifecycle | IMPLEMENTED | `src/client/lib/firebase.ts`, `src/client/components/SignIn.tsx` |
| Firebase project/provider/authorized domains | CONFIGURED EXTERNALLY | Pending Firebase console setup |
| Backend Firebase ID-token verification | IMPLEMENTED | `src/server/auth/firebase-token-verifier.ts`, authentication middleware |
| Unauthenticated/invalid-token denial | TESTED | API integration suite |
| Server-derived personal identity and paths | TESTED | Firestore repository plus cross-user API test |
| Confidential direct Firestore browser access denied | IMPLEMENTED | `firestore.rules`; emulator deployment/test pending |
| Personal sessions and messages | TESTED | Journal service, repository, and API integration suite |
| Multi-turn server-side Gemini call | IMPLEMENTED | Gemini model adapter; real call pending secret configuration |
| Structured auto-summary with provenance | TESTED | Service/repository path with synthetic model; real Gemini output pending integration test |
| Secret Manager access with ADC and pinned version | IMPLEMENTED | `src/server/services/secret-provider.ts`; IAM/runtime verification pending |
| Exact-origin CORS, CSP, no-store, body bounds, rate headers | TESTED | API integration suite |
| Unknown-field and oversized-input rejection | TESTED | Zod unit and API integration tests |
| Deletion removes source messages and derived summary | TESTED | Synthetic repository/API integration test |
| Cross-organization authorization | DEFERRED | Organization interface disabled; membership backend not implemented |
| Semantic vector retrieval | DEFERRED | Not required for base Personal Gemini Journal; future enhancement |
| Voice, uploads, calendar, email, external tools | DEFERRED | Gated by Phase 1 threat model |
| Cloud Run deployment and runtime IAM | CONFIGURED EXTERNALLY | Pending project-owner-approved cloud setup |

## Local verification record

The following checks must be rerun immediately before any approved commit and the exact output recorded:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run security:check`
- `npm audit`

Do not mark external Firebase, Firestore, Secret Manager, IAM, Gemini, or Cloud Run controls as tested until their sanitized evidence is actually observed.
