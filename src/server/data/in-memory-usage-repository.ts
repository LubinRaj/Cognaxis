import type { UsageDay } from "../../shared/schemas.js";
import { emptyUsageDay, type UsageField, type UsageRepository } from "./usage-repository.js";

export class InMemoryUsageRepository implements UsageRepository {
  private readonly days = new Map<string, UsageDay>();

  async increment(date: string, field: UsageField): Promise<void> {
    const day = this.days.get(date) ?? emptyUsageDay(date);
    day[field] += 1;
    this.days.set(date, day);
  }

  async listRange(fromDate: string, toDate: string): Promise<UsageDay[]> {
    return [...this.days.values()]
      .filter((day) => day.date >= fromDate && day.date <= toDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => structuredClone(day));
  }
}
