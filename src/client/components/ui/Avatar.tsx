import { useState } from "react";

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
  photoUrl?: string | null;
  size?: "small" | "medium" | "large";
  className?: string;
};

export function Avatar({ displayName, email, photoUrl, size = "medium", className = "" }: AvatarProps) {
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const showPhoto = Boolean(photoUrl) && photoUrl !== failedPhotoUrl;

  return (
    <span
      aria-hidden="true"
      className={`bg-primary-container text-on-primary-container flex shrink-0 items-center justify-center rounded-full font-medium ${
        size === "small" ? "h-8 w-8 text-xs" : size === "large" ? "h-20 w-20 text-xl" : "h-10 w-10 text-sm"
      } ${className}`}
    >
      {showPhoto ? (
        <img
          src={photoUrl ?? undefined}
          alt=""
          className="h-full w-full rounded-full object-cover"
          onError={() => setFailedPhotoUrl(photoUrl ?? null)}
        />
      ) : (
        deriveInitials(displayName, email)
      )}
    </span>
  );
}
