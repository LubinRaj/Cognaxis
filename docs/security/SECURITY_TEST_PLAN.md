# Cognaxis Security Test Plan

Version: 1.0
Status: Test design; implementation begins with the application foundation

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

### B. Personal isolation

For every personal resource type and operation, prove:

- User A can perform the permitted operation on User A's record;
- User B cannot read, list, update, delete, summarize, export, cite, or retrieve User A's record;
- changing `uid`, `ownerUid`, object ID, route, query, body, or headers cannot cross the boundary;
- personal list pagination cannot include another user;
- existence is not disclosed unnecessarily through status, timing, or error text.

### C. Organization isolation and roles

- active member can perform only member operations in their organization;
- non-member and removed member are denied before data access;
- Org A cannot access Org B by changing `orgId` or object ID;
- ordinary member cannot invite, promote, remove, or alter role fields;
- authorized owner action is transactionally rechecked;
- organization owner/admin cannot access any member's personal workspace;
- concurrent membership removal prevents a stale authorized write.

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
- rules tests whenever Firestore or Storage rules change.

Before deployment, additionally run:

- production build and bundle inspection;
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
