import { AppError } from "./errors.js";

export const MAX_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Raw voice is accepted only by the transient transcription endpoint and is never persisted. */
export const MAX_AUDIO_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/** Enforce product limits after raw-body parsing, with a stable client-safe error. */
export function assertAttachmentSize(mimeType: string, byteLength: number): void {
  const maximum = mimeType.startsWith("image/")
    ? MAX_IMAGE_ATTACHMENT_BYTES
    : mimeType.startsWith("audio/")
      ? MAX_AUDIO_ATTACHMENT_BYTES
      : MAX_DOCUMENT_ATTACHMENT_BYTES;
  if (byteLength > maximum) {
    throw new AppError(
      413,
      "ATTACHMENT_TOO_LARGE",
      mimeType.startsWith("image/")
        ? "Images must be 10 MB or smaller."
        : mimeType.startsWith("audio/")
          ? "Audio recordings must be 15 MB or smaller."
          : "Documents must be 10 MB or smaller.",
    );
  }
}
