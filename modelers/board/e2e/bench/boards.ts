/**
 * The runs of one place: every board in a context of its own per run, cold first, then twice
 * more for a warm run. A browser writes its code cache after the second load of a script, so
 * the third load is the first that is warm. Each of the two is followed by a load of the same
 * temperature that is panned throughout, for T1: the cold one in a context of its own, the
 * warm one as the fourth load of the run's context.
 */
import { cpus, platform, release } from "node:os";
import { test, type BrowserContext, type Page } from "@playwright/test";
import { EXAMPLE_FOLDER, readExample, standardBoards, type BenchRepository } from "./generate.js";
import { measureAnswers, measureLoad, type RunNumbers } from "./measure.js";
import { installProbe } from "./page-probe.js";
import { summarise, table, writeResult, type BoardResult } from "./report.js";
import { BOARDS, RUNS, TEMPERATURES, WINDOW } from "./settings.js";

/**
 * How long a panned load may take until its last preview: this many times the quiet load's T2,
 * and at least half a minute. After that it is read as it stands, without a T2 of its own.
 */
const GIVE_UP_TIMES = 6;
const GIVE_UP_MS = 30_000;

export interface Place {
  readonly name: string;
  /** hands the page its repository, before its first script runs */
  prepare(context: BrowserContext, repository: BenchRepository): Promise<void>;
  /** navigates to the board and returns once the navigation is on its way */
  open(page: Page): Promise<void>;
}

function boards(): BenchRepository[] {
  const all = standardBoards(readExample(EXAMPLE_FOLDER));
  if (!BOARDS) return all;
  const unknown = BOARDS.filter((name) => !all.some((board) => board.name === name));
  if (unknown.length > 0) {
    throw new Error(
      `BOARD_BENCH_BOARDS names ${unknown.join(", ")}. The boards are ${all.map((board) => board.name).join(", ")}.`,
    );
  }
  return all.filter((board) => BOARDS?.includes(board.name));
}

export function benchPlace(place: Place): void {
  for (const repository of boards()) {
    test(`${place.name}: ${repository.name}`, async ({ browser }) => {
      const runs: Record<"cold" | "warm", RunNumbers[]> = { cold: [], warm: [] };
      const result = (): BoardResult => ({
        place: place.name,
        board: repository.name,
        models: repository.modelNodes.length,
        taken: new Date().toISOString(),
        machine: `${cpus().length} x ${cpus()[0]?.model ?? "?"}, ${platform()} ${release()}, Chromium ${browser.version()}`,
        runs,
      });
      /** a context of its own: nothing of an earlier load is cached in it */
      const fresh = async (): Promise<BrowserContext> => {
        const context = await browser.newContext({ viewport: WINDOW });
        await place.prepare(context, repository);
        await context.addInitScript(installProbe, {
          modelNodes: repository.modelNodes.map((node) => node.id),
          nodeCount: repository.nodeCount,
        });
        return context;
      };
      /** the same board panned throughout, where the quiet load found bare pane to pan on */
      const answered = async (context: BrowserContext, quiet: RunNumbers): Promise<RunNumbers> => {
        if (!quiet.pane) return quiet;
        const answer = await measureAnswers({
          context,
          repository,
          open: place.open,
          pane: quiet.pane,
          giveUpAfterMs: Math.max(GIVE_UP_MS, GIVE_UP_TIMES * quiet.load.t2Ms),
        });
        return { ...quiet, answer };
      };
      for (let run = 0; run < RUNS; run++) {
        const context = await fresh();
        try {
          const load = (whole: boolean): Promise<RunNumbers> =>
            measureLoad({ browser, context, repository, open: place.open, whole });
          const cold = await load(TEMPERATURES.includes("cold"));
          if (TEMPERATURES.includes("cold")) {
            const apart = await fresh();
            try {
              runs.cold.push(await answered(apart, cold));
            } finally {
              await apart.close();
            }
          }
          if (TEMPERATURES.includes("warm")) {
            await load(false);
            runs.warm.push(await answered(context, await load(true)));
          }
        } finally {
          await context.close();
        }
        // after every run: a bench that is stopped keeps what it took
        writeResult(result());
      }
      console.log(`\n${table(summarise(result()))}\n`);
    });
  }
}
