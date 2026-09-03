import type { PersonalSignal } from "../../shared/schemas.js";

export type SignalWrite = {
  moodScore: PersonalSignal["moodScore"];
  energyScore: PersonalSignal["energyScore"];
  emotions: PersonalSignal["emotions"];
  note: string | null;
  location: PersonalSignal["location"];
  localDate: string;
  timezone: string;
  createdBy: string;
  scopeId: string;
};

export interface SignalRepository {
  get(uid: string, sessionId: string): Promise<PersonalSignal | null>;
  upsert(uid: string, sessionId: string, write: SignalWrite): Promise<PersonalSignal>;
  delete(uid: string, sessionId: string): Promise<boolean>;
  listRange(
    uid: string,
    fromLocalDate: string,
    toLocalDate: string,
    limit: number,
  ): Promise<PersonalSignal[]>;
}
