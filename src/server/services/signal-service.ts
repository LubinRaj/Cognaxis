import { addDays, localDateOf } from "../../shared/dates.js";
import type {
  CreateCheckInInput,
  MapPoint,
  PersonalCheckIn,
  PersonalSignal,
  UpsertSignalInput,
} from "../../shared/schemas.js";
import type { JournalRepository } from "../data/journal-repository.js";
import type { SignalRepository } from "../data/signal-repository.js";
import { AppError, notFound } from "../errors.js";

export type SignalUpsertOutcome = {
  signal: PersonalSignal | null;
  deleted: boolean;
};

function isEmpty(input: UpsertSignalInput): boolean {
  return (
    input.moodScore === null &&
    input.energyScore === null &&
    input.emotions.length === 0 &&
    input.note === null &&
    input.location === null
  );
}

// Two decimal places is roughly a kilometre, so "approximate" genuinely hides the exact spot.
function roundApproximate(value: number): number {
  return Math.round(value * 100) / 100;
}

export type SignalInvalidationListener = {
  onLocalDatesTouched(uid: string, localDates: string[]): Promise<void>;
};

export class SignalService {
  constructor(
    private readonly signals: SignalRepository,
    private readonly journal: JournalRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly invalidation?: SignalInvalidationListener,
  ) {}

  private async invalidate(uid: string, localDates: Array<string | undefined>): Promise<void> {
    const unique = [...new Set(localDates.filter((date): date is string => Boolean(date)))];
    if (unique.length > 0) {
      await this.invalidation?.onLocalDatesTouched(uid, unique);
    }
  }

  private async requireOwnedSession(uid: string, sessionId: string): Promise<void> {
    const session = await this.journal.getSession(uid, sessionId);
    if (!session) throw notFound();
    if (session.status !== "active") {
      throw new AppError(409, "SESSION_ARCHIVED", "This session is archived.");
    }
  }

  private asSignal(checkIn: PersonalCheckIn): PersonalSignal {
    const signal = { ...checkIn, schemaVersion: 1 } as PersonalSignal & {
      id?: string;
      anchorMessageId?: string | null;
    };
    delete signal.id;
    delete signal.anchorMessageId;
    return signal;
  }

  async getForSession(uid: string, sessionId: string): Promise<PersonalSignal | null> {
    await this.requireOwnedSession(uid, sessionId);
    const [legacy, events] = await Promise.all([
      this.signals.get(uid, sessionId),
      this.signals.listCheckIns(uid, sessionId, 1),
    ]);
    const latest = events[0] ?? null;
    if (!latest) return legacy;
    if (!legacy || latest.capturedAt >= legacy.updatedAt) return this.asSignal(latest);
    return legacy;
  }

  private validateCheckInTime(input: UpsertSignalInput): void {
    const localToday = localDateOf(this.now(), input.timezone);
    const allowed = [addDays(localToday, -1), localToday, addDays(localToday, 1)];
    if (!allowed.includes(input.localDate)) {
      throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
    }
  }

  private prepareLocation(input: UpsertSignalInput): UpsertSignalInput["location"] {
    return input.location === null
      ? null
      : input.location.precision === "approximate"
        ? { ...input.location, latitude: roundApproximate(input.location.latitude), longitude: roundApproximate(input.location.longitude) }
        : { ...input.location };
  }

  async upsert(
    uid: string,
    sessionId: string,
    input: UpsertSignalInput,
  ): Promise<SignalUpsertOutcome> {
    await this.requireOwnedSession(uid, sessionId);

    // The claimed local date must be plausible for the supplied timezone right now. One day of
    // tolerance absorbs client clock skew without letting a check-in be backdated.
    this.validateCheckInTime(input);

    const existing = await this.signals.get(uid, sessionId);

    if (isEmpty(input)) {
      await this.signals.delete(uid, sessionId);
      await this.invalidate(uid, [existing?.localDate, input.localDate]);
      return { signal: null, deleted: true };
    }

    const location = this.prepareLocation(input);

    const signal = await this.signals.upsert(uid, sessionId, {
      moodScore: input.moodScore,
      energyScore: input.energyScore,
      emotions: input.emotions,
      note: input.note,
      location,
      localDate: input.localDate,
      timezone: input.timezone,
      createdBy: uid,
      scopeId: uid,
    });
    await this.invalidate(uid, [existing?.localDate, signal.localDate]);

    return { signal, deleted: false };
  }

  async remove(uid: string, sessionId: string): Promise<void> {
    await this.requireOwnedSession(uid, sessionId);
    const existing = await this.signals.get(uid, sessionId);
    await this.signals.delete(uid, sessionId);
    await this.invalidate(uid, [existing?.localDate]);
  }

  async createCheckIn(
    uid: string,
    sessionId: string,
    input: CreateCheckInInput,
  ): Promise<PersonalCheckIn> {
    await this.requireOwnedSession(uid, sessionId);
    const parsed: UpsertSignalInput = {
      moodScore: input.moodScore,
      energyScore: input.energyScore,
      emotions: input.emotions,
      note: input.note,
      location: input.location,
      localDate: input.localDate,
      timezone: input.timezone,
    };
    if (isEmpty(parsed)) throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
    this.validateCheckInTime(parsed);
    const checkIn = await this.signals.createCheckIn(uid, sessionId, {
      ...parsed,
      location: this.prepareLocation(parsed),
      createdBy: uid,
      scopeId: uid,
    }, null);
    await this.invalidate(uid, [checkIn.localDate]);
    return checkIn;
  }

  async listCheckIns(uid: string, sessionId: string): Promise<PersonalCheckIn[]> {
    await this.requireOwnedSession(uid, sessionId);
    return this.signals.listCheckIns(uid, sessionId, 50);
  }

  async removeCheckIn(uid: string, sessionId: string, checkInId: string): Promise<void> {
    await this.requireOwnedSession(uid, sessionId);
    const target = (await this.signals.listCheckIns(uid, sessionId, 50)).find((item) => item.id === checkInId);
    if (!target) throw notFound();
    await this.signals.deleteCheckIn(uid, checkInId);
    await this.invalidate(uid, [target.localDate]);
  }

  // Used by the session-deletion cascade before the session document is removed; ownership was
  // already established by the deletion flow itself.
  async removeForDeletedSession(uid: string, sessionId: string): Promise<void> {
    const existing = await this.signals.get(uid, sessionId);
    await this.signals.delete(uid, sessionId);
    await this.signals.deleteCheckInsForSession(uid, sessionId);
    await this.invalidate(uid, [existing?.localDate]);
  }

  async listRange(
    uid: string,
    fromLocalDate: string,
    toLocalDate: string,
    limit: number,
  ): Promise<PersonalSignal[]> {
    return this.signals.listRange(uid, fromLocalDate, toLocalDate, limit);
  }

  // Returns only the projection the private map needs. Message bodies, notes, and emotions are
  // deliberately excluded from this response.
  async listMapPoints(
    uid: string,
    fromLocalDate: string,
    toLocalDate: string,
    limit: number,
  ): Promise<MapPoint[]> {
    const signals = await this.signals.listRange(uid, fromLocalDate, toLocalDate, limit);
    const located = signals.filter(
      (signal): signal is PersonalSignal & { location: NonNullable<PersonalSignal["location"]> } =>
        signal.location !== null,
    );

    // A session may now have many private check-ins. Places is a session-level view, so keep
    // only the newest located check-in for each session rather than rendering duplicate pins.
    const newestBySession = new Map<string, (typeof located)[number]>();
    for (const signal of located) {
      if (!newestBySession.has(signal.sourceSessionId)) newestBySession.set(signal.sourceSessionId, signal);
    }

    const points: MapPoint[] = [];
    for (const signal of [...newestBySession.values()].slice(0, limit)) {
      const session = await this.journal.getSession(uid, signal.sourceSessionId);
      if (!session || session.status !== "active") continue;
      points.push({
        sessionId: signal.sourceSessionId,
        sessionTitle: session.title,
        label: signal.location.label,
        latitude: signal.location.latitude,
        longitude: signal.location.longitude,
        precision: signal.location.precision,
        localDate: signal.localDate,
        moodScore: signal.moodScore,
        updatedAt: signal.updatedAt,
      });
    }
    return points;
  }
}
