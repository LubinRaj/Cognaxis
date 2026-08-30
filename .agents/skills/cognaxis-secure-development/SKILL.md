---
name: cognaxis-secure-development
description: Design, implement, or review Cognaxis changes under its security constitution, especially authentication, personal/organization tenancy, Firestore, Gemini, retrieval, uploads, voice, secrets, and Cloud Run. Use only within the Cognaxis repository.
---

# Cognaxis Secure Development

Use this skill for Cognaxis architecture, implementation, security review, and release-gate work.

## Load the applicable contract

Before changing a trust boundary, read:

1. [AI Studio Security Constitution](../../../docs/security/AI_STUDIO_SECURITY_CONSTITUTION.md)
2. [Security Architecture](../../../docs/architecture/SECURITY_ARCHITECTURE.md)
3. [Threat Model](../../../docs/security/THREAT_MODEL.md)
4. [Security Test Plan](../../../docs/security/SECURITY_TEST_PLAN.md)

For ordinary presentation-only changes, read only the constitution and the relevant implementation files. For authentication, authorization, storage, retrieval, model/tool use, uploads, voice, logging, secrets, deployment, or dependencies, read all four documents.

## Work from enforceable boundaries

Model instructions may shape development but cannot enforce runtime access. Place identity verification, authorization, tenant filtering, validation, retention, and action approval in deterministic server or datastore controls.

Preserve these invariants:

- derive user identity from a verified Firebase token;
- authorize organization membership and role before access or retrieval;
- keep personal and organization paths and semantic queries scope-specific;
- send Gemini only already-authorized, minimum necessary context;
- validate model output before persistence or action;
- keep secrets server-side and private content out of logs;
- require explicit confirmation before copying private information into an organization;
- cascade deletion to summaries, embeddings, indexes, and caches.

## Security-change workflow

For a security-relevant change:

1. State the asset, actor, trust boundary, threat, attack path, mitigation, and residual risk.
2. Prefer the smallest design that preserves the security contract.
3. Implement authorization before data access and validation before side effects.
4. Add a positive test and meaningful negative tests. Include cross-user or cross-organization attempts whenever tenancy is involved.
5. Run repository checks and the relevant test suite.
6. Update the threat model, test plan, and evidence record when behavior or assurance changes.

Do not silently weaken a control, invent evidence, claim perfect security, or expand the product scope to satisfy a failing test or deadline.

## Repository conventions

Do not commit credentials, raw private data, co-author trailers, or automated-tool attribution. Preserve required third-party notices. Keep generated changes reviewable and explain material security tradeoffs in the pull request or decision record.
