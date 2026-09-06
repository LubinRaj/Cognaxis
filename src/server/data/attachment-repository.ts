import type { AttachmentKind, AttachmentReference } from "../../shared/schemas.js";

export type AttachmentScope =
  | { type: "personal"; scopeId: string }
  | { type: "organization"; scopeId: string };

export type StoredAttachment = AttachmentReference & {
  sourceSessionId: string;
  scope: AttachmentScope;
  bytes: Buffer;
};

export interface AttachmentRepository {
  create(
    scope: AttachmentScope,
    sourceSessionId: string,
    kind: AttachmentKind,
    mimeType: string,
    bytes: Buffer,
  ): Promise<AttachmentReference>;
  get(
    scope: AttachmentScope,
    sourceSessionId: string,
    attachmentId: string,
  ): Promise<StoredAttachment | null>;
  delete(scope: AttachmentScope, sourceSessionId: string, attachmentId: string): Promise<boolean>;
  deleteForSession(scope: AttachmentScope, sourceSessionId: string): Promise<void>;
}
