import { z } from "zod";
import { isValidLocalDate, isValidTimeZone } from "./dates.js";

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

export const emotionLabels = [
  "calm",
  "hopeful",
  "focused",
  "energized",
  "grateful",
  "content",
  "uncertain",
  "tired",
  "stressed",
  "frustrated",
  "sad",
  "overwhelmed",
] as const;

const scoreSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const timezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(isValidTimeZone, "Unknown timezone");

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidLocalDate, "Invalid calendar date");

export const signalLocationSchema = z
  .object({
    placeId: z.string().min(1).max(256).nullable(),
    label: z.string().trim().min(1).max(160),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    precision: z.enum(["exact", "approximate"]),
  })
  .strict();

export const upsertSignalSchema = z
  .object({
    moodScore: scoreSchema.nullable(),
    energyScore: scoreSchema.nullable(),
    emotions: z
      .array(z.enum(emotionLabels))
      .max(5)
      .refine((values) => new Set(values).size === values.length, "Emotions must be unique"),
    note: z
      .string()
      .trim()
      .max(280)
      .nullable()
      .transform((value) => (value === "" ? null : value)),
    location: signalLocationSchema.nullable(),
    localDate: localDateSchema,
    timezone: timezoneSchema,
  })
  .strict();

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
  stale: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  scopeType: "personal";
  scopeId: string;
  schemaVersion: 1;
};

export const insightNarrativeSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    overview: z.string().trim().min(1).max(700),
    patterns: z
      .array(
        z
          .object({
            observation: z.string().trim().min(1).max(280),
            // Every pattern must be grounded in at least one authorized source reflection.
            evidenceSessionIds: z.array(documentIdSchema).min(1).max(10),
            confidence: z.enum(["low", "medium", "high"]),
          })
          .strict(),
      )
      .max(3),
    highlights: z.array(z.string().trim().min(1).max(280)).max(3),
    nextSteps: z.array(z.string().trim().min(1).max(280)).max(3),
    disclaimer: z.string().max(400).optional(),
  })
  .strict();

export type InsightNarrativeOutput = z.infer<typeof insightNarrativeSchema>;

export const generateInsightSchema = z
  .object({
    requestId: z.uuid(),
    regenerate: z.boolean().optional().default(false),
  })
  .strict();

export type GenerateInsightInput = z.infer<typeof generateInsightSchema>;

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

export type OrganizationPermissions = {
  canWrite: boolean;
  canManageMembers: boolean;
  canViewInvites: boolean;
  canInviteAdmin: boolean;
  canUpdateSettings: boolean;
  canViewAudit: boolean;
};

export type OrganizationDetail = {
  organization: Organization;
  role: OrganizationRole;
  permissions: OrganizationPermissions;
};

export type OrganizationMemberView = {
  uid: string;
  displayName: string | null;
  email: string | null;
  role: OrganizationRole;
  status: OrganizationStatus;
  joinedAt: string;
};

export type OrganizationMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  authorUid: string | null;
  createdAt: string;
};

export type OrganizationSession = {
  id: string;
  title: string;
  status: "active" | "archived";
  messageCount: number;
  summarizedMessageCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationSummary = SummaryOutput & {
  id: string;
  sourceSessionId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationSessionDetail = OrganizationSession & {
  messages: OrganizationMessage[];
  summary: OrganizationSummary | null;
};

export type InvitePreview = {
  organizationName: string;
  role: "admin" | "member" | "viewer";
  expiresAt: string;
};

export type CreatedInvite = {
  inviteId: string;
  secret: string;
  role: "admin" | "member" | "viewer";
  expiresAt: string;
};

// Invites
export const createInviteSchema = z.object({
  role: z.enum(["admin", "member", "viewer"])
}).strict();

export const acceptInviteSchema = z.object({
  secret: z.string().min(32).max(512).regex(/^[A-Za-z0-9_-]+$/)
}).strict();

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const updateMemberSchema = z
  .object({
    role: z.enum(["admin", "member", "viewer"]).optional(),
    status: z.enum(["active", "suspended"]).optional(),
  })
  .strict()
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: "Nothing to change",
  });

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

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

export type MapPoint = {
  sessionId: string;
  sessionTitle: string;
  label: string;
  latitude: number;
  longitude: number;
  precision: "exact" | "approximate";
  localDate: string;
  moodScore: 1 | 2 | 3 | 4 | 5 | null;
  updatedAt: string;
};

export type DashboardRangeDays = 7 | 30 | 90;

export type TrendPoint = {
  date: string;
  mood: number | null;
  energy: number | null;
};

export type ScoreDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

export type PersonalDashboard = {
  rangeDays: DashboardRangeDays;
  from: string;
  to: string;
  timezone: string;
  reflectionCount: number;
  checkinCount: number;
  locatedCount: number;
  coverage: number | null;
  moodAverage: number | null;
  energyAverage: number | null;
  moodDeltaFromPrevious: number | null;
  energyDeltaFromPrevious: number | null;
  moodDistribution: ScoreDistribution;
  energyDistribution: ScoreDistribution;
  topEmotions: Array<{ emotion: EmotionLabel; count: number }>;
  trend: TrendPoint[];
  hasEnoughForTrend: boolean;
};

export type FeatureFlags = {
  insights: boolean;
  maps: boolean;
  organizations: boolean;
  admin: boolean;
};

export type Capabilities = {
  platformRole: PlatformRole;
  status: PlatformStatus;
  features: FeatureFlags;
};

// ---- Platform administration ----

export const adminReasonSchema = z.string().trim().min(10).max(240);

export const updatePlatformRoleSchema = z
  .object({
    role: z.enum(["user", "super_admin"]),
    reason: adminReasonSchema,
  })
  .strict();

export const updatePlatformStatusSchema = z
  .object({
    status: z.enum(["active", "suspended"]),
    reason: adminReasonSchema,
  })
  .strict();

export const updateOrganizationStatusSchema = z
  .object({
    status: z.enum(["active", "suspended"]),
    reason: adminReasonSchema,
  })
  .strict();

export type UpdatePlatformRoleInput = z.infer<typeof updatePlatformRoleSchema>;
export type UpdatePlatformStatusInput = z.infer<typeof updatePlatformStatusSchema>;
export type UpdateOrganizationStatusInput = z.infer<typeof updateOrganizationStatusSchema>;

export type UsageDay = {
  date: string;
  sessionsCreated: number;
  messageExchangesCompleted: number;
  sessionSummariesGenerated: number;
  personalInsightsGenerated: number;
  organizationSessionsCreated: number;
  organizationInvitesAccepted: number;
};

/** Every value is a metadata count; null means the metric could not be computed right now. */
export type AdminOverview = {
  totalUsers: number | null;
  activeUsersLast7Days: number | null;
  activeOrganizations: number | null;
  usage: UsageDay[];
};

export type AdminUserPage = {
  users: PlatformUser[];
  nextCursor: string | null;
};

export type AdminAuditPage = {
  events: AuditEvent[];
  nextCursor: string | null;
};

export const updatePreferencesSchema = z
  .object({
    timezone: timezoneSchema,
    weekStartsOn: z.literal("monday"),
    insightRangeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  })
  .strict();

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

