// Read-only probe: how the pinned budget rule (minimum ordinary value = 3 x budget)
// drives W01 deposit counts when milestone fees or gear prices change.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { createW01 } from "/home/user/Motherload/src/campaign/world.ts";
import { W01 } from "/home/user/Motherload/src/campaign/config.ts";

const OUT =
  "/home/user/Motherload/docs/improvement-plan/work/critique-engineering/deposit-coupling.json";

function stats(seeds: number) {
  const counts: number[] = [];
  const values: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const ordinary = createW01(seed).packages.filter((p) => p.tags.includes("ordinary"));
    counts.push(ordinary.length);
    values.push(ordinary.reduce((t, p) => t + p.value, 0) / 10);
  }
  return {
    counts: [...new Set(counts)],
    minValueCR: Math.min(...values),
    maxValueCR: Math.max(...values),
  };
}

it("measures deposit counts under the current and plan-implied budgets", () => {
  const original = { budget: W01.budget, minOrdinary: W01.minOrdinary };
  const result: Record<string, unknown> = {
    current: { budgetCR: W01.budget / 10, minOrdinaryCR: W01.minOrdinary / 10, ...stats(50) },
  };
  // A3 fees (200/900/1600) with feet 400 -> 250: budget = core 3050 + gear (0+250+900) + project 2700.
  const variants = {
    a3FeesOnly: 3050 + 1300 + 2700,
    a3FeesAndA4Feet: 3050 + 1150 + 2700,
  };
  for (const [name, budgetCR] of Object.entries(variants)) {
    (W01 as { budget: number }).budget = budgetCR * 10;
    (W01 as { minOrdinary: number }).minOrdinary = budgetCR * 3 * 10;
    result[name] = { budgetCR, minOrdinaryCR: budgetCR * 3, ...stats(50) };
  }
  (W01 as { budget: number }).budget = original.budget;
  (W01 as { minOrdinary: number }).minOrdinary = original.minOrdinary;
  writeFileSync(OUT, JSON.stringify(result, null, 2));
});
