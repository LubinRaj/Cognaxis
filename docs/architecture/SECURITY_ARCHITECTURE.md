# Cognaxis Architecture

Last reviewed: 6 September 2026

This document describes the behavior implemented in the repository. It is not a claim that external cloud configuration has been verified.

## Product model

Cognaxis has three authorization domains:

1. **Personal:** private reflections, messages, summaries, attachments, check-ins, insights, and semantic memory owned by one verified Firebase user.
2. **Organization:** shared reflections and organization records available only to active members under owner, admin, member, and viewer permissions.
3. **Platform administration:** operational identity, status, organization, usage, and audit metadata available to active super admins. It has no journal-content endpoint.

An organization role never grants access to a member's personal data. Personal content is not copied into an organization automatically.

## Runtime topology

```text
Untrusted browser
  |
  | Firebase sign-in and SDK-managed session
  | Authorization: Bearer <Firebase ID token>
  v
Cloud Run: Node.js 22 + Express 5
  |
  | request ID, security headers, CORS, JSON bounds, rate limits
  | Firebase Admin token verification
  | verified-email and active-platform-user gates
  | scope and role authorization
  |
  +--> Cloud Firestore through Firebase Admin
  +--> Firebase Storage through Firebase Admin
  +--> Gemini API through a server-only secret
  +--> optional Agent Platform fallback through Application Default Credentials
  v
React 19 + Vite single-page application served by the same process
```

Authentication credential operations belong to Firebase Authentication. Cognaxis has no password, login, refresh-token, password-reset, or email-verification API. The Firebase client SDK owns token persistence and refresh.

## Protected request pipeline

Every `/api/v1` request passes through one shared pipeline before feature routes run:

1. Verify the Firebase ID token and derive the effective UID.
2. Apply short-window and minute-window limits keyed by that verified UID.
3. Require a verified email claim.
4. Load the live platform user and reject a suspended account.
5. Mark the response `private, no-store`.
6. Run the feature-specific personal, organization, or super-admin authorization.
7. Validate input before data access or model invocation.

The API client requests a current token for each protected call. A qualifying `401 UNAUTHENTICATED` can cause one forced refresh and one replay only. Authorization denials, validation errors, rate limits, and server errors are not treated as refresh problems.

## Data layout

Important Firestore paths are scope-rooted:

```text
users/{uid}/personalSessions/{sessionId}
users/{uid}/personalSessions/{sessionId}/messages/{messageId}
users/{uid}/personalSessions/{sessionId}/exchanges/{requestId}
users/{uid}/personalMemories/session_{sessionId}
users/{uid}/memoryChunks/{sessionId}
users/{uid}/attachments/{attachmentId}
users/{uid}/personalSignals/{sessionId}
users/{uid}/personalCheckIns/{checkInId}
users/{uid}/personalInsights/{periodKey}
users/{uid}/organizationMemberships/{orgId}
users/{uid}/settings/preferences

organizations/{orgId}
organizations/{orgId}/members/{uid}
organizations/{orgId}/invites/{inviteId}
organizations/{orgId}/auditEvents/{eventId}
organizations/{orgId}/workspaceSessions/{sessionId}
organizations/{orgId}/workspaceSessions/{sessionId}/messages/{messageId}
organizations/{orgId}/workspaceSummaries/session_{sessionId}
organizations/{orgId}/memoryChunks/{sessionId}
organizations/{orgId}/attachments/{attachmentId}
organizations/{orgId}/settings/eod
organizations/{orgId}/eodStatus/{uid}_{localDate}

platformUsers/{uid}
platformControl/access
platformAdminAudit/{eventId}
platformUsageDaily/{date}
```

Ownership, role, scope, timestamps, provenance, and audit fields are set by the server where authoritative. Firestore client rules deny direct access to confidential collections. Firebase Admin bypasses those rules, so server authorization and runtime IAM remain mandatory.

## Reflection flow

A message send follows this path:

1. The client creates a UUID request ID and opens an NDJSON stream.
2. The server authorizes the session before streaming starts.
3. The service checks for an existing completed exchange with the same request ID.
4. It loads a bounded recent window from the selected session and authorizes any attachments.
5. Gemini streams a response. The client validates stream events and renders incremental text.
6. The user and assistant messages, exchange receipt, and session counters are persisted together after the model completes.
7. Summary invalidation, insight invalidation, semantic indexing, and usage recording run through bounded post-write paths.

A failed model response does not persist a half-complete exchange. The request ID makes a supported retry idempotent.

Conversation generation is session-scoped. A new Journal reflection does not automatically inject earlier reflections into the conversation. Cross-reflection questions belong to Ask Me.

## Memory and Ask Me

The memory layer has two derived forms:

- One structured summary per reflection with title, summary, themes, next steps, and source message IDs.
- One semantic `memoryChunks` document per reflection containing bounded recent messages, summary, tags, extracted attachment text, provenance, and a 768-dimensional embedding.

Ask Me works in a user-selected personal or team scope:

1. The server authorizes the scope and lists only active sessions in that scope.
2. It embeds the question and runs Firestore nearest-neighbor search inside the scope-rooted `memoryChunks` collection.
3. Retrieved chunk IDs are checked against the authorized active-session set.
4. Gemini receives a bounded evidence set and must return structured citations.
5. The server accepts citations only when they name supplied sessions and message IDs and quote an exact supporting excerpt.
6. When vector search is unavailable or finds no usable evidence, a bounded lexical search checks summaries and then recent messages.

The user can rebuild memory indexes from the Ask Me page, and reflection changes schedule index refresh. Answers remain grounded in authorized source records and expose source navigation to the user.

## Organization authorization

The role matrix is centralized and enforced server-side. In broad terms:

| Capability | Owner | Admin | Member | Viewer |
|---|---:|---:|---:|---:|
| Read shared reflections | Yes | Yes | Yes | Yes |
| Create team reflections | Yes | Yes | Yes | No |
| Change organization settings | Yes | Yes, within policy | No | No |
| Invite or govern privileged members | Owner-controlled | Limited | No | No |
| Read any member's personal journal | No | No | No | No |

Viewer-only teams are excluded from the Journal scope selector because viewers cannot create reflections. They remain available on the Teams and Ask Me read surfaces.

Invitation secrets are random, single-use, expiring, and placed in the URL fragment. Only a digest is stored. Acceptance rechecks the invitation and membership in a transaction, and the client removes the fragment before continuing.

## Attachments, voice, check-ins, and location

- Attachment metadata and Storage object paths are rooted in the selected personal or organization scope.
- Up to three supported attachments may accompany a message. File type, size, ownership, and source session are validated server-side.
- Voice recording is explicit and visible. Audio is sent for transient transcription and is not retained as a raw recording by the voice flow.
- Personal check-ins are explicit self-reports. Mood and energy are bounded integers; emotions come from an allowlist.
- Location is opt-in. Approximate coordinates are reduced in precision before persistence.
- Personal signals and locations are not exposed through organization or platform-admin endpoints.

## Insights

The dashboard computes 7, 30, and 90-day metrics from the user's own active reflections and check-ins. Daily and weekly recaps combine deterministic metrics with a schema-validated Gemini narrative. Evidence IDs must belong to the supplied source set. Repeated generation is protected by source fingerprints, request IDs, rate limits, and a Firestore lease.

Insights are not clinical assessments. The application must not infer diagnoses, employee performance, personality, or attrition.

## Platform administration

The first super admin is created by a reviewed offline script after the user has signed in. There is no public bootstrap route. Role and status changes require a live active super-admin record, recent authentication, a bounded operational reason, a transaction, and an audit event. The final active super admin cannot be removed.

Admin APIs expose operational account and organization metadata only. They intentionally have no path to personal sessions, messages, summaries, check-ins, locations, attachments, semantic memory, or Ask Me.

## AI and trust boundary

Gemini receives only context selected after deterministic authorization. User text, retrieved text, attachments, and model output are untrusted. They cannot select another tenant, change a role, enable a tool, reveal a secret, or authorize a side effect.

Machine-consumed outputs use explicit schemas and reject malformed or foreign provenance. User-facing text is rendered through safe React output paths. The model has no general Firestore, IAM, Secret Manager, shell, network, or deployment tool.

## Secrets and runtime identity

The server reads `GEMINI_API_KEY`; the browser never does. In production, Cloud Run should receive that variable from a pinned Secret Manager secret version. The runtime uses a dedicated keyless service account with only the Firestore, Storage, optional Agent Platform, and secret-specific access actually required.

Firebase web configuration and the Maps JavaScript key are browser-visible by design. They must be API-restricted and origin-restricted. No `VITE_*` value may be treated as confidential.

## Availability and cost controls

- Global IP and verified-user rate limits
- Per-operation limits for model, upload, invitation, insight, and admin routes
- Bounded input, conversation, retrieval, output, and attachment sizes
- Provider timeouts and cancellation
- Idempotent exchange persistence
- Optional provider fallback using Cloud Run identity
- Generic client errors with request IDs and content-free structured logs

In-memory rate limits apply per running Cloud Run instance. Project quotas, budget alerts, and maximum-instance settings are still required production controls.

## Verification

Automated tests cover identity, authorization, tenancy, retrieval, model output, archive and deletion behavior, organization roles, administration, accessibility, and web security headers. The deployment checklist covers IAM, API restrictions, Firebase configuration, Storage privacy, monitoring, and production verification.
