import type { PersonalCheckIn, PersonalSignal } from "../../../shared/schemas";
import { ENERGY_LABELS, EMOTION_DISPLAY, MOOD_LABELS } from "../../workspace/check-in";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";

export function CheckInSummaryRow({
  signal,
  onEdit,
  editDisabled,
}: {
  signal: PersonalSignal | PersonalCheckIn;
  onEdit: () => void;
  editDisabled?: boolean;
}) {
  const shownEmotions = signal.emotions.slice(0, 3);
  const extraEmotions = signal.emotions.length - shownEmotions.length;

  return (
    <section
      aria-label="Saved check-in"
      className="border-outline-variant bg-surface-container-low flex flex-wrap items-center gap-2 rounded-card border px-3 py-2"
    >
      <span className="text-on-surface-variant text-xs font-medium">Check-in</span>

      {signal.moodScore !== null && <Chip icon="mood">Mood: {MOOD_LABELS[signal.moodScore]}</Chip>}
      {signal.energyScore !== null && (
        <Chip icon="bolt">Energy: {ENERGY_LABELS[signal.energyScore]}</Chip>
      )}
      {shownEmotions.length > 0 && (
        <Chip>
          {shownEmotions.map((emotion) => EMOTION_DISPLAY[emotion]).join(", ")}
          {extraEmotions > 0 ? ` +${extraEmotions}` : ""}
        </Chip>
      )}
      {signal.location && <Chip icon="place">{signal.location.label}</Chip>}
      {signal.note && <Chip icon="edit_document">Note saved</Chip>}

      <Button
        size="compact"
        variant="text"
        onClick={onEdit}
        disabled={editDisabled}
        className="ml-auto"
      >
        Edit
      </Button>
    </section>
  );
}
