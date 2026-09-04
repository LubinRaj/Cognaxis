import { useEffect, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "../../workspace/session-sync";
import { Chip } from "../ui/Chip";
import { IconButton } from "../ui/IconButton";

const STARTER_PROMPTS = [
  "Help me think through a difficult decision.",
  "Reflect on what I learned today.",
  "Turn these notes into clear next steps.",
  "Explore a challenge from another perspective.",
];

const WARNING_THRESHOLD = Math.floor(MAX_MESSAGE_LENGTH * 0.9);

type ReflectionComposerProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  sending: boolean;
  submissionBlocked?: boolean;
  submissionBlockedReason?: string;
  disabled: boolean;
  disabledReason?: string;
  showStarterPrompts: boolean;
};

export function ReflectionComposer({
  draft,
  onDraftChange,
  onSubmit,
  onCancel,
  sending,
  submissionBlocked = false,
  submissionBlockedReason,
  disabled,
  disabledReason,
  showStarterPrompts,
}: ReflectionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [composing, setComposing] = useState(false);

  const trimmed = draft.trim();
  const canSend = trimmed.length > 0 && !sending && !submissionBlocked && !disabled;
  const remaining = MAX_MESSAGE_LENGTH - draft.length;
  const nearLimit = draft.length >= WARNING_THRESHOLD;
  const atLimit = draft.length >= MAX_MESSAGE_LENGTH;

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

  return (
    <div className="border-outline-variant bg-surface/95 border-t px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-5">
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

        <form
          className="border-outline-variant bg-surface-container-low flex items-end gap-2 rounded-3xl border p-2 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) onSubmit();
          }}
        >
          <label htmlFor="reflection-composer" className="sr-only">
            Write your reflection
          </label>
          <textarea
            ref={textareaRef}
            id="reflection-composer"
            rows={1}
            value={draft}
            disabled={disabled}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={
              disabled
                ? (disabledReason ?? "Sending is unavailable.")
                : "Write what is on your mind…"
            }
            aria-describedby="composer-help"
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter inserts a line break, and an active IME composition is
              // never interrupted by a submission.
              if (event.key !== "Enter" || event.shiftKey) return;
              if (composing || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (canSend) onSubmit();
            }}
            className="text-on-surface placeholder:text-on-surface-variant max-h-52 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[0.9375rem] leading-relaxed outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />

          {sending && onCancel ? (
            <IconButton
              icon="close"
              label="Cancel response"
              type="button"
              tone="primary"
              onClick={onCancel}
              className="bg-error text-on-error hover:bg-error mb-0.5 hover:opacity-90"
            />
          ) : (
            <IconButton
              icon="send"
              label={sending ? "Sending message" : "Send message"}
              type="submit"
              tone="primary"
              disabled={!canSend}
              title={submissionBlocked ? submissionBlockedReason : undefined}
              className="bg-primary text-on-primary hover:bg-primary disabled:bg-surface-container-high disabled:text-on-surface-variant mb-0.5 hover:opacity-90"
            />
          )}
        </form>

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
