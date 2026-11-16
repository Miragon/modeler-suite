/**
 * What a run of the bench is told through the environment. A flag after `npm run board bench`
 * never reaches the script (npm takes it for an option of its own), so every setting is a
 * variable, as `E2E_PORT` is for the e2e projects.
 */
import { fileURLToPath } from "node:url";

const env = (name: string): string | undefined => {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
};

const count = (name: string, otherwise: number): number => {
  const value = env(name);
  if (value === undefined) return otherwise;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} is "${value}". Give a whole number of one or more.`);
  }
  return parsed;
};

/**
 * Chromium's sandbox is on unless the environment turns it off. Playwright's own default starts
 * Chromium without it, which is no setting for a bench on a person's machine; a container where
 * the sandbox cannot start sets `BOARD_BENCH_SANDBOX=off`.
 */
export function chromiumSandbox(): boolean {
  const value = env("BOARD_BENCH_SANDBOX") ?? "on";
  if (value !== "on" && value !== "off") {
    throw new Error(`BOARD_BENCH_SANDBOX is "${value}". Set it to "on" or "off".`);
  }
  return value === "on";
}

/** Where the builds and the results go; never a folder Git tracks. */
export const OUT =
  env("BOARD_BENCH_OUT") ?? fileURLToPath(new URL("../test-results/bench/", import.meta.url));

/** Where a bench page of the web app finds its repository: set before its first script runs. */
export const REPOSITORY_GLOBAL = "__boardBenchRepository";

/** How many runs a number is the median of, cold and warm each. */
export const RUNS = count("BOARD_BENCH_RUNS", 5);

/** The boards to measure, by the generator's names; absent: every standard board. */
export const BOARDS: readonly string[] | undefined = env("BOARD_BENCH_BOARDS")
  ?.split(",")
  .map((name) => name.trim())
  .filter((name) => name !== "");

/** `cold`, `warm` or both (the default): a warm run costs two more loads of its board. */
export const TEMPERATURES: readonly ("cold" | "warm")[] = (() => {
  const value = env("BOARD_BENCH_RUN") ?? "cold,warm";
  const named = value.split(",").map((one) => one.trim());
  const unknown = named.filter((one) => one !== "cold" && one !== "warm");
  if (unknown.length > 0) {
    throw new Error(`BOARD_BENCH_RUN is "${value}". Name "cold", "warm" or "cold,warm".`);
  }
  return named as ("cold" | "warm")[];
})();

/** The bench's own ports, apart from the e2e projects' 5184 and 5194, and strict as those are. */
export const WEBAPP_PORT = count("BOARD_BENCH_WEBAPP_PORT", 5186);
export const WEBVIEW_PORT = count("BOARD_BENCH_WEBVIEW_PORT", 5196);

/** The window of every run: the size the board's browser tests use. */
export const WINDOW = { width: 1280, height: 800 } as const;

/** How long a board may take until its last preview is drawn before the run fails. */
export const LOAD_LIMIT_MS = count("BOARD_BENCH_LOAD_LIMIT_MS", 300_000);
