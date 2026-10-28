import { readFile, stat } from "node:fs/promises";
import { delay } from "./wait.js";

/** One read of the file between two `stat` calls. */
export interface FileSample {
  text: string;
  size: number;
  mtimeMs: number;
  /** Size and mtime did not change while the file was read, and the read got every byte. */
  consistent: boolean;
}

export interface SavedTextOptions<T> {
  file: string;
  /** The text before the save: a read that still shows it is not the save's. */
  previous: string;
  parse: (text: string) => T | Promise<T>;
  /** How long the file may take to change and settle. */
  timeoutMs: number;
  /** Between two reads; default 100 ms. */
  intervalMs?: number | undefined;
  /** How long a text the parser rejects has to stay unchanged before it counts as the saved one; default 1 s. */
  settleMs?: number | undefined;
  /** One read of `file`; the default reads it from disk between two `stat` calls. Tests pass their own. */
  readSample?: ((file: string) => Promise<FileSample | undefined>) | undefined;
}

/**
 * What the save left on disk: `parsed`, or why not. `unchanged`: the file still holds `previous`.
 * `unsettled`: it changed but never held still for two reads. `unparseable`: it held still and
 * the parser rejected it for `settleMs`.
 */
export type SavedTextOutcome<T> =
  | { status: "parsed"; text: string; parsed: T; waitedMs: number }
  | { status: "unchanged" }
  | { status: "unsettled"; text: string | undefined }
  | { status: "unparseable"; text: string; error: unknown; unchangedMs: number };

const DEFAULT_INTERVAL_MS = 100;
const DEFAULT_SETTLE_MS = 1_000;

async function sampleFile(path: string): Promise<FileSample | undefined> {
  try {
    const before = await stat(path);
    const bytes = await readFile(path);
    const after = await stat(path);
    return {
      text: bytes.toString("utf8"),
      size: after.size,
      mtimeMs: after.mtimeMs,
      consistent:
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        bytes.length === after.size,
    };
  } catch {
    // between the removal and the creation of a file that is written by replacing it
    return undefined;
  }
}

function sameSample(a: FileSample | undefined, b: FileSample | undefined): a is FileSample {
  return (
    a !== undefined &&
    b !== undefined &&
    a.consistent &&
    b.consistent &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.text === b.text
  );
}

/**
 * Reads the file a save writes until it holds still, then parses it. A read counts once two reads
 * `intervalMs` apart see the same size, mtime and text, and the text differs from `previous`. A
 * text the parser rejects is read again: only when it stays unchanged for `settleMs` is it the
 * saved one.
 *
 * On its own this cannot tell a pause inside a write from its end: a write that stops for longer
 * than `intervalMs` after a part the parser accepts (a line-based DSL accepts any whole lines)
 * yields that part. A complete read needs the editor's clean state first, which
 * `readSaveOnceClean` waits for; the two reads after it are a margin for a save that reports
 * success before its write is visible.
 */
export async function waitForSavedText<T>(
  options: SavedTextOptions<T>,
): Promise<SavedTextOutcome<T>> {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const started = performance.now();
  const deadline = started + options.timeoutMs;
  let changed = false;
  let latest: FileSample | undefined;
  let rejected: { text: string; error: unknown; since: number } | undefined;
  const readSample = options.readSample ?? sampleFile;
  for (;;) {
    const sample = await readSample(options.file);
    if (sample && sample.text !== options.previous) changed = true;
    const now = performance.now();
    if (sameSample(sample, latest) && sample.text !== options.previous) {
      if (rejected?.text === sample.text) {
        if (now - rejected.since >= settleMs) {
          return {
            status: "unparseable",
            text: sample.text,
            error: rejected.error,
            unchangedMs: Math.round(now - rejected.since),
          };
        }
      } else {
        try {
          const parsed = await options.parse(sample.text);
          return {
            status: "parsed",
            text: sample.text,
            parsed,
            waitedMs: Math.round(performance.now() - started),
          };
        } catch (error) {
          rejected = { text: sample.text, error, since: now };
        }
      }
    }
    if (performance.now() >= deadline) {
      if (!changed) return { status: "unchanged" };
      if (rejected && rejected.text === sample?.text) {
        return {
          status: "unparseable",
          text: rejected.text,
          error: rejected.error,
          unchangedMs: Math.round(now - rejected.since),
        };
      }
      return { status: "unsettled", text: sample?.text ?? latest?.text };
    }
    latest = sample;
    await delay(intervalMs);
  }
}

export interface SaveReadBackOptions<T> extends SavedTextOptions<T> {
  /** Whether the saved editor still has unsaved changes. */
  dirty: () => Promise<boolean>;
}

export interface SaveReadBack<T> {
  /** The editor turned clean within `timeoutMs`. */
  clean: boolean;
  /** How long the disk got: `timeoutMs` after a clean editor, `settleMs` after a dirty one. */
  diskTimeoutMs: number;
  written: SavedTextOutcome<T>;
}

/**
 * After the save key: waits for the editor to turn clean, then reads the file with
 * `waitForSavedText`. The order is what makes the read complete: VS Code truncates the file before
 * it writes the new text and clears the dirty state only once the write has resolved. An editor
 * that stays dirty most likely saved nothing, so the disk then gets `settleMs`, not another
 * `timeoutMs`.
 */
export async function readSaveOnceClean<T>(
  options: SaveReadBackOptions<T>,
): Promise<SaveReadBack<T>> {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const deadline = performance.now() + options.timeoutMs;
  let clean = false;
  for (;;) {
    clean = !(await options.dirty());
    if (clean || performance.now() >= deadline) break;
    await delay(intervalMs);
  }
  const diskTimeoutMs = clean ? options.timeoutMs : settleMs;
  const written = await waitForSavedText({ ...options, timeoutMs: diskTimeoutMs });
  return { clean, diskTimeoutMs, written };
}
