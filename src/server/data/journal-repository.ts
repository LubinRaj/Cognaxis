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

export type SaveMessageExchangeInput = {
  requestId: string;
  userContent: string;
  assistantContent: string;
  maxMessageCount: number;
};

export type PersistedMessageExchange = {
  userMessage: JournalMessage;
  assistantMessage: JournalMessage;
  messageCount: number;
};

export interface JournalRepository {
  createSession(uid: string, title: string): Promise<JournalSession>;
  listSessions(uid: string, limit: number): Promise<JournalSession[]>;
  getSession(uid: string, sessionId: string): Promise<JournalSession | null>;
  listMessages(uid: string, sessionId: string, limit: number): Promise<JournalMessage[]>;
  getMessageExchange(
    uid: string,
    sessionId: string,
    requestId: string,
  ): Promise<PersistedMessageExchange | null>;
  saveMessageExchange(
    uid: string,
    sessionId: string,
    input: SaveMessageExchangeInput,
  ): Promise<PersistedMessageExchange>;
  saveSummary(uid: string, input: SaveSummaryInput): Promise<PersonalMemory>;
  getSummary(uid: string, sessionId: string): Promise<PersonalMemory | null>;
  deleteSession(uid: string, sessionId: string): Promise<boolean>;
}
