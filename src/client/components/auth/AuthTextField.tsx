import type { HTMLInputAutoCompleteAttribute, ReactNode } from "react";
import { PasswordRevealButton } from "./PasswordRevealButton";

// A minimal structural view of a TanStack Form field. FirebaseUI owns the schema, the form state,
// and the credential call; Cognaxis owns the markup so that labels, autocomplete tokens, and error
// association meet the accessibility requirements for this feature.
export type AuthField = {
  name: string;
  state: { value: string; meta: { isTouched: boolean; errors: unknown[] } };
  handleChange: (value: string) => void;
  handleBlur: () => void;
};

export function fieldErrorMessages(errors: unknown[]): string[] {
  const messages: string[] = [];
  for (const issue of errors) {
    if (typeof issue === "string") {
      messages.push(issue);
    } else if (
      typeof issue === "object" &&
      issue !== null &&
      "message" in issue &&
      typeof issue.message === "string"
    ) {
      messages.push(issue.message);
    }
  }
  return messages;
}

type AuthTextFieldProps = {
  field: AuthField;
  label: string;
  type: "email" | "password" | "text";
  autoComplete: HTMLInputAutoCompleteAttribute;
  action?: ReactNode;
  description?: ReactNode;
  describedBy?: string;
  reveal?: { revealed: boolean; onToggle: () => void };
  onValueChange?: (value: string) => void;
};

export function AuthTextField({
  field,
  label,
  type,
  autoComplete,
  action,
  description,
  describedBy,
  reveal,
  onValueChange,
}: AuthTextFieldProps) {
  const messages = fieldErrorMessages(field.state.meta.errors);
  const showError = field.state.meta.isTouched && messages.length > 0;
  const errorId = `${field.name}-error`;
  const descriptionId = description ? `${field.name}-description` : undefined;
  const inputType = reveal?.revealed && type === "password" ? "text" : type;

  const describedByIds = [describedBy, descriptionId, showError ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="cx-field">
      <div className="cx-field__label-row">
        <label className="cx-field__label" htmlFor={field.name}>
          {label}
        </label>
        {action}
      </div>

      {description && (
        <p id={descriptionId} className="cx-field__description">
          {description}
        </p>
      )}

      <div className="cx-field__control">
        <input
          id={field.name}
          name={field.name}
          type={inputType}
          value={field.state.value}
          autoComplete={autoComplete}
          autoCapitalize={type === "email" ? "none" : undefined}
          inputMode={type === "email" ? "email" : undefined}
          spellCheck={type === "email" ? false : undefined}
          aria-invalid={showError || undefined}
          aria-describedby={describedByIds.length > 0 ? describedByIds : undefined}
          data-has-reveal={reveal ? "true" : undefined}
          onChange={(event) => {
            field.handleChange(event.target.value);
            onValueChange?.(event.target.value);
          }}
          onBlur={field.handleBlur}
        />
        {reveal && (
          <PasswordRevealButton
            revealed={reveal.revealed}
            controls={field.name}
            fieldLabel={label}
            onToggle={reveal.onToggle}
          />
        )}
      </div>

      {showError && (
        <p id={errorId} role="alert" className="cx-field__error fui-error">
          {messages.join(" ")}
        </p>
      )}
    </div>
  );
}
