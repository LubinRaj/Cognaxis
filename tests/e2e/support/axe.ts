import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Page } from "@playwright/test";

// Reuses the repository's existing axe-core package inside the browser; the bundled source is
// added as an inline script, which the end-to-end CSP permits. The production policy stays
// untouched.

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

export type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: unknown }>;
};

export async function scanForSeriousViolations(page: Page): Promise<AxeViolation[]> {
  const alreadyInjected = await page.evaluate(() =>
    Boolean((window as { axe?: unknown }).axe),
  );
  if (!alreadyInjected) {
    await page.addScriptTag({ content: axeSource });
  }

  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as {
      axe: {
        run: (
          context: Document,
          options: { resultTypes: string[] },
        ) => Promise<{ violations: AxeViolation[] }>;
      };
    }).axe;
    const results = await axe.run(document, { resultTypes: ["violations"] });
    return results.violations;
  });

  return violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
}
