import type { AppConfig } from "../config/env.js";
import { AppError } from "../errors.js";

export interface SecretProvider {
  getGeminiApiKey(): Promise<string>;
}

// The Gemini key arrives as the GEMINI_API_KEY environment variable everywhere: Google AI Studio
// injects it in Preview, and the Cloud Run service receives it as a Secret Manager reference
// exposed as an environment variable. The raw value is never written into configuration files or
// the browser bundle, and the server never needs its own Secret Manager client.
export class EnvSecretProvider implements SecretProvider {
  constructor(private readonly config: Pick<AppConfig, "GEMINI_API_KEY">) {}

  getGeminiApiKey(): Promise<string> {
    if (this.config.GEMINI_API_KEY) return Promise.resolve(this.config.GEMINI_API_KEY);
    return Promise.reject(new AppError(503, "MODEL_NOT_CONFIGURED", "AI is not configured yet."));
  }
}
