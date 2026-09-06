export const MAX_REFLECTION_TAGS = 5;
export const MAX_AI_REFLECTION_TAGS = 1;
export const MAX_AUTOMATIC_REFLECTION_TAGS = 2;

/**
 * Tags are deliberately small, human-readable labels. They are normalized at the boundary so
 * search, memory retrieval, and user-created labels all use the same value.
 */
export function normalizeReflectionTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Stable document key for a normalized tag. The tag value itself remains the session-facing
 * reference, so old reflections remain compatible while the catalog has one canonical record.
 */
export function reflectionTagKey(value: string): string {
  return `tag_${encodeURIComponent(normalizeReflectionTag(value))}`;
}

export function sanitizeReflectionTags(values: readonly string[], limit = MAX_REFLECTION_TAGS): string[] {
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeReflectionTag(value);
    if (!normalized || normalized.length > 48 || !/^[a-z0-9][a-z0-9 _/&-]*$/i.test(normalized)) continue;
    if (!result.includes(normalized)) result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * Automatic tagging is deliberately conservative. The first reflection message can add one tag;
 * a later summary can add at most one distinct tag, leaving user-managed tags untouched.
 */
export function appendAutomaticReflectionTag(
  currentTags: readonly string[],
  candidates: readonly string[],
): string[] | null {
  const current = sanitizeReflectionTags(currentTags);
  if (current.length >= MAX_AUTOMATIC_REFLECTION_TAGS) return null;

  const candidate = sanitizeReflectionTags(candidates, MAX_AI_REFLECTION_TAGS)[0];
  if (!candidate || current.includes(candidate)) return null;
  return [...current, candidate];
}
