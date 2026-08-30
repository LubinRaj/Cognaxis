import { z } from "zod";

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).optional().default(3000),
    APP_ORIGIN: z.string().optional(),
    GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().min(1).default("gemini-3.7-flash"),
    GEMINI_API_KEY_SECRET: z
      .string()
      .regex(/^projects\/[^/]+\/secrets\/[^/]+\/versions\/[0-9]+$/)
      .optional(),
    GEMINI_API_KEY_LOCAL: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== "production") return;

    if (!value.GOOGLE_CLOUD_PROJECT) {
      context.addIssue({
        code: "custom",
        path: ["GOOGLE_CLOUD_PROJECT"],
        message: "GOOGLE_CLOUD_PROJECT is required in production",
      });
    }

    if (!value.GEMINI_API_KEY_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["GEMINI_API_KEY_SECRET"],
        message: "A pinned Secret Manager version is required in production",
      });
    }

    if (value.GEMINI_API_KEY_LOCAL) {
      context.addIssue({
        code: "custom",
        path: ["GEMINI_API_KEY_LOCAL"],
        message: "Local Gemini credentials are forbidden in production",
      });
    }
  });

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(environment);
}
