# Cognaxis Security Architecture

Status: Approved Phase 1 baseline
Scope: Security-critical MVP
Primary deployment region: To be confirmed before Firestore creation

## 1. Product and security objective

Cognaxis provides two explicit operating scopes:

- **Personal:** private conversations, memories, reflections, and derived intelligence owned by one authenticated user.
- **Organization:** records intentionally created or copied into an organization and available according to active membership and role.

The primary assurance objective is to prevent data or derived intelligence from crossing user or organization boundaries without explicit, authorized action.

## 2. Security-critical MVP

Included:

- Firebase Google Sign-In;
- authenticated multi-turn Gemini interaction;
- personal sessions, messages, summaries, and memory;
- explicit personal/organization workspace selection;
- organization creation and membership;
- organization-scoped updates and intelligence;
- source provenance for retrieved memories and derived insights;
- Cloud Run deployment and Secret Manager integration.

Gated until separately threat-modeled:

- voice and raw audio;
- arbitrary document uploads;
- email or calendar integration;
- external URL retrieval;
- general-purpose tools or plugins;
- autonomous external or destructive actions;
- employee sentiment, personality, performance, or attrition analysis.

## 3. Trust boundaries and data flow

```text
Untrusted browser
  |
  | 1. Google Sign-In through Firebase Authentication
  | 2. HTTPS request with Firebase ID token
  v
Public Cloud Run web/API boundary
  |
  |-- verify token; derive uid
  |-- validate schema and bounds
  |-- resolve workspace
  |-- verify organization membership and role where applicable
  |-- enforce rate, cost, and action policy
  |
  +--> exact personal Firestore path
  +--> exact authorized organization Firestore path
  +--> scope-specific semantic query
  +--> Gemini with minimum authorized context
  +--> redacted structured logging
  +--> Secret Manager through runtime identity
```

### Boundary rules

1. The browser is not a policy enforcement point.
2. Protected routes authenticate every request independently.
3. Authorization precedes Firestore access, semantic retrieval, Gemini calls, and writes.
4. The backend sends Gemini only context already authorized for the current operation.
5. Model output cannot grant access or authorize a side effect.
6. Data scope is represented structurally in datastore paths and queries, not only in prompt text.

## 4. Identity and authorization

### Authentication

- Firebase Authentication issues an ID token after Google Sign-In.
- The browser sends the token in `Authorization: Bearer <token>` over HTTPS.
- The backend verifies format, signature, expiry, issuer, and audience using the Firebase Admin SDK.
- The backend uses only the verified token's `uid` as the effective user identity.

Sensitive membership, role, export, or deletion operations may require recent authentication and revocation-aware verification. App Check may reduce automated abuse but does not replace identity or authorization.

### Organization authorization

An `orgId` in a request is a resource locator, not proof of access. Before organization data is read or passed to Gemini, the server verifies:

1. the requester has an active membership record;
2. the operation is allowed for the server-resolved role;
3. the target object belongs to that organization;
4. the operation preserves server-authoritative ownership, scope, and provenance fields.

Organization role changes are transactionally authorized. A user cannot assign themselves a role through a profile or request body.

## 5. Datastore isolation contract

```text
users/{uid}
users/{uid}/personalSessions/{sessionId}
users/{uid}/personalSessions/{sessionId}/messages/{messageId}
users/{uid}/personalMemories/{memoryId}
users/{uid}/personalSettings/{settingId}

organizations/{orgId}
organizations/{orgId}/members/{uid}
organizations/{orgId}/sessions/{sessionId}
organizations/{orgId}/sessions/{sessionId}/messages/{messageId}
organizations/{orgId}/memories/{memoryId}
organizations/{orgId}/decisions/{decisionId}
organizations/{orgId}/insights/{insightId}
organizations/{orgId}/auditEvents/{eventId}
```

Required server-authoritative metadata:

- `createdBy`
- `createdAt`
- `updatedAt`
- `scopeType`: `personal` or `organization`
- `scopeId`: verified `uid` or authorized `orgId`
- `sourceIds` for derived data
- `schemaVersion`

The web client does not directly read or write confidential Firestore collections in the baseline architecture. Firestore client rules therefore deny those operations by default. Server SDKs bypass Firestore rules, so backend authorization and least-privilege IAM are mandatory.

## 6. Semantic retrieval contract

Personal retrieval begins under:

```text
users/{verifiedUid}/personalMemories
```

Organization retrieval begins under:

```text
organizations/{authorizedOrgId}/memories
```

Scope is selected and authorized before the query. Retrieval never begins from a global cross-tenant candidate set. Every result retains source provenance and classification.

## 7. Personal-to-organization sharing

No automatic sharing is allowed. A future share flow must:

1. show the exact content and destination organization;
2. require explicit confirmation;
3. recheck active membership at execution time;
4. create a new organization record rather than changing the private record's scope;
5. record an action receipt and source provenance;
6. leave the personal source protected;
7. avoid silently syncing later private edits.

## 8. Gemini boundary

The backend constructs a prompt from:

- system policy;
- the current authenticated request;
- the minimum authorized conversation window;
- a bounded set of scope-specific retrieved records;
- a strict output schema when machine processing is required.

Retrieved content is delimited as untrusted evidence. It cannot change system policy, tenant selection, authorization, tool availability, or secret handling. Model output is validated and safely rendered before storage or use.

## 9. Secrets and service identities

- Cloud Run uses a dedicated runtime service account without a downloadable key.
- The runtime receives only the Firestore permissions needed by the application and access to the specific Gemini secret.
- Gemini credentials are stored in Secret Manager and delivered to the server at runtime.
- Development and production credentials are separate.
- CI does not receive production runtime secrets for ordinary tests.
- No secret is placed in frontend configuration, source, logs, screenshots, fixtures, or documentation.

## 10. Logging and privacy

Permitted operational fields include a request/correlation ID, route template, status class, latency, model identifier, retry count, and aggregated token/cost metrics. User or organization references are included only when needed and should be pseudonymous.

Prohibited logging includes raw prompts, journal text, responses, retrieved passages, uploads, ID tokens, authorization headers, invite tokens, keys, and secret values.

Summaries and embeddings inherit the source classification. Deleted sources must disappear from history and retrieval and must cascade to derived artifacts.

## 11. Web and abuse controls

- exact-origin CORS;
- restrictive CSP and standard secure headers;
- explicit request and response size limits;
- per-user and global rate/cost limits;
- safe Markdown or plain-text rendering;
- generic client errors and sanitized server diagnostics;
- bounded timeouts, retries, and model context;
- Cloud Run maximum instances and budget alerts.

## 12. Security invariants suitable for automated tests

- No protected handler reaches data access without verified identity.
- No organization data access occurs without an active membership decision.
- No personal query accepts a user ID other than the verified identity.
- No semantic retrieval runs without an already-authorized scope.
- No model call receives records from multiple tenant scopes.
- No model output directly executes a side effect.
- No source deletion completes while active derived retrieval artifacts remain.
- No application secret is present in browser output or repository history.

## 13. Primary implementation references

- [Firebase: verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firestore rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Firestore: rules are not filters](https://firebase.google.com/docs/firestore/security/rules-query)
- [Cloud Run: configure secrets](https://cloud.google.com/run/docs/configuring/services/secrets)
- [Gemini safety and prompt-injection guidance](https://ai.google.dev/gemini-api/docs/safety-guidance)
