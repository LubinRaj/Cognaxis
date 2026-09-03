import { z } from "zod";

export const documentIdSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid resource identifier");

export const createSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const createMessageSchema = z
  .object({
    requestId: z.uuid(),
    content: z.string().trim().min(1).max(8_000),
  })
  .strict();

export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const summaryOutputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(2_000),
    themes: z.array(z.string().trim().min(1).max(48)).max(8),
    nextSteps: z.array(z.string().trim().min(1).max(240)).max(8),
  })
  .strict();

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

export type JournalSession = {
  id: string;
  title: string;
  status: "active" | "archived";
  messageCount: number;
  summarizedMessageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type JournalMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  createdAt: string;
};

export type PersonalMemory = SummaryOutput & {
  id: string;
  sourceSessionId: string;
  sourceMessageIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type SessionDetail = JournalSession & {
  messages: JournalMessage[];
  /**
   * The reflection summary owned by the same user as the session. It travels with session detail
   * so the interface can restore it after navigation or reload without a second endpoint and
   * without any additional authorization surface.
   */
  summary: PersonalMemory | null;
};

// ---- Cognaxis Extended Types ----

export type ScopeType = "personal" | "organization" | "platform_admin";

export type PersonalScope = {
  type: "personal";
  uid: string;
};

export type OrganizationScope = {
  type: "organization";
  uid: string;
  orgId: string;
  role: "owner" | "admin" | "member" | "viewer";
  membershipId: string;
};

export type PlatformAdminScope = {
  type: "platform_admin";
  uid: string;
  role: "super_admin";
};

// Platform Users
export type PlatformRole = "user" | "super_admin";
export type PlatformStatus = "active" | "suspended";

export type PlatformUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  providerIds: string[];
  emailVerified: boolean;
  platformRole: PlatformRole;
  status: PlatformStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSeenWriteAt: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
};

// Preferences
export type Preferences = {
  timezone: string;
  weekStartsOn: "monday";
  insightRangeDays: 7 | 30 | 90;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
};

// Signals & Locations
export type EmotionLabel =
  | "calm" | "hopeful" | "focused" | "energized"
  | "grateful" | "content" | "uncertain" | "tired"
  | "stressed" | "frustrated" | "sad" | "overwhelmed";

export type PersonalSignalLocation = {
  placeId: string | null;
  label: string;
  latitude: number;
  longitude: number;
  precision: "exact" | "approximate";
};

export type PersonalSignal = {
  sourceSessionId: string;
  moodScore: 1 | 2 | 3 | 4 | 5 | null;
  energyScore: 1 | 2 | 3 | 4 | 5 | null;
  emotions: EmotionLabel[];
  note: string | null;
  location: PersonalSignalLocation | null;
  localDate: string;
  timezone: string;
  capturedAt: string;
  updatedAt: string;
  createdBy: string;
  scopeType: "personal";
  scopeId: string;
  schemaVersion: 1;
};

export const upsertSignalSchema = z.object({
  moodScore: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
  energyScore: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
  emotions: z.array(z.enum([
    "calm", "hopeful", "focused", "energized",
    "grateful", "content", "uncertain", "tired",
    "stressed", "frustrated", "sad", "overwhelmed"
  ])).max(5),
  note: z.string().trim().max(280).nullable(),
  location: z.object({
    placeId: z.string().max(256).nullable(),
    label: z.string().max(160),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    precision: z.enum(["exact", "approximate"])
  }).nullable(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().max(100),
}).strict();

export type UpsertSignalInput = z.infer<typeof upsertSignalSchema>;

// Insights
export type InsightPeriodType = "day" | "week";

export type PersonalInsight = {
  periodType: InsightPeriodType;
  periodKey: string;
  periodStart: string;
  periodEndExclusive: string;
  timezone: string;
  sourceSessionIds: string[];
  sourceSignalSessionIds: string[];
  sourceFingerprint: string;
  metrics: {
    reflectionCount: number;
    checkinCount: number;
    moodAverage: number | null;
    energyAverage: number | null;
    moodDeltaFromPrevious: number | null;
    energyDeltaFromPrevious: number | null;
    emotionCounts: Record<EmotionLabel, number>;
  };
  narrative: {
    title: string;
    overview: string;
    patterns: Array<{
      observation: string;
      evidenceSessionIds: string[];
      confidence: "low" | "medium" | "high";
    }>;
    highlights: string[];
    nextSteps: string[];
    disclaimer: string;
  };
  generationRequestId: string;
  model: string;
  promptVersion: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  scopeType: "personal";
  scopeId: string;
  schemaVersion: 1;
};

// Organizations
export type OrganizationRole = "owner" | "admin" | "member" | "viewer";
export type OrganizationStatus = "active" | "suspended";

export type Organization = {
  id: string; // Document ID
  name: string;
  description: string | null;
  status: OrganizationStatus;
  ownerUid: string;
  memberCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
};

export type OrganizationMembership = {
  uid: string;
  orgId: string;
  role: OrganizationRole;
  status: OrganizationStatus;
  invitedBy: string | null;
  joinedAt: string;
  updatedAt: string;
  schemaVersion: 1;
};

// For user's projection:
export type UserOrganizationEdge = {
  orgId: string;
  organizationName: string;
  role: OrganizationRole;
  status: OrganizationStatus;
  joinedAt: string;
  updatedAt: string;
};

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable(),
}).strict();

export const updateOrganizationSchema = createOrganizationSchema.partial();
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

// Invites
export const createInviteSchema = z.object({
  role: z.enum(["admin", "member", "viewer"])
}).strict();

export const acceptInviteSchema = z.object({
  secret: z.string().min(32)
}).strict();

export type OrganizationInvite = {
  id: string;
  tokenHash: string;
  role: "admin" | "member" | "viewer";
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdBy: string;
  acceptedBy: string | null;
  createdAt: string;
  acceptedAt: string | null;
  schemaVersion: 1;
};

// Admin Audit & Metrics
export type AuditEvent = {
  id: string;
  eventType: string;
  actorUid: string;
  targetType: "user" | "organization" | "membership" | "invite";
  targetId: string;
  organizationId: string | null;
  changes: Array<{ field: string; from: string | null; to: string | null }>;
  reason: string | null;
  requestId: string;
  createdAt: string;
  schemaVersion: 1;
};

export type CapabilitiesOutput = {
  platformRole: PlatformRole;
  status: PlatformStatus;
};

export const updatePreferencesSchema = z.object({
  timezone: z.string().min(1).max(100),
  weekStartsOn: z.literal("monday"),
  insightRangeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
}).strict();

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

