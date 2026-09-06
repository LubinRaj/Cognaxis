# Security Test Plan

Last reviewed: 7 September 2026

All security tests use synthetic users, organizations, content, files, and locations.

## Required coverage

### Identity and sessions

- Protected APIs reject absent or invalid Firebase authentication.
- Verified identity is derived from the server-validated token.
- Email verification and active-account status are enforced before private access.
- Sign-out and account switching clear private client state.
- Authentication recovery is bounded and does not reinterpret authorization or server failures.

### Personal isolation

- A user can access only personal sessions, messages, summaries, memories, attachments, check-ins, insights, settings, and locations rooted in that verified identity.
- Foreign identifiers do not reveal another user's records or record existence.
- Client-supplied ownership and scope fields cannot alter authorization.

### Organization isolation and roles

- Organization access requires active membership.
- Owner, admin, member, and viewer permissions follow the centralized role policy.
- Organization roles never grant access to personal data.
- Invitations are expiring, single-use, integrity-protected, and transactionally accepted.
- Membership and role changes are revalidated during sensitive writes.

### Firestore and Storage

- Anonymous and authenticated browser clients cannot directly read, write, or query confidential Firestore collections.
- Cloud Run database operations remain bound to the verified personal or organization scope.
- Attachments are private, scope-rooted, validated, and available only through authorized operations.
- Deletion removes both metadata and associated stored objects or derived records.

### AI and retrieval

- Gemini receives only authorized context.
- Personal and organization retrieval remain in separate scopes.
- Retrieved content cannot override policy, authorization, tenant selection, or tool access.
- Structured output and citations are validated against the authorized source set.
- Model and persistence failures preserve recoverable user input and never create a completed partial exchange.

### Administration and privacy

- Ordinary and suspended accounts cannot access platform administration.
- Super-admin responses contain operational metadata only.
- Logs, responses, audits, bundles, and repository files contain no credentials or private journal content.
- Security headers, origin policy, private caching, request bounds, and rate limits are active.

## Release commands

```bash
npm run typecheck
npm run lint
npm test
npm run test:emulator
npm run test:e2e
npm run build
npm run security:check
npm audit --audit-level=high
```

Verify IAM, Secret Manager references, Firebase providers and authorized domains, Firestore index status, Storage privacy, browser-key restrictions, quotas, labels, and monitoring through the deployment checklist.
