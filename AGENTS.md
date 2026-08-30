# Cognaxis repository instructions

## Mission

Build Cognaxis as a production-oriented, security-first personal and organizational intelligence platform. Optimize for a convincing, stable ideathon MVP without weakening identity, authorization, tenant isolation, secret management, privacy, or evidence quality.

## Current phase

The repository is currently establishing the Phase 1 security foundation. Do not generate application scaffolding, choose a framework, provision cloud resources, or implement product features unless the user explicitly advances the project into implementation.

## Authoritative documents

Read these before designing or changing a trust boundary:

1. `docs/security/AI_STUDIO_SECURITY_CONSTITUTION.md`
2. `docs/architecture/SECURITY_ARCHITECTURE.md`
3. `docs/security/THREAT_MODEL.md`
4. `docs/security/SECURITY_TEST_PLAN.md`

When documents conflict, prefer the stricter security invariant and flag the conflict before implementation.

## Non-negotiable invariants

- Verify Firebase ID tokens on every protected backend request.
- Derive the effective user ID from the verified token; never authorize with a client-provided user ID.
- Resolve organization membership and role server-side before any organization read, retrieval, model call, or write.
- Keep personal and organization records in scope-specific paths and queries.
- Authorize before retrieval. Never retrieve globally and filter afterward.
- Never expose Gemini credentials, privileged service credentials, or Secret Manager access to browser code.
- Treat retrieved content, uploads, model output, and tool arguments as untrusted.
- Validate structured model output before storage or action.
- Never move private content into an organization automatically.
- Never log raw journals, prompts, model responses, ID tokens, secrets, or uploaded private content.
- A source deletion must remove or invalidate every derived summary, embedding, and retrieval artifact.
- High-impact or external actions require explicit user confirmation and independent server-side authorization.

## Change workflow

Before implementing a feature that touches authentication, authorization, data storage, retrieval, Gemini, uploads, voice, external integrations, or deployment:

1. Identify the assets and trust boundaries affected.
2. Describe likely abuse cases and attack paths.
3. Define enforceable mitigations below the model layer.
4. Add positive and negative tests, including cross-user and cross-organization cases when applicable.
5. Record residual risk or defer the feature if the risk cannot be bounded safely.

Keep changes small and reviewable. Reuse established modules and schemas once they exist. Do not introduce a dependency, cloud service, browser permission, data field, or logging sink without explaining why it is necessary.

## Code and verification standards

- Prefer TypeScript strict mode and explicit schemas when the application stack is selected.
- Validate at every external boundary and reject unknown fields for security-sensitive inputs.
- Use parameterized APIs and framework-safe output encoding; do not build queries, HTML, paths, or commands from untrusted strings.
- Return generic client errors and keep sanitized diagnostic details server-side.
- Bound request size, conversation length, retrieval count, retries, timeouts, and model cost.
- Pin production and CI dependencies, review provenance, and avoid abandoned packages.
- Tests must verify behavior and authorization outcomes, not merely snapshots or generated wording.
- Do not claim a security control exists until its enforcement and test evidence exist.

## Repository integrity

- Never commit secrets or realistic private user content.
- Do not add co-author trailers or automated-tool attribution to commits, source files, generated documentation, or user-facing copy.
- Preserve all legally required third-party copyright, attribution, and license notices.
- Do not weaken checks merely to make CI pass. Fix the cause or document an explicit, time-bounded exception.
