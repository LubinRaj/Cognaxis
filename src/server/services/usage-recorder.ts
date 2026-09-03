import { localDateOf } from "../../shared/dates.js";
import type { UsageField, UsageRepository } from "../data/usage-repository.js";

// Aggregate counters are best-effort bookkeeping: a failed increment is logged as an event name
// only and never fails or delays the user-facing operation that triggered it.
export class UsageRecorder {
  constructor(
    private readonly repository: UsageRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async record(field: UsageField): Promise<void> {
    try {
      await this.repository.increment(localDateOf(this.now(), "UTC"), field);
    } catch {
      console.error(JSON.stringify({ severity: "WARNING", event: "usage_counter_failed", field }));
    }
  }
}
