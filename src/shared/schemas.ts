import { z } from "zod";

export const documentIdSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid resource identifier");

export const createSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const createMessageSchema = z
  .object({
    requestId: z.uuid(),
    content: z.string().trim().min(1).max(8_000),
  })
  .strict();

export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const summaryOutputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(2_000),
    themes: z.array(z.string().trim().min(1).max(48)).max(8),
    nextSteps: z.array(z.string().trim().min(1).max(240)).max(8),
  })
  .strict();

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

export type JournalSession = {
  id: string;
  title: string;
  status: "active" | "archived";
  messageCount: number;
  summarizedMessageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type JournalMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  createdAt: string;
};

export type PersonalMemory = SummaryOutput & {
  id: string;
  sourceSessionId: string;
  sourceMessageIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type SessionDetail = JournalSession & {
  messages: JournalMessage[];
  /**
   * The reflection summary owned by the same user as the session. It travels with session detail
   * so the interface can restore it after navigation or reload without a second endpoint and
   * without any additional authorization surface.
   */
  summary: PersonalMemory | null;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
};
