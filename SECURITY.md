# Security Policy

Cognaxis stores private reflections and organization knowledge. Security reports are taken seriously, especially issues involving authentication, authorization, tenant isolation, secret exposure, retrieval scope, or deletion.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the repository owner privately through the contact method listed on their GitHub profile and include:

- the affected route, feature, or commit;
- a clear reproduction using synthetic data;
- the impact and scope you observed;
- any logs or screenshots after removing tokens, credentials, email addresses, user IDs, organization IDs, journal text, and other private content.

Please do not access another person's records, run destructive tests against production, create excessive traffic, or disclose a finding before it has been reviewed.

## Supported version

The latest commit on the default branch is the supported development version.

## Security model

Cognaxis follows these invariants:

- Firebase ID tokens are verified on every protected backend request.
- The effective user ID comes only from the verified token.
- Active organization membership and role are resolved server-side before organization access.
- Personal and organization data use separate Firestore paths and retrieval scopes.
- Authorization happens before Firestore reads, semantic ranking, Gemini calls, and writes.
- The browser does not receive Gemini credentials, Admin SDK credentials, or Secret Manager access.
- Model and retrieved text are treated as untrusted data, not as authorization instructions.
- Structured model output is validated before persistence or use.
- Private API responses are not publicly cacheable, and client errors are sanitized.
- Source deletion removes or invalidates its summaries, semantic index, check-ins, and other derived records.

The checked-in Firestore client rules deny direct confidential access. The backend uses Firebase Admin, which bypasses those rules, so the server's authorization and the Cloud Run service account's IAM are the primary controls.

## Secrets

Never commit or paste any of the following into source, documentation, issues, screenshots, fixtures, or browser configuration:

- Gemini API keys;
- service-account JSON or private keys;
- Firebase ID or refresh tokens;
- invitation tokens;
- password-reset or email-verification action links;
- real journal content or production user and organization identifiers.

Firebase web configuration and a Maps browser key are public identifiers, not server secrets, but they must be restricted to the required APIs and approved origins. Every `VITE_*` variable is embedded in the browser bundle.

Production uses a dedicated keyless Cloud Run identity, least-privilege Firestore and Storage access, and secret-specific Secret Manager access. Owner and Editor roles are not appropriate for the runtime identity.

## Verification

Before a security-relevant change is merged or published, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run security:check
npm audit --audit-level=high
```

Use `npm run test:emulator` for Firestore rules and transaction changes, and add cross-user or cross-organization negative tests whenever a tenant boundary changes. Full testing guidance is in [docs/testing/AUTOMATED_TESTING.md](docs/testing/AUTOMATED_TESTING.md).

## Operational verification

Source controls are complemented by deployment controls including IAM, API restrictions, authorized domains, private Storage, Secret Manager bindings, quotas, and monitoring. Verify these settings for every production environment using the [Cloud Setup Checklist](docs/deployment/CLOUD_SETUP_CHECKLIST.md).

The implemented trust boundaries and verification coverage are documented in [Security Architecture](docs/architecture/SECURITY_ARCHITECTURE.md), [Threat Model](docs/security/THREAT_MODEL.md), and [Security Test Plan](docs/security/SECURITY_TEST_PLAN.md).
