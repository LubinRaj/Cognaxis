import type { ButtonHTMLAttributes } from "react";
import { MaterialIcon, type MaterialIconName } from "../MaterialIcon";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: MaterialIconName;
  /** Required: an icon-only control must still expose an accessible name. */
  label: string;
  size?: number;
  tone?: "default" | "destructive" | "primary";
  active?: boolean;
};

const toneClasses = {
  default: "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
  primary: "text-primary hover:bg-primary-container/40",
  destructive: "text-error hover:bg-error-container/50",
} as const;

export function IconButton({
  icon,
  label,
  size = 20,
  tone = "default",
  active = false,
  className = "",
  type = "button",
  title,
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={title ?? label}
      aria-pressed={active || undefined}
      className={`focus-visible:outline-focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-(--duration-feedback) focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "bg-secondary-container text-on-secondary-container" : toneClasses[tone]
      } ${className}`}
    >
      <MaterialIcon name={icon} size={size} />
    </button>
  );
}
