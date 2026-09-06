import { describe, expect, it } from "vitest";
import {
  assertAttachmentSize,
  MAX_AUDIO_ATTACHMENT_BYTES,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from "../../src/server/attachment-limits.js";

describe("attachment size limits", () => {
  it("allows images and documents up to 10 MB and legacy audio up to 15 MB", () => {
    expect(() => assertAttachmentSize("image/png", MAX_IMAGE_ATTACHMENT_BYTES)).not.toThrow();
    expect(() => assertAttachmentSize("application/pdf", MAX_DOCUMENT_ATTACHMENT_BYTES)).not.toThrow();
    expect(() => assertAttachmentSize("audio/webm", MAX_AUDIO_ATTACHMENT_BYTES)).not.toThrow();
  });

  it("rejects an image larger than the image limit", () => {
    expect(() => assertAttachmentSize("image/jpeg", MAX_IMAGE_ATTACHMENT_BYTES + 1)).toThrow(
      "Images must be 10 MB or smaller.",
    );
  });

  it("rejects audio larger than the audio limit", () => {
    expect(() => assertAttachmentSize("audio/ogg", MAX_AUDIO_ATTACHMENT_BYTES + 1)).toThrow(
      "Audio recordings must be 15 MB or smaller.",
    );
  });
});
