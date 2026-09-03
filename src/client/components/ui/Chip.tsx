import type { ReactNode } from "react";
import { MaterialIcon, type MaterialIconName } from "../MaterialIcon";

export type ChipTone = "neutral" | "primary" | "success" | "warning";

const toneClasses: Record<ChipTone, string> = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  primary: "bg-primary-container text-on-primary-container",
  success: "bg-success-container text-on-success-container",
  warning: "bg-warning-container text-on-warning-container",
};

export type ChipProps = {
  children: ReactNode;
  tone?: ChipTone;
  icon?: MaterialIconName;
  /** Renders an activatable assist chip instead of a static label. */
  onClick?: () => void;
  /** With onClick, renders a toggleable filter chip that announces its pressed state. */
  selected?: boolean;
  disabled?: boolean;
  className?: string;
};

export function Chip({
  children,
  tone = "neutral",
  icon,
  onClick,
  selected,
  disabled = false,
  className = "",
}: ChipProps) {
  const toneClass =
    selected === true ? "bg-secondary-container text-on-secondary-container" : toneClasses[tone];
  const shared = `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${toneClass} ${className}`;

  const content = (
    <>
      {icon && (
        <span aria-hidden="true" className="shrink-0">
          <MaterialIcon name={icon} size={14} />
        </span>
      )}
      {children}
    </>
  );

  if (!onClick) {
    return <span className={shared}>{content}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected === undefined ? undefined : selected}
      className={`${shared} focus-visible:outline-focus-ring min-h-9 transition-colors duration-(--duration-feedback) hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:brightness-110`}
    >
      {content}
    </button>
  );
}
