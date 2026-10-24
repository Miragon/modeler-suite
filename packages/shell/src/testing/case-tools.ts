import { TOOLTIP_DELAY_MS, type Appearance, type ShellHost, type Size } from "../core/index.js";
import { harnessHookProblems, isToolEntry } from "./checks.js";
import {
  menuEntriesProbe,
  paletteFocusProbe,
  shapesProbe,
  type MenuEntryFacts,
  type PaletteEntryState,
  type ShapeFacts,
} from "./facts.js";
import type {
  AbsentFeature,
  OpenContext,
  ShellCaseOutcome,
  ShellConformanceHarness,
  ShellSkip,
  ShowHook,
  ShowHooks,
} from "./harness.js";
import type { PageLike } from "./page.js";
import {
  findTarget,
  focusTarget,
  inPage,
  settle,
  type ChromeTarget,
  type TargetFacts,
} from "./page-tools.js";

/*
 * What every case shares: opening the harness, failing and finishing, skips, polling and the
 * pointer and menu moves the cases make.
 */

/** Wide, narrow and very narrow (guide §5.15); 900 is above, 700 below the low breakpoint. */
export const DEFAULT_SIZES: readonly Size[] = [
  { width: 1280, height: 900 },
  { width: 720, height: 700 },
  { width: 420, height: 700 },
];

export const LIGHT: Appearance = { theme: "light" };

/** Shown in this order, so the legend is measured without and then with the pill. */
export const SHOWN_ISLANDS = [
  "legend",
  "problems",
  "status",
  "inspector",
] as const satisfies ReadonlyArray<keyof ShowHooks>;

export const POLL_MS = 50;

/** Room for the chrome tooltip's own fade after its 300ms hover delay. */
export const HOVER_MARGIN_MS = 200;

/** Room for a modeler that places, selects or re-renders a frame or two after Enter. */
export const CREATE_WAIT_MS = 1000;

/** A spot without chrome: the root's top-left corner lies outside every island (12px edge). */
export const PARK = { x: 1, y: 1 } as const;

export function sizeLabel(size: Size): string {
  return `${size.width} × ${size.height}`;
}

export function fail(caseName: string, host: ShellHost, problems: readonly string[]): never {
  const unique = [...new Set(problems)];
  throw new Error(
    `@miragon/modeler-shell conformance: ${caseName} (${host} host)\n${unique.map((problem) => `- ${problem}`).join("\n")}`,
  );
}

export function finish(
  caseName: string,
  host: ShellHost,
  problems: readonly string[],
  skipped: Iterable<ShellSkip>,
): ShellCaseOutcome | void {
  if (problems.length > 0) fail(caseName, host, problems);
  const seen = new Set<string>();
  const unique = [...skipped].filter((skip) => !seen.has(skip.reason) && seen.add(skip.reason));
  return unique.length > 0 ? { skipped: unique } : undefined;
}

/** A harness that gives a hook it also declares absent contradicts itself: fail before opening anything. */
export function assertHooksConsistent<P extends PageLike>(
  caseName: string,
  harness: ShellConformanceHarness<P>,
  hooks: readonly AbsentFeature[],
): void {
  const problems = harnessHookProblems(harness, hooks);
  if (problems.length > 0) fail(caseName, harness.host, problems);
}

/** A hook that is neither given nor declared absent. */
export function unfed<P extends PageLike>(
  harness: ShellConformanceHarness<P>,
  hook: ShowHook,
): boolean {
  return !harness.show?.[hook] && !harness.absent?.includes(hook);
}

/** One skip per island hook neither given nor declared absent, with what it would have verified. */
export function missingHooks<P extends PageLike>(
  harness: ShellConformanceHarness<P>,
  what: string,
): ShellSkip[] {
  return SHOWN_ISLANDS.filter((island) => unfed(harness, island)).map((island) => ({
    hook: island,
    reason: `show.${island} is undefined: ${what} of the ${island} island not verified`,
  }));
}

/**
 * Opens the harness. In the web host the system's mode and contrast come first, through
 * `page.emulateMedia` where the page has it (API.md, `./testing`): the page's head script reads
 * them before the first paint.
 */
export async function openHarness<P extends PageLike>(
  page: P,
  harness: ShellConformanceHarness<P>,
  context: OpenContext,
): Promise<void> {
  if (harness.host === "web" && page.emulateMedia) {
    await page.emulateMedia({
      colorScheme: context.requested.theme,
      contrast: context.requested.kontrast === "hoch" ? "more" : "no-preference",
    });
  }
  await harness.open(page, context);
}

/**
 * The web column's hooks a case of `host` needs, each with what it would have verified: the start
 * screen in the web app, toasts outside the IDE host.
 */
export function webHookSkips<P extends PageLike>(
  harness: ShellConformanceHarness<P>,
  hooks: Partial<Record<"toast" | "emptyState", string>>,
): ShellSkip[] {
  return (Object.entries(hooks) as Array<["toast" | "emptyState", string]>)
    .filter(([hook]) => (hook === "toast" ? harness.host !== "ide" : harness.host === "web"))
    .filter(([hook]) => unfed(harness, hook))
    .map(([hook, what]) => ({ hook, reason: `show.${hook} is undefined: ${what} not verified` }));
}

/** Reads until `done` holds or `timeoutMs` passed; the last value either way. */
export async function pollUntil<T>(
  page: PageLike,
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  let value = await read();
  for (let waited = 0; !done(value) && waited < timeoutMs; waited += POLL_MS) {
    await page.waitForTimeout(POLL_MS);
    value = await read();
  }
  return value;
}

/** Hovers `target` long enough for its chrome tooltip; the hovered control, `null` when there is none. */
export async function hover(
  page: PageLike,
  root: string,
  target: ChromeTarget,
): Promise<TargetFacts | null> {
  const anchor = await findTarget(page, root, target);
  if (!anchor) return null;
  await page.mouse.move(PARK.x, PARK.y);
  await page.mouse.move(anchor.client.x, anchor.client.y);
  await page.waitForTimeout(TOOLTIP_DELAY_MS + HOVER_MARGIN_MS);
  await settle(page);
  return anchor;
}

export async function openMenuByClick(page: PageLike, root: string): Promise<boolean> {
  const trigger = await findTarget(page, root, "menu");
  if (!trigger) return false;
  await page.mouse.click(trigger.client.x, trigger.client.y);
  await settle(page);
  return true;
}

export async function closeByEscape(page: PageLike): Promise<void> {
  await page.keyboard.press("Escape");
  await settle(page);
}

/** The open menu's entries, opened by a click and closed again by Escape. */
export async function menuEntries(page: PageLike, root: string): Promise<MenuEntryFacts[]> {
  if (!(await openMenuByClick(page, root))) return [];
  const entries = (await inPage(page, menuEntriesProbe, { root })) ?? [];
  await closeByEscape(page);
  return entries;
}

/** The visible shapes on the canvas. */
export function shapes(page: PageLike, root: string): Promise<ShapeFacts[]> {
  return inPage(page, shapesProbe, { root });
}

/** Moves the palette's roving focus by keyboard to `action`; `false` when it cannot get there. */
export async function focusPaletteEntry(
  page: PageLike,
  root: string,
  action: string,
): Promise<boolean> {
  const before = await inPage(page, paletteFocusProbe, { root });
  if (!before || !before.entries.includes(action)) return false;
  if (!(await focusTarget(page, root, "palette-tab-stop"))) return false;
  await page.keyboard.press("Home");
  for (let step = 0; step <= before.entries.length; step++) {
    if ((await inPage(page, paletteFocusProbe, { root }))?.active === action) return true;
    await page.keyboard.press("ArrowRight");
  }
  return false;
}

/** The first entry that creates something: outside the tools group and not a tool. */
export function firstCreatingEntry(
  entries: readonly PaletteEntryState[],
): PaletteEntryState | undefined {
  return entries.find((entry) => !isToolEntry(entry));
}

/** Enter on `entry`; the shapes once a new one appeared or `CREATE_WAIT_MS` passed. */
export async function enterOnEntry(
  page: PageLike,
  root: string,
  entry: string,
  before: readonly ShapeFacts[],
): Promise<ShapeFacts[] | undefined> {
  if (!(await focusPaletteEntry(page, root, entry))) return undefined;
  await page.keyboard.press("Enter");
  await settle(page);
  const known = new Set(before.map((shape) => shape.id));
  return pollUntil(
    page,
    () => shapes(page, root),
    (after) => after.some((shape) => !known.has(shape.id)),
    CREATE_WAIT_MS,
  );
}
