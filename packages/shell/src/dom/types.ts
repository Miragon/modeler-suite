import type {
  AppearanceChoice,
  Insets,
  Platform,
  ProblemItem,
  ShellHost,
  ShellMessageOverrides,
  ShellMessages,
  ShortcutGroup,
  Theme,
  ThemeColors,
  ToastRequest,
  ZoomTarget,
} from "../core/index.js";
import type { ShellDialog } from "./dialog.js";
import type { ShellIconName } from "./icons.js";

export interface ShellOptions {
  /** The host column of guide §5.2. */
  host: ShellHost;
  /**
   * The element diagram-js renders into (for example a renderer's `modeler.container`). The shell
   * moves it into its canvas slot and adds `cd-shell-canvas`. Omitted: the shell creates the slot,
   * and the modeler is constructed with `container: handle.canvas`.
   */
  canvas?: HTMLElement | undefined;
  /**
   * The tool's UI language (BCP 47) for `Intl` and `<html lang>` (guide §2: one language per tool).
   * Default in an own document (`ide`, `web`): the closest `[lang]` of the root, else `"en"`. In the
   * `embedded` host the page's language is not the tool's, so the default is the root's own `lang`
   * attribute, else `"en"`, and the root carries `lang` itself.
   */
  lang?: string | undefined;
  messages?: ShellMessageOverrides | undefined;
  /** Platform of the shortcut labels; default `detectPlatform(navigator)`. */
  platform?: Platform | undefined;
  /** Where the one `keydown` listener sits; default `document`, `root` in the `embedded` host. */
  keyScope?: "document" | "root" | undefined;
  /**
   * The modes the modeler can show (a static value of the modeler package), default `["light"]`.
   * Read in the `embedded` and `web` hosts. Embedded: the root carries `data-cd-theme="<themes[0]>"`
   * itself, whatever the page shows, and mirrors the host's `data-cd-kontrast` (guide §13.3); the
   * host asks the renderer for a mode through the contract's `appearance` surface
   * (`@miragon/modeler-api` 1.5), which a light-only renderer answers in `themes[0]` too. Web: with
   * `"dark"` the shell renders the Appearance group and applies the choice on `<html>` (needs
   * `appearance`); light-only it renders no group. In the `ide` host the host writes the mode.
   */
  themes?: readonly Theme[] | undefined;
  /** The fixed menu groups this modeler fills (guide §5.4); omitted groups and empty ones collapse. */
  menu?: MenuGroups | undefined;
  /** The problems pill; omitted = the modeler has no diagnostics. */
  problems?: ProblemsOptions | undefined;
  /** The legend card; omitted = the notation has no legend. */
  legend?: LegendOptions | undefined;
  /** The inspector slot; omitted = the modeler has no inspector. */
  inspector?: InspectorOptions | undefined;
  /** The empty-file hint of IDE and embedded hosts (guide §13.5); omitted = no hint. */
  emptyHint?: EmptyHintOptions | undefined;

  // ---- Web host (0.2): read in `host: "web"` only, ignored elsewhere (guide §5.2) ----

  /** The primary action at the top right (guide §5.7); omitted = the top right stays empty. */
  primary?: PrimaryActionOptions | undefined;
  /**
   * The legal line at the bottom left (guide §5.10), always rendered in the web host: copyright,
   * Impressum and Datenschutz (`lang="de"`), then `links`.
   */
  legal?: LegalLineOptions | undefined;
  /** The File group, first in the menu (guide §5.4); omitted = no File group. */
  file?: FileMenuOptions | undefined;
  /** The mode choice of a dark-capable modeler (guide §13.3); required when `themes` includes `"dark"`. */
  appearance?: WebAppearanceOptions | undefined;
  /** The start screen (guide §8 Empty State); omitted = none. Shown by `setEmptyState(true)`. */
  emptyState?: EmptyStateOptions | undefined;
  /** Files dropped anywhere on the page (guide §9 Drag-over, Drop forbidden); omitted = none. */
  dropZone?: DropZoneOptions | undefined;
}

/** Rendered in this order, separated by separators: Model, Export, Help (guide §5.4). */
export interface MenuGroups {
  model?: readonly MenuEntry[] | undefined;
  export?: readonly MenuEntry[] | undefined;
  help?: readonly MenuEntry[] | undefined;
}

export type MenuEntry = MenuActionEntry | MenuDialogEntry | MenuCheckboxEntry | MenuRadioGroup;

interface MenuItemBase {
  /** Stable id, rendered as `data-menu-id`. */
  id: string;
  label: string;
  /** Only the entries the guide gives an icon (the common set, guide §5.14). */
  icon?: ShellIconName | undefined;
  /** Read whenever the menu opens or `refresh()` runs; disabled entries stay focusable. */
  disabled?: (() => boolean) | undefined;
  /**
   * A Model entry that stays enabled on a read-only canvas: a view-only toggle that never touches
   * the document (Legend, Type captions). Default `false`: the entry is aria-disabled while the
   * canvas is read-only (guide §13.5). The shell's own Legend checkbox sets it.
   */
  keepEnabledWhenReadOnly?: boolean | undefined;
}

/** `menuitem`: closes the menu, returns focus to the trigger, then runs `onSelect`. */
export interface MenuActionEntry extends MenuItemBase {
  kind: "action";
  /** Shortcut chip text shown on the right, verbatim. */
  shortcut?: string | undefined;
  /**
   * `aria-keyshortcuts` (WAI-ARIA names, guide §5.6); default `ariaKeyShortcutsFromLabel(shortcut)`,
   * which names keys, not characters (`"?"` → `"Shift+/ Shift+ß"`). An empty string sets none.
   */
  ariaKeyShortcuts?: string | undefined;
  /** Destructive: icon in `--cd-ui-danger` (confirm per guide §9 in `onSelect`). */
  danger?: boolean | undefined;
  onSelect(): void;
}

/**
 * `menuitem` with `aria-haspopup="dialog"`; its label ends with "…" (U+2026). Behaves like an
 * action: the menu closes and focus returns to the trigger before `onSelect` opens the dialog.
 */
export interface MenuDialogEntry extends MenuItemBase {
  kind: "dialog";
  /** Shortcut chip text shown on the right, verbatim ("?" for "Keyboard shortcuts…"). */
  shortcut?: string | undefined;
  /** As for `MenuActionEntry`: default `ariaKeyShortcutsFromLabel(shortcut)`, `""` sets none. */
  ariaKeyShortcuts?: string | undefined;
  onSelect(): void;
}

/** `menuitemcheckbox`: toggles and keeps the menu open; the check mark carries the state. */
export interface MenuCheckboxEntry extends MenuItemBase {
  kind: "checkbox";
  checked(): boolean;
  onToggle(checked: boolean): void;
}

/** A `role="group"` with a heading and `menuitemradio` entries; keeps the menu open. */
export interface MenuRadioGroup {
  kind: "radio";
  id: string;
  /** Heading and group `aria-label`. */
  label: string;
  options: readonly MenuRadioOption[];
  value(): string | undefined;
  onSelect(value: string): void;
  disabled?: (() => boolean) | undefined;
  /** As `MenuItemBase.keepEnabledWhenReadOnly`. */
  keepEnabledWhenReadOnly?: boolean | undefined;
}

export interface MenuRadioOption {
  value: string;
  label: string;
}

export interface ProblemsOptions {
  /**
   * A click on the pill where the host has a problems view of its own: the IDE host opens its
   * Problems view (give it there), an embedding host its own list. Ignored in the web host, where
   * the pill opens the problems popover; an embedded shell without it opens the popover as well.
   */
  onActivate?: (() => void) | undefined;
  /**
   * A click on a row of the problems popover, after the popover closed (guide §5.10): select the
   * element the item names, where there is one.
   */
  onSelectItem?: ((item: ProblemItem) => void) | undefined;
}

export interface LegendOptions {
  /** Renders the legend rows into `body` once (classes `cd-shell-legend-*`, see API.md). */
  render(body: HTMLElement): void;
  /**
   * Start state the host remembered (VS Code webview state, local storage); default (also
   * `undefined`) closed, in every container.
   */
  open?: boolean | undefined;
  /**
   * Every change of the open state (close button, menu checkbox, `setOpen`, `toggle`), so the host
   * can persist it; not the start state.
   */
  onToggle?: ((open: boolean) => void) | undefined;
  /** Append the "Legend" checkbox to the Model group; default `true`. */
  menuEntry?: boolean | undefined;
}

export interface InspectorOptions {
  /** `aria-label` of the inspector `<aside>`. */
  label: string;
}

export interface EmptyHintOptions {
  /** Shows the "Insert example" button; the modeler writes the example as one document change. */
  onInsertExample?: (() => void) | undefined;
}

export interface ShellHandle {
  /** The element passed to `mountShell`, now `.cd-shell`. */
  readonly root: HTMLElement;
  /** The canvas slot (`.cd-shell-canvas`), diagram-js's container. */
  readonly canvas: HTMLElement;
  readonly host: ShellHost;
  readonly lang: string;
  readonly platform: Platform;
  /** The resolved messages table. */
  readonly messages: ShellMessages;
  readonly menu: MenuHandle;
  readonly tooltip: TooltipHandle;
  readonly legend: LegendHandle | undefined;
  readonly inspector: InspectorHandle | undefined;
  /** The web app's primary action; `undefined` without `primary` and outside the web host. */
  readonly primary: PrimaryActionHandle | undefined;
  /** The web app's mode choice; `undefined` outside the web host and for a light-only modeler. */
  readonly appearance: AppearanceHandle | undefined;
  /** Binds zoom panel, readout and chrome keys; `null` unbinds (buttons disabled). */
  setZoomTarget(target: ZoomTarget | null): void;
  /** The fit insets for what is open right now (palette row, legend, inspector, pill). */
  fitInsets(): Insets;
  /** Adapter API: the diagram-js palette island; returns the unregister function. */
  registerPalette(palette: PaletteRegistration): () => void;
  /** Shows the pill for `count > 0`, hides it at 0. */
  setProblems(summary: ProblemSummary): void;
  /** Shows (after `delayMs`, default 0) or hides (at once) the status box under the palette. */
  setStatus(status: StatusMessage | null, options?: { delayMs?: number | undefined }): void;
  /**
   * Shows or hides the empty-file hint. `connectDiagramJs` keeps it in sync with the diagram
   * (`ConnectOptions.isEmpty`). Hiding it while it holds the focus moves the focus to the canvas.
   */
  setEmptyHint(visible: boolean): void;
  /**
   * Read-only canvas (invalid file, guide §13.5). `true` locks at once: `isReadOnly()`, the palette
   * veto (every entry but Lasso and Hand) and the Model entries of the menu without
   * `keepEnabledWhenReadOnly`; the legend and its Legend checkbox stay usable. `data-readonly` and the
   * `aria-disabled` palette entries show after `delayMs` (default 0; an invalid file passes
   * `INVALID_STATUS_DELAY_MS`, as for `setStatus`), so typing in the text editor does not flicker.
   * Repeated calls while the delay runs keep the first timer; `false` unlocks and hides at once.
   */
  setReadOnly(readOnly: boolean, options?: { delayMs?: number | undefined }): void;
  /** The lock, true from the first `setReadOnly(true)` on, also while its marks are still delayed. */
  isReadOnly(): boolean;
  /**
   * Shows or hides the web app's start screen (guide §8): while it shows, menu trigger, primary
   * action, palette, zoom panel, pill, legend, status box, hint and inspector are hidden, the canvas
   * slot is `inert` and the chrome keys do nothing; the legal line, toasts and the drop zone stay.
   * A no-op without `emptyState`. Hiding it while it holds the focus moves the focus to the canvas.
   */
  setEmptyState(shown: boolean): void;
  isEmptyStateShown(): boolean;
  /**
   * Shows a toast (guide §8, §9) in the web host: bottom centre, at most three, the newest at the
   * bottom, closing by itself after `toastLifetime` unless hovered or focused. In the `ide` and
   * `embedded` hosts it shows nothing and returns an inert handle: there the extension shows the
   * host's notification (§13.5), and the embedding host shows the feedback on the actions it runs
   * itself (§5.2).
   */
  toast(request: ToastRequest): ToastHandle;
  /**
   * Opens the "Keyboard shortcuts…" dialog of the Help group (guide §5.4, §8) in the root: one
   * table per group in the given order, the chrome's zoom and fit keys at the top of the View group
   * (`messages.shortcutsView`, first when `groups` has none), each named and chipped as its tooltip
   * shows it. A modeler row of the View group that names a chrome action is left out. The menu
   * closes first; the focus returns to the element that had it (the menu trigger after the Help
   * entry), else to the canvas. While it is open a second call returns it unchanged; `destroy()`
   * removes it. Usable on a read-only canvas (guide §13.5).
   */
  showShortcutsDialog(groups: readonly ShortcutGroup[]): ShellDialog;
  /** Removes every element, attribute, listener, observer and timer the shell added. Idempotent. */
  destroy(): void;
}

export interface MenuHandle {
  readonly trigger: HTMLButtonElement;
  readonly dropdown: HTMLElement;
  isOpen(): boolean;
  /** Opens on the first (default) or last entry. */
  open(focus?: "first" | "last"): void;
  /** Closes; `restoreFocus` moves focus back to the trigger (default `false`). */
  close(options?: { restoreFocus?: boolean | undefined }): void;
  /** Re-reads `checked`, `value` and `disabled` (call after an external state change). */
  refresh(): void;
  setGroups(groups: MenuGroups): void;
}

export interface TooltipContent {
  label: string;
  /** Shortcut chip text, verbatim (`⌘+`). */
  shortcut?: string | undefined;
}

export interface TooltipHandle {
  /**
   * The chrome tooltip for `control`: after `TOOLTIP_DELAY_MS` hover, at once on keyboard focus,
   * hidden on click, Escape, leave and menu open. Returns the detach function.
   */
  attach(control: HTMLElement, content: TooltipContent | (() => TooltipContent | null)): () => void;
  hide(): void;
}

export interface LegendHandle {
  /** The legend card (`[data-chrome="legend"]`). */
  readonly element: HTMLElement;
  /** Where `render` put the rows. */
  readonly body: HTMLElement;
  isOpen(): boolean;
  setOpen(open: boolean): void;
  toggle(): void;
}

export interface InspectorHandle {
  /** The `<aside data-chrome="inspector">`; the modeler renders its fields into it. */
  readonly element: HTMLElement;
  isOpen(): boolean;
  open(): void;
  /** Closes; a focus inside it moves to the canvas. */
  close(): void;
}

/** What the diagram-js adapter hands the shell about the palette. */
export interface PaletteRegistration {
  /** The `.djs-palette` element (already carrying `data-chrome="palette"`). */
  element: HTMLElement;
  /** Tooltip of an entry element (`.entry`), from `palette.getEntries()` title and shortcut. */
  entryTooltip(entry: HTMLElement): TooltipContent | null;
  /** The read-only state, on registration and on every `setReadOnly` and its delayed marks. */
  setReadOnly(state: PaletteReadOnlyState): void;
}

/** The read-only canvas as the palette sees it (guide §13.5). */
export interface PaletteReadOnlyState {
  /** Veto every entry but Lasso and Hand on `palette.trigger`, from the invalid import on. */
  locked: boolean;
  /** Mark those entries `aria-disabled` and muted, once the shell's delay has passed. */
  shown: boolean;
}

export interface ProblemSummary {
  count: number;
  /** How many of them are errors; decides icon and wording. */
  errors: number;
  /**
   * The rows of the problems popover (web, embedded without `onActivate`), in this order; the IDE
   * host ignores them. `problemSummary(items)` builds the whole summary from them.
   */
  items?: readonly ProblemItem[] | undefined;
}

export type StatusSeverity = "danger" | "warning";

export interface StatusMessage {
  severity: StatusSeverity;
  text: string;
}

// ---- Web host (0.2) ----

/** The web app's primary action (guide §5.7): a blue primary button, icon and label, at the top right. */
export interface PrimaryActionOptions {
  /** Label and `aria-label`; default `messages.share` ("Share"). */
  label?: string | undefined;
  /** Default `"share-2"`. */
  icon?: ShellIconName | undefined;
  /**
   * After a pointer click the canvas has the focus already (guide §5.7); Enter and Space leave it on
   * the button.
   */
  onSelect(): void;
  /** Read on mount and on `primary.refresh()`; disabled stays focusable (`aria-disabled`). */
  disabled?: (() => boolean) | undefined;
}

export interface PrimaryActionHandle {
  /** The `<button data-chrome="primary">`. */
  readonly element: HTMLButtonElement;
  /** True while the label is collapsed to the icon (guide §5.15); the root then carries `data-primary="collapsed"`. */
  isCollapsed(): boolean;
  /** Re-reads `disabled()`. */
  refresh(): void;
}

/** A link of the legal line after Impressum and Datenschutz. */
export interface LegalLink {
  label: string;
  href: string;
  /** For a label in another language than the tool's. */
  lang?: string | undefined;
}

export interface LegalLineOptions {
  /** After Impressum and Datenschutz: `{ label: "GitHub", href: "https://github.com/Miragon/…" }`. */
  links?: readonly LegalLink[] | undefined;
  /** The copyright year; default the current year at mount. */
  year?: number | undefined;
}

/** One entry of the File group; label and icon come from the shell (guide §2, §5.4). */
export interface FileMenuAction {
  onSelect(): void;
  /** Shortcut chip, e.g. "⌘O"; the web app binds the key itself. */
  shortcut?: string | undefined;
  /** `kind: "dialog"` (`aria-haspopup="dialog"`) when it opens an in-page dialog, not the browser's file picker. */
  dialog?: boolean | undefined;
  disabled?: (() => boolean) | undefined;
}

/**
 * The File group of the web app (guide §5.4), in this order, as far as the modeler has them:
 * "New diagram" (`file-plus`), "Open…" (`folder-open`), "Show example", "Import…" (`import`).
 * Menu ids `new-diagram`, `open`, `show-example`, `import`, `data-menu-group="file"`.
 */
export interface FileMenuOptions {
  newDiagram?: FileMenuAction | undefined;
  open?: FileMenuAction | undefined;
  showExample?: FileMenuAction | undefined;
  import?: FileMenuAction | undefined;
}

/** What `localStorage` offers; a blocked storage throws, the shell catches it. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WebAppearanceOptions {
  /** The two `theme-color` values from the vendored token JSON (see `ThemeColors`). */
  themeColors: ThemeColors;
  /** Default `globalThis.localStorage`. */
  storage?: StorageLike | undefined;
}

/** The mode choice of a dark-capable web app (guide §13.3), as the Appearance group drives it. */
export interface AppearanceHandle {
  /** The stored choice, `"system"` without one. */
  choice(): AppearanceChoice;
  /**
   * Stores the choice (`"system"` removes `APPEARANCE_STORAGE_KEY`) and applies `documentMode` on
   * `<html>` and the metas in one step, with `cd-shell-no-transition` for one frame (guide §7).
   */
  setChoice(choice: AppearanceChoice): void;
}

/** The web app's start screen (guide §8): a centred glass card with the Komet and two actions. */
export interface EmptyStateOptions {
  /** The card's title (h1, 21px/600), the modeler's name: "Event Storming Modeler". */
  title: string;
  /** One line of help (16px/1.6, `--cd-ui-text-leise`): "Start a new diagram, or explore the example." */
  text: string;
  /**
   * URL of the official Miragon icon `miragon-komet-blau.svg`, vendored unchanged from
   * `Miragon/corporate-identity` (guide §2, §11), shown at 64px with `alt=""`.
   */
  komet: string;
  /** "New diagram", the blue primary button. The shell hides the card first. */
  onNewDiagram(): void;
  /** "Show example", the ghost button; omitted = no example button. The shell hides the card first. */
  onShowExample?: (() => void) | undefined;
  /** The drag-and-drop hint (13px, `--cd-ui-text-leise`), shown with a `dropZone` only; default `messages.dropHint`. */
  dropHint?: string | undefined;
}

export interface DropZoneOptions {
  /**
   * Like `<input accept>`: extensions (".storm") and MIME types ("application/json", "text/*").
   * List the MIME types too, so a drag can already show a foreign type as forbidden. Empty = any file.
   */
  accept: readonly string[];
  /** Default `false`: a drag with more than one file is forbidden. */
  multiple?: boolean | undefined;
  /** The dropped files that match `accept` (one unless `multiple`). */
  onDrop(files: readonly File[]): void;
  /** The dropped files outside `accept`; default a danger toast `messages.cannotOpenFile`. */
  onReject?: ((files: readonly File[]) => void) | undefined;
}

export interface ToastHandle {
  /** Closes the toast (slide and fade out); a second call does nothing. */
  dismiss(): void;
}
