import type { PersonalSignal, UpsertSignalInput } from "../../shared/schemas.js";

export interface SignalRepository {
  getSignal(uid: string, sessionId: string): Promise<PersonalSignal | null>;
  upsertSignal(uid: string, sessionId: string, input: UpsertSignalInput): Promise<PersonalSignal>;
  deleteSignal(uid: string, sessionId: string): Promise<boolean>;
  listSignals(uid: string, limit?: number): Promise<PersonalSignal[]>;
}
