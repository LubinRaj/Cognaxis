import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { MaterialIcon, type MaterialIconName } from "../MaterialIcon";
import { IconButton } from "./IconButton";

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  /** Hides the visible label but keeps it available to assistive technology. */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
  leadingIcon?: MaterialIconName;
  onClear?: () => void;
  clearLabel?: string;
  inputRef?: Ref<HTMLInputElement>;
};

export function TextField({
  label,
  hideLabel = false,
  hint,
  error,
  leadingIcon,
  onClear,
  clearLabel = "Clear",
  inputRef,
  className = "",
  value,
  ...props
}: TextFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const showClear = Boolean(onClear) && typeof value === "string" && value.length > 0;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={
          hideLabel ? "sr-only" : "text-on-surface text-sm font-medium"
        }
      >
        {label}
      </label>

      <div className="relative flex items-center">
        {leadingIcon && (
          <span
            aria-hidden="true"
            className="text-on-surface-variant pointer-events-none absolute left-3"
          >
            <MaterialIcon name={leadingIcon} size={20} />
          </span>
        )}

        <input
          {...props}
          ref={inputRef}
          id={inputId}
          value={value}
          aria-label={hideLabel ? label : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy.length > 0 ? describedBy : undefined}
          className={`text-on-surface bg-surface placeholder:text-on-surface-variant min-h-11 w-full rounded-xl border text-sm transition-[border-color,box-shadow] duration-(--duration-feedback) focus-visible:outline-none ${
            leadingIcon ? "pl-11" : "pl-4"
          } ${showClear ? "pr-11" : "pr-4"} ${
            error
              ? "border-error focus-visible:shadow-[0_0_0_2px_var(--sys-error)]"
              : "border-outline focus-visible:border-primary focus-visible:shadow-[0_0_0_2px_var(--sys-primary)]"
          } ${className}`}
        />

        {showClear && (
          <IconButton
            icon="close"
            label={clearLabel}
            size={18}
            onClick={onClear}
            className="absolute right-0.5 h-10 w-10"
          />
        )}
      </div>

      {hint && !error && (
        <p id={hintId} className="text-on-surface-variant text-xs leading-relaxed">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-error flex items-start gap-1.5 text-xs">
          <span aria-hidden="true" className="mt-px">
            <MaterialIcon name="error" size={14} />
          </span>
          {error}
        </p>
      )}
    </div>
  );
}
