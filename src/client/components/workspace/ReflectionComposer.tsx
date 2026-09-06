import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "../../workspace/session-sync";
import { Chip } from "../ui/Chip";
import { IconButton } from "../ui/IconButton";
import { Skeleton } from "../ui/Skeleton";
import { MaterialIcon } from "../MaterialIcon";
import type { AttachmentReference } from "../../../shared/schemas";

type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechErrorEvent = {
  error?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event?: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const STARTER_PROMPTS = [
  "Help me think through a difficult decision.",
  "Reflect on what I learned today.",
  "Turn these notes into clear next steps.",
  "Explore a challenge from another perspective.",
];

const WARNING_THRESHOLD = Math.floor(MAX_MESSAGE_LENGTH * 0.9);
const MAX_RECORDING_MS = 5 * 60 * 1_000;

type ReflectionComposerProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  sending: boolean;
  submissionBlocked?: boolean;
  submissionBlockedReason?: string;
  disabled: boolean;
  disabledReason?: string;
  showStarterPrompts: boolean;
  attachments?: AttachmentReference[];
  onUploadAttachment?: (file: File) => Promise<AttachmentReference | null>;
  onRemoveAttachment?: (attachmentId: string) => Promise<boolean>;
  onTranscribeAttachment?: (attachmentId: string) => Promise<string | null>;
  onTranscribeVoice?: (file: File) => Promise<string | null>;
  attachmentError?: string | null;
};

export function ReflectionComposer({
  draft,
  onDraftChange,
  onSubmit,
  sending,
  submissionBlocked = false,
  submissionBlockedReason,
  disabled,
  disabledReason,
  showStarterPrompts,
  attachments = [],
  onUploadAttachment,
  onRemoveAttachment,
  onTranscribeAttachment,
  onTranscribeVoice,
  attachmentError,
}: ReflectionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionTranscriptRef = useRef("");
  const recognitionActiveRef = useRef(false);
  const recognitionCompletionRef = useRef<"listening" | "done" | "discard">("listening");
  const [composing, setComposing] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [pendingUploadName, setPendingUploadName] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [transcribedAttachmentIds, setTranscribedAttachmentIds] = useState<Set<string>>(() => new Set());
  const imagePreviewsRef = useRef<Record<string, string>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);

  useEffect(() => {
    imagePreviewsRef.current = imagePreviews;
  }, [imagePreviews]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const trimmed = draft.trim();
  const canSend = trimmed.length > 0 && !sending && !submissionBlocked && !disabled;
  const remaining = MAX_MESSAGE_LENGTH - draft.length;
  const nearLimit = draft.length >= WARNING_THRESHOLD;
  const atLimit = draft.length >= MAX_MESSAGE_LENGTH;

  useEffect(() => () => {
    recognitionActiveRef.current = false;
    recognitionCompletionRef.current = "discard";
    recognitionRef.current?.stop();
    recorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    Object.values(imagePreviewsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const startedAt = recordingStartedAtRef.current;
      if (startedAt === null) return;
      const elapsed = Date.now() - startedAt;
      setRecordingElapsedMs(Math.min(elapsed, MAX_RECORDING_MS));
      if (elapsed >= MAX_RECORDING_MS) {
        setVoiceError("The 5-minute recording limit was reached.");
        recorderRef.current?.stop();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 208)}px`;
  }, [draft]);

  function applyPrompt(prompt: string) {
    // The prompt is placed into the composer for editing; it is never sent automatically.
    onDraftChange(prompt);
    textareaRef.current?.focus();
  }

  function appendTranscript(transcript: string) {
    const existing = draftRef.current.trim();
    const next = `${existing}${existing ? "\n" : ""}${transcript.trim()}`.slice(0, MAX_MESSAGE_LENGTH);
    draftRef.current = next;
    onDraftChange(next);
  }

  async function transcribe(attachmentId: string): Promise<void> {
    if (!onTranscribeAttachment) return;
    setUploading(true);
    try {
      const transcript = await onTranscribeAttachment(attachmentId);
      if (!transcript?.trim()) return;
      appendTranscript(transcript);
      setTranscribedAttachmentIds((current) => new Set(current).add(attachmentId));
    } finally {
      setUploading(false);
    }
  }

  function toggleVoice() {
    if (recording || listening) {
      recorderRef.current?.stop();
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (Recognition) {
      setVoiceError(null);
      recognitionTranscriptRef.current = "";
      recognitionActiveRef.current = true;
      recognitionCompletionRef.current = "listening";
      const recognition = new Recognition();
      recognition.lang = navigator.language || "en-US";
      recognition.interimResults = false;
      recognition.continuous = true;
      recognition.onresult = (event) => {
        const transcript = Array.from({ length: event.results.length - event.resultIndex })
          .map((_, index) => event.results[event.resultIndex + index]?.[0]?.transcript ?? "")
          .join(" ")
          .trim();
        if (transcript) {
          recognitionTranscriptRef.current = [recognitionTranscriptRef.current, transcript]
            .filter(Boolean)
            .join(" ");
        }
      };
      recognition.onerror = (event) => {
        // Chrome can report no-speech after a pause. It must not finalize the draft; onend will
        // restart the continuous recognition session while the user remains in recording mode.
        if (event?.error === "no-speech" || event?.error === "aborted") return;
        recognitionActiveRef.current = false;
        setListening(false);
        recognitionRef.current = null;
        setVoiceError("Voice input could not be completed. You can still type your thought.");
      };
      recognition.onend = () => {
        if (
          recognitionActiveRef.current &&
          recognitionCompletionRef.current === "listening"
        ) {
          // SpeechRecognition may end after silence despite continuous=true. Keep recording and
          // retain the transcript until the user explicitly chooses Done or Discard.
          window.setTimeout(() => {
            if (!recognitionActiveRef.current || recognitionRef.current !== recognition) return;
            try {
              recognition.start();
            } catch {
              recognitionActiveRef.current = false;
              setListening(false);
              recognitionRef.current = null;
              setVoiceError("Voice input could not be resumed. You can still type your thought.");
            }
          }, 0);
          return;
        }
        recognitionRef.current = null;
        setListening(false);
        if (recognitionCompletionRef.current === "done" && recognitionTranscriptRef.current) {
          appendTranscript(recognitionTranscriptRef.current);
        }
        recognitionTranscriptRef.current = "";
        recognitionActiveRef.current = false;
        recognitionCompletionRef.current = "listening";
      };
      recognitionRef.current = recognition;
      setListening(true);
      try {
        recognition.start();
      } catch {
        recognitionRef.current = null;
        setListening(false);
        setVoiceError("Voice input could not be started. Check microphone permission and try again.");
      }
      return;
    }
    if (onTranscribeVoice && typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined") {
      void startRecording();
      return;
    }
    setVoiceError("Voice input is not supported in this browser. You can still type your thought.");
  }

  async function startRecording() {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"]
        .find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
      const recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      mediaStreamRef.current = mediaStream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        setRecording(false);
        setVoiceError("Voice recording could not be completed. You can still type your thought.");
        mediaStream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        setRecording(false);
        recordingStartedAtRef.current = null;
        recorderRef.current = null;
        mediaStream.getTracks().forEach((track) => track.stop());
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          setRecordingElapsedMs(0);
          setVoiceError(null);
          return;
        }
        const type = recorder.mimeType || "audio/webm";
        const file = new File(chunks, "voice-note.webm", { type });
        void (async () => {
          setUploading(true);
          try {
            const transcript = await onTranscribeVoice?.(file);
            if (transcript?.trim()) appendTranscript(transcript);
          } catch {
            setVoiceError("Voice input could not be transcribed. You can still type your thought.");
          } finally {
            setUploading(false);
            setRecordingElapsedMs(0);
          }
        })();
      };
      setVoiceError(null);
      discardRecordingRef.current = false;
      setRecordingElapsedMs(0);
      recordingStartedAtRef.current = Date.now();
      setRecording(true);
      recorder.start();
    } catch {
      setVoiceError("Microphone access was unavailable. You can still type your thought.");
    }
  }

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onUploadAttachment || attachments.length >= 3) return;
    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setUploadingAttachment(true);
    setPendingUploadName(file.name);
    setUploading(true);
    try {
      const attachment = await onUploadAttachment(file);
      if (attachment?.kind === "image" && previewUrl) {
        setImagePreviews((current) => ({ ...current, [attachment.id]: previewUrl }));
      } else if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      // Voice is handled by the transient voice endpoint; attachments are only images/documents.
    } finally {
      setUploading(false);
      setUploadingAttachment(false);
      setPendingUploadName(null);
    }
  }

  function discardRecording() {
    if (!recording) return;
    discardRecordingRef.current = true;
    recorderRef.current?.stop();
  }

  function completeVoice() {
    if (listening) {
      recognitionCompletionRef.current = "done";
      recognitionActiveRef.current = false;
      recognitionRef.current?.stop();
      return;
    }
    if (recording) recorderRef.current?.stop();
  }

  function discardVoice() {
    if (listening) {
      recognitionCompletionRef.current = "discard";
      recognitionActiveRef.current = false;
      recognitionTranscriptRef.current = "";
      recognitionRef.current?.stop();
    } else {
      discardRecording();
    }
  }

  function removeAttachment(attachment: AttachmentReference) {
    if (!onRemoveAttachment) return;
    void onRemoveAttachment(attachment.id).then((removed) => {
      if (!removed) return;
      const previewUrl = imagePreviews[attachment.id];
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setImagePreviews((current) => {
        const next = { ...current };
        delete next[attachment.id];
        return next;
      });
      setTranscribedAttachmentIds((current) => {
        const next = new Set(current);
        next.delete(attachment.id);
        return next;
      });
    });
  }

  const recordingSeconds = Math.floor(recordingElapsedMs / 1_000);
  const formattedRecordingTime = `${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="border-outline-variant bg-surface/95 border-t px-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md sm:px-5 sm:pt-3">
      <div className="mx-auto w-full max-w-[900px]">
        {showStarterPrompts && !disabled && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Starter prompts">
            {STARTER_PROMPTS.map((prompt) => (
              <Chip
                key={prompt}
                tone="neutral"
                onClick={() => applyPrompt(prompt)}
                className="shrink-0 whitespace-nowrap"
              >
                {prompt}
              </Chip>
            ))}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2" aria-label="Attachments">
            {attachments.map((attachment) => (
              <span key={attachment.id} className="bg-surface-container-high text-on-surface-variant inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs">
                {attachment.kind === "image" && imagePreviews[attachment.id] ? (
                  <img src={imagePreviews[attachment.id]} alt="Attached image preview" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <MaterialIcon name={attachment.kind === "image" || attachment.kind === "document" ? "description" : "mic"} size={14} />
                )}
                {attachment.kind === "image" ? "Image attached" : attachment.kind === "document" ? "Document attached" : "Audio attached"}
                {attachment.kind === "audio" && onTranscribeAttachment && !transcribedAttachmentIds.has(attachment.id) && (
                  <button
                    type="button"
                    className="text-primary hover:text-on-surface rounded px-1 font-medium"
                    onClick={() => void transcribe(attachment.id)}
                    disabled={sending || uploading}
                  >
                    Retry transcription
                  </button>
                )}
                {onRemoveAttachment && (
                  <button
                    type="button"
                    className="hover:text-on-surface ml-1 rounded-full"
                    aria-label="Remove attachment"
                    onClick={() => removeAttachment(attachment)}
                    disabled={sending}
                  >
                    <MaterialIcon name="close" size={14} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {uploadingAttachment && (
          <div
            className="border-outline-variant bg-surface-container-low mb-2 flex min-h-10 items-center gap-2 rounded-full border px-2 py-1.5"
            role="status"
            aria-live="polite"
            aria-label={`Uploading ${pendingUploadName ?? "attachment"}`}
          >
            <Skeleton className="h-8 w-8 shrink-0 rounded" />
            <span className="text-on-surface-variant min-w-0 flex-1 truncate text-xs">
              Uploading {pendingUploadName ?? "attachment"}…
            </span>
            <Skeleton className="h-3 w-12 shrink-0 rounded" />
          </div>
        )}

        <form
          className="border-outline-variant bg-surface-container-low flex items-end gap-1 rounded-3xl border p-1.5 shadow-sm sm:gap-2 sm:p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) onSubmit();
          }}
        >
          <label htmlFor="reflection-composer" className="sr-only">
            Write your reflection
          </label>
          {recording || listening ? (
            <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2" role="status" aria-live="polite">
              <span className="text-on-surface min-w-0 shrink text-xs font-medium sm:text-sm">
                {recording ? `Recording ${formattedRecordingTime}` : "Listening…"}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="flex h-7 w-20 shrink-0 items-center justify-end gap-0.5 sm:w-28" aria-hidden="true">
                  {[3, 5, 8, 12, 7, 10, 5, 8, 4, 7, 11, 6].map((height, index) => (
                    <span key={index} className="bg-primary w-1 rounded-full motion-safe:animate-pulse" style={{ height: `${height * 2}px`, animationDelay: `${index * 70}ms` }} />
                  ))}
                </span>
                <IconButton
                  icon="close"
                  label="Discard voice recording"
                  tone="destructive"
                  iconClassName="text-error"
                  onClick={discardVoice}
                  className="bg-error-container text-error hover:bg-error-container"
                />
                <IconButton
                  icon="check"
                  label="Finish voice recording"
                  tone="primary"
                  iconClassName="text-on-primary"
                  onClick={completeVoice}
                  className="bg-primary text-on-primary hover:!bg-primary"
                />
              </div>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              id="reflection-composer"
              rows={1}
              value={draft}
              disabled={disabled}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={disabled ? (disabledReason ?? "Sending is unavailable.") : "Write what is on your mind…"}
              aria-describedby="composer-help"
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                if (composing || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (canSend) onSubmit();
              }}
              className="text-on-surface placeholder:text-on-surface-variant max-h-52 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-[0.9375rem] leading-relaxed outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:px-3"
            />
          )}

          {!recording && !listening && onUploadAttachment && (
            <label
              className="text-on-surface-variant hover:bg-surface-container-high inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:opacity-50"
              title="Attach an image or document"
            >
              <span className="sr-only">Attach an image or document</span>
              <MaterialIcon name="add" size={20} />
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                disabled={disabled || sending || uploading || attachments.length >= 3}
                onChange={(event) => void handleAttachmentChange(event)}
              />
            </label>
          )}

          {!recording && !listening && <IconButton
            icon="mic"
            label={recording || listening ? "Stop voice input" : "Record voice input"}
            type="button"
            tone="default"
            disabled={disabled || sending}
            onClick={toggleVoice}
            iconClassName={recording || listening ? "text-on-primary-container" : ""}
            className={recording || listening ? "bg-primary-container text-on-primary-container" : ""}
          />}
          {!recording && !listening && <IconButton
            icon="send"
            label={sending ? "Sending message" : "Send message"}
            type="submit"
            tone="default"
            disabled={!canSend}
            title={submissionBlocked ? submissionBlockedReason : undefined}
            iconClassName={canSend ? "text-primary" : "text-on-surface-variant"}
            className="mb-0.5 bg-transparent hover:bg-transparent"
          />}
        </form>

        {(voiceError || attachmentError) && (
          <p className="text-error mt-1.5 px-2 text-xs" role="status">{voiceError ?? attachmentError}</p>
        )}

        <div
          id="composer-help"
          className="mt-1.5 flex items-center justify-between gap-3 px-2 text-xs"
        >
          <span className="text-on-surface-variant hidden sm:inline">
            {disabled
              ? (disabledReason ?? "")
              : submissionBlocked
                ? (submissionBlockedReason ?? "Another message is still being sent.")
              : "Enter sends · Shift + Enter adds a line break"}
          </span>
          <span className="text-on-surface-variant sm:hidden">
            {disabled
              ? (disabledReason ?? "")
              : submissionBlocked
                ? (submissionBlockedReason ?? "Another message is still being sent.")
                : ""}
          </span>

          {nearLimit && (
            <span
              role="status"
              className={atLimit ? "text-error font-medium" : "text-warning font-medium"}
            >
              {atLimit
                ? `Message limit reached. Remove characters to continue.`
                : `${remaining} characters left`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
