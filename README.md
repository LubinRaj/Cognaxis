# Cognaxis

Cognaxis is a secure personal and organizational intelligence platform that turns conversations, reflections, updates, and decisions into permission-scoped memory and actionable intelligence.

## Current status

The repository is in **Phase 1: security and development foundation**. Application implementation has intentionally not started. The current work establishes the security constitution, trust boundaries, threat model, test gates, and development rules that must govern every generated or hand-written change.

## Product principle

Personal information remains private. Organizational intelligence may use only information created in, or explicitly copied into, an authorized organization workspace. Organization ownership or administrative roles never grant access to another person's private workspace.

## Planned production architecture

```text
Browser
  -> Firebase Authentication
  -> Cloud Run API (token verification and authorization)
      -> Firestore (scope-specific collections)
      -> tenant-scoped semantic retrieval
      -> Gemini (minimum authorized context only)
      -> Secret Manager (server-side secret access)
```

The browser will not call Gemini directly and will not perform sensitive Firestore reads or writes. Runtime authorization is enforced by the backend and datastore rules—not by model instructions.

## Security foundation

- [AI Studio Security Constitution](docs/security/AI_STUDIO_SECURITY_CONSTITUTION.md)
- [Security Architecture](docs/architecture/SECURITY_ARCHITECTURE.md)
- [Threat Model](docs/security/THREAT_MODEL.md)
- [Security Test Plan](docs/security/SECURITY_TEST_PLAN.md)
- [Phase 1 Evidence Checklist](docs/evidence/PHASE_1_EVIDENCE.md)
- [Security Policy](SECURITY.md)

## Local repository safeguards

Enable the versioned commit-message policy after cloning:

```bash
git config core.hooksPath .githooks
```

Run the repository policy check locally:

```bash
bash scripts/security/check-repository.sh
```

The repository must never contain application secrets, private keys, service-account key files, ID tokens, raw private journal data, or unnecessary production identifiers.

## Assurance target

No software can honestly be described as 100% secure. The release target is: no known Critical or High findings; all mandatory tenant-isolation and authorization tests pass; secrets are absent from source, browser bundles, and logs; and remaining risks are documented with an owner and disposition.

## License

No license has been selected yet. All rights are reserved until a license is added explicitly.
