# Phase 4 Evidence — Extended Features Remediation and Completion

Date: 3 September 2026
Scope: Full implementation of `docs/plans/EXTENDED_FEATURES_IMPLEMENTATION_SPEC.md` as corrected
and extended by `docs/plans/EXTENDED_FEATURES_REMEDIATION_IMPLEMENTATION_SPEC.md`.
Baseline commit: `c2f9628` (audited as not releasable). All work is uncommitted in the local tree
by explicit project-owner instruction.

## 1. Remediation phases and gates

| Phase | Delivered | Gate result |
|---|---|---|
| R0 — Build stabilization | `package-lock.json` regenerated from the reviewed manifest; `bun.lock` removed; Cloud Run `PORT` honored via validated config with a startup test; the tautological `mock-tests-complete.test.ts` and unused `vitest-mock.ts` (and its lint exclusion) deleted | Clean `npm ci`, typecheck, lint, tests, build, and security check pass |
| R1 — Shared security foundation | One private pipeline (`authenticate → per-user rate limit → verified email → live platform-status upsert/enforcement → no-store`) in front of every feature router including the original journal; `/me/capabilities` with server-enforced feature flags; sanitized error logging (route templates and error categories only — no messages, stacks, or bodies); CSP without production inline scripts or broad wildcards; CORS methods matching the implemented API | Suspended accounts are denied on every private route before any repository or model call |
| R1b — Routing shell | `react-router-dom` routes with deep links, refresh, history, unknown-route handling, lazy feature chunks, post-sign-in return to the attempted path, and full private-state reset on uid change | Routing component suite passes |
| R2 — Signals, preferences, dashboard | Editable check-in dialog (load, edit, remove, input preserved on failure), strict schemas, timezone-validated preferences, honest approximate-location rounding, session-deletion cascade, deterministic 7/30/90-day dashboard with gaps kept as gaps and an accessible chart + table | Cross-user, boundary, cascade, and accessibility tests pass; no model call is needed for metrics |
| R3 — Grounded insights | ISO day/week period model with year-transition tests; real Gemini generation behind a strict schema, evidence-subset check, clinical-language rejection, request-id idempotency, fingerprint reuse, explicit regeneration, staleness marking from signal/session/summary changes and deletions, a Firestore-backed per-user-and-period generation lease, and a per-instance rate limit | Invalid output is never stored; duplicate requests never duplicate model cost |
| R4 — Google Maps | `VITE_GOOGLE_MAPS_API_KEY` across Vite typing, `.env.example`, Dockerfile, and README with key-restriction steps; the Google-documented Maps JavaScript API CSP allowlist gated by the maps flag; official `@googlemaps/js-api-loader` imported only inside lazily loaded map surfaces; owner-scoped `/personal/map-points` projection; map page with a synchronized accessible list and honest list-only fallback; the unapproved OpenStreetMap fallback removed with the deleted prototype | Journaling works without Maps; coordinates stay out of logs, admin, organization, and audit surfaces |
| R5 — Organization RBAC | Rebuilt on the DI repository pattern with in-memory and transactional Firestore implementations; dual membership edges, member counts, invites, and audit written atomically; one-time hashed fragment-carried invites with in-transaction revalidation and constant-time comparison; the complete role matrix as a pure tested function; organization conversations, summaries, and Gemini isolation; recent-auth on sensitive mutations; complete list/detail/members/invites/settings UI and the `/join` flow | The full role/action, cross-org, replay, and late-write matrices pass |
| R6 — Super admin | Offline bootstrap script initializing `platformControl/access` from a transactional count of active super admins; role/status mutations as one transaction over target + counter + audit with self-target denial and last-admin protection (verified under concurrency and the uninitialized-counter fail-closed path); real metadata counters where failure reads "Unavailable", never zero; cursor-paginated user directory; organization suspension; append-only audit browsing; admin UI with confirmation-and-reason dialogs | Canary private content appears in no admin response; ordinary and suspended-admin accounts are denied everywhere |
| R7 — Release evidence | `firestore.indexes.json` + `firebase.json` reference; README, threat model v1.2 (T34–T44), security test plan v1.2, dependency register updates; this report | Final verification below |

## 2. Verification from a clean state (Node 22 toolchain, npm 11)

```
npm ci                → clean install, lockfile unchanged
npm run typecheck     → 0 errors (client, server, node tests, component tests)
npm run lint          → 0 problems
npm test              → 58 files, 611 tests, all passing (node + jsdom projects; counts as of
                        the audit remediation — see AUDIT_REMEDIATION_EVIDENCE.md)
npm run build         → vite build + server tsc succeed; entry chunk 1, lazy feature chunks
npm run security:check→ bundle inspection and repository policy checks pass
npm audit             → 6 moderate findings, all the documented pre-existing D-01 path;
                        no high or critical findings; no new advisory from the two added packages
```

The suite was executed repeatedly during development, but a rare parallel-run flake (roughly one
run in twenty) survived this phase and was root-caused later: desktop applications on the
development machine hold `127.0.0.1`-specific listeners in the ephemeral port range, and
supertest's wildcard-bound ephemeral servers could land on such a port, delivering a foreign,
header-less 404/401. `tests/setup/node-setup.ts` now allocates test ports from a quiet fixed band
with conflict retry; see `docs/evidence/AUDIT_REMEDIATION_EVIDENCE.md` for the reproduction
evidence and the consecutive-run verification that replaced this claim.

## 3. What replaced the audited commit

The audited commit's extended server layer called `getFirestore()` directly inside middleware and
routes, bypassed the repository/DI pattern, shipped a fake `InsightService` (no Gemini, no period
filtering, fabricated "focus hours" advice), let organization admins invite and remove admins,
validated invitations outside the acceptance transaction, and exposed placeholder admin metrics.
All of it was deleted and rebuilt: 11 server files and 6 client component files from that commit
were removed, and the proven baseline `WorkspaceShell`, `WorkspaceAppBar`, and `api-client` were
restored before being extended. The useful ideas that survived are the Firestore path layout, the
signal document-per-session model, hashed invitation secrets, and the added Material icon names
(which previously had no SVG implementations and rendered nothing).

## 4. Defects found beyond the remediation document

- `Dialog`'s focus trap re-ran its effect whenever the parent re-rendered (the inline `onClose`
  changed identity), yanking focus from inputs after the first keystroke in any dialog whose state
  lives in the parent. Fixed in `use-focus-trap.ts` with a latest-ref escape handler; the create-
  organization dialog test now types full values.
- `documentIdSchema` (min 12 chars) silently rejected real Firebase UIDs in member-management
  routes; member targets now use a dedicated uid schema.
- The audited commit's five new icon names had no SVG cases and rendered `null`.

## 5. Endpoint inventory (all behind the shared private pipeline)

- `GET /me/capabilities`
- Journal: `GET/POST /sessions`, `GET /sessions/:id`, `POST /sessions/:id/messages`,
  `POST /sessions/:id/summarize`, `DELETE /sessions/:id` (revocation-checked + recent auth)
- Personal: `GET/PUT /personal/preferences`; `GET/PUT/DELETE /sessions/:id/signals`;
  `GET /personal/map-points` (maps flag); `GET /personal/insights/dashboard`,
  `GET /personal/insights/periods`, `POST /personal/insights/:type/:key/generate`
  (uuid idempotency + 10/15-min limit), `DELETE /personal/insights/:key` (insights flag)
- Organizations (organizations flag; recent auth on every starred mutation):
  `GET/POST /organizations`; `GET/PATCH* /organizations/:id`; `GET /…/members`;
  `PATCH*/DELETE* /…/members/:uid`; `GET/POST* /…/invites`; `DELETE* /…/invites/:id`;
  `POST /…/invites/:id/preview|accept`; `GET /…/audit-events`;
  `GET/POST /…/sessions`; `GET /…/sessions/:id`; `POST /…/sessions/:id/messages|summarize`;
  `DELETE* /…/sessions/:id`
- Admin (admin flag + live super-admin check + 30/min limit; recent auth + reason on mutations):
  `GET /admin/overview|users|organizations|audit`; `PATCH /admin/users/:uid/role|status`;
  `PATCH /admin/organizations/:id/status`

There is no admin or organization endpoint for personal sessions, messages, memories, signals,
insights, locations, exports, or search.

## 6. Data paths and indexes

New/extended paths: `users/{uid}/settings/preferences`, `users/{uid}/personalSignals/{sessionId}`,
`users/{uid}/personalInsights/{periodKey}`, `users/{uid}/organizationMemberships/{orgId}`,
`organizations/{orgId}` with `members/{uid}`, `invites/{id}`, `auditEvents/{id}`,
`workspaceSessions/{id}` (messages/exchanges), `workspaceSummaries/session_{id}`,
`platformUsers/{uid}`, `platformControl/access`, `platformUsageDaily/{date}`,
`platformAdminAudit/{id}`. Composite indexes are versioned in `firestore.indexes.json`
(personalInsights periodType+periodStart; platformUsers role/status × lastSeenAt) and deployed via
`firebase deploy --only firestore:rules,firestore:indexes`. No collection-group or global query
touches personal content; the only collection-scope queries added are within one owner or one
organization subtree.

## 7. Not done in this environment (external or blocked)

- **Firebase emulator rules tests and Docker container build**: the emulator suite needs a Java
  runtime and the Docker daemon was not running on this machine. The lockfile root cause of the
  audited Docker failure is fixed (`npm ci` is clean). Deny-all rules tests now exist in
  `tests/emulator/firestore-rules.test.ts` behind `npm run test:rules`
  (`firebase emulators:exec`); they typecheck but have not been executed here because neither a
  JDK nor the Firebase CLI is installed, and they are not claimed as passing.
- **Deployed smoke tests** (real Firebase/Firestore/Gemini/Maps, Cloud Run `PORT=8080` probe,
  log/bundle canary review in production): require the owner's cloud access and approval.
- **Google Cloud configuration**: Maps key creation/restriction, index deployment, super-admin
  bootstrap, and feature-flag env values are documented but must be executed by the owner.
- **Visual/AT verification** (screenshots across widths and themes, screen-reader pass, measured
  contrast): no browser automation was permitted in this session; structural accessibility
  (labels, roles, keyboard paths, live regions, chart/table and map/list equivalents) is asserted
  in jsdom.

## 8. Residual risks

- The clinical-language rejection list is finite; the system instruction is the primary control.
- The pending-invite hand-off stores the invite secret in `sessionStorage` only while the
  recipient signs in; strict CSP bounds exposure and the value is cleared on completion/failure.
- Admin "reason" text is operator-supplied free text shown only on the admin audit surface.
- The six moderate `npm audit` findings remain the documented D-01 chain
  (`firebase-admin → @google-cloud/storage → uuid`), with no reachable call path in Cognaxis.
- Organization directory listing for admins is capped at 50 without cursors in this release.

## 9. Confirmation

No commit, push, deployment, Google Cloud/Firebase change, IAM change, secret creation, or live
network test was performed. All changes exist only in the local working tree.
