import { GoogleGenAI } from "@google/genai";
import type { AppConfig } from "../config/env.js";
import { isRequestCancellation } from "./provider-errors.js";

/**
 * Keeps the AI Studio Gemini API as the primary path and invokes Gemini Enterprise Agent Platform
 * whenever that primary request fails. The Cloud Run service identity supplies Application Default
 * Credentials, so no Agent Platform key is stored.
 */
export class AgentPlatformFallback {
  private client: GoogleGenAI | undefined;

  constructor(
    private readonly config: Pick<AppConfig, "GEMINI_MODEL" | "GOOGLE_CLOUD_PROJECT" | "AGENT_PLATFORM_FALLBACK_ENABLED">,
  ) {}

  get configured(): boolean {
    return this.config.AGENT_PLATFORM_FALLBACK_ENABLED && Boolean(this.config.GOOGLE_CLOUD_PROJECT);
  }

  private getClient(): GoogleGenAI | undefined {
    const project = this.config.GOOGLE_CLOUD_PROJECT;
    if (!this.config.AGENT_PLATFORM_FALLBACK_ENABLED || !project) return undefined;
    if (!this.client) {
      this.client = new GoogleGenAI({
        enterprise: true,
        project,
        location: "global",
      });
    }
    return this.client;
  }

  async run<T>(
    operation: string,
    primary: () => Promise<T>,
    agentPlatform: (client: GoogleGenAI, model: string) => Promise<T>,
    model = this.config.GEMINI_MODEL,
  ): Promise<T> {
    try {
      return await primary();
    } catch (primaryError: unknown) {
      return this.fallback(operation, primaryError, agentPlatform, model);
    }
  }

  async fallback<T>(
    operation: string,
    primaryError: unknown,
    agentPlatform: (client: GoogleGenAI, model: string) => Promise<T>,
    model = this.config.GEMINI_MODEL,
  ): Promise<T> {
    // A user deliberately cancelling an in-flight request is not a provider failure and must not
    // result in an unexpected second response.
    if (isRequestCancellation(primaryError)) throw primaryError;

    const client = this.getClient();
    if (!client) throw primaryError;

    // Do not log prompts, responses, attachments, identities, or provider error payloads.
    console.warn(JSON.stringify({ severity: "WARNING", event: "agent_platform_fallback", operation }));
    return agentPlatform(client, model);
  }
}
