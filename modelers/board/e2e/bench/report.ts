/**
 * The bench's results: every run as it was measured, and per board, place and temperature the
 * median of the runs with their range. Nothing is rounded into a better number: a median and a
 * range are given as measured, to a tenth.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunNumbers } from "./measure.js";
import { OUT } from "./settings.js";

export type Temperature = "cold" | "warm";

export interface BoardResult {
  readonly place: string;
  readonly board: string;
  readonly models: number;
  /** when the last run ended, and on what */
  readonly taken: string;
  readonly machine: string;
  readonly runs: Readonly<Record<Temperature, readonly RunNumbers[]>>;
}

export interface Spread {
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly runs: number;
}

export function spread(values: readonly number[]): Spread | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[middle] ?? 0)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  return {
    median: Math.round(median * 10) / 10,
    min: sorted[0] ?? 0,
    max: sorted.at(-1) ?? 0,
    runs: sorted.length,
  };
}

type Column = readonly [title: string, read: (run: RunNumbers) => number | undefined];

/** The table's columns: the plan's three numbers first, then what stands beside them. */
export const COLUMNS: readonly Column[] = [
  ["T1 ms", (run) => run.answer?.t1Ms],
  ["T2 ms", (run) => run.load.t2Ms],
  ["heap MB", (run) => run.memory.heapMB],
  ["DOM nodes", (run) => run.memory.domNodes],
  ["modelers", (run) => run.memory.modelers],
  ["renderer MB", (run) => run.memory.rendererMB],
  ["drawn ms", (run) => run.load.drawnMs],
  ["last slow pan ms", (run) => run.answer?.t1LastSlowMs],
  ["pan at rest ms", (run) => run.load.restPanMs],
  ["median pan of the load ms", (run) => run.answer?.medianPanMs],
  ["slowest pan ms", (run) => run.answer?.slowestPanMs],
  ["pans of the load", (run) => run.answer?.pans],
  ["of them in time", (run) => run.answer?.pansInTime],
  ["T2 under pans ms", (run) => run.answer?.t2Ms],
  ["longest task ms", (run) => run.load.longestTaskMs],
  ["blocked ms", (run) => run.load.blockedMs],
  ["script ms", (run) => run.load.scriptMs],
  ["layout ms", (run) => run.load.layoutMs],
  ["style ms", (run) => run.load.styleMs],
  ["frames/s", (run) => run.motion?.framesPerSecond],
  ["motion longest task ms", (run) => run.motion?.longestTaskMs],
  ["pan answer ms", (run) => run.motion?.panAnswerMs],
  ["arm ms", (run) => run.arm?.armedMs],
  ["arm rested ms", (run) => run.arm?.armRestedMs],
  ["leave ms", (run) => run.arm?.leftMs],
  ["yardstick ms", (run) => run.yardstickMs],
  ["yardstick on six threads ms", (run) => run.yardstickSixMs],
];

export interface SummaryRow {
  readonly place: string;
  readonly board: string;
  readonly models: number;
  readonly temperature: Temperature;
  readonly numbers: Readonly<Record<string, Spread | undefined>>;
}

export function summarise(result: BoardResult): SummaryRow[] {
  return (["cold", "warm"] as const)
    .filter((temperature) => result.runs[temperature].length > 0)
    .map((temperature) => ({
      place: result.place,
      board: result.board,
      models: result.models,
      temperature,
      numbers: Object.fromEntries(
        COLUMNS.map(([title, read]) => [
          title,
          spread(
            result.runs[temperature].flatMap((run) => {
              const value = read(run);
              return value === undefined ? [] : [value];
            }),
          ),
        ]),
      ),
    }));
}

/** A median with its range; where fewer runs gave the number than were made, how many did. */
const cell = (value: Spread | undefined, runs: number): string => {
  if (value === undefined) return "none";
  const part = value.runs < runs ? `, ${value.runs} of ${runs} runs` : "";
  return `${value.median} (${value.min} to ${value.max}${part})`;
};

/** The rows as a Markdown table: a median with its range in every cell. */
export function table(rows: readonly SummaryRow[]): string {
  const titles = ["place", "board", "run", "runs", ...COLUMNS.map(([title]) => title)];
  const lines = rows.map((row) => {
    const runs = Math.max(0, ...Object.values(row.numbers).map((value) => value?.runs ?? 0));
    const cells = COLUMNS.map(([title]) => cell(row.numbers[title], runs));
    return `| ${[row.place, row.board, row.temperature, String(runs), ...cells].join(" | ")} |`;
  });
  return [`| ${titles.join(" | ")} |`, `| ${titles.map(() => "---").join(" | ")} |`, ...lines].join(
    "\n",
  );
}

const RESULTS = join(OUT, "results");

export function writeResult(result: BoardResult): void {
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(
    join(RESULTS, `${result.place}--${result.board}.json`),
    `${JSON.stringify({ ...result, summary: summarise(result) }, null, 2)}\n`,
  );
}

/** Every result the folder holds, as one table and one JSON file beside them. */
export function writeSummary(): string | undefined {
  if (!existsSync(RESULTS)) return undefined;
  const results = readdirSync(RESULTS)
    .filter((name) => name.includes("--") && name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(RESULTS, name), "utf8")) as BoardResult);
  const rows = results
    .sort((a, b) => a.place.localeCompare(b.place) || a.models - b.models)
    .flatMap(summarise);
  const text = table(rows);
  writeFileSync(join(RESULTS, "summary.json"), `${JSON.stringify(rows, null, 2)}\n`);
  writeFileSync(join(RESULTS, "summary.md"), `${text}\n`);
  return text;
}
