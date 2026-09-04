import type { JournalSession, PersonalMemory, SessionDetail } from "../../shared/schemas.js";

/** Most recently updated first, with a stable identifier tiebreak. */
export function sortSessions(sessions: readonly JournalSession[]): JournalSession[] {
  return [...sessions].sort((left, right) => {
    const difference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (Number.isNaN(difference) || difference === 0) return left.id < right.id ? 1 : -1;
    return difference;
  });
}

/** Inserts or replaces a session without mutating the previous array. */
export function upsertSession(
  sessions: readonly JournalSession[],
  session: JournalSession,
): JournalSession[] {
  const others = sessions.filter((item) => item.id !== session.id);
  return sortSessions([session, ...others]);
}

export function removeSession(
  sessions: readonly JournalSession[],
  sessionId: string,
): JournalSession[] {
  return sessions.filter((session) => session.id !== sessionId);
}

/**
 * Applies the authoritative counts from a session detail response back onto the list row so the
 * message count and ordering cannot drift after a write.
 */
export function syncSessionFromDetail(
  sessions: readonly JournalSession[],
  detail: SessionDetail,
): JournalSession[] {
  // The row is projected field by field so private message and summary payloads can never end
  // up stored in the navigation list.
  const session: JournalSession = {
    id: detail.id,
    title: detail.title,
    status: detail.status,
    messageCount: detail.messageCount,
    summarizedMessageCount: detail.summarizedMessageCount,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
  return sessions.some((item) => item.id === session.id)
    ? upsertSession(sessions, session)
    : [...sessions];
}

/** Chooses the row to open after a deletion: the next nearest remaining session, or none. */
export function nextSelectionAfterDelete(
  sessions: readonly JournalSession[],
  deletedId: string,
): string | null {
  const index = sessions.findIndex((session) => session.id === deletedId);
  const remaining = removeSession(sessions, deletedId);
  if (remaining.length === 0) return null;
  if (index === -1) return remaining[0].id;
  return remaining[Math.min(index, remaining.length - 1)].id;
}

/** Title-only filtering of the sessions already loaded from the API. */
export function filterSessions(
  sessions: readonly JournalSession[],
  query: string,
): JournalSession[] {
  const trimmed = query.trim().toLocaleLowerCase();
  if (trimmed.length === 0) return [...sessions];
  return sessions.filter((session) => session.title.toLocaleLowerCase().includes(trimmed));
}

export type MessageExchange = {
  userMessage: SessionDetail["messages"][number];
  assistantMessage: SessionDetail["messages"][number];
  summary: PersonalMemory | null;
};

/**
 * Replaces the optimistic message with the two authoritative server messages and advances the
 * counts exactly as the server does: one user message plus one model message, and a summary that
 * covers every stored message when the server generated one.
 */
export function applyExchange(
  detail: SessionDetail,
  exchange: MessageExchange,
  optimisticId: string,
): SessionDetail {
  const messages = [
    ...detail.messages.filter(
      (message) => message.id !== optimisticId && !message.id.startsWith("pending-"),
    ),
    exchange.userMessage,
    exchange.assistantMessage,
  ];
  const messageCount = detail.messageCount + 2;

  return {
    ...detail,
    messages,
    messageCount,
    summarizedMessageCount: exchange.summary ? messageCount : detail.summarizedMessageCount,
    summary: exchange.summary ?? detail.summary,
    updatedAt: exchange.assistantMessage.createdAt,
  };
}

/** Applies a manually requested summary to the session that asked for it. */
export function applySummary(detail: SessionDetail, summary: PersonalMemory): SessionDetail {
  return {
    ...detail,
    summary,
    summarizedMessageCount: detail.messageCount,
    updatedAt: summary.updatedAt,
  };
}

/** Removes an optimistic message after a failed send. */
export function removeOptimisticMessage(
  detail: SessionDetail,
  optimisticId: string,
): SessionDetail {
  return {
    ...detail,
    messages: detail.messages.filter((message) => message.id !== optimisticId),
  };
}

export type SummaryActionState =
  | "not-enough-messages"
  | "create"
  | "current"
  | "stale"
  | "summarizing";

/**
 * Derives the summary action from the authoritative counts rather than guessing from the messages
 * held in the browser.
 */
export function deriveSummaryState(input: {
  session: Pick<JournalSession, "messageCount" | "summarizedMessageCount"> | null;
  summary: PersonalMemory | null;
  summarizing: boolean;
}): SummaryActionState {
  if (input.summarizing) return "summarizing";
  if (!input.session) return "not-enough-messages";
  if (input.session.messageCount < 2) return "not-enough-messages";
  if (!input.summary) return "create";
  return input.session.summarizedMessageCount >= input.session.messageCount ? "current" : "stale";
}

export const SUMMARY_ACTION_LABELS: Record<SummaryActionState, string> = {
  "not-enough-messages": "Create summary",
  create: "Create summary",
  current: "View summary",
  stale: "Update summary",
  summarizing: "Create summary",
};

/** Server contract: a session stops accepting messages at 120 stored messages. */
export const MAX_SESSION_MESSAGES = 120;

/** Server contract: a single message is limited to 8,000 characters. */
export const MAX_MESSAGE_LENGTH = 8_000;

export function isSessionFull(session: Pick<JournalSession, "messageCount"> | null): boolean {
  return session !== null && session.messageCount >= MAX_SESSION_MESSAGES;
}
