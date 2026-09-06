import type {
  CaptureType,
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
  /** Applied only when the session still has its untouched placeholder title. */
  title?: string;
  /** Applied only when the session still has its untouched placeholder title. */
  tags?: string[];
  attachmentIds?: string[];
  maxMessageCount: number;
};

export type PersistedMessageExchange = {
  userMessage: JournalMessage;
  assistantMessage: JournalMessage;
  messageCount: number;
};

export interface JournalRepository {
  createSession(uid: string, title: string, captureType?: CaptureType): Promise<JournalSession>;
  renameSession(uid: string, sessionId: string, title: string): Promise<JournalSession>;
  setSessionTags(uid: string, sessionId: string, tags: string[]): Promise<JournalSession>;
  /** Catalogued canonical labels for the owner's private reflection space. */
  listTags(uid: string, limit: number): Promise<string[]>;
  /** Upserts canonical labels without coupling a tag's lifetime to a single reflection. */
  registerTags(uid: string, tags: string[]): Promise<void>;
  listSessions(uid: string, limit: number, status?: JournalSession["status"]): Promise<JournalSession[]>;
  listSessionsCreatedSince(uid: string, sinceIso: string, limit: number): Promise<JournalSession[]>;
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
  setSessionStatus(
    uid: string,
    sessionId: string,
    status: JournalSession["status"],
  ): Promise<JournalSession | null>;
  deleteSession(uid: string, sessionId: string): Promise<boolean>;
}
