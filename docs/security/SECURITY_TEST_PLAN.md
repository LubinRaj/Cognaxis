# Cognaxis Security Test Plan

Version: 1.2
Status: Suites A, A2, A3, A4, A5, B, G, H, and J implemented for the Personal Gemini Journal with
FirebaseUI authentication. Remaining suites stay in design until their features are enabled.

## 1. Test strategy

Security tests use synthetic users and organizations. No real journal, employee, or organization data belongs in fixtures, screenshots, emulator exports, or logs.

Required test identities:

- anonymous caller;
- User A and User B with personal records;
- Org A owner, Org A member, and Org A removed member;
- Org B owner and member;
- user with no organization membership.

Use the Firebase Emulator Suite for deterministic authentication and Firestore-rule tests. Use backend integration tests for Admin SDK paths because server SDKs bypass Firestore rules. Run a small set of deployed smoke tests against synthetic accounts before submission.

## 2. Mandatory security suites

### A. Authentication

- valid token reaches an authorized handler;
- missing and malformed bearer token fail;
- expired token fails;
- token from another Firebase project fails;
- incorrectly signed token fails;
- revoked token fails on sensitive operations;
- error contains no decoded claims, token, key material, or stack trace.

Implemented by `tests/integration/journal-api.test.ts` and
`tests/integration/verified-email-boundary.test.ts`.

### A2. Email/password identity and verification gate

Positive:

- a verified email/password token reaches an authorized handler;
- a verified Google token reaches an authorized handler;
- account creation transitions to the verification screen and sends one Firebase verification email;
- confirming verification reloads the Firebase user and forces a fresh ID token before the journal
  opens.

Negative and adversarial:

- an unverified token receives `403 EMAIL_VERIFICATION_REQUIRED` on every private route;
- an unverified request creates no repository record and invokes no model call;
- `emailVerified`, `uid`, `email`, `signInProvider`, or a `principal` object supplied in a request
  body or header is ignored or rejected;
- a truthy non-boolean verification value is not accepted by the middleware or the client check;
- error bodies contain no email address, claim name, `auth/` code, or stack frame.

Implemented by `tests/integration/verified-email-boundary.test.ts`,
`tests/unit/require-verified-email.test.ts`, and `tests/component/auth-verify-email.test.tsx`.

### A3. Enumeration resistance and credential-error redaction

- every credential outcome (`user-not-found`, `wrong-password`, `invalid-credential`,
  `invalid-login-credentials`, `user-disabled`) resolves to one identical message;
- no rendered message states that an account does or does not exist, or that a password was wrong;
- a Firebase code absent from the FirebaseUI translation map never reaches the user as a raw
  provider message;
- the password-reset confirmation is byte-identical for a known and an unknown address;
- network, rate-limit, and configuration failures — which cannot indicate account existence — are
  still reported accurately;
- provider-conflict codes map to one message that names no provider and confirms no account.

Implemented by `tests/unit/auth-errors.test.ts`, `tests/component/auth-sign-in.test.tsx`,
`tests/component/auth-sign-up.test.tsx`, and `tests/component/auth-forgot-password.test.tsx`.

### A4. Session lifecycle, refresh bounds, and state clearing

- a current ID token is requested immediately before every protected call;
- the token appears only in the `Authorization` header, never in a URL, and never in
  `localStorage`, `sessionStorage`, or any application store;
- a `401 UNAUTHENTICATED` triggers exactly one forced refresh and one replay;
- no retry occurs for `RECENT_AUTH_REQUIRED`, `EMAIL_VERIFICATION_REQUIRED`, `FORBIDDEN`,
  `RATE_LIMITED`, validation failures, or server errors;
- a second failure ends the session, clears private state, and shows the session-expired screen;
- switching from User A to User B leaves no User A record in the document and sends only User B's
  token;
- sign-out clears in-memory journal state before the Firebase sign-out call;
- the bootstrap state shows no signed-out or private content and offers a bounded retry.

Implemented by `tests/unit/token-retry-policy.test.ts`, `tests/unit/api-client.test.ts`,
`tests/component/auth-session-isolation.test.tsx`, and `tests/component/auth-bootstrap.test.tsx`.

### A5. Authentication interface and accessibility

- every authentication screen reports no serious or critical automated accessibility violation;
- every input has a visible label and the correct `autocomplete` token;
- each field error is associated with its input through `aria-describedby` and announced with
  `role="alert"`;
- the password visibility control is a keyboard-operable button with a distinct name per field;
- submit controls disable while a request is pending, and repeated clicks issue one request;
- resend controls honour a cooldown after both success and failure;
- the theme control works on every authentication screen without a reload and stores no password,
  token, or email address;
- the configuration-required screen names only missing variables, exposes no value, and offers no
  input that could receive a pasted secret.

Implemented by `tests/component/auth-theme-accessibility.test.tsx`,
`tests/component/auth-configuration-required.test.tsx`, and the per-screen component suites.

### B. Personal isolation

For every personal resource type and operation, prove:

- User A can perform the permitted operation on User A's record;
- User B cannot read, list, update, delete, summarize, export, cite, or retrieve User A's record;
- changing `uid`, `ownerUid`, object ID, route, query, body, or headers cannot cross the boundary;
- personal list pagination cannot include another user;
- existence is not disclosed unnecessarily through status, timing, or error text.

### B2. Signals, deterministic dashboard, and location privacy

- signal scores accept only nullable integers one to five and controlled unique emotions;
- server-controlled fields (`uid`, `createdBy`, `scopeId`, timestamps) are rejected;
- the claimed local date must be plausible for the supplied IANA timezone;
- an all-empty save is a deletion result, not an error;
- deleting the reflection deletes its signal and its map eligibility;
- dashboard metrics are deterministic, range-exact, and never fill gaps or coerce null scores;
- no geolocation request happens before the explicit user action, and denial leaves journaling
  fully usable;
- "approximate" is genuinely rounded before persistence;
- coordinates never appear in logs, admin, organization, or audit surfaces;
- the map endpoint returns only the minimal owner-scoped projection, never message bodies.

Implemented by `tests/unit/signal-schemas.test.ts`, `tests/unit/signal-service.test.ts`,
`tests/unit/personal-dashboard.test.ts`, `tests/integration/personal-api.test.ts`,
`tests/integration/map-points-api.test.ts`, `tests/component/workspace-checkin.test.tsx`,
`tests/component/insights-page.test.tsx`, and `tests/component/map-page.test.tsx`.

### B3. Grounded period insights

- period keys parse strictly, including ISO week/year transitions, and future periods are refused;
- sparse periods produce a deterministic result with no model call;
- unchanged sources and repeated request IDs reuse the stored result without a second model call;
- invalid structured output, foreign evidence IDs, and clinical language are rejected with
  nothing stored;
- source mutations and deletions mark derived periods stale;
- deleting an insight removes only the derived document;
- per-instance rate limits plus a Firestore-backed generation lease (one in-flight generation per
  user and period across all server instances, with a 60-second expiry) bound model spend.

Implemented by `tests/unit/periods.test.ts`, `tests/unit/insight-service.test.ts`, and
`tests/integration/insights-api.test.ts`.

### C. Organization isolation and roles

- active member can perform only member operations in their organization;
- non-member and removed member are denied before data access;
- Org A cannot access Org B by changing `orgId` or object ID;
- ordinary member cannot invite, promote, remove, or alter role fields;
- authorized owner action is transactionally rechecked;
- organization owner/admin cannot access any member's personal workspace;
- concurrent membership removal prevents a stale authorized write;
- the full owner/admin/member/viewer matrix is enforced for every action, including that only the
  owner may invite or govern admins, and nobody may mutate themselves or the owner;
- invitations are one-time, expiring, hash-stored, constant-time compared, transactionally
  accepted, and replay-safe across users and retries;
- suspended memberships and suspended organizations authorize nothing;
- organization model context contains only that organization's records, and a viewer can never
  trigger a model call;
- sensitive organization mutations require recent revocation-checked authentication.

Implemented by `tests/unit/organization-roles.test.ts`,
`tests/unit/organization-service.test.ts`, `tests/integration/organization-api.test.ts`, and
`tests/component/organizations.test.tsx`.

### C2. Platform administration

- every `/admin` route denies ordinary users, suspended admins, and stale authentication on
  mutations;
- self-targeted role or status changes are refused;
- the last active super admin is protected transactionally, including under concurrent demotion;
- mutations fail closed when the access-control counter was never bootstrapped;
- every mutation records a fixed-schema audit event with a bounded operational reason;
- platform suspension blocks all Cognaxis APIs without deleting data, and restoration re-enables
  access;
- no admin response contains private journal content, session identifiers, coordinates, or
  wellbeing data (canary-verified);
- overview metrics distinguish "unavailable" from a legitimate zero.

Implemented by `tests/unit/platform-user-service.test.ts`,
`tests/integration/platform-user-boundary.test.ts`, `tests/integration/admin-api.test.ts`, and
`tests/component/admin-page.test.tsx`.

### D. Firestore and IAM

- Firestore emulator denies direct confidential client reads and writes;
- no permissive wildcard rule exists;
- server tests prove authorization because rules do not protect Admin SDK access;
- runtime service account has no Owner or Editor role and no user-managed key;
- Secret Manager access is limited to the required secret;
- CI identity cannot read production application secrets.

### E. Semantic retrieval

Seed semantically near-identical synthetic records in User A, User B, Org A, and Org B.

- personal query returns only the verified user's candidates;
- organization query returns only the authorized organization's candidates;
- authorization occurs before vector search;
- candidate count, pagination, reranking, fallback, and cache paths preserve scope;
- citations and provenance resolve only inside the authorized scope;
- deleted sources and embeddings never reappear.

### F. Prompt injection and model boundary

Test malicious user and retrieved text that requests:

- ignoring system instructions;
- switching to another uid or orgId;
- revealing system prompts, secrets, tokens, or hidden context;
- reading another tenant;
- adding or invoking an unapproved tool;
- fabricating an approval or role;
- writing malformed or oversized structured output.

Expected result: prose may acknowledge or refuse the content, but authorization, selected scope, available tools, context set, and side effects remain unchanged. Invalid structured output is rejected safely.

### G. Secret and privacy leakage

- full Git history secret scan passes;
- production bundle contains no Gemini key, service credential, private configuration, or source map not approved for release;
- canary secrets and private strings do not appear in responses, errors, logs, traces, screenshots, or monitoring;
- environment/startup failures do not print secret values;
- repository fixtures contain synthetic data only.

### H. Web security

- approved origin succeeds and hostile origins fail CORS checks;
- restrictive CSP and secure headers are present;
- user/model XSS payloads render inert;
- unknown fields and invalid types are rejected;
- request body, field, conversation, retrieval, output, and upload limits are enforced;
- redirects and paths cannot be controlled by untrusted absolute URLs or traversal strings;
- authenticated responses use private/no-store caching behavior.

### I. Abuse, reliability, and cost

- per-user and anonymous rate limits activate predictably;
- Gemini timeout produces a sanitized, useful fallback;
- retries are bounded and do not duplicate writes;
- model rate limiting does not produce a retry storm;
- Cloud Run max-instance and budget-alert evidence exists;
- health endpoints reveal no identifiers or dependency secrets.

### J. Retention and deletion

- deleting a source removes it from direct reads and lists;
- summaries, embeddings, caches, and citations are removed or invalidated;
- organization copies remain governed by the explicit sharing policy and are clearly disclosed before sharing;
- canceled sharing creates no organization record;
- raw voice audio is absent unless a later approved retention mode explicitly stores it.

## 3. Repository gates

Every pull request must run:

- repository policy check;
- full-history secret scan;
- lockfile/dependency review after application dependencies exist;
- unit and integration suites relevant to changed security behavior;
- component suites for every authentication screen when authentication code changes;
- rules tests whenever Firestore or Storage rules change.

Before deployment, additionally run:

- production build and automated client bundle inspection
  (`scripts/security/inspect-client-bundle.mjs`, run by `npm run security:check`), which fails if
  FirebaseUI reaches the entry chunk or if any asset contains a server-side credential marker;
- Firebase Emulator Suite end-to-end authentication journeys;
- one controlled staging smoke test covering real Google OAuth, one real verification email, and
  one real password-reset email using synthetic accounts;
- container vulnerability scan;
- infrastructure and IAM review;
- deployed synthetic-account smoke tests;
- log redaction verification;
- evidence checklist update.

## 4. Severity and exit criteria

| Severity | Examples | Release rule |
|---|---|---|
| Critical | Cross-tenant bulk exposure, committed production credential, remote code execution | Block; remediate immediately |
| High | Single-record cross-user access, role escalation, secret in browser or logs | Block; remediate before submission |
| Medium | Missing defense in depth, bounded sensitive metadata leak | Fix or document owner, rationale, and deadline |
| Low | Hardening or clarity improvement without practical exploit | Track and prioritize |

Submission exit criteria:

1. zero known Critical or High findings;
2. all mandatory identity, personal, organization, retrieval, prompt-injection, secret, and deletion tests pass;
3. no secret appears in repository history or client bundle;
4. all gated features are either disabled or separately threat-modeled and tested;
5. residual risks are documented accurately;
6. evidence artifacts contain no credentials or private content.

## 5. Evidence record template

For each gate record:

- test or review name;
- commit SHA and environment;
- date and operator;
- command or procedure;
- sanitized result artifact;
- failures and remediation;
- final disposition.

Never record a passing result that was not actually observed.
