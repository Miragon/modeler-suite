import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** One input `orca plugin shot --act` sends to the editor, in its CSS pixels. */
export type OrcaAct =
  | { click: [number, number] }
  | { drag: [[number, number], [number, number]] }
  | { key: string; modifiers?: Array<"shift" | "control" | "alt" | "meta"> };

/** An element of the smoke's document: where a click in the editor hits it, and its label. */
export interface OrcaSmokeElement {
  at: [number, number];
  label: string;
}

export interface OrcaSmokeOptions {
  /** The built plugin folder, which holds `orca-plugin.json`. */
  plugin: string;
  /** The extracted Orca (`squashfs-root` of its AppImage); default `$ORCA_APP`. */
  app?: string | undefined;
  /** The document the smoke opens, such as `smoke.storm`. */
  document: { name: string; text: string };
  /**
   * Three elements the smoke deletes, by a click and Delete, in the editor of `size`: the first
   * for the edit and the undo, the second while an agent adds an element, the third while an agent
   * changes it. Each is inside the document's bounds, so deleting it keeps the fitted view and the
   * next element where it was; every shot loads the editor afresh and fits it.
   */
  deletions: readonly [OrcaSmokeElement, OrcaSmokeElement, OrcaSmokeElement];
  /**
   * An outside write that touches no element the smoke deletes: an agent adds the `count`th
   * element labelled `ORCA_SMOKE_AGENT_LABEL`, inside the document's bounds.
   */
  addOutside(text: string, count: number): string;
  /** An outside write that changes the third of `deletions`, so the merge conflicts. */
  changeOutside(text: string): string;
  /**
   * Also run `merge` and `conflict`: an agent's write under unsaved edits. Off by default: driven
   * through `orca plugin shot`, Orca 1.4.249 never hands that write to the editor, since its merge
   * needs exactly one mounted editor view of the tab and a shot mounts a view of its own.
   */
  merge?: boolean | undefined;
  /** Screenshots and logs; default `test-results/orca-smoke`. */
  results?: string | undefined;
  /** The editor's size for every shot; default 1200 × 800. */
  size?: { width: number; height: number } | undefined;
  log?: ((line: string) => void) | undefined;
}

export interface OrcaSmokeResult {
  version: string;
  pluginKey: string;
  steps: string[];
}

const SAVE: OrcaAct = { key: "s", modifiers: ["control"] };
const UNDO: OrcaAct = { key: "z", modifiers: ["control"] };
/** Chromium's error for a capture of a frame its compositor has not drawn yet. */
const UNDRAWN_FRAME = "UnknownVizError";
const CONFLICT_WARNING = "the file changed outside the editor where it was edited";

/** The label of the element `addOutside` adds. */
export const ORCA_SMOKE_AGENT_LABEL = "Added by an agent";

interface CliResult {
  ok?: boolean;
  result?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/**
 * Runs a modeler's Orca plugin in a real Orca, on Linux under an X server (`xvfb-run -a`), with an
 * isolated profile: launch, `validate` and `check`, load with the approval Orca asks for, open the
 * document in the editor, both themes, undo of a delete, a delete saved to disk, an outside write
 * to the clean tab, one under unsaved edits that the merge keeps, one that conflicts and leaves
 * Orca's banner, and no blocked request or error in the plugin's logs. Never brings a window up on macOS: run it
 * in a container (`modeler-shell-orca-docker`).
 */
export async function runOrcaSmoke(options: OrcaSmokeOptions): Promise<OrcaSmokeResult> {
  const log = options.log ?? ((line: string) => console.log(`[orca-smoke] ${line}`));
  const steps: string[] = [];
  const step = (name: string, detail = ""): void => {
    steps.push(name);
    log(detail ? `${name}: ${detail}` : name);
  };
  const results = resolve(options.results ?? "test-results/orca-smoke");
  mkdirSync(results, { recursive: true });
  const size = options.size ?? { width: 1200, height: 800 };

  const app = options.app ?? process.env.ORCA_APP;
  if (!app) throw new Error("runOrcaSmoke needs the extracted Orca: pass app or set ORCA_APP");
  const cli = join(app, "resources", "bin", "orca-ide");
  if (!existsSync(cli)) throw new Error(`no Orca CLI at ${cli}`);
  const version = spawnSync(cli, ["--version"], { encoding: "utf8" }).stdout.trim();
  step("resolve", `Orca ${version} at ${app}`);

  const profile = mkdtempSync(join(tmpdir(), "modeler-shell-orca-"));
  const workspace = join(profile, "work");
  mkdirSync(workspace, { recursive: true });
  const file = join(workspace, options.document.name);
  writeFileSync(file, options.document.text);
  const env = {
    ...process.env,
    HOME: profile,
    XDG_CONFIG_HOME: join(profile, "config"),
    XDG_CACHE_HOME: join(profile, "cache"),
    ORCA_BACKGROUND_LAUNCH: "1",
    CI: "1",
  };

  const orca = (args: readonly string[], allowFailure = false): CliResult => {
    const run = spawnSync(cli, [...args, "--json"], { encoding: "utf8", env, timeout: 120_000 });
    let parsed: CliResult;
    try {
      parsed = JSON.parse(run.stdout) as CliResult;
    } catch {
      throw new Error(`orca ${args.join(" ")} printed no JSON: ${run.stdout}${run.stderr}`);
    }
    if (!allowFailure && parsed.ok === false) {
      throw new Error(`orca ${args.join(" ")}: ${parsed.error?.message ?? JSON.stringify(parsed)}`);
    }
    return parsed;
  };
  const disk = (): string => readFileSync(file, "utf8");
  const shotOnce = (name: string, extra: readonly string[]): CliResult =>
    orca([
      "plugin",
      "shot",
      options.plugin,
      "--editor",
      file,
      "--width",
      String(size.width),
      "--height",
      String(size.height),
      "--out",
      join(results, `${name}.png`),
      ...extra,
    ]);
  const checkedShot = (name: string, run: CliResult): Record<string, unknown> => {
    const result = run.result!;
    const errors = result.errors as unknown[] | undefined;
    if (errors && errors.length > 0)
      throw new Error(`${name}: the editor reported ${JSON.stringify(errors)}`);
    return result;
  };
  const shot = (name: string, extra: readonly string[] = []): Record<string, unknown> => {
    // Chromium's compositor refuses the capture while the frame was never drawn yet, which a fresh
    // Orca under Xvfb sometimes does right after a load. A shot without acts changes nothing, so it
    // may simply run again; one with acts may have applied them already.
    const retries = extra.includes("--act") ? 0 : 3;
    for (let attempt = 0; ; attempt++) {
      try {
        return checkedShot(name, shotOnce(name, extra));
      } catch (error) {
        if (attempt >= retries || !String(error).includes(UNDRAWN_FRAME)) throw error;
        log(`${name}: the frame was not drawn yet, once more`);
        spawnSync("sleep", ["1"]);
      }
    }
  };
  const act = (name: string, acts: readonly OrcaAct[]): Record<string, unknown> =>
    shot(name, ["--in-place", "--act", JSON.stringify(acts)]);

  let child: ChildProcess | undefined;
  let loadedKey = "";
  try {
    child = spawn(join(app, "AppRun"), ["--no-sandbox", "--password-store=basic"], {
      env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => (stderr = `${stderr}${chunk}`.slice(-4000)));
    const started = Date.now();
    for (;;) {
      const status = orca(["status"], true).result as
        { runtime?: { state?: string; reachable?: boolean } } | undefined;
      if (status?.runtime?.reachable && status.runtime.state === "ready") break;
      if (Date.now() - started > 90_000) throw new Error(`Orca did not start in 90 s: ${stderr}`);
      await sleep(1000);
    }
    step("launch", `ready after ${Math.round((Date.now() - started) / 1000)} s`);

    orca(["plugin", "validate", options.plugin]);
    const check = orca(["plugin", "check", options.plugin]).result as {
      editors?: Array<{ issues?: unknown[]; warnings?: unknown[] }>;
    };
    const findings = (check.editors ?? []).flatMap((editor) => [
      ...(editor.issues ?? []),
      ...(editor.warnings ?? []),
    ]);
    if (findings.length > 0) throw new Error(`orca plugin check: ${JSON.stringify(findings)}`);
    step("validate", "validate and check without findings");

    orca(["plugin", "system", "on"]);
    const asked = orca(["plugin", "dev", "load", options.plugin], true);
    const fingerprint = JSON.stringify(asked).match(/"approvalFingerprint":"([^"]+)"/)?.[1];
    const loaded = fingerprint
      ? orca(["plugin", "dev", "load", options.plugin, "--approve", fingerprint])
      : asked;
    const pluginKey = String((loaded.result as { pluginKey?: unknown }).pluginKey);
    loadedKey = pluginKey;
    step("load", `${pluginKey}${fingerprint ? `, approved ${fingerprint}` : ""}`);

    const opened = shot("open");
    if (opened.subscribed !== true || opened.settled !== true) {
      throw new Error(`open: the editor did not take its document (${JSON.stringify(opened)})`);
    }
    step("open", `${opened.width} × ${opened.height}`);

    for (const theme of ["dark", "light"]) shot(`theme-${theme}`, ["--theme", theme]);
    step("themes", "dark and light without errors");

    const [edited, merged, conflicted] = options.deletions;
    const remove = (element: OrcaSmokeElement): OrcaAct[] => [
      { click: element.at },
      { key: "Delete" },
    ];
    const holds = (label: string): boolean => disk().includes(label);

    // Orca focuses what the last click hit, the deleted element: a click on the empty canvas gives
    // the keys back to it, as a person's next click would.
    const blank: OrcaAct = { click: [Math.round(size.width / 2), size.height - 120] };
    act("undo", [...remove(edited), blank, UNDO, SAVE]);
    if (!holds(edited.label)) throw new Error(`undo: "${edited.label}" did not come back`);
    step("undo", "the editor's own history undid a delete");

    for (let attempt = 1; holds(edited.label); attempt++) {
      if (attempt > 2) throw new Error(`edit: the saved file still holds "${edited.label}"`);
      if (attempt === 2) log("edit: the delete did not reach the file, once more");
      act("edit", [...remove(edited), SAVE]);
    }
    step("edit", "a delete reached the file through a save");

    writeFileSync(file, options.addOutside(disk(), 1));
    await sleep(1500);
    shot("external");
    if (!holds(ORCA_SMOKE_AGENT_LABEL)) throw new Error("external: the outside write is gone");
    step("external", "an outside write to the clean tab opened without errors");

    if (options.merge) {
      act("merge-edit", remove(merged));
      writeFileSync(file, options.addOutside(disk(), 2));
      await sleep(1500);
      act("merge-save", [SAVE]);
      const agentElements = disk().split(ORCA_SMOKE_AGENT_LABEL).length - 1;
      if (agentElements !== 2 || holds(merged.label)) {
        throw new Error(`merge: the save lost a side of the merge:\n${disk()}`);
      }
      step("merge", "an outside write under unsaved edits merged with them");

      act("conflict-edit", remove(conflicted));
      const conflicting = options.changeOutside(disk());
      writeFileSync(file, conflicting);
      await sleep(1500);
      if (disk() !== conflicting) throw new Error("conflict: the file changed without the person");
      const conflictLogs = pluginLogs(cli, env, pluginKey);
      if (!conflictLogs.includes(CONFLICT_WARNING)) {
        throw new Error(`conflict: the merge did not refuse the write:\n${conflictLogs}`);
      }
      step("conflict", "a conflicting write left the draft and Orca's banner");
    }

    const logs = pluginLogs(cli, env, pluginKey);
    writeFileSync(join(results, "plugin.log"), logs);
    const unexpected = logs
      .split("\n")
      .filter((line) => /blocked|error/i.test(line))
      .filter((line) => !line.includes("MergeConflictError") && !line.includes(CONFLICT_WARNING));
    if (unexpected.length > 0) throw new Error(`logs:\n${unexpected.join("\n")}`);
    step("logs", "no blocked request and no error");
    return { version, pluginKey, steps };
  } catch (error) {
    writeFileSync(join(results, "plugin.log"), pluginLogs(cli, env, String(loadedKey)));
    throw error;
  } finally {
    child?.kill("SIGTERM");
    await sleep(500);
    step("close");
    rmSync(profile, { recursive: true, force: true });
  }
}

function pluginLogs(cli: string, env: NodeJS.ProcessEnv, pluginKey: string): string {
  return spawnSync(cli, ["plugin", "logs", pluginKey], { encoding: "utf8", env }).stdout;
}
