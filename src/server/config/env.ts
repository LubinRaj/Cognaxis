import { z } from "zod";

const originSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
  }, "Must be an exact HTTP(S) origin without a path, query, fragment, or trailing slash");

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).optional().default(3000),
    APP_ORIGIN: originSchema.optional(),
    GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().min(1).default("gemini-3.7-flash"),
    // One name everywhere: AI Studio injects it in Preview, and the Cloud Run service receives
    // it as a Secret Manager reference exposed as an environment variable, so the raw value is
    // never stored in configuration.
    GEMINI_API_KEY: z.string().min(1).optional(),
    FIREBASE_AUTH_DOMAIN: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i)
      .optional(),
    FEATURE_INSIGHTS: z.stringbool().optional().default(true),
    FEATURE_MAPS: z.stringbool().optional().default(true),
    FEATURE_ORGANIZATIONS: z.stringbool().optional().default(true),
    FEATURE_ADMIN: z.stringbool().optional().default(true),
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

    if (!value.APP_ORIGIN) {
      context.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "APP_ORIGIN is required in production",
      });
    }

    if (!value.GEMINI_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["GEMINI_API_KEY"],
        message:
          "GEMINI_API_KEY is required in production; deliver it as a Secret Manager reference exposed as an environment variable",
      });
    }
  });

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(environment);
}
