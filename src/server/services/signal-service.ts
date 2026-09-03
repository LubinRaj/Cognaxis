import type { PersonalSignal, UpsertSignalInput } from "../../shared/schemas.js";
import type { SignalRepository } from "../data/signal-repository.js";
import { AppError } from "../errors.js";
import type { JournalRepository } from "../data/journal-repository.js";

export class SignalService {
  constructor(
    private readonly signalRepo: SignalRepository,
    private readonly journalRepo: JournalRepository
  ) {}

  async getSignal(uid: string, sessionId: string): Promise<PersonalSignal | null> {
    // Verify session ownership first
    const session = await this.journalRepo.getSession(uid, sessionId);
    if (!session) {
      throw new AppError(404, "NOT_FOUND", "Session not found");
    }
    return this.signalRepo.getSignal(uid, sessionId);
  }

  async upsertSignal(uid: string, sessionId: string, input: UpsertSignalInput): Promise<PersonalSignal> {
    // Verify session ownership
    const session = await this.journalRepo.getSession(uid, sessionId);
    if (!session) {
      throw new AppError(404, "NOT_FOUND", "Session not found");
    }

    if (
      input.moodScore === null &&
      input.energyScore === null &&
      input.emotions.length === 0 &&
      !input.note &&
      input.location === null
    ) {
      await this.signalRepo.deleteSignal(uid, sessionId);
      throw new AppError(204, "NO_CONTENT", "Signal deleted");
    }

    return this.signalRepo.upsertSignal(uid, sessionId, input);
  }

  async deleteSignal(uid: string, sessionId: string): Promise<void> {
    // Verify session ownership
    const session = await this.journalRepo.getSession(uid, sessionId);
    if (!session) {
      throw new AppError(404, "NOT_FOUND", "Session not found");
    }
    await this.signalRepo.deleteSignal(uid, sessionId);
  }

  async listSignals(uid: string, limit = 50): Promise<PersonalSignal[]> {
    return this.signalRepo.listSignals(uid, limit);
  }
}
