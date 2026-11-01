import { describe, expect, it } from "vitest";
import { fitCrumbs, type CrumbWidths } from "../src/navigation/breadcrumbFit.js";

/** System landscape › Shop context › Shop containers › API components, at a 13px text. */
const PATH: CrumbWidths[] = [
  { fixed: 12, name: 104, level: 0, current: false },
  { fixed: 28, name: 32, level: 50, current: false },
  { fixed: 28, name: 32, level: 68, current: false },
  { fixed: 28, name: 24, level: 76, current: true },
];
const TOTAL = 12 + 104 + 28 + 82 + 28 + 100 + 28 + 100;
const NAME_MIN = 26;

const round = (fit: ReturnType<typeof fitCrumbs>) =>
  fit?.map(({ name, level }) => [Math.round(name * 10) / 10, Math.round(level * 10) / 10]);

describe("fitCrumbs: how a path too wide gives way", () => {
  it("leaves a path that fits whole", () => {
    expect(fitCrumbs(PATH, TOTAL, NAME_MIN)).toEqual(
      PATH.map(({ name, level }) => ({ name, level })),
    );
  });

  it("cuts the names above first, in proportion to what each can give", () => {
    // 20 to give: the landscape can give 78, each Shop 6.
    // 104 - 20 × 78/90 and 32 - 20 × 6/90.
    expect(round(fitCrumbs(PATH, TOTAL - 20, NAME_MIN))).toEqual([
      [86.7, 0],
      [30.7, 50],
      [30.7, 68],
      [24, 76],
    ]);
  });

  it("keeps the view shown whole while the names above can give", () => {
    const fit = fitCrumbs(PATH, TOTAL - 90, NAME_MIN)!;
    expect(fit.slice(0, 3).map(({ name }) => name)).toEqual([NAME_MIN, NAME_MIN, NAME_MIN]);
    expect(fit.map(({ level }) => level)).toEqual([0, 50, 68, 76]);
    expect(fit[3]).toEqual({ name: 24, level: 76 });
  });

  it("then the current name, then the levels above, then the current level", () => {
    const long: CrumbWidths[] = [PATH[0]!, PATH[1]!, { ...PATH[3]!, name: 126 }];
    const total = 12 + 104 + 28 + 82 + 28 + 126 + 76;
    // The landscape gives 78, Shop 6, the current name 100: 184; then the level above 50.
    expect(round(fitCrumbs(long, total - 184, NAME_MIN))).toEqual([
      [26, 0],
      [26, 50],
      [26, 76],
    ]);
    expect(round(fitCrumbs(long, total - 184 - 20, NAME_MIN))).toEqual([
      [26, 0],
      [26, 30],
      [26, 76],
    ]);
    expect(round(fitCrumbs(long, total - 184 - 50 - 30, NAME_MIN))).toEqual([
      [26, 0],
      [26, 0],
      [26, 46],
    ]);
  });

  it("never cuts a name below its own width or below a letter and its ellipsis", () => {
    const fit = fitCrumbs(PATH, 220, NAME_MIN)!;
    expect(fit[3]!.name).toBe(24);
    for (const crumb of fit.slice(0, 3)) expect(crumb.name).toBeGreaterThanOrEqual(NAME_MIN);
  });

  it("gives up where even the cut path does not fit", () => {
    const least = 12 + 26 + 28 + 26 + 28 + 26 + 28 + 24;
    expect(fitCrumbs(PATH, least, NAME_MIN)).toBeDefined();
    expect(fitCrumbs(PATH, least - 1, NAME_MIN)).toBeUndefined();
  });
});
