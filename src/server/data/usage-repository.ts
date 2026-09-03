import type { UsageDay } from "../../shared/schemas.js";

export type UsageField = Exclude<keyof UsageDay, "date">;

export interface UsageRepository {
  increment(date: string, field: UsageField): Promise<void>;
  listRange(fromDate: string, toDate: string): Promise<UsageDay[]>;
}

export function emptyUsageDay(date: string): UsageDay {
  return {
    date,
    sessionsCreated: 0,
    messageExchangesCompleted: 0,
    sessionSummariesGenerated: 0,
    personalInsightsGenerated: 0,
    organizationSessionsCreated: 0,
    organizationInvitesAccepted: 0,
  };
}
