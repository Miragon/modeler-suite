import type {
  Appearance,
  ColorThemeSetting,
  ShellHost,
  ShortcutGroup,
  Size,
  Theme,
  ToastStatus,
} from "../core/index.js";
import { createCases } from "./cases.js";
import type { PageLike } from "./page.js";

export interface OpenContext {
  /** The page's viewport, which is the modeler's container in an own document. */
  size: Size;
  /**
   * What the host requests before the modeler resolves it: in an IDE host the VS Code color theme
   * (`vsCodeStubSearch` hands it to a page with the VS Code stub). For an embedded host the kit
   * itself puts the foreign page's `<html>` in this mode once `open` resolved. In the web host the
   * system's preference without a stored choice: the kit emulates `prefers-color-scheme` and
   * `prefers-contrast` (`PageLike.emulateMedia`) before `open`, and `open` loads the page with an
   * empty `localStorage` entry `miragon.darstellung`.
   */
  requested: Appearance;
  /**
   * After 0.5.0: the key of `ShellConformanceHarness.documents` to load; absent for the harness's
   * default document, the one with content every other case acts on.
   */
  document?: string | undefined;
}

/**
 * The keys of `ShellConformanceHarness.documents` the kit reserves (after 0.5.0) for documents
 * without an element (guide §13.5: empty means no element, only whitespace, comments or a header
 * such as the title):
 * - `"empty"`: the empty diagram a user starts from. In an IDE host the file the extension's "New
 *   Empty <Diagram>" command writes, in the web host the canvas after "New diagram" on the start
 *   screen, embedded the host's new document.
 * - `"blank"`: a file of zero bytes, as a user creates one outside the extension (IDE host).
 */
export type EmptyDocument = "empty" | "blank";

/**
 * How the kit makes the optional islands visible (`geometry`, `aria`) and puts the modeler into its
 * invalid-file state (`readOnly`).
 */
export interface ShowHooks<P extends PageLike = PageLike> {
  problems?: ((page: P) => Promise<void>) | undefined;
  status?: ((page: P) => Promise<void>) | undefined;
  legend?: ((page: P) => Promise<void>) | undefined;
  inspector?: ((page: P) => Promise<void>) | undefined;
  /**
   * Puts the modeler into its invalid-file state the way its host does (an invalid import): a
   * read-only canvas and the status box. The kit waits `INVALID_STATUS_DELAY_MS` afterwards.
   */
  invalid?: ((page: P) => Promise<void>) | undefined;
  /**
   * Web host: puts the page on its start screen, the way a fresh visit without a document shows
   * it (`shell.setEmptyState(true)`); `open` itself loads a document.
   */
  emptyState?: ((page: P) => Promise<void>) | undefined;
  /**
   * Web and embedded hosts: shows `toast` through the modeler's `shell.toast`, with
   * `{ label: toast.actionLabel, onSelect() {} }` as its action when `actionLabel` is given.
   */
  toast?: ((page: P, toast: ToastFixture) => Promise<void>) | undefined;
}

/** A toast the kit asks the `toast` hook to show (cases `toasts`, `geometry`). */
export interface ToastFixture {
  status: ToastStatus;
  text: string;
  actionLabel?: string | undefined;
}

/** A file the kit drops on the page (case `dropZone`), built in the page as `new File([text], name, { type })`. */
export interface DropFixture {
  name: string;
  type: string;
  text: string;
}

export interface DropFixtures {
  /** A file `DropZoneOptions.accept` takes; dropping it on the start screen opens it (the card goes). */
  accepted: DropFixture;
  /** A file outside `accept`; dropping it opens nothing and shows a danger toast (or the modeler's `onReject`). */
  rejected?: DropFixture | undefined;
  /** `DropZoneOptions.multiple` of the modeler; default `false`, so a drag of two files is forbidden. */
  multiple?: boolean | undefined;
}

/**
 * A show hook by name: the islands `legend`, `inspector`, `problems`, `status`, the state
 * `invalid`, and in the web column `emptyState` and `toast`.
 */
export type ShowHook = keyof ShowHooks;

/**
 * How the `labelEditor` case opens the modeler's label editor and sees a commit of it (0.4).
 */
export interface LabelEditorHooks<P extends PageLike = PageLike> {
  /**
   * Opens the label editor on an element of the opened document the way a user does (a
   * double-click) and types text the element's label does not hold yet, without committing it (no
   * Enter, no click elsewhere). Resolves with the typed text once the editor has the keyboard focus
   * and holds it. The case calls it again after a step that committed or closed the editor, on the
   * view that step left.
   */
  open(page: P): Promise<string>;
  /**
   * Whether the document changed since `open` last resolved: what the host would save or hand to
   * its peers (a content change of the modeler, an edit message to the extension).
   */
  documentChanged(page: P): Promise<boolean>;
}

/**
 * How the `csp` case opens the modeler's production webview bundle (0.6): built as the extension
 * ships it, behind `renderWebviewHtml`'s document and CSP, with the VS Code stub running before it.
 * `openWebviewBundle` of `@miragon/modeler-shell/testing/webview-bundle` serves all of that.
 */
export interface CspHooks<P extends PageLike = PageLike> {
  /**
   * Load the bundle at `context.size` as VS Code would with `context.requested`, hand it its
   * document the way the extension does (the example, through the `init` message) and resolve once
   * the first import is done.
   */
  open(page: P, context: OpenContext): Promise<void>;
}

/**
 * How the `shortcutsDialog` case opens the shell's "Keyboard shortcuts…" dialog (0.7).
 */
export interface ShortcutsDialogHooks<P extends PageLike = PageLike> {
  /**
   * Calls `shell.showShortcutsDialog(groups)` in the page, with the focus where the kit left it (on
   * the menu trigger, as the Help entry leaves it): `groups` are the modeler's own shortcut groups,
   * those its Help entry shows, or `fixture` where the page cannot build them. The case checks only
   * what holds for any groups. Resolve once the call returned.
   */
  show(page: P, fixture: readonly ShortcutGroup[]): Promise<void>;
}

/**
 * What a harness can lack: a show hook, the web app's drop zone (`drop`), problems that point at
 * an element (`problemSelection`: the modeler's diagnostics only name lines, so no row selects), a
 * label editor (`labelEditor`: the notation has no labels to edit on the canvas), or a menu entry
 * that acts on the canvas (`canvasMenuAction`: no File or Model action without a dialog, as in an
 * IDE host whose Model group holds only toggles and dialogs).
 */
export type AbsentFeature =
  ShowHook | "drop" | "problemSelection" | "labelEditor" | "canvasMenuAction";

export interface ShellConformanceHarness<P extends PageLike = PageLike> {
  host: ShellHost;
  /** The modes the modeler declares (static); the appearance case requests dark from `["light"]`. */
  themes: readonly Theme[];
  /**
   * Load the modeler with the shell at `size`, as the host would with `requested`, as on a first
   * visit: without a stored legend state, so the shell's default decides (case `legendStart`:
   * closed at every size). Each call loads a new document: a navigation that changes only the URL
   * fragment keeps the page, and with it the legend's earlier start state, so `legendStart` fails it
   * (go to `about:blank` first). Resolve once the first import is done.
   */
  open(page: P, context: OpenContext): Promise<void>;
  /** Tear modeler and shell down through the page's own path; `undefined` skips the cleanup case. */
  destroy?: ((page: P) => Promise<void>) | undefined;
  /** CSS selector of the shell root; default `.cd-shell`. */
  root?: string | undefined;
  /** Hooks for the islands and states the modeler has; one that is neither given nor `absent` is reported as skipped. */
  show?: ShowHooks<P> | undefined;
  /** Web host: the files the `dropZone` case drops; without them (and not `absent`) it is skipped with `hook: "drop"`. */
  drop?: DropFixtures | undefined;
  /**
   * 0.4: the modeler's label editor for the `labelEditor` case; without it (and not `absent`) the
   * case is skipped with `hook: "labelEditor"`.
   */
  labelEditor?: LabelEditorHooks<P> | undefined;
  /**
   * 0.6, `ide` only: the production webview bundle for the `csp` case; without it the case is
   * skipped with `hook: "csp"`.
   */
  csp?: CspHooks<P> | undefined;
  /**
   * 0.7: the shell's "Keyboard shortcuts…" dialog for the `shortcutsDialog` case; without it the
   * case is skipped with `hook: "shortcutsDialog"`. Every modeler has the dialog (guide §5.4), so
   * it cannot be declared absent.
   */
  shortcutsDialog?: ShortcutsDialogHooks<P> | undefined;
  /**
   * The islands and states the modeler does not have. An absent hook is not reported as skipped,
   * and `geometry` and `aria` assert that its island is never visible. Listing a hook that `show`
   * also gives fails every case that uses it.
   */
  absent?: readonly AbsentFeature[] | undefined;
  /** Container sizes of the geometry case; default wide 1280 × 900, narrow 720 × 700, very narrow 420 × 700. */
  sizes?: readonly Size[] | undefined;
  /**
   * After 0.5.0: the documents `open` loads besides its default one, by key
   * (`OpenContext.document`). The `appearance` case runs on the default document and on each listed
   * one. `emptyFile` runs on the keys of `EmptyDocument`; without `"empty"`, and in the IDE host
   * without `"blank"`, it is skipped with `hook: "documents"`. Any other key names a document of the
   * harness's own, such as one in a style the renderer paints differently.
   */
  documents?: readonly string[] | undefined;
}

/** One part of a case the harness could not feed. */
export interface ShellSkip {
  /**
   * The harness field that would feed it: a show hook, `drop`, `labelEditor`, `csp`,
   * `shortcutsDialog`, `destroy`, `documents`, or `open` when the document it opens lacks what the
   * case needs (a shape on the canvas).
   */
  hook:
    | ShowHook
    | "drop"
    | "labelEditor"
    | "csp"
    | "shortcutsDialog"
    | "destroy"
    | "documents"
    | "open";
  reason: string;
}

export interface ShellCaseOutcome {
  /** What the case could not (fully) run, one entry per missing harness field. */
  skipped?: readonly ShellSkip[];
}

export interface ShellConformanceCase {
  name: string;
  run<P extends PageLike>(
    page: P,
    harness: ShellConformanceHarness<P>,
  ): Promise<ShellCaseOutcome | void>;
}

/**
 * The cases: `geometry` (every `data-chrome` island ±1px, per host and breakpoint), `legendStart`
 * (without a stored state the legend starts closed at 390 × 844, 441 × 900 and 1280 × 900), `aria`
 * (roles, names, `aria-expanded`/`-controls`/`-keyshortcuts`/`-disabled`, DOM order, no positive
 * tabindex), `keys` (each chrome key acts exactly once; in the IDE host a `keydown` listener on
 * `window` never fires for a handled key; unmodified `+`/`-` never zoom; select all acts on the
 * canvas only), `focusHandBack` (a pointer click on a zoom control, a palette tool, a File or Model
 * action without a dialog or, in the web host, the primary action leaves the focus on the canvas;
 * Enter and Space on zoom in and on the primary action leave it on the button, Enter on that menu
 * entry returns it to the trigger), `create` (Enter on the first creating palette entry places one
 * selected element in the free rectangle and focuses the canvas),
 * `emptyFile` (each empty document of `documents` opens at 100 %, or fitted to a plot that always
 * counts, with the empty-file hint in the middle of the free rectangle and no invalid-file state;
 * the first element takes the hint away without moving the view, deleting it brings the hint back;
 * `appearance` runs on every document of `documents` too),
 * `labelEditor` (the shell's zoom, fit and refit never commit an open label editor, contract L5,
 * and leave it open with the typed text, which L5 recommends and the shell kit requires),
 * `readOnly` (the invalid-file lock of guide §13.5), `appearance` (dark requested from a light-only
 * modeler: nothing turns dark, `color-scheme` light everywhere, the canvas surround and the
 * palette's tool colours from the roles; the web app's mode and its Appearance group),
 * `reducedMotion` (under `prefers-reduced-motion` and VS Code's reduce motion nothing moves and an
 * explicit fit jumps), `forcedColors` (under `forced-colors: active` islands, dropdown and the
 * modeler's dialogs keep their border, the pressed tool, the focus and the status box their marks),
 * `overlayLayers` (what stays on the canvas lies at `z-index` 100 or below, under the palette; only a
 * popup that closes on a pan or zoom covers it), `shortcutsDialog` (0.7: `shell.showShortcutsDialog`
 * through the harness's hook is the modal dialog of guide §8 in normal and high contrast and under
 * forced colours, its View group starts with the chrome's keys as their tooltips show them, the
 * focus stays inside, the zoom keys rest, and Escape, Close and the backdrop close it and return the
 * focus to the menu trigger), `csp` (the IDE host's production bundle under
 * `renderWebviewHtml`'s CSP: no violation, no error and the shell's fonts from files after a walk
 * over tooltip, context pad, label editor, menu and zoom) and `cleanup` (after `destroy` no shell
 * element, class, attribute or key handling remains); then the web
 * column's `webChrome`, `emptyState`, `toasts`, `problemsList` and `dropZone`, which assert in the
 * other hosts that nothing of them shows.
 */
export function shellConformanceCases(): ShellConformanceCase[] {
  return createCases();
}

/** Playwright's `test` (or any runner whose body receives `{ page }`). */
export type ShellConformanceTest<P extends PageLike = PageLike> = (
  name: string,
  body: (fixtures: { page: P }) => Promise<void>,
) => unknown;

export interface RegisterShellConformanceOptions {
  /** Default: `console.warn`, one line per case with its skips joined by "; ". */
  onSkip?: ((caseName: string, skips: readonly ShellSkip[]) => void) | undefined;
}

/**
 * The query string for a test page that installs the VS Code stub of
 * `@miragon/modeler-shell/testing/vscode-stub` with `stubOptionsFromSearch(location.search)`:
 * `theme=dark&kontrast=hoch`, plus the `colorTheme` setting and VS Code's reduce motion.
 */
export function vsCodeStubSearch(
  requested: Appearance,
  extra: { colorTheme?: ColorThemeSetting | undefined; reduceMotion?: boolean | undefined } = {},
): string {
  const query = new URLSearchParams({ theme: requested.theme });
  if (requested.kontrast) query.set("kontrast", requested.kontrast);
  if (extra.colorTheme) query.set("colorTheme", extra.colorTheme);
  if (extra.reduceMotion) query.set("reduceMotion", "");
  return query.toString();
}

/** Registers every case as `shell conformance: <name>`. */
export function registerShellConformance<P extends PageLike>(
  harness: ShellConformanceHarness<P>,
  test: ShellConformanceTest<P>,
  options: RegisterShellConformanceOptions = {},
): void {
  const onSkip =
    options.onSkip ??
    ((caseName: string, skips: readonly ShellSkip[]) => {
      console.warn(
        `@miragon/modeler-shell conformance: SKIPPED "${caseName}" (${harness.host} host): ${skips.map((skip) => skip.reason).join("; ")}`,
      );
    });
  for (const conformanceCase of shellConformanceCases()) {
    test(`shell conformance: ${conformanceCase.name}`, async ({ page }) => {
      const outcome = await conformanceCase.run(page, harness);
      if (outcome?.skipped && outcome.skipped.length > 0)
        onSkip(conformanceCase.name, outcome.skipped);
    });
  }
}
