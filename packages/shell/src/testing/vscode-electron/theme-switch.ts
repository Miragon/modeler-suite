import type { ColorThemeKind } from "../vscode-stub.js";
import { VSCODE_COLOR_THEMES, workbenchThemeClass, type VsCodeColorTheme } from "./themes.js";
import { delay } from "./wait.js";

/** The color theme `.monaco-workbench` shows. */
export interface WorkbenchTheme {
  /** `vs`, `vs-dark`, `hc-black` or `hc-light`; undefined when the workbench has none. */
  type: string | undefined;
  /** The theme's own class, `<extension id>-<theme file>` (`vscode-theme-defaults-themes-light_modern-json`). */
  id: string | undefined;
}

export interface WorkbenchThemeSwitchOptions {
  theme: VsCodeColorTheme;
  /** Writes `workbench.colorTheme` into the profile's `settings.json`. */
  writeSettings: (colorTheme: string) => Promise<void>;
  /** The classes of `.monaco-workbench`. */
  readWorkbench: () => Promise<readonly string[]>;
  /** The whole switch, every retry included. */
  timeoutMs: number;
  /** How long VS Code gets to notice one write before the next; default 2 s, at most a quarter of `timeoutMs`. */
  retryAfterMs?: number | undefined;
  /** Between two reads of the workbench; default 100 ms. */
  intervalMs?: number | undefined;
  /** The themes the workbench showed earlier in the run, by `workbenchThemeKey`, to name what it shows. */
  names?: ReadonlyMap<string, string> | undefined;
  log?: ((line: string) => void) | undefined;
}

export interface WorkbenchThemeSwitch {
  switched: boolean;
  /** What the workbench showed at the last read. */
  shown: WorkbenchTheme;
  /** The `workbench.colorTheme` values written, in order. */
  written: string[];
  ms: number;
}

/** A switch took at most 0.9 s, under load too; a write VS Code missed stayed missed for the whole timeout. */
export const THEME_RETRY_AFTER_MS = 2_000;
const DEFAULT_INTERVAL_MS = 100;

const THEME_TYPE_CLASSES: readonly string[] = VSCODE_COLOR_THEMES.map(({ kind }) =>
  workbenchThemeClass(kind),
);

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * VS Code adds a theme's two classes, its type and its own, in one `classList.add`, so the theme's
 * own class directly follows the type class.
 */
export function workbenchThemeOf(classes: readonly string[]): WorkbenchTheme {
  const index = classes.findIndex((name) => THEME_TYPE_CLASSES.includes(name));
  if (index < 0) return { type: undefined, id: undefined };
  return { type: classes[index], id: classes[index + 1] };
}

export function workbenchThemeKey(shown: WorkbenchTheme): string {
  return [shown.type, shown.id].filter(Boolean).join(".");
}

/** `Default Light Modern (.vs.vscode-theme-defaults-themes-light_modern-json)`, or only the classes. */
export function describeWorkbenchTheme(
  shown: WorkbenchTheme,
  names: ReadonlyMap<string, string> = new Map(),
): string {
  if (!shown.type) return "no theme class on .monaco-workbench";
  const key = workbenchThemeKey(shown);
  const name = names.get(key);
  return name ? `${name} (.${key})` : `.${key}`;
}

/**
 * A default theme of neither the requested kind nor the shown one: the workbench visibly switches to
 * it, so VS Code read that write, and the requested theme after it is a change again even when VS
 * Code had read the requested one before without applying it.
 */
export function detourTheme(
  requested: ColorThemeKind,
  shownType: string | undefined,
): VsCodeColorTheme {
  return VSCODE_COLOR_THEMES.find(
    (theme) => theme.kind !== requested && workbenchThemeClass(theme.kind) !== shownType,
  )!;
}

/**
 * Writes the theme and waits for the workbench to show its class. VS Code notices the write through
 * its file watcher, and now and then it does not switch at all. Unswitched after `retryAfterMs`, the
 * driver writes the setting again (for a change event VS Code missed); unswitched after another
 * `retryAfterMs`, it switches through `detourTheme` and back (for a change VS Code read but did not
 * apply, which an identical write cannot change). It waits for the detour until `retryAfterMs` before
 * the deadline, then writes the requested theme and waits for the rest of `timeoutMs`. When the
 * detour never showed, the requested theme counts only if the workbench still shows it at the
 * deadline.
 */
export async function switchWorkbenchTheme(
  options: WorkbenchThemeSwitchOptions,
): Promise<WorkbenchThemeSwitch> {
  const { theme } = options;
  const started = performance.now();
  const deadline = started + options.timeoutMs;
  const retryAfterMs = Math.min(
    options.retryAfterMs ?? THEME_RETRY_AFTER_MS,
    options.timeoutMs / 4,
  );
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const log = options.log ?? (() => undefined);
  const written: string[] = [];
  let shown: WorkbenchTheme = { type: undefined, id: undefined };

  const write = async (colorTheme: VsCodeColorTheme) => {
    written.push(colorTheme.name);
    await options.writeSettings(colorTheme.name);
  };
  const shows = async (kind: ColorThemeKind, waitMs: number): Promise<boolean> => {
    const until = Math.min(performance.now() + waitMs, deadline);
    for (;;) {
      shown = workbenchThemeOf(await options.readWorkbench());
      if (shown.type === workbenchThemeClass(kind)) return true;
      if (performance.now() >= until) return false;
      await delay(intervalMs);
    }
  };
  const describe = () => describeWorkbenchTheme(shown, options.names);
  const elapsed = () => Math.round(performance.now() - started);
  const showsAtDeadline = async (kind: ColorThemeKind): Promise<boolean> => {
    await delay(Math.max(0, deadline - performance.now()));
    shown = workbenchThemeOf(await options.readWorkbench());
    return shown.type === workbenchThemeClass(kind);
  };
  const outcome = (switched: boolean, how = "switched"): WorkbenchThemeSwitch => {
    if (switched && written.length > 1) {
      log(
        `${theme.name}: the workbench ${how} ${seconds(elapsed())} after the first write, on write ${written.length}`,
      );
    }
    return { switched, shown, written, ms: elapsed() };
  };

  await write(theme);
  if (await shows(theme.kind, retryAfterMs)) return outcome(true);
  log(
    `${theme.name}: the workbench still shows ${describe()} after ${seconds(elapsed())}, writing the setting again`,
  );
  await write(theme);
  if (await shows(theme.kind, retryAfterMs)) return outcome(true);
  const detour = detourTheme(theme.kind, shown.type);
  log(
    `${theme.name}: the workbench still shows ${describe()} after ${seconds(elapsed())}, switching through ${detour.name}`,
  );
  await write(detour);
  // A VS Code slow enough to show the detour only after the way back would end on the detour.
  const detourShown = await shows(detour.kind, deadline - retryAfterMs - performance.now());
  if (detourShown) {
    await write(theme);
    return outcome(await shows(theme.kind, Number.POSITIVE_INFINITY));
  }
  log(
    `${theme.name}: the workbench never showed ${detour.name} and shows ${describe()} after ${seconds(elapsed())}, writing the setting again`,
  );
  await write(theme);
  // The detour may still be on its way, so a theme shown before the deadline proves nothing yet.
  return outcome(await showsAtDeadline(theme.kind), "shows it at the deadline,");
}

/** The failure of a switch that never happened: the theme requested and the one VS Code shows. */
export function missedThemeSwitch(
  theme: VsCodeColorTheme,
  outcome: WorkbenchThemeSwitch,
  names?: ReadonlyMap<string, string>,
): string {
  const retries =
    outcome.written.length > 1
      ? `, though the driver wrote the setting ${outcome.written.length} times (${outcome.written.join(", ")})`
      : "";
  return (
    `${theme.name}: the workbench never switched (no .${workbenchThemeClass(theme.kind)}): ` +
    `requested ${theme.name}, VS Code shows ${describeWorkbenchTheme(outcome.shown, names)} after ${seconds(outcome.ms)}${retries}`
  );
}
