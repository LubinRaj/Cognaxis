import type {
  JournalMessage,
  JournalSession,
  PersonalMemory,
  SummaryOutput,
} from "../../shared/schemas.js";

export type SaveSummaryInput = SummaryOutput & {
  sourceSessionId: string;
  sourceMessageIds: string[];
  sourceMessageCount: number;
};

export type AppendMessageInput = {
  role: JournalMessage["role"];
  content: string;
};

export interface JournalRepository {
  createSession(uid: string, title: string): Promise<JournalSession>;
  listSessions(uid: string, limit: number): Promise<JournalSession[]>;
  getSession(uid: string, sessionId: string): Promise<JournalSession | null>;
  listMessages(uid: string, sessionId: string, limit: number): Promise<JournalMessage[]>;
  appendMessage(
    uid: string,
    sessionId: string,
    message: AppendMessageInput,
  ): Promise<JournalMessage>;
  saveSummary(uid: string, input: SaveSummaryInput): Promise<PersonalMemory>;
  getSummary(uid: string, sessionId: string): Promise<PersonalMemory | null>;
  deleteSession(uid: string, sessionId: string): Promise<boolean>;
}
