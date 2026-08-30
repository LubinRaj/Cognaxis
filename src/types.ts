export type ScopeType = 'personal' | 'organization';

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  createdAt: string;
}

export interface Organization {
  orgId: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
  memberCount: number;
}

export interface Membership {
  orgId: string;
  uid: string;
  role: UserRole;
  joinedAt: string;
  invitedBy: string;
  status: 'active' | 'suspended';
}

export interface MemoryItem {
  id: string;
  title: string;
  content: string;
  category: 'reflection' | 'decision' | 'insight' | 'note' | 'update' | 'meeting';
  tags: string[];
  scopeType: ScopeType;
  scopeId: string; // uid or orgId
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  provenanceId?: string;
  sourceType?: 'user_input' | 'ai_synthesis' | 'shared_from_personal';
  embeddingVector?: number[]; // simulated or real vector
  isSharedToOrg?: boolean;
  derivedInsightCount?: number;
}

export interface DecisionRecord {
  id: string;
  orgId: string;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  ownerUid: string;
  status: 'draft' | 'proposed' | 'approved' | 'implemented' | 'deprecated';
  createdAt: string;
  updatedAt: string;
  sourceMemoryIds: string[];
  impactArea: string;
  verificationNotes?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  scopeType: ScopeType;
  scopeId: string;
  retrievedMemoryIds?: string[];
  securityAttestation?: {
    scopeVerified: boolean;
    authorizedUid: string;
    model: string;
    tokensEvaluated: number;
    crossTenantFilteredCount: number;
    promptInjectionScanned: boolean;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  scopeType: ScopeType;
  scopeId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  action: 
    | 'AUTH_VERIFIED'
    | 'WORKSPACE_ACCESSED'
    | 'MEMORY_CREATED'
    | 'MEMORY_ACCESSED'
    | 'MEMORY_DELETED'
    | 'DECISION_LOGGED'
    | 'CROSS_SCOPE_SHARE_INITIATED'
    | 'CROSS_SCOPE_SHARE_CONFIRMED'
    | 'CROSS_SCOPE_SHARE_DENIED'
    | 'SEMANTIC_RETRIEVAL_SCOPED'
    | 'ADVERSARIAL_ATTACK_BLOCKED'
    | 'ROLE_VERIFIED'
    | 'POLICY_ENFORCED';
  actorUid: string;
  scopeType: ScopeType;
  scopeId: string;
  resourceId?: string;
  status: 'SUCCESS' | 'BLOCKED' | 'DENIED' | 'FLAGGED';
  details: string;
  ipMasked: string;
}

export interface ThreatItem {
  id: string; // T01 to T27
  title: string;
  threatDescription: string;
  requiredControls: string;
  mandatoryVerification: string;
  residualRisk: string;
  enforcementLayer: string;
  testStatus: 'PASSED' | 'TESTING' | 'PENDING';
}

export interface SecurityTestResult {
  threatId: string;
  testName: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  targetEndpoint: string;
  payloadDescription: string;
  expectedBehavior: string;
  observedBehavior: string;
  timestamp: string;
  latencyMs: number;
}
