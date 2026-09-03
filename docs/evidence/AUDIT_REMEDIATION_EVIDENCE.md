# Audit Remediation Evidence — Sixteen Confirmed Findings

Date: 3 September 2026
Baseline: uncommitted working tree on top of commit `c2f9628`.
All changes remain uncommitted in the local tree for human review, by explicit instruction.
Nothing was committed, pushed, deployed, or changed in Google Cloud or Firebase.

## Per-finding outcomes

### F1 — Production static assets resolved above the repository root
`src/server/app.ts` resolved `../../../dist/client`, one level too high for both the source and
compiled layouts, and served the SPA HTML for missing assets and unknown API paths. Fixed to
`../../dist/client`, with `/assets` misses returning a real JSON 404 and `/api` paths always
falling through to the API pipeline. `tests/integration/production-static.test.ts` builds the real
client bundle and proves the deep link, real asset, missing asset, health, and unknown-API cases;
a live production boot smoke is recorded under Verification below. **Verified locally.**

### F2 — Gemini request contract
All sampling parameters (`temperature`, and any `topP`/`topK`) were removed from
`conversation-model.ts` and `insight-model.ts`; requests carry only model, contents,
`systemInstruction`, `maxOutputTokens`, response schema/mime type, and a 20-second timeout, and
never end with a prefilled model turn. `tests/unit/gemini-contract.test.ts` asserts this at the
SDK boundary. A live request against the deployed Gemini 3.7 endpoint was **not** made: no Gemini
credential exists in this environment and live calls were not authorized. **Code verified
locally; live smoke externally pending.**

### F3 — Organization authorization revalidated at write time
Workspace writes (`createSession`, `saveMessageExchange`, `saveSummary`, `deleteSession`) now take
an actor constraint and re-read the organization's status and the actor's membership inside the
same Firestore transaction that persists the write; the in-memory workspace repository is linked
to the organization repository and fails closed when unlinked. The generate-then-short-transaction
shape is preserved — no transaction spans a model call. Race tests hold the model reply open,
remove the member (or suspend the organization) mid-flight, and prove nothing persisted
(`tests/unit/organization-service.test.ts`, "in-flight authorization races"). **Verified locally.**

### F4 — Member mutations transactionally correct
`updateMembership`/`removeMembership` now accept a pure decision plan evaluated inside the write
transaction against the freshly read actor and target memberships; the seniority matrix and the
audit `from`/`to` values always reflect commit-time state, and an already-applied change writes no
duplicate audit. Concurrency tests cover a target promoted mid-flight, an actor removed
mid-flight, and audit accuracy under a concurrent identical change. **Verified locally.**

### F5 — Super-admin mutations, atomic organization-status audit, bootstrap
`applyAdminMutation` re-reads the acting user inside the transaction and requires an active super
admin; audit transitions are derived from the transaction-read target. Organization suspension and
its platform audit event now commit in one transaction
(`setOrganizationStatusWithAudit`, with the in-memory implementation linked to the organization
repository). `bootstrapFirstAdmin` derives the counter from a transactional count of active super
admins — never zero while the promoted target is active — and the script reports clear
instructions when the target is missing or the count cannot be established.
`tests/unit/platform-admin-service.test.ts` covers the actor recheck, racing demotion, counter
states, bootstrap recovery from a stale counter, and audit atomicity. **Verified locally.**

### F6 — Cross-instance insight generation lease
The in-process `Set` guard was replaced by a Firestore-backed lease scoped to user **and** period:
one short transaction acquires it, a 60-second expiry reclaims it after a crash, no transaction
spans the model call, and it is released in `finally`. Request-id replays return the stored
insight without touching the lease; fingerprint reuse is unchanged. Two-service-instance tests
cover blocking, per-period scoping, release after failure, expiry takeover, and replay under a
foreign lease (`tests/unit/insight-service.test.ts`, "insight generation lease"). Message-exchange
duplicate protection remains the transactional request-id idempotency in the data layer.
**Verified locally.**

### F7 — Insight grounding and prompt safety
Every narrative pattern must cite at least one supplied record id (`minItems: 1` in the schema and
the shared Zod schema); citations outside the authorized source set are rejected; causal wording
(caused/produces/guarantees/explains/because-of/leads-to) joins the diagnostic rejection list;
the stored `model` field records the configured model identifier; prompt records are embedded as
JSON-serialized data with a round-trip inertness test against embedded instructions.
**Verified locally.**

### F8 — Staleness keyed to the affected session's period
Content-change listeners carry the session's own `createdAt`; invalidation maps it through the
user's saved timezone to that session's day/week periods, so editing an older reflection marks the
older period stale — not the current one. Covered in `journal-service` and `insight-service`
unit tests. **Verified locally.**

### F9 — Maps CSP and MapCanvas lifecycle
The CSP now carries the Google-documented Maps JavaScript API allowlist (script/img/connect/frame
plus `worker-src blob:`), gated on `FEATURE_MAPS`, asserted in integration tests for both flag
states. `MapCanvas` gained a ready state so markers and center supplied during the asynchronous
library load render once it completes, and unmount removes all map/marker listeners and detaches
markers. `tests/component/map-canvas.test.tsx` drives a deferred loader mock through initial
markers, late center, cleanup, and load failure. **Verified locally.**

### F10 — Honest legal surfaces
New public `/privacy` and `/terms` routes (lazy chunks) describe storage, Gemini processing with
the paid-tier training caveat attributed to Google's terms, approximate-location retention,
exports, deletion, admin metadata-only access, and the Google Maps Platform Terms of Service
acknowledgement with links. The unconditional "not used to train it" claim in the account menu was
rewritten to attribute the paid-tier statement to Google's API terms. Landing footer and the auth
legal note link to both pages; routing tests render them unauthenticated. **Verified locally.**

### F11 — Validation corrections
Malformed pagination cursors — including structurally valid cursors with unparseable dates — now
fail with 400 `INVALID_CURSOR` instead of silently restarting the listing (strict decoding in both
platform-user repositories). Admin target ids parse via `safeParse` to 400, journal list queries
via `safeParse` to 400. The admin overview counts organizations with a Firestore `count()`
aggregate, and the admin organization listing filters status inside the query. The documented
50-member organization cap is enforced inside the invite-acceptance transaction
(409 `ORGANIZATION_FULL`), which also keeps the 200-member edge-rename bound safe. The default map
range is computed in the user's saved timezone as `[today−89, today]` — no future day. All covered
by unit/integration tests. **Verified locally.**

### F12 — Per-operation rate limits
On top of the shared pipeline: journal model routes 12/min per user, organization model routes
12/min per user, invitation create/preview/accept 10/15 min per user, admin mutations 10/15 min
per user. Integration tests exhaust the journal model and invitation budgets. These counters are
explicitly **per running instance** (documented in code, README, and the security test plan); the
cross-instance duplicate protections are transactional in the data layer. **Verified locally.**

### F13 — Firestore rules tests
`@firebase/rules-unit-testing` added as a dev dependency; `tests/emulator/firestore-rules.test.ts`
asserts the deny-all rules against unauthenticated, authenticated-owner, and collection-sweep
access for every collection in the data model, via `npm run test:rules`
(`firebase emulators:exec` with a dedicated vitest config outside the default projects). The file
typechecks in `tsconfig.test.json`. It was **not executed** here: this machine has neither a Java
runtime nor the Firebase CLI. These tests are authored, not green. **Authored + typechecked;
execution externally pending.**

### F14 — Parallel-run flake root cause
Reproduced repeatedly (three symptom shapes, roughly one full run in twenty). Diagnostics added
along the way (response-body/header-revealing assertions in `tests/setup/node-setup.ts`, server
log replay on failure) produced the decisive evidence: the flaky 404/401 responses carried **no
`x-request-id` and no body** — they never touched the application. Cause: supertest binds each
ephemeral server to the wildcard address inside the OS ephemeral port range, where desktop
applications on this machine (VS Code helpers, ChatGPT — observed via `lsof`) hold long-lived
`127.0.0.1`-specific listeners; a collision routes loopback connections to the foreign process.
Fix: test servers allocate ports synchronously from a quiet fixed band (20000–28999, pid-spread,
conflict retry) instead of the ephemeral range; keep-alive is also disabled for test agents. No
retries were added and no assertion was weakened. Stability evidence: 30 consecutive node-project
runs, then **five consecutive full-suite runs (611 tests each) under normal parallel settings, all
passing** — recorded under Verification. **Verified locally.**

### F15 — Verification gates (this environment)

```
rm -rf node_modules && npm ci   → clean install from the committed lockfile
npm run typecheck               → 0 errors (client, server, node tests, component tests)
npm run lint                    → 0 problems
npm test × 5 (consecutive)      → 58 files, 611 tests, 5/5 runs fully passing
npm run build                   → vite build + server tsc succeed (informational chunk-size note)
npm run security:check          → bundle inspection and repository policy checks pass
npm audit --audit-level=high    → exit 0; six moderate findings remain (documented D-01 chain)
production boot smoke           → NODE_ENV=production node dist-server/server/index.js:
                                  /api/health 200 · / 200 html · /app/journal 200 ·
                                  real asset 200 · missing asset 404 JSON ·
                                  unknown /api path 401 through the pipeline · CSP present ·
                                  structured sanitized logs only
bundle secret scan              → no Gemini, Secret Manager, or service-account material in
                                  dist/client; the only `AIza…` value is the Firebase Web API
                                  key from VITE_FIREBASE_API_KEY, public by design
npm run test:rules              → NOT EXECUTED (no JDK, no Firebase CLI on this machine)
Docker image build              → NOT EXECUTED (Docker daemon not running on this machine)
live Gemini smoke               → NOT EXECUTED (no credentials here; live calls not authorized)
```

### F16 — Documentation corrections
The false "no flaky failures remaining" claim in the Phase 4 evidence was replaced with the real
history and this report's reference; the insight "one-at-a-time guard" wording in the threat model
and security test plan now describes the cross-instance lease; the Maps CSP wording names the
Google-documented allowlist; the bootstrap description notes the transactional count; the README
documents per-operation limits as per-instance; the emulator-tests wording states plainly that the
rules tests are authored but unexecuted here. No document claims "production-ready" or "fully
secure".

## Remaining limitations (unchanged by this work)

- Emulator rules tests, the Docker image build, live Gemini/Maps smoke tests, index deployment,
  Maps key restriction, super-admin bootstrap, and feature-flag configuration require the owner's
  environment and approval.
- Per-operation rate limits bound spend per instance only; platform-wide ceilings scale with
  instance count.
- The six moderate `npm audit` findings remain the documented `firebase-admin →
  @google-cloud/storage → uuid` chain with no reachable call path in Cognaxis.
- The causal/diagnostic wording rejection lists are finite; the system instruction remains the
  primary control.
