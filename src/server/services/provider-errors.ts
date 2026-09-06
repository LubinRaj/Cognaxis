import { AppError } from "../errors.js";

/** A user cancellation must never cause a second provider request. */
export function isRequestCancellation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.message === "AbortError")
  );
}

/** Identify Gemini/API failures that should be shown as a provider quota/rate-limit issue. */
export function isProviderQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const status =
    error && typeof error === "object" && "status" in error && typeof error.status === "number"
      ? error.status
      : null;
  return status === 429 || /resource[_ -]?exhausted|quota|rate[_ -]?limit|too many requests/.test(message);
}

export function providerQuotaError(): AppError {
  return new AppError(
    429,
    "QUOTA_EXCEEDED",
    "The AI provider rate or quota limit was reached. Check the Gemini API key project quota or try again later.",
  );
}
