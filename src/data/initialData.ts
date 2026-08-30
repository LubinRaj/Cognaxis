import { UserProfile, Organization, Membership, MemoryItem, DecisionRecord, ThreatItem, AuditEvent } from '../types';

export const CURRENT_USER: UserProfile = {
  uid: 'usr_8f29c011e4b',
  email: 'alex.mercer@cognaxis.internal',
  displayName: 'Alex Mercer',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  createdAt: '2026-01-15T09:00:00Z',
};

export const OTHER_USERS: UserProfile[] = [
  {
    uid: 'usr_4a81e92d001',
    email: 'sarah.chen@acmelabs.ai',
    displayName: 'Sarah Chen (VP Eng)',
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    createdAt: '2026-01-10T08:00:00Z',
  },
  {
    uid: 'usr_7b19a32c992',
    email: 'david.vance@acmelabs.ai',
    displayName: 'David Vance (Security Lead)',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    createdAt: '2026-01-12T10:30:00Z',
  },
];

export const INITIAL_ORGANIZATIONS: Organization[] = [
  {
    orgId: 'org_acme_labs_01',
    name: 'Acme AI Labs',
    slug: 'acme-ai-labs',
    description: 'High-throughput enterprise AI intelligence & security-first deployment research group.',
    createdAt: '2026-01-01T00:00:00Z',
    memberCount: 14,
  },
  {
    orgId: 'org_quantum_core_02',
    name: 'Quantum Dynamics',
    slug: 'quantum-core',
    description: 'Applied cryptographic foundations and multi-tenant zero-trust architecture workspace.',
    createdAt: '2026-02-14T00:00:00Z',
    memberCount: 6,
  }
];

export const INITIAL_MEMBERSHIPS: Membership[] = [
  {
    orgId: 'org_acme_labs_01',
    uid: CURRENT_USER.uid,
    role: 'admin',
    joinedAt: '2026-01-15T10:00:00Z',
    invitedBy: 'usr_4a81e92d001',
    status: 'active',
  },
  {
    orgId: 'org_quantum_core_02',
    uid: CURRENT_USER.uid,
    role: 'member',
    joinedAt: '2026-02-16T14:20:00Z',
    invitedBy: 'usr_7b19a32c992',
    status: 'active',
  }
];

export const INITIAL_PERSONAL_MEMORIES: MemoryItem[] = [
  {
    id: 'pmem_9011',
    title: 'Personal Career Milestone & Technical Growth 2026',
    content: 'My goal for this quarter is to lead the tenant-isolation verification engine. I need to balance architectural rigor with shipping velocity. Personal reflection: remember to practice clear asynchronous documentation so team members do not get blocked on implicit knowledge.',
    category: 'reflection',
    tags: ['career', 'personal-goals', 'leadership', 'reflection'],
    scopeType: 'personal',
    scopeId: CURRENT_USER.uid,
    createdBy: CURRENT_USER.uid,
    createdAt: '2026-08-20T14:32:00Z',
    updatedAt: '2026-08-20T14:32:00Z',
    sourceType: 'user_input',
    isSharedToOrg: false,
    derivedInsightCount: 2,
  },
  {
    id: 'pmem_9012',
    title: 'Private Notes on Distributed Zero-Knowledge Verification',
    content: 'Drafting conceptual thoughts on zk-SNARK verifications for confidential inference. Private scratchpad: verify how client-side key generation interacts with Cloud Run runtime ephemeral memory. Keep this confidential until patent review.',
    category: 'note',
    tags: ['cryptography', 'research', 'zk-proofs', 'confidential'],
    scopeType: 'personal',
    scopeId: CURRENT_USER.uid,
    createdBy: CURRENT_USER.uid,
    createdAt: '2026-08-22T09:15:00Z',
    updatedAt: '2026-08-24T11:00:00Z',
    sourceType: 'user_input',
    isSharedToOrg: false,
    derivedInsightCount: 1,
  },
  {
    id: 'pmem_9013',
    title: 'Post-Mortem Reflection on Sprint 34 Latency Spike',
    content: 'Personal notes on what went wrong during Sprint 34: I misjudged the cold-start overhead when loading large tokenizer dictionaries in memory. Going forward, initialize vector caches lazily at the service boundary.',
    category: 'insight',
    tags: ['post-mortem', 'performance', 'latency', 'lessons-learned'],
    scopeType: 'personal',
    scopeId: CURRENT_USER.uid,
    createdBy: CURRENT_USER.uid,
    createdAt: '2026-08-25T16:45:00Z',
    updatedAt: '2026-08-25T16:45:00Z',
    sourceType: 'user_input',
    isSharedToOrg: false,
    derivedInsightCount: 3,
  }
];

export const INITIAL_ORG_MEMORIES: MemoryItem[] = [
  {
    id: 'omem_8011',
    title: 'Zero-Trust API Gateway Specification & Token Verification Gate',
    content: 'All incoming requests to Cloud Run must present a cryptographically verified Firebase ID token. The backend extracts verified claims, binds effective UID, and verifies tenant membership before issuing queries to Firestore or dispatching Gemini prompt contexts.',
    category: 'decision',
    tags: ['architecture', 'api-gateway', 'token-verification', 'security'],
    scopeType: 'organization',
    scopeId: 'org_acme_labs_01',
    createdBy: 'usr_7b19a32c992',
    createdAt: '2026-08-10T11:00:00Z',
    updatedAt: '2026-08-15T15:20:00Z',
    sourceType: 'user_input',
    derivedInsightCount: 4,
  },
  {
    id: 'omem_8012',
    title: 'Tenant-Scoped Semantic Memory Isolation Protocol',
    content: 'Vector search and semantic retrieval must ALWAYS constrain the search space to `organizations/{orgId}/memories` BEFORE computing embeddings or similarity scoring. Global candidate retrieval with post-query filtering is strictly prohibited by security invariant T10.',
    category: 'insight',
    tags: ['semantic-search', 'rag', 'tenant-isolation', 'compliance'],
    scopeType: 'organization',
    scopeId: 'org_acme_labs_01',
    createdBy: CURRENT_USER.uid,
    createdAt: '2026-08-18T13:40:00Z',
    updatedAt: '2026-08-18T13:40:00Z',
    sourceType: 'shared_from_personal',
    provenanceId: 'share_rec_20260818_99a',
    derivedInsightCount: 5,
  },
  {
    id: 'omem_8013',
    title: 'Gemini Model Fencing & Bounded Context Policies',
    content: 'Model input must be fenced with unambiguous delimiter tags (`<AUTHENTICATED_CONTEXT>`, `<USER_QUERY>`). Prompts must enforce schema validation for all structured outputs. High-impact destructive or cross-tenant actions are forbidden from automated model tool dispatch without explicit human confirmation.',
    category: 'decision',
    tags: ['gemini', 'prompt-fencing', 'structured-output', 'safety'],
    scopeType: 'organization',
    scopeId: 'org_acme_labs_01',
    createdBy: 'usr_4a81e92d001',
    createdAt: '2026-08-21T10:10:00Z',
    updatedAt: '2026-08-21T10:10:00Z',
    sourceType: 'user_input',
    derivedInsightCount: 3,
  },
  {
    id: 'omem_8021',
    title: 'Quantum Dynamics Cryptographic Rollout Phase II',
    content: 'Quantum Dynamics workspace policy: all organization session logs are encrypted at rest with tenant-derived envelope keys. Cross-organization lookups are physically prevented at the partition schema level.',
    category: 'update',
    tags: ['encryption', 'envelope-keys', 'quantum-dynamics'],
    scopeType: 'organization',
    scopeId: 'org_quantum_core_02',
    createdBy: 'usr_7b19a32c992',
    createdAt: '2026-08-24T08:30:00Z',
    updatedAt: '2026-08-24T08:30:00Z',
    sourceType: 'user_input',
    derivedInsightCount: 1,
  }
];

export const INITIAL_DECISIONS: DecisionRecord[] = [
  {
    id: 'dec_101',
    orgId: 'org_acme_labs_01',
    title: 'Mandatory Server-Side Prompt Fencing & Authorization Gates',
    context: 'Risk of prompt injection (T11) and unauthorized cross-tenant data retrieval when using LLM assistance for multi-user organizational workflows.',
    decision: 'All LLM calls are mediated exclusively via Cloud Run backend with strict server-side pre-authorization, scope bounding, and output validation. Browser never receives direct Gemini API credentials.',
    rationale: 'Defense in depth: client authorization cannot be delegated to probabilistic LLM instructions.',
    ownerUid: CURRENT_USER.uid,
    status: 'approved',
    createdAt: '2026-08-16T14:00:00Z',
    updatedAt: '2026-08-16T14:00:00Z',
    sourceMemoryIds: ['omem_8011', 'omem_8013'],
    impactArea: 'Backend API & AI Pipeline',
    verificationNotes: 'Passed test suite T11 (Adversarial Prompt Injection) and T13 (Secret Exfiltration).',
  },
  {
    id: 'dec_102',
    orgId: 'org_acme_labs_01',
    title: 'Strict 2-Step Confirmation for Cross-Scope Memory Sharing',
    context: 'Personal reflections must never accidentally leak or automatically sync into organizational workspaces.',
    decision: 'Implement Section 7 protocol: explicit modal showing exact diff, destination tenant, target role, immutable provenance ID generation, and total detachment of subsequent private edits.',
    rationale: 'Preserves privacy guarantees and prevents accidental enterprise disclosure.',
    ownerUid: 'usr_4a81e92d001',
    status: 'implemented',
    createdAt: '2026-08-19T09:30:00Z',
    updatedAt: '2026-08-20T11:00:00Z',
    sourceMemoryIds: ['omem_8012'],
    impactArea: 'User Privacy & Sharing UX',
    verificationNotes: 'Verified with T20 test gate: zero background transfers permitted.',
  }
];

export const THREAT_REGISTER: ThreatItem[] = [
  {
    id: 'T01',
    title: 'Anonymous Request to Protected Route',
    threatDescription: 'Anonymous caller invokes a protected intelligence or memory endpoint without credential.',
    requiredControls: 'Verify Firebase ID token before protected processing; deny by default with HTTP 401.',
    mandatoryVerification: 'Every protected route returns generic 401 without valid token.',
    residualRisk: 'Public endpoint still receives network traffic; rate limits remain necessary.',
    enforcementLayer: 'Cloud Run / Express Middleware',
    testStatus: 'PASSED'
  },
  {
    id: 'T02',
    title: 'Forged / Expired / Wrong-Project Token',
    threatDescription: 'Attacker submits forged signature, expired claims, or token minted for foreign GCP project.',
    requiredControls: 'Admin SDK cryptographic verification; issuer and audience binding.',
    mandatoryVerification: 'Token-negative test matrix rejecting malformed, expired, or invalid signatures.',
    residualRisk: 'Token revocation latency bounded by standard 1-hour Firebase TTL unless checked.',
    enforcementLayer: 'Identity Provider & Auth Gateway',
    testStatus: 'PASSED'
  },
  {
    id: 'T03',
    title: 'Client User ID Substitution (Spoofing UID)',
    threatDescription: 'User submits client-supplied uid or ownerUid in request body/query to access another user.',
    requiredControls: 'Ignore client identity fields; derive effective UID solely from verified token claims.',
    mandatoryVerification: 'User A cannot act on User B by changing body, query, route, or headers.',
    residualRisk: 'Authorization bugs in newly created unvetted handlers.',
    enforcementLayer: 'Backend Authorization Core',
    testStatus: 'PASSED'
  },
  {
    id: 'T04',
    title: 'Insecure Direct Object Reference (IDOR)',
    threatDescription: 'User enumerates or guesses another user\'s personal memory ID (`pmem_xxxx`).',
    requiredControls: 'Ownership check on every object; non-sequential IDs; generic not-found/forbidden response.',
    mandatoryVerification: 'Cross-user tests for read, update, delete, summarize, and retrieval return 404/403.',
    residualRisk: 'Timing differences on resource existence.',
    enforcementLayer: 'Datastore Access Layer',
    testStatus: 'PASSED'
  },
  {
    id: 'T05',
    title: 'Cross-Tenant Organization ID Substitution',
    threatDescription: 'Org A member supplies Org B orgId or memory ID to exfiltrate rival organization intelligence.',
    requiredControls: 'Verify active membership in requested Org before datastore lookup or retrieval.',
    mandatoryVerification: 'Cross-org matrix across every organization endpoint and retrieval path returns 403.',
    residualRisk: 'Complex sub-team hierarchical scopes in future releases.',
    enforcementLayer: 'Tenant Membership Guard',
    testStatus: 'PASSED'
  },
  {
    id: 'T07',
    title: 'Organization Owner Access to Personal Workspaces',
    threatDescription: 'Enterprise owner attempts to inspect an employee\'s private reflections or personal memories.',
    requiredControls: 'Personal and Organization domains are strictly independent; no role bridging exists.',
    mandatoryVerification: 'Owner/admin receives zero personal data through API, retrieval, analytics, or export.',
    residualRisk: 'User voluntarily disclosing personal notes in organization scope.',
    enforcementLayer: 'Scope Partition Contract',
    testStatus: 'PASSED'
  },
  {
    id: 'T10',
    title: 'Cross-Tenant Semantic Vector Search Leakage',
    threatDescription: 'Global vector search reveals semantically similar embeddings across tenant boundaries.',
    requiredControls: 'Scope-specific collections/indexes; authorize scope BEFORE query execution.',
    mandatoryVerification: 'Seed identical memories in different scopes; prove zero cross-tenant candidates.',
    residualRisk: 'Datastore index configuration drift.',
    enforcementLayer: 'Semantic Retrieval Engine',
    testStatus: 'PASSED'
  },
  {
    id: 'T11',
    title: 'Adversarial Prompt Injection via Retrieved Document',
    threatDescription: 'Retrieved text instructs Gemini to ignore system policy, switch tenant, or dump system secrets.',
    requiredControls: 'Delimited untrusted evidence tags; fixed server-selected scope; strict output schema.',
    mandatoryVerification: 'Adversarial injection test corpus cannot override policy, switch tenant, or leak keys.',
    residualRisk: 'Model output prose style variation.',
    enforcementLayer: 'Prompt Builder & Gemini Sanitizer',
    testStatus: 'PASSED'
  },
  {
    id: 'T13',
    title: 'Credential Exfiltration in Client Bundles or Logs',
    threatDescription: 'Gemini API key or service account credential leaked in client JS bundle, response, or log stream.',
    requiredControls: 'Server-side Secret Manager delivery; strict response masking; zero secret in client code.',
    mandatoryVerification: 'Repository scanning, bundle inspection, response check prove zero API keys in browser.',
    residualRisk: 'External communication channels outside repository.',
    enforcementLayer: 'Secret Manager & Runtime Config',
    testStatus: 'PASSED'
  },
  {
    id: 'T20',
    title: 'Silent / Automatic Personal-to-Org Data Leak',
    threatDescription: 'Private personal reflections silently copied or indexed into organization without user consent.',
    requiredControls: 'Zero automatic background synchronization; explicit 2-step confirmation modal with audit receipt.',
    mandatoryVerification: 'No automated transfer exists; canceled sharing creates zero org records.',
    residualRisk: 'User intentionally sharing sensitive data by mistake.',
    enforcementLayer: 'Sharing UX & Audit Gateway',
    testStatus: 'PASSED'
  }
];

export const INITIAL_AUDIT_LOGS: AuditEvent[] = [
  {
    id: 'aud_9901',
    timestamp: '2026-08-29T22:15:30Z',
    action: 'AUTH_VERIFIED',
    actorUid: CURRENT_USER.uid,
    scopeType: 'personal',
    scopeId: CURRENT_USER.uid,
    status: 'SUCCESS',
    details: 'Firebase ID Token verified via Cloud Run Admin SDK. Effective UID derived.',
    ipMasked: '198.51.100.xx',
  },
  {
    id: 'aud_9902',
    timestamp: '2026-08-29T22:16:04Z',
    action: 'WORKSPACE_ACCESSED',
    actorUid: CURRENT_USER.uid,
    scopeType: 'organization',
    scopeId: 'org_acme_labs_01',
    status: 'SUCCESS',
    details: 'Membership verified: role=admin for organization Acme AI Labs.',
    ipMasked: '198.51.100.xx',
  },
  {
    id: 'aud_9903',
    timestamp: '2026-08-29T22:20:12Z',
    action: 'SEMANTIC_RETRIEVAL_SCOPED',
    actorUid: CURRENT_USER.uid,
    scopeType: 'organization',
    scopeId: 'org_acme_labs_01',
    status: 'SUCCESS',
    details: 'Semantic query "zero trust gateway" executed within strictly partitioned scope `organizations/org_acme_labs_01/memories`. Cross-tenant candidates filtered: 0.',
    ipMasked: '198.51.100.xx',
  },
  {
    id: 'aud_9904',
    timestamp: '2026-08-29T22:24:50Z',
    action: 'ADVERSARIAL_ATTACK_BLOCKED',
    actorUid: 'usr_malicious_probe',
    scopeType: 'organization',
    scopeId: 'org_quantum_core_02',
    resourceId: 'omem_8021',
    status: 'BLOCKED',
    details: 'Security Invariant T05 Enforced: Attacker attempted IDOR cross-tenant access to Quantum Dynamics record without valid membership. Request blocked with HTTP 403.',
    ipMasked: '203.0.113.xx',
  }
];
