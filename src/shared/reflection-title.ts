export function isPlaceholderReflectionTitle(title: string, organization = false): boolean {
  const placeholders = organization
    ? ["New shared reflection", "New team reflection"]
    : ["New reflection", "New personal reflection"];
  return placeholders.includes(title);
}

/** Keeps model-generated history labels short and scannable without copying the user's message. */
export function normalizeReflectionTitle(title: string | undefined): string | null {
  if (!title) return null;
  const normalized = title.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.split(" ").slice(0, 5).join(" ").slice(0, 80) || null;
}
