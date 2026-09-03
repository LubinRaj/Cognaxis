import { addDays, localDateOf } from "../../shared/dates.js";
import type { Preferences, UpdatePreferencesInput } from "../../shared/schemas.js";
import type { JournalRepository } from "../data/journal-repository.js";
import { DEFAULT_PREFERENCES, type PreferencesRepository } from "../data/preferences-repository.js";
import type { SignalRepository } from "../data/signal-repository.js";
import {
  computeDashboard,
  type DashboardRangeDays,
  type PersonalDashboard,
} from "./personal-dashboard.js";

const SIGNAL_QUERY_LIMIT = 500;
const SESSION_QUERY_LIMIT = 500;

export class DashboardService {
  constructor(
    private readonly signals: SignalRepository,
    private readonly journal: JournalRepository,
    private readonly preferences: PreferencesRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getPreferences(uid: string): Promise<Preferences> {
    const stored = await this.preferences.get(uid);
    if (stored) return stored;
    const timestamp = this.now().toISOString();
    return { ...DEFAULT_PREFERENCES, createdAt: timestamp, updatedAt: timestamp };
  }

  async updatePreferences(uid: string, input: UpdatePreferencesInput): Promise<Preferences> {
    return this.preferences.set(uid, input);
  }

  async getDashboard(uid: string, rangeDays: DashboardRangeDays): Promise<PersonalDashboard> {
    const preferences = await this.getPreferences(uid);
    const timezone = preferences.timezone;
    const today = localDateOf(this.now(), timezone);
    const from = addDays(today, -(rangeDays - 1));
    const previousFrom = addDays(from, -rangeDays);
    const previousTo = addDays(from, -1);

    // Sessions are filtered precisely by local date inside computeDashboard; the query bound only
    // needs to be generous enough to cover every UTC offset.
    const sessionsSince = new Date(
      Date.parse(`${from}T00:00:00.000Z`) - 36 * 60 * 60 * 1_000,
    ).toISOString();

    const [signals, previousSignals, sessions] = await Promise.all([
      this.signals.listRange(uid, from, today, SIGNAL_QUERY_LIMIT),
      this.signals.listRange(uid, previousFrom, previousTo, SIGNAL_QUERY_LIMIT),
      this.journal.listSessionsCreatedSince(uid, sessionsSince, SESSION_QUERY_LIMIT),
    ]);

    return computeDashboard({
      rangeDays,
      timezone,
      today,
      signals,
      previousSignals,
      sessionCreationTimes: sessions.map((session) => session.createdAt),
    });
  }
}
