import type { PersonalInsight } from "../../shared/schemas.js";
import type {
  GenerationLeaseRequest,
  InsightRepository,
  InsightWrite,
} from "./insight-repository.js";

export class InMemoryInsightRepository implements InsightRepository {
  private readonly insights = new Map<string, Map<string, PersonalInsight>>();
  private readonly leases = new Map<string, { holder: string; expiresAtIso: string }>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private forUser(uid: string): Map<string, PersonalInsight> {
    let userInsights = this.insights.get(uid);
    if (!userInsights) {
      userInsights = new Map();
      this.insights.set(uid, userInsights);
    }
    return userInsights;
  }

  async get(uid: string, periodKey: string): Promise<PersonalInsight | null> {
    const insight = this.forUser(uid).get(periodKey);
    return insight ? structuredClone(insight) : null;
  }

  async save(uid: string, insight: InsightWrite): Promise<PersonalInsight> {
    const timestamp = this.now().toISOString();
    const existing = this.forUser(uid).get(insight.periodKey);
    const record: PersonalInsight = {
      ...structuredClone(insight),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.forUser(uid).set(insight.periodKey, record);
    return structuredClone(record);
  }

  async delete(uid: string, periodKey: string): Promise<boolean> {
    return this.forUser(uid).delete(periodKey);
  }

  async list(uid: string, periodType: "day" | "week", limit: number): Promise<PersonalInsight[]> {
    return [...this.forUser(uid).values()]
      .filter((insight) => insight.periodType === periodType)
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
      .slice(0, limit)
      .map((insight) => structuredClone(insight));
  }

  async markStale(uid: string, periodKeys: string[]): Promise<void> {
    for (const periodKey of periodKeys) {
      const insight = this.forUser(uid).get(periodKey);
      if (insight && !insight.stale) {
        insight.stale = true;
        insight.updatedAt = this.now().toISOString();
      }
    }
  }

  async acquireGenerationLease(
    uid: string,
    periodKey: string,
    lease: GenerationLeaseRequest,
  ): Promise<boolean> {
    const key = `${uid}/${periodKey}`;
    const existing = this.leases.get(key);
    if (existing && existing.expiresAtIso > lease.nowIso && existing.holder !== lease.holder) {
      return false;
    }
    this.leases.set(key, { holder: lease.holder, expiresAtIso: lease.expiresAtIso });
    return true;
  }

  async releaseGenerationLease(uid: string, periodKey: string, holder: string): Promise<void> {
    const key = `${uid}/${periodKey}`;
    if (this.leases.get(key)?.holder === holder) this.leases.delete(key);
  }

  async listCitingSession(uid: string, sessionId: string): Promise<PersonalInsight[]> {
    return [...this.forUser(uid).values()]
      .filter(
        (insight) =>
          insight.sourceSessionIds.includes(sessionId) ||
          insight.sourceSignalSessionIds.includes(sessionId),
      )
      .map((insight) => structuredClone(insight));
  }
}
