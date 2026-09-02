import type { ButtonHTMLAttributes, ReactNode } from "react";
import { MaterialIcon } from "../MaterialIcon";

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "destructive";
export type ButtonSize = "standard" | "compact";

const variantClasses: Record<ButtonVariant, string> = {
  filled: "bg-primary text-on-primary hover:opacity-90",
  tonal:
    "bg-secondary-container text-on-secondary-container hover:brightness-95 dark:hover:brightness-110",
  outlined:
    "border border-outline text-on-surface hover:bg-surface-container-high bg-transparent",
  text: "text-primary hover:bg-primary-container/40 bg-transparent",
  destructive: "bg-error text-on-error hover:opacity-90",
};

const sizeClasses: Record<ButtonSize, string> = {
  standard: "min-h-11 px-6 text-sm",
  compact: "min-h-10 px-4 text-sm",
};

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  icon?: Parameters<typeof MaterialIcon>[0]["name"];
  trailingIcon?: Parameters<typeof MaterialIcon>[0]["name"];
  fullWidth?: boolean;
  /** Marks this control as the one a dialog should focus first. */
  "data-autofocus"?: "true";
  children: ReactNode;
};

export function Button({
  variant = "filled",
  size = "standard",
  loading = false,
  loadingLabel,
  icon,
  trailingIcon,
  fullWidth = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const inactive = disabled === true || loading;

  return (
    <button
      {...props}
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      className={`focus-visible:outline-focus-ring inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[background-color,opacity,filter] duration-(--duration-feedback) focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        variantClasses[variant]
      } ${sizeClasses[size]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="motion-safe:animate-spin motion-reduce:animate-none"
        >
          <MaterialIcon name="progress_activity" size={18} />
        </span>
      ) : (
        icon && (
          <span aria-hidden="true" className="shrink-0">
            <MaterialIcon name={icon} size={18} />
          </span>
        )
      )}

      {/* The label stays mounted so the button keeps its width while loading. */}
      <span className={loading && loadingLabel ? "sr-only" : undefined}>{children}</span>
      {loading && loadingLabel && <span>{loadingLabel}</span>}

      {trailingIcon && !loading && (
        <span aria-hidden="true" className="shrink-0">
          <MaterialIcon name={trailingIcon} size={18} />
        </span>
      )}
    </button>
  );
}
