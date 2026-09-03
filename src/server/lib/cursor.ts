// Opaque pagination cursors carry only the expected sort values and are validated strictly on the
// way back in; no raw datastore cursor object ever reaches a client.

const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;

export function encodeCursor(values: Record<string, string>): string {
  return Buffer.from(JSON.stringify(values), "utf8").toString("base64url");
}

export class InvalidCursorError extends Error {
  constructor() {
    super("INVALID_CURSOR");
    this.name = "InvalidCursorError";
  }
}

/**
 * Strict variant for request-supplied cursors: a cursor that fails structural validation, or whose
 * date-typed values do not parse as instants, is rejected outright instead of silently restarting
 * the listing from the beginning.
 */
export function decodeCursorStrict(
  cursor: string,
  expectedKeys: readonly string[],
  dateKeys: readonly string[] = [],
): Record<string, string> {
  const decoded = decodeCursor(cursor, expectedKeys);
  if (!decoded) throw new InvalidCursorError();
  for (const key of dateKeys) {
    const value = decoded[key];
    if (value === undefined || Number.isNaN(Date.parse(value))) throw new InvalidCursorError();
  }
  return decoded;
}

export function decodeCursor(
  cursor: string,
  expectedKeys: readonly string[],
): Record<string, string> | null {
  if (!CURSOR_PATTERN.test(cursor)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.join(",") !== [...expectedKeys].sort().join(",")) return null;
    for (const key of expectedKeys) {
      const value = record[key];
      if (typeof value !== "string" || value.length > 256) return null;
    }
    return record as Record<string, string>;
  } catch {
    return null;
  }
}
