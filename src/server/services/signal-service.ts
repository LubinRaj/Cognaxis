import { addDays, localDateOf } from "../../shared/dates.js";
import type { MapPoint, PersonalSignal, UpsertSignalInput } from "../../shared/schemas.js";
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
  }

  async getForSession(uid: string, sessionId: string): Promise<PersonalSignal | null> {
    await this.requireOwnedSession(uid, sessionId);
    return this.signals.get(uid, sessionId);
  }

  async upsert(
    uid: string,
    sessionId: string,
    input: UpsertSignalInput,
  ): Promise<SignalUpsertOutcome> {
    await this.requireOwnedSession(uid, sessionId);

    // The claimed local date must be plausible for the supplied timezone right now. One day of
    // tolerance absorbs client clock skew without letting a check-in be backdated.
    const localToday = localDateOf(this.now(), input.timezone);
    const allowed = [addDays(localToday, -1), localToday, addDays(localToday, 1)];
    if (!allowed.includes(input.localDate)) {
      throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
    }

    const existing = await this.signals.get(uid, sessionId);

    if (isEmpty(input)) {
      await this.signals.delete(uid, sessionId);
      await this.invalidate(uid, [existing?.localDate, input.localDate]);
      return { signal: null, deleted: true };
    }

    const location =
      input.location === null
        ? null
        : input.location.precision === "approximate"
          ? {
              ...input.location,
              latitude: roundApproximate(input.location.latitude),
              longitude: roundApproximate(input.location.longitude),
            }
          : { ...input.location };

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

  // Used by the session-deletion cascade before the session document is removed; ownership was
  // already established by the deletion flow itself.
  async removeForDeletedSession(uid: string, sessionId: string): Promise<void> {
    const existing = await this.signals.get(uid, sessionId);
    await this.signals.delete(uid, sessionId);
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

    const points: MapPoint[] = [];
    for (const signal of located.slice(0, limit)) {
      const session = await this.journal.getSession(uid, signal.sourceSessionId);
      if (!session) continue;
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
