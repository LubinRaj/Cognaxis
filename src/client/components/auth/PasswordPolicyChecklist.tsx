import type { PasswordValidationStatus } from "firebase/auth";
import { MaterialIcon } from "../MaterialIcon";

export type PolicyRequirement = { id: string; label: string; met: boolean };

export function describePasswordPolicy(
  status: PasswordValidationStatus | null,
): PolicyRequirement[] {
  if (!status) return [];

  const options = status.passwordPolicy.customStrengthOptions;
  const requirements: PolicyRequirement[] = [];

  if (typeof options.minPasswordLength === "number") {
    requirements.push({
      id: "min-length",
      label: `At least ${options.minPasswordLength} characters`,
      met: status.meetsMinPasswordLength === true,
    });
  }
  if (typeof options.maxPasswordLength === "number") {
    requirements.push({
      id: "max-length",
      label: `No more than ${options.maxPasswordLength} characters`,
      met: status.meetsMaxPasswordLength === true,
    });
  }
  if (options.containsLowercaseLetter) {
    requirements.push({
      id: "lowercase",
      label: "A lowercase letter",
      met: status.containsLowercaseLetter === true,
    });
  }
  if (options.containsUppercaseLetter) {
    requirements.push({
      id: "uppercase",
      label: "An uppercase letter",
      met: status.containsUppercaseLetter === true,
    });
  }
  if (options.containsNumericCharacter) {
    requirements.push({
      id: "numeric",
      label: "A number",
      met: status.containsNumericCharacter === true,
    });
  }
  if (options.containsNonAlphanumericCharacter) {
    requirements.push({
      id: "symbol",
      label: "A symbol",
      met: status.containsNonAlphanumericCharacter === true,
    });
  }

  return requirements;
}

type PasswordPolicyChecklistProps = {
  id: string;
  requirements: PolicyRequirement[];
  unavailable: boolean;
};

export function PasswordPolicyChecklist({
  id,
  requirements,
  unavailable,
}: PasswordPolicyChecklistProps) {
  if (unavailable) {
    return (
      <p id={id} className="text-on-surface-variant text-xs leading-relaxed">
        Choose a long, unique password. Your password is checked against the Cognaxis password
        policy when you submit the form.
      </p>
    );
  }

  if (requirements.length === 0) return null;

  return (
    <div id={id}>
      <p className="text-on-surface-variant text-xs font-medium">Your password needs:</p>
      <ul className="mt-2 space-y-1.5">
        {requirements.map((requirement) => (
          <li
            key={requirement.id}
            className={`flex items-center gap-2 text-xs ${
              requirement.met ? "text-on-surface" : "text-on-surface-variant"
            }`}
          >
            <span
              className={requirement.met ? "text-primary" : "text-on-surface-variant"}
              aria-hidden="true"
            >
              <MaterialIcon
                name={requirement.met ? "check_circle" : "radio_button_unchecked"}
                size={16}
              />
            </span>
            <span>{requirement.label}</span>
            <span className="sr-only">{requirement.met ? "requirement met" : "not yet met"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
