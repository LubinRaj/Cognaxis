import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../errors.js";

export interface SecretProvider {
  getGeminiApiKey(): Promise<string>;
}

export class GoogleSecretProvider implements SecretProvider {
  private readonly client = new SecretManagerServiceClient();
  private cachedKey: string | undefined;

  constructor(private readonly config: AppConfig) {}

  async getGeminiApiKey(): Promise<string> {
    if (this.cachedKey) return this.cachedKey;

    if (this.config.GEMINI_API_KEY_SECRET) {
      const [version] = await this.client.accessSecretVersion({
        name: this.config.GEMINI_API_KEY_SECRET,
      });
      const key = version.payload?.data?.toString("utf8").trim();
      if (!key) throw new AppError(503, "MODEL_UNAVAILABLE", "AI is temporarily unavailable.");
      this.cachedKey = key;
      return key;
    }

    if (this.config.NODE_ENV !== "production" && this.config.GEMINI_API_KEY_LOCAL) {
      this.cachedKey = this.config.GEMINI_API_KEY_LOCAL;
      return this.cachedKey;
    }

    throw new AppError(503, "MODEL_NOT_CONFIGURED", "AI is not configured yet.");
  }
}
