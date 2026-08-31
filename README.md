# Cognaxis

Cognaxis is a security-first personal intelligence journal. An authenticated user can hold a multi-turn conversation with Gemini, preserve the conversation in a private Firestore scope, and save structured summaries as personal memories.

The ideathon MVP deliberately keeps personal and organization authorization domains separate. Organization features remain disabled until their membership workflow is implemented and tested; an organization role never grants access to a person's private journal.

## Implementation status

Implemented locally:

- React + TypeScript + Vite authenticated interface;
- Firebase Google Sign-In and SDK-managed token lifecycle;
- authenticated API client using Firebase bearer tokens;
- Express API with Firebase Admin token verification;
- server-derived personal Firestore paths;
- personal sessions, messages, summaries, and cascade deletion;
- server-only Gemini calls with bounded context and structured summary validation;
- Secret Manager credential adapter using Application Default Credentials;
- Zod validation, exact-origin CORS, security headers, body limits, private caching, redacted errors, and rate limits;
- deny-by-default Firestore client rules;
- synthetic cross-user and negative security tests.

Still requires external configuration before live use:

- attach Firebase to the ideathon Google Cloud project;
- enable Google Sign-In and register authorized domains;
- create the Firestore database in the selected region;
- create the Gemini secret and dedicated Cloud Run runtime identity;
- grant secret-specific and datastore-specific IAM;
- configure Cloud Run environment values and deploy;
- run emulator and deployed synthetic-user security tests.

No real credentials belong in this repository.

## Architecture

```text
Untrusted browser
  -> Firebase Authentication
  -> HTTPS Express API with Firebase ID token
      -> verify token and derive uid
      -> validate and authorize before data access
      -> users/{verifiedUid}/personalSessions/...
      -> users/{verifiedUid}/personalMemories/...
      -> Gemini with minimum authorized context
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
- [Cloud Setup Checklist](docs/deployment/CLOUD_SETUP_CHECKLIST.md)

## Repository policy

Enable the versioned commit-message policy after cloning:

```bash
git config core.hooksPath .githooks
```

No commit or push is performed without the project owner's explicit approval. Do not add automated-tool attribution or co-author trailers. Preserve required third-party licenses.

## License

No license has been selected. All rights are reserved until the project owner chooses one explicitly.
