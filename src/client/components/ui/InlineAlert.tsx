import type { ReactNode } from "react";
import { MaterialIcon, type MaterialIconName } from "../MaterialIcon";
import { IconButton } from "./IconButton";

export type AlertTone = "info" | "success" | "warning" | "error";

const toneStyles: Record<AlertTone, { classes: string; icon: MaterialIconName; label: string }> = {
  info: {
    classes: "bg-secondary-container text-on-secondary-container",
    icon: "info",
    label: "Information",
  },
  success: {
    classes: "bg-success-container text-on-success-container",
    icon: "check_circle",
    label: "Success",
  },
  warning: {
    classes: "bg-warning-container text-on-warning-container",
    icon: "warning",
    label: "Warning",
  },
  error: {
    classes: "bg-error-container text-on-error-container",
    icon: "error",
    label: "Error",
  },
};

export type InlineAlertProps = {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  /** Only urgent, unexpected changes should interrupt a screen reader. */
  urgent?: boolean;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
};

export function InlineAlert({
  tone = "info",
  title,
  children,
  urgent = false,
  action,
  onDismiss,
  className = "",
}: InlineAlertProps) {
  const style = toneStyles[tone];

  return (
    <div
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      className={`flex items-start gap-3 rounded-2xl p-4 text-sm ${style.classes} ${className}`}
    >
      {/* The icon carries the meaning that colour alone must not convey. */}
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        <MaterialIcon name={style.icon} size={20} />
      </span>

      <div className="min-w-0 flex-1">
        <span className="sr-only">{style.label}: </span>
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? "mt-1" : undefined}>{children}</div>
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>

      {onDismiss && (
        <IconButton
          icon="close"
          label="Dismiss message"
          size={18}
          onClick={onDismiss}
          iconClassName="text-current"
          className="-my-1.5 -mr-1.5 h-9 w-9 text-current hover:bg-black/5 dark:hover:bg-white/10"
        />
      )}
    </div>
  );
}
