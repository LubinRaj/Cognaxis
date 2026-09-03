# Cognaxis

**A security-first personal intelligence journal and evolving organizational intelligence platform built with Gemini and Google Cloud.**

Cognaxis combines an authenticated conversational workspace with permission-scoped memory, structured reflection summaries, personal signal tracking, periodic insights, and role-aware organization surfaces. Its core design rule is simple: authorize before retrieval, keep private and organization data in separate scopes, and never rely on the model to enforce access control.

> **Project status:** active development. The application and automated test suite run locally; production use still requires the Firebase, Google Cloud, IAM, and deployment steps documented below.

## What the project demonstrates

- **Conversational intelligence:** multi-turn Gemini conversations with bounded context and schema-validated summaries
- **Private memory:** server-derived Firestore paths for personal sessions, messages, summaries, signals, insights, and cascade deletion
- **Identity and access control:** Firebase authentication, verified-email checks, server-side token verification, platform roles, and organization role enforcement
- **Organization workflows:** organization creation, membership, single-use invitations, team administration, and audit events while personal journals remain separately authorized
- **Platform administration:** protected user, role, status, and high-level metrics surfaces for super administrators
- **Security by construction:** server-only model access, Secret Manager integration, Zod validation, exact-origin CORS, security headers, request limits, redacted errors, and deny-by-default Firestore client rules
- **Verification evidence:** unit, component, integration, negative authorization, accessibility, and repository security checks

## Technology

`React` `TypeScript` `Vite` `Express` `Firebase Auth` `Firestore` `Gemini` `Google Cloud` `Cloud Run` `Secret Manager` `Zod` `Vitest` `Testing Library` `Tailwind CSS`

## Implementation status

Implemented and verified by the local automated suite:

- React + TypeScript + Vite authenticated interface with real routes (`/app/journal`,
  `/app/insights`, `/app/map`, `/app/organizations`, `/app/organizations/:orgId`, `/app/admin`,
  `/join`), deep links, browser history, and lazy-loaded feature modules;
- Firebase Google and email/password sign-in with SDK-managed token lifecycle, verification, and
  password reset;
- Express API behind one shared private pipeline: token verification, per-user rate limiting,
  verified email, live platform-status enforcement, and private/no-store responses;
- personal sessions, messages, summaries, exports, and cascade deletion under
  `users/{verifiedUid}`, including signal and derived-insight cleanup;
- optional per-reflection check-ins (mood and energy 1–5, controlled emotions, private note,
  opt-in exact/approximate location) with strict validation and honest precision reduction;
- deterministic 7/30/90-day insights dashboard computed server-side from self-reports only;
- on-demand daily and weekly Gemini recaps that are grounded, schema-validated,
  evidence-checked, idempotent, staleness-aware, and never stored when invalid;
- a private map endpoint and page with a synchronized accessible list that works without Google
  Maps and upgrades to the official Maps JavaScript API when a restricted browser key is built in;
- organization workspaces with transactional creation, one-time hashed invitations accepted
  atomically, a server-enforced owner/admin/member/viewer matrix, organization-scoped Gemini
  conversations and summaries, settings, member management, and fixed-schema audit events;
- platform administration for an offline-bootstrapped super admin: metadata-only overview and
  usage counters, a paginated user directory, transactional role/status mutations protected by an
  active-super-admin counter, organization suspension, and an append-only audit trail;
- server-enforced feature flags surfaced through `/api/v1/me/capabilities`;
- server-only Gemini calls with bounded context and structured output validation;
- Secret Manager credential adapter using Application Default Credentials;
- Zod validation, exact-origin CORS, security headers, body limits, private caching, sanitized
  logging and errors, and per-operation rate limits (counted per running instance; transactional
  request-id idempotency in the data layer is the cross-instance duplicate protection);
- deny-by-default Firestore client rules and versioned composite indexes;
- 560+ synthetic unit, repository, integration, and component tests covering the cross-user,
  cross-organization, role-matrix, injection, and admin non-disclosure boundaries.

Production deployment also requires the external configuration described below:

- attach Firebase to the ideathon Google Cloud project;
- enable the sign-in providers and register authorized domains;
- create the Firestore database, deploy the deny-all rules and the composite indexes;
- create the Gemini secret and dedicated Cloud Run runtime identity;
- create and restrict a separate Google Maps JavaScript browser key;
- grant secret-specific and datastore-specific IAM;
- configure Cloud Run environment values and deploy;
- bootstrap the first super admin with the reviewed offline script;
- run emulator and deployed synthetic-user security tests.

No real credentials or private user content belong in this repository.

## Architecture

```text
Untrusted browser
  -> Firebase Authentication
  -> Google Maps JavaScript API (only on map/location screens, separate restricted browser key)
  -> HTTPS Express API with Firebase ID token
      -> verify token, derive uid, enforce verified email and active platform status
      -> resolve exactly one scope: personal(uid) | organization(orgId, role) | platform admin
      -> validate and authorize before every Firestore read or Gemini call
      -> users/{verifiedUid}/personalSessions|personalMemories|personalSignals|personalInsights
      -> users/{verifiedUid}/settings/preferences, organizationMemberships (navigation edges)
      -> organizations/{orgId}/members|invites|auditEvents|workspaceSessions|workspaceSummaries
      -> platformUsers, platformControl/access, platformUsageDaily, platformAdminAudit
      -> Gemini with minimum authorized scope-specific context
      -> Secret Manager through Cloud Run runtime identity
```

The browser never receives a Gemini credential, Admin SDK privilege, service-account key, or Secret Manager access. Confidential Firestore client access is denied by `firestore.rules`; the backend remains responsible for authorization because Admin SDK operations bypass those rules.

## Development, preview, and publishing

The supported project workflow is intentionally simple:

1. Develop and review source code locally.
2. Commit and push the reviewed changes to GitHub.
3. Sync the latest GitHub commit into Google AI Studio.
4. Exercise the application in AI Studio Preview.
5. Publish from Google AI Studio; AI Studio builds and deploys the Cloud Run service.
6. Complete the one-time production configuration below, then test the published URL.

Local application startup and local container builds are not part of the normal release path.
There is no CI/CD pipeline: automated tests are development-only tooling run locally when
useful, and the production smoke suite drives the published Cloud Run URL from a local
Playwright runner on demand.

### Production configuration

Google AI Studio must retain the public Firebase web configuration used by the preview and build:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- optional `VITE_GOOGLE_MAPS_API_KEY`

These browser values are identifiers, not authorization secrets. Restrict the Firebase key to the
required Firebase APIs and restrict the Maps key to the Maps JavaScript API and approved website
origins. Never provide the Gemini key, a service-account key, or an Admin SDK credential to the
browser build.

After the first AI Studio publication, open its Cloud Run service through **Advanced settings** and:

1. bind the dedicated keyless runtime identity
   `cognaxis-runtime@ideathon-journal.iam.gserviceaccount.com`;
2. set `APP_ORIGIN` to the exact published HTTPS origin;
3. set `GOOGLE_CLOUD_PROJECT=ideathon-journal`;
4. set `GEMINI_MODEL=gemini-3.7-flash`;
5. add `GEMINI_API_KEY` as a Secret Manager reference exposed as an environment variable
   (pinned numeric version — never paste the raw key);
6. set `FIREBASE_AUTH_DOMAIN` to the exact Firebase authentication domain;
7. decide the `FEATURE_INSIGHTS`, `FEATURE_MAPS`, `FEATURE_ORGANIZATIONS`, and
   `FEATURE_ADMIN` launch flags;
8. apply the required label `dev-tutorial=cloud-run-ai-challenge`.

The runtime identity receives `roles/datastore.user` on the project and
`roles/secretmanager.secretAccessor` only on the Gemini secret. It must not receive Owner or
Editor, and no service-account JSON key is created or uploaded.

In Firebase Console:

1. confirm Google and Email/Password providers, the 8–128 password policy, and enumeration
   protection;
2. create Firestore in Native mode if it does not already exist;
3. publish the repository's deny-by-default `firestore.rules`;
4. create the composite indexes described by `firestore.indexes.json`;
5. add the published Cloud Run hostname to Authentication authorized domains;
6. optionally point authentication email templates to
   `https://<published-origin>/auth/action` after that route has been tested.

The first super administrator is created only by the reviewed offline bootstrap script after that
person has signed in once. There is intentionally no public API for creating the first administrator.

### Production verification

Use dedicated synthetic accounts to verify Google and email sign-in, verification and password
reset, one real Gemini conversation, persistence after refresh, deletion, check-ins and recaps,
Maps or its documented fallback, organization role isolation, and the metadata-only super-admin
surface. Confirm `/api/health` returns `{"status":"ok"}` and the Cloud Run service retains the
required challenge label.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run security:check
npm audit
```

The full local gate, including the Playwright browser suite, is one command (no Java, no running
application, no other setup — everything starts itself):

```bash
npm run test:all
```

Optional extras: `npm run test:emulator` (Security Rules + real Firestore repository
transactions; the only suite that needs a Java runtime) and `npm run test:prod-smoke`
(explicitly invoked smoke of the published Cloud Run URL with a dedicated synthetic account).
The architecture and safety guards are documented in
[docs/testing/AUTOMATED_TESTING.md](docs/testing/AUTOMATED_TESTING.md).

`npm audit --omit=dev` currently reports six Moderate production findings, all one documented
transitive advisory inherited through Firebase Admin's optional Cloud Storage dependency;
Cognaxis does not invoke the affected UUID buffer APIs or Cloud Storage. Full `npm audit`,
including development tooling, currently reports thirteen Moderate findings — the additional
seven are inherited through the pinned Firebase CLI used only for local emulator testing; it is
a development dependency that is never imported by application code. There are no High or Critical
findings. Both chains remain tracked in
[the dependency risk register](docs/security/DEPENDENCY_RISK_REGISTER.md) (D-01, D-02); no
forced downgrade (`npm audit fix --force`) or incompatible override is permitted merely to make
the report empty.

## Security documents

- [AI Studio Security Constitution](docs/security/AI_STUDIO_SECURITY_CONSTITUTION.md)
- [Security Architecture](docs/architecture/SECURITY_ARCHITECTURE.md)
- [Threat Model](docs/security/THREAT_MODEL.md)
- [Security Test Plan](docs/security/SECURITY_TEST_PLAN.md)
- [Phase 1 Evidence Checklist](docs/evidence/PHASE_1_EVIDENCE.md)
- [Phase 2 Implementation Evidence](docs/evidence/PHASE_2_IMPLEMENTATION_EVIDENCE.md)
- [Phase 3 Product UI Evidence](docs/evidence/PHASE_3_PRODUCT_UI_EVIDENCE.md)
- [Phase 4 Extended Features Evidence](docs/evidence/PHASE_4_EXTENDED_FEATURES_EVIDENCE.md)
- [Cloud Setup Checklist](docs/deployment/CLOUD_SETUP_CHECKLIST.md)

## Repository policy

Enable the versioned commit-message policy after cloning:

```bash
git config core.hooksPath .githooks
```

No commit or push is performed without the project owner's explicit approval. Do not add automated-tool attribution or co-author trailers. Preserve required third-party licenses.

## License

No license has been selected. All rights are reserved until the project owner chooses one explicitly.
