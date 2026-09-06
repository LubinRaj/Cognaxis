---
name: cognaxis-secure-development
description: Build, fix, review, or document Cognaxis while preserving its personal/team scope boundary, Firebase identity, Firestore retrieval, Gemini, privacy, and Cloud Run conventions. Use only inside the Cognaxis repository.
---

# Cognaxis Secure Development

Use this skill for Cognaxis product, code, documentation, security, or release work.

## Load only what applies

- Read [Architecture](../../../docs/architecture/SECURITY_ARCHITECTURE.md) before changing data flow, memory, organization roles, Gemini context, or runtime structure.
- Read [AI Studio Custom Instructions](../../../docs/security/AI_STUDIO_SECURITY_CONSTITUTION.md) when changing the persistent AI Studio prompt, deployment workflow, or cross-cutting engineering conventions.
- Read [Threat Model](../../../docs/security/THREAT_MODEL.md) and [Security Test Plan](../../../docs/security/SECURITY_TEST_PLAN.md) for authentication, authorization, storage, retrieval, uploads, voice, secrets, logging, IAM, dependencies, or deletion changes.
- Read [Cloud Setup Checklist](../../../docs/deployment/CLOUD_SETUP_CHECKLIST.md) only for deployment or external configuration work.

For presentation-only changes, inspect the relevant UI and tests without loading every security reference.

## Product boundaries

Cognaxis is a secure cognitive memory for people and teams, not a generic chatbot or autonomous agent.

- Personal journals, check-ins, insights, attachments, and memory remain owner-only.
- Team memory contains only records created in that organization.
- Organization roles never grant personal access.
- Viewers can read shared reflections and use team Ask Me, but cannot create team reflections. Exclude viewer-only teams from the Journal creation selector.
- Platform administration exposes operational metadata only, never journal or memory content.
- Check-ins are explicit self-reports, insights are non-clinical, location is opt-in, and raw voice audio is transient by default.

## Enforceable invariants

- Verify a Firebase ID token on every protected request and derive the UID only from that token.
- Authorize ownership or active organization membership and role before any read, semantic ranking, Gemini call, or write.
- Keep personal and organization Firestore, Storage, and memory queries scope-rooted.
- Treat user input, uploads, retrieved text, and model output as untrusted.
- Validate structured model output and provenance before persistence or use.
- Keep Gemini credentials and Admin SDK privileges server-side. Every `VITE_*` value is public.
- Use bounded context, retrieval, uploads, output, retries, rate limits, and timeouts.
- Keep authenticated responses private/no-store and logs free of content, tokens, coordinates, invite secrets, and raw provider errors.
- Cascade deletion to messages, exchanges, summaries, memory chunks, signals/check-ins, attachments, and derived insight state.

## Memory behavior

Ask Me searches pre-authorized personal or organization memory and validates grounded citations. Journal conversation context remains scoped to the selected reflection.

When changing retrieval, prove that tenant scope is applied before ranking and that deleted or archived sources cannot reappear. Add near-identical cross-user and cross-organization negative cases.

## Change workflow

For a security-relevant change:

1. Identify the asset, actor, trust boundary, credible misuse, and current enforcement point.
2. Make the smallest cohesive change with authorization before access and validation before side effects.
3. Add a positive behavior test and meaningful negative tests. Include cross-user, cross-organization, stale-role, or forged-provenance cases when relevant.
4. Run focused checks, then the appropriate type, lint, test, build, emulator, and repository-security gates.
5. Update documentation when product behavior, data paths, environment variables, or external configuration changes.

Never fabricate evidence, describe external cloud configuration as verified from source, weaken a control to satisfy a test, or add a dependency/service without a concrete need.

## AI Studio and release conventions

The normal release path is local work, GitHub sync, AI Studio Preview, and AI Studio publish to Cloud Run. Tests run locally and in GitHub; AI Studio only needs install, build, and start.

Cloud Run environment values, secret references, runtime identity, IAM, labels, instance limits, Firebase settings, and API-key restrictions are managed deployment configuration. Ordinary code publishing must not rename, replace, or hardcode them; verify them through the release checklist.

## Repository integrity

Keep one npm lockfile. Do not commit secrets, production IDs, private content, emulator state, generated build output, or local-only artifacts. Preserve required licenses and use synthetic test data only.
