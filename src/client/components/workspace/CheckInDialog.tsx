import { useId, useState } from "react";
import type { EmotionLabel, PersonalCheckIn, PersonalSignal, Preferences, UpsertSignalInput } from "../../../shared/schemas";
import { emotionLabels } from "../../../shared/schemas";
import {
  ENERGY_LABELS,
  EMOTION_DISPLAY,
  MAX_EMOTIONS,
  MAX_NOTE_LENGTH,
  MOOD_LABELS,
  draftFromSignal,
  isDraftEmpty,
  toUpsertInput,
  toggleEmotion,
  type CheckInDraft,
  type Score,
} from "../../workspace/check-in";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Dialog } from "../ui/Dialog";
import { InlineAlert } from "../ui/InlineAlert";
import { CheckInLocationSection } from "./CheckInLocationSection";

const SCORES: Score[] = [1, 2, 3, 4, 5];

type ScoreGroupProps = {
  legend: string;
  labels: Record<Score, string>;
  value: Score | null;
  name: string;
  onChange: (value: Score | null) => void;
  disabled: boolean;
};

function ScoreGroup({ legend, labels, value, name, onChange, disabled }: ScoreGroupProps) {
  return (
    <fieldset disabled={disabled}>
      <div className="flex items-baseline justify-between gap-2">
        <legend className="text-on-surface text-sm font-medium">{legend}</legend>
        {value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-primary focus-visible:outline-focus-ring rounded-control text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Clear {legend.toLowerCase()}
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1" role="radiogroup" aria-label={legend}>
        {SCORES.map((score) => {
          const checked = value === score;
          return (
            <label
              key={score}
              className={`flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control border px-1 py-2 text-center motion-safe:transition-colors motion-safe:duration-feedback ${
                checked
                  ? "border-primary bg-secondary-container text-on-secondary-container"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
              } has-[:focus-visible]:outline-focus-ring has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2`}
            >
              <input
                type="radio"
                name={name}
                value={score}
                checked={checked}
                onChange={() => onChange(score)}
                className="sr-only"
              />
              <span className="text-sm font-semibold" aria-hidden="true">
                {score}
              </span>
              <span className="text-[10px] leading-tight">{labels[score]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export type CheckInDialogProps = {
  sessionTitle: string;
  initialSignal: PersonalSignal | PersonalCheckIn | null;
  saving: boolean;
  errorMessage: string | null;
  onDismissError: () => void;
  onSave: (input: UpsertSignalInput) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
  onClose: () => void;
  nudge?: boolean;
  locationMode?: Preferences["locationMode"];
};

export function CheckInDialog({
  sessionTitle,
  initialSignal,
  saving,
  errorMessage,
  onDismissError,
  onSave,
  onRemove,
  onClose,
  nudge = false,
  locationMode = "off",
}: CheckInDialogProps) {
  const [draft, setDraft] = useState<CheckInDraft>(() => draftFromSignal(initialSignal));
  const noteId = useId();
  const noteCountId = useId();

  const empty = isDraftEmpty(draft);
  const locationLabelMissing = draft.location !== null && draft.location.label.trim() === "";

  async function save() {
    const delivered = await onSave(toUpsertInput(draft));
    if (delivered) onClose();
  }

  async function remove() {
    const removed = await onRemove();
    if (removed) onClose();
  }

  return (
    <Dialog
      open
      title="Private check-in"
      description={`How you are arriving, kept privately with “${sessionTitle}”. Every part is optional, and each save is a time-stamped moment.`}
      onClose={onClose}
      busy={saving}
      size="wide"
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={saving}>
            {nudge ? "Skip for now" : "Cancel"}
          </Button>
          {initialSignal && (
            <Button
              variant="text"
              className="text-error hover:bg-error-container/40"
              onClick={() => void remove()}
              disabled={saving}
            >
              Remove latest check-in
            </Button>
          )}
          <Button
            onClick={() => void save()}
            disabled={saving || empty || locationLabelMissing}
            loading={saving}
            loadingLabel="Saving…"
            title={locationLabelMissing ? "Give the selected place a label first." : undefined}
          >
            Save check-in
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {errorMessage && (
          <InlineAlert tone="error" urgent onDismiss={onDismissError}>
            {errorMessage}
          </InlineAlert>
        )}

        <ScoreGroup
          legend="Mood"
          labels={MOOD_LABELS}
          value={draft.moodScore}
          name="checkin-mood"
          disabled={saving}
          onChange={(moodScore) => setDraft((current) => ({ ...current, moodScore }))}
        />

        <ScoreGroup
          legend="Energy"
          labels={ENERGY_LABELS}
          value={draft.energyScore}
          name="checkin-energy"
          disabled={saving}
          onChange={(energyScore) => setDraft((current) => ({ ...current, energyScore }))}
        />

        <fieldset disabled={saving}>
          <legend className="text-on-surface text-sm font-medium">
            Emotions
            <span className="text-on-surface-variant ml-1 font-normal">
              (up to {MAX_EMOTIONS})
            </span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {emotionLabels.map((emotion: EmotionLabel) => {
              const selected = draft.emotions.includes(emotion);
              return (
                <Chip
                  key={emotion}
                  selected={selected}
                  disabled={saving || (!selected && draft.emotions.length >= MAX_EMOTIONS)}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      emotions: toggleEmotion(current.emotions, emotion),
                    }))
                  }
                >
                  {EMOTION_DISPLAY[emotion]}
                </Chip>
              );
            })}
          </div>
        </fieldset>

        <CheckInLocationSection
          location={draft.location}
          disabled={saving}
          locationMode={locationMode}
          onChange={(location) => setDraft((current) => ({ ...current, location }))}
        />

        <div>
          <label htmlFor={noteId} className="text-on-surface text-sm font-medium">
            Private note
            <span className="text-on-surface-variant ml-1 font-normal">(optional)</span>
          </label>
          <textarea
            id={noteId}
            value={draft.note}
            maxLength={MAX_NOTE_LENGTH}
            rows={3}
            disabled={saving}
            aria-describedby={noteCountId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, note: event.target.value }))
            }
            className="border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant focus-visible:outline-focus-ring mt-2 w-full resize-none rounded-field border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            placeholder="Anything worth remembering about this moment."
          />
          <p id={noteCountId} className="text-on-surface-variant mt-1 text-right text-xs">
            {draft.note.length}/{MAX_NOTE_LENGTH}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
