import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface OrcaSmokeOptions {
  /** The built plugin folder, which holds `orca-plugin.json`. */
  plugin: string;
  /** The extracted Orca (`squashfs-root` of its AppImage); default `$ORCA_APP`. */
  app?: string | undefined;
  /** The document the smoke opens, such as `smoke.storm`. */
  document: { name: string; text: string };
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

/** Chromium's error for a capture of a frame its compositor has not drawn yet. */
const UNDRAWN_FRAME = "UnknownVizError";

interface CliResult {
  ok?: boolean;
  result?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

function groupAlive(groupId: number): boolean {
  try {
    process.kill(-groupId, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ends Orca with every process it started. AppRun is the AppImage's start script, so a signal to
 * it alone leaves Orca and its helpers running, still writing into the profile.
 */
async function stopOrca(child: ChildProcess): Promise<void> {
  const groupId = child.pid;
  if (groupId === undefined) return;
  for (const [signal, waitMs] of [
    ["SIGTERM", 10_000],
    ["SIGKILL", 5_000],
  ] as const) {
    if (!groupAlive(groupId)) return;
    process.kill(-groupId, signal);
    for (const started = Date.now(); groupAlive(groupId) && Date.now() - started < waitMs;) {
      await sleep(100);
    }
  }
}

/**
 * Runs a modeler's Orca plugin in a real Orca, on Linux under an X server (`xvfb-run -a`), with an
 * isolated profile: launch, `validate` and `check`, load with the approval Orca asks for, open the
 * document in the editor, both themes, and no blocked request or error in the plugin's logs. Never
 * brings a window up on macOS: run it in a container (`modeler-shell-orca-docker`).
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
    // Orca under Xvfb sometimes does right after a load. A shot changes nothing, so it may simply
    // run again.
    for (let attempt = 0; ; attempt++) {
      try {
        return checkedShot(name, shotOnce(name, extra));
      } catch (error) {
        if (attempt >= 3 || !String(error).includes(UNDRAWN_FRAME)) throw error;
        log(`${name}: the frame was not drawn yet, once more`);
        spawnSync("sleep", ["1"]);
      }
    }
  };
  let child: ChildProcess | undefined;
  let loadedKey = "";
  try {
    child = spawn(join(app, "AppRun"), ["--no-sandbox", "--password-store=basic"], {
      env,
      stdio: ["ignore", "ignore", "pipe"],
      detached: true,
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

    const logs = pluginLogs(cli, env, pluginKey);
    writeFileSync(join(results, "plugin.log"), logs);
    const unexpected = logs.split("\n").filter((line) => /blocked|error/i.test(line));
    if (unexpected.length > 0) throw new Error(`logs:\n${unexpected.join("\n")}`);
    step("logs", "no blocked request and no error");
    return { version, pluginKey, steps };
  } catch (error) {
    writeFileSync(join(results, "plugin.log"), pluginLogs(cli, env, String(loadedKey)));
    throw error;
  } finally {
    if (child) await stopOrca(child);
    step("close");
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

function pluginLogs(cli: string, env: NodeJS.ProcessEnv, pluginKey: string): string {
  return spawnSync(cli, ["plugin", "logs", pluginKey], { encoding: "utf8", env }).stdout;
}
