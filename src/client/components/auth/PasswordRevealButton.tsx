import { MaterialIcon } from "../MaterialIcon";

type PasswordRevealButtonProps = {
  revealed: boolean;
  onToggle: () => void;
  controls: string;
  fieldLabel: string;
};

export function PasswordRevealButton({
  revealed,
  onToggle,
  controls,
  fieldLabel,
}: PasswordRevealButtonProps) {
  const name = fieldLabel.toLowerCase();

  return (
    <button
      type="button"
      className="cx-password-reveal"
      aria-pressed={revealed}
      aria-controls={controls}
      aria-label={revealed ? `Hide ${name}` : `Show ${name}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
    >
      <MaterialIcon name={revealed ? "visibility_off" : "visibility"} size={20} />
    </button>
  );
}
