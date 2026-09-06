# Cognaxis repository instructions

## Mission

Maintain Cognaxis as a secure cognitive memory platform for people and teams. Favor a stable, clear product without weakening identity, authorization, tenant isolation, provenance, deletion, secret handling, privacy, or accessibility.

## Current state

The product includes personal and team reflections, streamed Gemini guidance, summaries and tags, scoped Ask Me retrieval, attachments and transient voice transcription, personal check-ins and insights, maps, organization roles and invitations, and metadata-only platform administration.

The stack is React, TypeScript, Vite, Express, Firebase Authentication and Admin, Cloud Firestore, Firebase Storage, Gemini through `@google/genai`, Secret Manager, and Cloud Run on Node.js 22.

## Project skill

Use `.agents/skills/cognaxis-secure-development/SKILL.md` for Cognaxis work. It routes to the architecture, security, testing, and deployment references appropriate to a change.

## Non-negotiable boundaries

- Verify Firebase ID tokens on every protected request and derive the UID from the verified token.
- Authorize ownership or active organization membership and role before any data access, retrieval, Gemini call, or write.
- Keep personal and organization data and semantic queries in separate scope-rooted paths.
- Never make private content available to an organization automatically.
- Keep Gemini credentials, Admin SDK access, and Secret Manager permission out of the browser.
- Treat requests, uploads, retrieved records, and model output as untrusted.
- Validate structured output and provenance before storage or use.
- Keep platform administration metadata-only.
- Remove or invalidate derived data when its source is deleted or archived.
- Do not log content, tokens, secrets, coordinates, invite fragments, or raw provider errors.

## Product conventions

- Cognaxis is a reflective cognitive workspace, not a generic assistant or autonomous agent.
- Viewers can read team content but cannot create team reflections; viewer-only teams stay out of the Journal creation selector.
- Journal context is current-session only. Ask Me is the cross-reflection retrieval surface.
- Ask Me is the authorized cross-reflection retrieval surface and returns grounded source citations.
- Check-ins are explicit self-reports and insights are non-clinical.
- Location is opt-in and raw voice audio is transient by default.
- Preserve the established visual system, responsive behavior, accessible names, keyboard paths, and explicit loading, empty, and error states.

## Change standards

For security-relevant work, identify the affected asset and trust boundary, preserve enforceable controls, and add positive and negative tests. Keep changes cohesive, centralize authorization, and validate external input with strict schemas.

Run the checks proportionate to the change. The full local gate is `npm run test:all`; Firestore rules and transaction changes also use `npm run test:emulator`.

## AI Studio and deployment

The maintained release flow is local development, GitHub sync, AI Studio Preview, and AI Studio publish to Cloud Run. Tests run locally and in GitHub, not as a deployment prerequisite inside AI Studio.

Cloud Run environment variables, Secret Manager references, runtime identity, IAM, service labels, instance limits, Firebase console settings, Firestore indexes, and browser-key restrictions are managed deployment configuration. Preserve their names and verify them through the deployment checklist.

## Repository integrity

- Use `package-lock.json` as the only lockfile.
- Never commit credentials, production user or organization IDs, private content, environment exports, build artifacts, or temporary generated files.
- Do not add co-author trailers or automated-tool attribution.
- Preserve required third-party notices.
- Do not commit, push, publish, change IAM, or mutate production data without explicit authorization for that action.
