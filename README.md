# Cognaxis

Secure cognitive memory for people and teams.

Cognaxis turns reflections, decisions, blockers, check-ins, and shared updates into permission-scoped memory that can be revisited later. Gemini guides the conversation, creates structured summaries, and answers questions from authorized personal or team history with source links.

[Live application](https://cognaxis.ai.studio) | [Security policy](SECURITY.md) | [Architecture](docs/architecture/SECURITY_ARCHITECTURE.md)

## Demo

- [Working prototype](https://cognaxis.ai.studio)
- [Demo social post](https://x.com/Lubin_Raj/status/2096653930914865446?s=20) (`#AccelerateAIwithCloudRun`)

## Why Cognaxis

Useful context is usually scattered across private notes, chats, and meetings. Cognaxis creates two deliberately separate memory spaces:

- **Personal memory:** a private journal, check-ins, reflections, summaries, insights, and Ask Me search visible only to the account owner.
- **Team memory:** organization-owned reflections and summaries shared according to a server-enforced role model.

Personal content is never made available to an organization merely because its owner belongs to that organization. Scope is authorized before Firestore retrieval or Gemini invocation.

## Core capabilities

- Multi-turn personal and team reflections with streamed Gemini responses
- AI-generated titles, tags, structured summaries, and grounded source citations
- Personal and team Ask Me retrieval using scoped Firestore vector search with bounded lexical fallback
- Image and document attachments plus transient voice transcription
- Optional private mood, energy, emotion, note, and location check-ins
- Deterministic 7, 30, and 90-day dashboards with grounded daily and weekly recaps
- Reflection archive, restore, export, permanent deletion, and derived-data cleanup
- Organization creation, invitations, owner/admin/member/viewer roles, and audit events
- Metadata-only platform administration that cannot read journal content
- Google and email/password authentication with verified-email enforcement

## Architecture

```text
React + Vite browser
  |  Firebase ID token over HTTPS
  v
Express API on Cloud Run
  |  verify identity and active account
  |  resolve personal or organization scope
  |  authorize role before every read, retrieval, model call, and write
  |
  +--> Firebase Authentication
  +--> Cloud Firestore
  +--> Firebase Storage
  +--> Gemini API through a server-only secret
  +--> optional Agent Platform fallback through Cloud Run identity
```

The browser never receives a Gemini key, Admin SDK credential, service-account key, or Secret Manager permission. Confidential Firestore access is server-side; the checked-in Firestore client rules deny direct reads and writes.

For request flows, data paths, retrieval behavior, and security boundaries, see the [architecture document](docs/architecture/SECURITY_ARCHITECTURE.md).

## Firestore security and user isolation

Cognaxis includes deployable Firestore Security Rules in [`firestore.rules`](firestore.rules). Because confidential database access is performed by the Cloud Run backend rather than the browser, the client rules deliberately deny every direct read, write, and query:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

User isolation is enforced in two layers:

1. The rules above prevent anonymous and authenticated web/mobile clients from bypassing the API.
2. Cloud Run verifies the Firebase ID token, derives the UID from the verified token, and constructs personal paths under `users/{verifiedUid}/...`. Organization access similarly requires active membership and a server-resolved role before Firestore access.

Firebase Admin bypasses Firestore Security Rules, so the backend combines verified-identity authorization with a least-privilege runtime identity. Confidential data is not exposed through a browser-writable Firestore path.

The reproducible Firebase configuration is checked in as:

- [`firebase.json`](firebase.json): connects the Firebase CLI to the rules and index files.
- [`firestore.rules`](firestore.rules): deny-all direct-client policy.
- [`firestore.indexes.json`](firestore.indexes.json): composite and vector indexes used by the API.
- [`.env.example`](.env.example): variable names and safe placeholders only.

## Technology

| Layer | Technology |
|---|---|
| Client | React 19, TypeScript, Vite, Tailwind CSS |
| API | Node.js 22, Express 5, Zod |
| Identity | Firebase Authentication and Firebase Admin token verification |
| Data | Cloud Firestore and Firebase Storage |
| AI | Gemini API through `@google/genai` |
| Runtime | Google Cloud Run and Secret Manager |
| Quality | Vitest, Testing Library, Playwright, Firebase Emulator Suite, ESLint |

## Local setup

Prerequisites:

- Node.js 22 LTS
- A Firebase project with Authentication enabled
- Google Cloud CLI with Application Default Credentials for the server
- Firebase CLI; Java is additionally required for emulator-based rules tests
- A Gemini API key for local development

```bash
git clone https://github.com/LubinRaj/Cognaxis.git
cd Cognaxis
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Populate `.env.local` with your own project values. Environment files other than `.env.example` are ignored by Git.

### Configuration

| Variable | Exposure | Purpose |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Browser identifier | Firebase web application configuration |
| `VITE_FIREBASE_AUTH_DOMAIN` | Browser identifier | Firebase Authentication domain |
| `VITE_FIREBASE_PROJECT_ID` | Browser identifier | Firebase project identifier |
| `VITE_FIREBASE_APP_ID` | Browser identifier | Firebase web application identifier |
| `APP_ORIGIN` | Server configuration | Exact browser origin accepted by the API |
| `GOOGLE_CLOUD_PROJECT` | Server configuration | Google Cloud project used by the backend |
| `GEMINI_MODEL` | Server configuration | Gemini model name |
| `GEMINI_API_KEY` | **Secret** | Server-only Gemini credential |
| `FIREBASE_STORAGE_BUCKET` | Server configuration | Private attachment bucket |
| `FIREBASE_AUTH_DOMAIN` | Server configuration | Authentication frame CSP allowlist |
| `VITE_GOOGLE_MAPS_API_KEY` | Restricted browser key | Optional Maps JavaScript API key |
| `AGENT_PLATFORM_FALLBACK_ENABLED` | Server configuration | Enables the optional keyless fallback |
| `FEATURE_*` | Server configuration | Enables or disables optional product areas |

Never add `VITE_` to a secret name. Vite embeds all `VITE_*` values in the browser bundle.

## Useful commands

```bash
npm run dev             # local client and API
npm run typecheck       # application and test type checks
npm run lint            # static analysis
npm test                # unit, component, and API integration tests
npm run build           # production client and server build
npm run security:check  # repository and client-bundle policy checks
npm run test:e2e        # local Chromium journeys
npm run test:emulator   # Firestore rules and repository tests; requires Java
npm run test:all        # complete local verification gate
```

Tests use synthetic identities and local emulators. Do not point destructive or bulk tests at production.

## Reproduce and deploy

### 1. Prepare Firebase and Google Cloud

In a new project:

1. Create a Firestore Native mode database and a Firebase web app.
2. Enable the Firebase Authentication providers you intend to expose, then add the local and deployed hostnames to Authentication's authorized domains.
3. Create a private Firebase Storage bucket when attachments are enabled.
4. Enable Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Firestore, and the Gemini API used by the project.
5. Create a dedicated keyless Cloud Run service account. Grant only the required Firestore, Firebase Authentication viewer, bucket-level Storage object, and secret-specific Secret Accessor permissions. Do not grant Owner or Editor.

### 2. Deploy Firestore rules and indexes

Run this from the repository root after authenticating the Firebase CLI. The explicit project argument avoids committing a production project ID in `.firebaserc`:

```bash
npx firebase deploy \
  --only firestore:rules,firestore:indexes \
  --project YOUR_PROJECT_ID
```

The deny-all rules can also be copied from `firestore.rules` into **Firebase Console → Firestore Database → Rules → Publish**. Composite indexes can be created in the console, but deploying `firestore.indexes.json` is the reproducible path. Wait until every required composite and vector index reports ready before testing administration or Ask Me.

### 3. Configure the application

Copy `.env.example` to `.env.local` for local development and replace only the placeholders with values from your own project. Then authenticate the server without downloading a service-account key:

```bash
gcloud auth application-default login
npm run dev
```

For production, configure the public `VITE_*` Firebase values as build settings and the server values listed above as runtime settings. Store the Gemini key in Secret Manager and expose it to Cloud Run as `GEMINI_API_KEY`; do not add the value to source, a Docker image, or a plaintext committed environment file.

### 4. Publish through AI Studio

The maintained release flow is local verification, GitHub push, Google AI Studio sync, Preview, and AI Studio publish to Cloud Run. The build contract is `npm ci`, `npm run build`, and `npm start`.

After publishing, verify that AI Studio preserved the environment variables, Secret Manager reference, runtime service account, IAM bindings, instance limits, and required campaign label. Apply the challenge label if it is absent:

```bash
gcloud run services update SERVICE_NAME \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=REGION \
  --project=YOUR_PROJECT_ID
```

Run the release checks in the [cloud setup checklist](docs/deployment/CLOUD_SETUP_CHECKLIST.md) against synthetic accounts. Publishing code must never be allowed to replace external security settings with placeholder values.

## Repository structure

```text
src/client/       React application and Firebase Auth client
src/server/       Express API, authorization, services, and repositories
src/shared/       Shared schemas and domain types
tests/            Unit, component, integration, emulator, and browser tests
scripts/          Reviewed administrative and repository-safety utilities
docs/             Architecture, deployment, security, and testing references
.agents/skills/   Cognaxis-specific development skill
```

## Security and privacy

Please read [SECURITY.md](SECURITY.md) before reporting a vulnerability or changing a trust boundary. The project uses least-privilege IAM, server-side authorization, scope-specific storage and retrieval, structured validation, exact-origin CORS, private caching, bounded requests, generic client errors, and secret scanning.

No real credentials, production identifiers, private journal content, or production data belong in this repository.

## Retrieval architecture

Cognaxis creates scope-rooted semantic memory from reflections, summaries, tags, and authorized attachment text. Ask Me searches only the selected personal or organization scope, validates sources before returning citations, and uses a safe text-retrieval path when semantic search is unavailable. See [Architecture: Memory and Ask Me](docs/architecture/SECURITY_ARCHITECTURE.md#memory-and-ask-me).

## License

No open-source license has been selected. The source is publicly viewable, but reuse rights are not granted until the owner adds a license.
