/**
 * Derives up to two initials from a display name or email address. Only letters and digits are
 * kept, so untrusted profile text can never introduce markup or control characters into the DOM.
 */
export function deriveInitials(displayName?: string | null, email?: string | null): string {
  const source = (displayName ?? "").trim() || (email ?? "").split("@")[0] || "";
  const words = source
    .split(/[\s._-]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word.length > 0);

  if (words.length === 0) return "C";

  const initials = words.slice(0, 2).map((word) => word[0].toUpperCase());
  return initials.join("");
}

export type AvatarProps = {
  displayName?: string | null;
  email?: string | null;
  size?: "small" | "medium";
  className?: string;
};

export function Avatar({ displayName, email, size = "medium", className = "" }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`bg-primary-container text-on-primary-container flex shrink-0 items-center justify-center rounded-full font-medium ${
        size === "small" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"
      } ${className}`}
    >
      {deriveInitials(displayName, email)}
    </span>
  );
}
