# Cognaxis Threat Model

Version: 1.0
Status: Phase 1 baseline
Review trigger: Any change to identity, authorization, data model, retrieval, Gemini tools, uploads, voice, integrations, IAM, or deployment

## 1. Method and assurance boundary

This model uses asset and trust-boundary analysis with STRIDE-style web/cloud threats and LLM-specific abuse cases. It describes intended controls, not proof that they are implemented. Control status must be updated during implementation and supported by tests or configuration evidence.

## 2. Protected assets

| Asset | Classification | Primary harm |
|---|---|---|
| Personal journals, conversations, summaries, memories | Confidential | Privacy breach, psychological harm, loss of trust |
| Organization updates, decisions, blockers, insights | Confidential | Tenant breach, business harm, surveillance misuse |
| Embeddings and derived facts | Same as source | Inference or retrieval leakage |
| Firebase ID tokens and invite tokens | Restricted | Account or membership abuse |
| Gemini/API credentials and cloud identity | Restricted | Data access, cost abuse, compromise |
| Membership and role records | Security-critical | Privilege escalation |
| Provenance and audit events | Integrity-critical | False evidence, repudiation |
| Availability and quota | Operational | Denial of service or unexpected spend |

## 3. Actors

- anonymous internet user;
- authenticated ordinary user;
- malicious or compromised user;
- organization member;
- organization owner/administrator;
- malicious uploaded or retrieved content;
- compromised browser or dependency;
- application runtime service account;
- developer or CI workflow;
- Gemini as an untrusted probabilistic component.

## 4. Trust boundaries

1. Browser to Firebase Authentication.
2. Browser to public Cloud Run endpoint.
3. Cloud Run authorization layer to Firestore.
4. Cloud Run retrieval layer to semantic memory.
5. Cloud Run prompt builder to Gemini.
6. Cloud Run runtime identity to Secret Manager and Google Cloud APIs.
7. Repository and CI to deployment artifacts.

## 5. Threat register

| ID | Threat and attack path | Required controls | Mandatory verification | Residual risk |
|---|---|---|---|---|
| T01 | Anonymous caller invokes a protected route. | Verify a Firebase ID token before protected processing; deny by default. | Every protected route returns a generic 401 without a token. | Public endpoint still receives traffic; rate limits remain necessary. |
| T02 | Attacker submits a forged, expired, wrong-project, or revoked token. | Admin SDK verification; issuer/audience binding; revocation-aware checks for sensitive operations. | Token-negative test matrix. | Ordinary token revocation may be bounded by token lifetime unless checked on every request. |
| T03 | User supplies another uid or ownerUid. | Ignore client identity fields; derive uid from verified token; reject server-authoritative fields. | User A cannot act on User B by changing body, query, route, or headers. | Authorization bugs in new handlers remain possible without centralized guards. |
| T04 | User enumerates or guesses another personal object ID. | Ownership check on every object; non-sequential IDs; generic not-found/forbidden behavior. | Cross-user tests for read, update, delete, summarize, export, and retrieval. | Object existence timing differences require review. |
| T05 | Org A member substitutes Org B's orgId or object ID. | Verify active membership before data access; verify target belongs to authorized org. | Cross-org matrix across every organization endpoint and retrieval path. | Complex future team scopes may add policy errors. |
| T06 | User promotes themselves or abuses an invitation. | Server-controlled roles; authorized inviter; one-time expiring invite; transactional recheck; audit receipt. | Member cannot invite/promote/remove unless allowed; replayed/expired invite fails. | Compromised owner account retains legitimate owner powers. |
| T07 | Organization owner accesses an employee's personal workspace. | Personal and organization authorization domains are independent; no role bridge. | Owner/admin receives no personal data through API, retrieval, analytics, export, or errors. | A user may voluntarily disclose similar information in organization scope. |
| T08 | Direct Firestore client access bypasses the API. | Deny confidential client access in Firestore rules; do not ship privileged credentials. | Emulator tests deny anonymous and authenticated client reads/writes. | Server SDK bypasses rules; IAM and application authorization remain critical. |
| T09 | Server service account is overprivileged. | Dedicated keyless identity; least-privilege Firestore access; secret-level accessor grant. | IAM evidence review; no Owner/Editor; no service-account keys. | Some Google predefined roles may still be broader than ideal. |
| T10 | Global vector search reveals semantically similar records from another tenant. | Scope-specific collections/indexes; authorize before query; no post-retrieval tenant filtering. | Seed near-identical memories in different scopes and prove zero cross-scope candidates. | Datastore or index configuration drift can reintroduce leakage. |
| T11 | Retrieved document instructs Gemini to ignore policy, switch tenant, reveal secrets, or call tools. | Treat content as delimited evidence; fixed server-selected scope/tools; validate outputs and actions independently. | Injection corpus cannot change tenant, tool allowlist, authorization, or secret handling. | Injection may still influence harmless generated prose. |
| T12 | Model fabricates object IDs, roles, provenance, or action arguments. | Strict schemas; server lookup and authorization; reject unknown fields; action confirmation. | Fabricated and malformed outputs cannot read, write, or execute. | Valid-looking inaccurate prose remains possible and must be presented as AI output. |
| T13 | Gemini or service credential appears in source, frontend bundle, response, log, or screenshot. | Secret Manager; server-only calls; repository and history scanning; log redaction. | Secret scan, bundle scan, response inspection, and log review. | A developer may disclose a secret outside repository controls. |
| T14 | Raw private content appears in logs or monitoring. | Structured metadata-only logging; centralized redaction; no request/response body logging. | Canary private strings do not appear in logs, traces, errors, or alerts. | Third-party runtime errors need review for payload capture. |
| T15 | Stored or reflected XSS through user or model text steals tokens or changes UI. | Safe rendering, no unsanitized HTML, CSP, output encoding, avoid persistent tokens in insecure storage. | XSS payload corpus renders inert; CSP verification. | Browser extensions and compromised dependencies remain outside complete control. |
| T16 | Misconfigured CORS allows hostile origin access. | Exact origins, allowed headers/methods, no wildcard with credentials. | Preflight tests for approved and hostile origins. | CORS is not authorization; non-browser clients can still call public endpoints. |
| T17 | Oversized prompts, loops, retries, or many accounts create denial of service or cost abuse. | Request/model bounds, per-user/global rate limits, timeouts, bounded retries, max instances, quotas and alerts. | Boundary and load tests; forced model failures do not create retry storms. | Distributed abuse may require stronger edge controls after MVP. |
| T18 | Error response exposes stack traces, paths, queries, secrets, or tenant existence. | Generic client errors; sanitized structured server diagnostics; correlation IDs. | Fault injection and response/log review. | Rare framework-level failures must be tested in deployed configuration. |
| T19 | Deleting a memory leaves an embedding, summary, cache, or citation retrievable. | Transactional deletion workflow or tombstone plus reliable cleanup; derived-artifact inventory. | Deleted source disappears from history, direct access, retrieval, summaries, and citations. | Asynchronous cleanup creates a bounded delay that must be visible and tested. |
| T20 | Private content is silently copied into an organization. | No automatic transfer; explicit preview and confirmation; create a new org record; action receipt. | No background or model-driven share; canceled sharing creates nothing. | Users can intentionally share sensitive content and need clear UX. |
| T21 | Supply-chain dependency or CI action executes malicious code. | Minimal dependencies, lockfiles, provenance review, immutable action SHAs, read-only workflow permissions, dependency scanning. | Dependency review and CI configuration audit. | Trusted upstream compromise remains possible. |
| T22 | Repository history contains removed credentials or private fixtures. | Pre-commit and CI scanning; synthetic fixtures; rotate and purge immediately after exposure. | Full-history secret scan on every push. | Hosted forks or caches may preserve already-published material. |
| T23 | File upload exploits parser, storage, or prompt processing. | Feature remains disabled until type/signature, size, decompression, malware, metadata, access, and injection controls are implemented. | Upload threat-model extension and adversarial file suite required before release. | Complex parser vulnerabilities cannot be eliminated completely. |
| T24 | Voice records without awareness or retains raw audio unintentionally. | Feature remains disabled until visible recording state, consent, transport, retention, deletion, and fallback controls exist. | Verify raw audio is not retained by default and deletion is complete. | Provider-side processing terms and retention require review. |
| T25 | Organization analytics become employee surveillance. | Analyze only organization-scope records; prohibit private-source ingestion and sensitive employee profiling. | Dataset lineage proves no personal sources; prohibited insight tests. | Organization-authored content may still contain personal information. |
| T26 | Race condition changes membership between authorization and write. | Transactional authorization check or immediate recheck; idempotency and optimistic concurrency. | Concurrent remove/member-action tests. | Distributed timing edge cases require datastore-specific testing. |
| T27 | Cached response or CDN serves confidential content to another user. | No public caching for authenticated responses; private/no-store headers; cache key includes verified scope if caching is approved. | Response-header and cross-session cache tests. | Browser history and local device compromise remain user-environment risks. |

## 6. Release blockers

Release is blocked by:

- a known Critical or High finding;
- any failing T03, T04, T05, T07, T08, T10, T11, T13, T19, or T20 verification;
- any committed or deployed credential exposure;
- undocumented external data transfer or retention;
- a security claim without implementation and evidence;
- an enabled gated feature without its threat-model extension.

## 7. Review record

| Version | Date | Scope | Reviewer | Outcome |
|---|---|---|---|---|
| 1.0 | 2026-08-30 | Phase 1 architecture baseline | Project owner review pending | Proposed |
