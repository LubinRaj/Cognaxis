import type { PersonalInsight } from "../../shared/schemas.js";

export type InsightWrite = Omit<PersonalInsight, "createdAt" | "updatedAt">;

export type GenerationLeaseRequest = {
  /** Random identifier of this generation attempt; only the holder may release the lease. */
  holder: string;
  nowIso: string;
  expiresAtIso: string;
};

export interface InsightRepository {
  get(uid: string, periodKey: string): Promise<PersonalInsight | null>;
  save(uid: string, insight: InsightWrite): Promise<PersonalInsight>;
  delete(uid: string, periodKey: string): Promise<boolean>;
  list(uid: string, periodType: "day" | "week", limit: number): Promise<PersonalInsight[]>;
  markStale(uid: string, periodKeys: string[]): Promise<void>;
  /** Insights whose provenance cites the session as a source reflection or check-in. */
  listCitingSession(uid: string, sessionId: string): Promise<PersonalInsight[]>;
  /**
   * Atomically claims the single generation slot for one user and period across all server
   * instances. Returns false while another holder's unexpired lease exists; a lease past its
   * expiry may be taken over so a crashed instance can never block generation forever.
   */
  acquireGenerationLease(
    uid: string,
    periodKey: string,
    lease: GenerationLeaseRequest,
  ): Promise<boolean>;
  /** Releases the lease only if this holder still owns it. */
  releaseGenerationLease(uid: string, periodKey: string, holder: string): Promise<void>;
}
