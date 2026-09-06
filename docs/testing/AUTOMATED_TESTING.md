# Automated Testing

Cognaxis uses layered automated verification with synthetic data and local test services.

| Layer | Tool | Coverage |
|---|---|---|
| Unit and component | Vitest, Testing Library | Schemas, services, role policy, state handling, accessibility, and UI behavior |
| API integration | Vitest, Supertest | Authentication, validation, tenant isolation, authorization, rate limits, and error contracts |
| Firebase emulator | Emulator Suite | Firestore Security Rules, repository queries, transactions, and indexes |
| Browser end-to-end | Playwright | Authentication, reflections, Ask Me, check-ins, insights, maps, teams, administration, settings, and accessibility |
| Repository security | Project scripts and CI | Sensitive files, browser bundles, source maps, lockfiles, dependency severity, and secret scanning |

## Commands

```bash
npm run typecheck
npm run lint
npm test
npm run test:emulator
npm run test:e2e
npm run build
npm run security:check
npm run test:all
```

The Firestore emulator requires Java. Browser tests start their required local services automatically.

## Security coverage

Automated suites verify:

- authenticated and verified-user boundaries;
- personal and organization isolation;
- owner, admin, member, viewer, and super-admin permissions;
- Firestore direct-client denial;
- scoped retrieval and citation validation;
- attachment, voice, location, signal, and insight boundaries;
- archive, restore, deletion, and derived-data cleanup;
- input validation, error redaction, secure headers, private caching, and rate limiting;
- keyboard interaction and serious or critical accessibility findings.

## Test safety

- Use synthetic identities, content, organizations, and files.
- Use emulator-only Firebase projects for automated Firebase tests.
- Block unintended network access from local browser tests.
- Keep production smoke testing separate and explicitly configured.
- Never run destructive, adversarial, or bulk tests with a real user's account or data.
- Do not hide failures with weakened assertions or automatic retries.

GitHub verification runs type checks, linting, automated tests, a production build, repository policy checks, dependency severity checks, and secret scanning. Deployment remains an explicit action.
