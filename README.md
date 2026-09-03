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

## Local development

Requirements:

- Node.js 22 or newer;
- a Firebase project configuration for interactive sign-in;
- Application Default Credentials or Firebase emulators for backend integration;
- a non-production Gemini credential only when exercising real model calls locally.

Install dependencies and create local configuration:

```bash
npm ci
cp .env.example .env.local
```

Fill only the required local values. Never place service-account JSON, private keys, or production secrets in the repository. Start the frontend and API:

```bash
npm run dev
```

The browser and API run together at `http://localhost:3000`; in development, Express mounts Vite
as middleware so the frontend and `/api` remain on the same local origin.

Without Firebase configuration, Cognaxis intentionally displays a configuration-required screen instead of a fake authenticated demo.

## Cloud Run deployment

These instructions deploy the reviewed checkout as one public Cloud Run service: Express serves the
compiled React application and the authenticated `/api/v1` routes. Run them from the repository root
using the Google Cloud CLI and Docker. Replace only the values marked with angle brackets.

### 1. Select the project and deployment values

```bash
export PROJECT_ID="ideathon-journal"
export REGION="asia-south1"
export SERVICE="cognaxis"
export RUNTIME_SA_NAME="cognaxis-runtime"
export RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
export SECRET_NAME="cognaxis-gemini-api-key"
export REPOSITORY="cognaxis"
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/cognaxis:$(git rev-parse --short HEAD)"

gcloud auth login
gcloud config set project "$PROJECT_ID"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
```

Export the public Firebase web-app identifiers from Firebase Console **Project settings > Your
apps > Web app > SDK setup and configuration**:

```bash
export VITE_FIREBASE_API_KEY="<firebase-web-api-key>"
export VITE_FIREBASE_AUTH_DOMAIN="<project>.firebaseapp.com"
export VITE_FIREBASE_PROJECT_ID="$PROJECT_ID"
export VITE_FIREBASE_APP_ID="<firebase-web-app-id>"
```

Firebase web configuration is visible in every browser bundle by design; it identifies the Firebase
app but does not authorize database access. Restrict that key to the required Firebase APIs, never
allow the Generative Language API on it, keep `firestore.rules` deny-by-default, and use a separate
server-only Gemini key.

For the private map, create one additional dedicated **Maps JavaScript browser key** and export it:

```bash
export VITE_GOOGLE_MAPS_API_KEY="<restricted-maps-browser-key>"
```

This key is compiled into the browser bundle by design and is a public identifier, not a secret.
Before deploying, in Google Cloud **APIs & Services > Credentials**:

1. add website (HTTP referrer) restrictions for `http://localhost:3000/*` and the exact production
   Cloud Run origin;
2. restrict the key's APIs to the **Maps JavaScript API only** — never Gemini/Generative Language,
   Secret Manager, or any privileged Cloud API;
3. set quotas and a budget alert for the key;
4. never reuse it for server-side web-service calls; a future server geocoding need requires a
   different key in Secret Manager.

If the variable is absent at build time, Cognaxis still works: the map page and location previews
degrade to accessible list and coordinate views without contacting any third party.

### 2. Enable services and prepare the runtime identity

Enable the APIs and create the Artifact Registry repository and dedicated service account once. If a
resource already exists, verify it instead of recreating it.

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com

gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Cognaxis release images"

gcloud iam service-accounts create "$RUNTIME_SA_NAME" \
  --display-name="Cognaxis Runtime"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/datastore.user"

gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

Do not grant this runtime identity Owner or Editor and do not download a service-account key. Cloud
Run supplies Application Default Credentials to the selected identity.

Create the Gemini secret only if it does not exist, then add the key without placing it in a command,
file, screenshot, or shell history. Paste the value when prompted and finish input with `Ctrl-D`:

```bash
gcloud secrets create "$SECRET_NAME" --replication-policy=automatic
gcloud secrets versions add "$SECRET_NAME" --data-file=-
```

Select the newest enabled numeric version without reading its value:

```bash
export SECRET_VERSION="$(gcloud secrets versions list "$SECRET_NAME" \
  --filter='state=ENABLED' \
  --sort-by='~createTime' \
  --limit=1 \
  --format='value(name)')"
test -n "$SECRET_VERSION"
```

Create Firestore in Native mode in `asia-south1` if it has not already been created. Then deploy the
versioned deny-by-default client rules and the composite indexes required by the extended queries:

```bash
firebase login
firebase deploy --only firestore:rules,firestore:indexes --project "$PROJECT_ID"
```

### 3. Build and push the reviewed image

Run the repository verification suite before producing the image:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run security:check
```

Build the browser with the public Firebase configuration and push the resulting image. Never pass the
Gemini key or a service-account credential as a Docker build argument.

```bash
gcloud auth configure-docker "${REGION}-docker.pkg.dev"

docker build --platform linux/amd64 \
  --build-arg "VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}" \
  --build-arg "VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}" \
  --build-arg "VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}" \
  --build-arg "VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}" \
  --build-arg "VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}" \
  --tag "$IMAGE" \
  .

docker push "$IMAGE"
```

### 4. Deploy with the mandatory challenge label

The first deployment uses a temporary denied origin only to obtain the generated Cloud Run URL. The
second command immediately replaces it with the exact production origin. The required ideathon label
must remain on every deployment:

```bash
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="$RUNTIME_SA" \
  --allow-unauthenticated \
  --ingress=all \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=20 \
  --timeout=60s \
  --min-instances=0 \
  --max-instances=3 \
  --set-env-vars="APP_ORIGIN=https://pending.invalid,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GEMINI_MODEL=gemini-3.7-flash,GEMINI_API_KEY_SECRET=projects/${PROJECT_NUMBER}/secrets/${SECRET_NAME}/versions/${SECRET_VERSION},FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}" \
  --labels="dev-tutorial=cloud-run-ai-challenge"

export SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --format='value(status.url)')"

gcloud run services update "$SERVICE" \
  --region="$REGION" \
  --update-env-vars="APP_ORIGIN=${SERVICE_URL}" \
  --update-labels="dev-tutorial=cloud-run-ai-challenge"
```

`GEMINI_API_KEY_SECRET` deliberately references a pinned numeric secret version. Never set
`GEMINI_API_KEY_LOCAL` or `GOOGLE_APPLICATION_CREDENTIALS` on Cloud Run.

### 5. Complete Firebase production configuration

In Firebase Authentication:

1. Add the hostname from `$SERVICE_URL` (without `https://`) to **Settings > Authorized domains**.
2. Confirm Google and Email/Password providers are enabled.
3. Keep the approved password policy at 8-128 characters and email-enumeration protection enabled.
4. If Firebase permits custom email action URLs, set the handler to
   `${SERVICE_URL}/auth/action`; otherwise retain Firebase's hosted handler and document that limitation.

Restrict the Firebase browser key to the required Firebase APIs and approved web origins. App Check is
a recommended post-MVP hardening layer; it does not replace Firebase Authentication, backend token
verification, authorization, or Firestore rules.

### 6. Bootstrap the first super admin

There is deliberately no HTTP endpoint that can create a platform administrator. After the target
person has signed in to the deployed application at least once, the project owner runs the
reviewed offline script with credentials that may write to Firestore:

```bash
GOOGLE_CLOUD_PROJECT="$PROJECT_ID" npx tsx scripts/admin/bootstrap-super-admin.ts <uid>
```

In one transaction it promotes `platformUsers/<uid>` and initializes the
`platformControl/access` active-super-admin counter. Until this has been run, every admin role or
status mutation fails closed with `ACCESS_CONTROL_UNINITIALIZED`.

Server-enforced feature flags (`FEATURE_INSIGHTS`, `FEATURE_MAPS`, `FEATURE_ORGANIZATIONS`,
`FEATURE_ADMIN`) default to enabled; set any of them to `false` in the Cloud Run environment to
disable a module and hide its navigation without a code change.

### 7. Verify the release

```bash
curl --fail --silent --show-error "${SERVICE_URL}/api/health"

gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --format='yaml(metadata.labels,spec.template.spec.serviceAccountName,status.url)'
```

The health endpoint must return `{"status":"ok"}`. The service description must show:

- `dev-tutorial: cloud-run-ai-challenge` under `metadata.labels`;
- `cognaxis-runtime@ideathon-journal.iam.gserviceaccount.com` as the runtime identity;
- the submitted public Cloud Run URL.

Finally, use synthetic accounts to walk the deployed journeys: Google sign-in, email verification,
password reset, one real Gemini conversation with persistence and deletion, a check-in with an
approximate location, a generated daily recap, the private map, an organization with an invited
viewer who can read but not write, an Org B account that cannot reach Org A, and the super admin
seeing metadata and audit events but no private artifact. Confirm private API calls without a valid
Firebase token return `401`, that a suspended synthetic account is blocked without data loss,
inspect Cloud Run logs for redaction, and verify the browser bundle contains no Gemini key,
service-account credential, or private content.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run security:check
npm audit
```

`npm audit` currently reports a documented Moderate transitive advisory inherited through Firebase Admin's optional Cloud Storage dependency. Cognaxis does not invoke the affected UUID buffer APIs or Cloud Storage. It remains tracked in [the dependency risk register](docs/security/DEPENDENCY_RISK_REGISTER.md); no forced downgrade or incompatible override is permitted merely to make the report empty.

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
