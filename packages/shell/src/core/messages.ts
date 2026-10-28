import type { ProblemSeverity } from "./feedback/problems.js";
import type { DropForbiddenReason } from "./web-chrome/drop.js";

/**
 * Every text the shell shows or announces, in one table (guide §2, shared terms). English by
 * default; a localized modeler overrides the whole table in its language, numbers arrive already
 * formatted through `Intl` in that language.
 */
export interface ShellMessages {
  /** Menu trigger `aria-label` and tooltip, dropdown `aria-label`. */
  menu: string;
  /** Palette `aria-label`. */
  tools: string;
  /** `aria-label` of the focusable canvas `<svg>` (`role="application"`); a modeler names its notation. */
  canvas: string;
  /** Zoom panel `aria-label`. */
  zoom: string;
  zoomOut: string;
  zoomIn: string;
  /** Tooltip of the readout, e.g. `(percent) => "Zoom to " + percent` with percent "100%". */
  zoomToActual(percent: string): string;
  /** `aria-label` of the readout: "Zoom to 100% (now 86%)". */
  zoomToActualNow(percent: string, now: string): string;
  fit: string;
  /** Legend title and the Model-group checkbox. */
  legend: string;
  closeLegend: string;
  /** Pill text: "1 problem", "2 problems". */
  problems(count: number, formattedCount: string): string;
  /** Pill `aria-label`: "2 problems, 1 error", "2 problems, no errors". */
  problemsLabel(
    count: number,
    errors: number,
    formattedCount: string,
    formattedErrors: string,
  ): string;
  /** Pill tooltip in the IDE host. */
  showProblems: string;
  /** Empty-file hint (guide §13.5). */
  emptyHint: string;
  insertExample: string;
  /** Status box for an invalid file; `diagram` names the notation ("Event Storming board"). */
  invalidFile(diagram: string): string;
  /** Key names in shortcut chips outside macOS (German: Strg, Umschalt, Plus, Minus). */
  keyNames: { ctrl: string; shift: string; plus: string; minus: string };

  // ---- Web host (0.2): guide §2 shared terms, §5.4, §5.7, §5.10, §8, §9 ----

  /** Default label and `aria-label` of the primary action (web app, top right). */
  share: string;
  /** `aria-label` of the legal line's `<nav>`. "Impressum" and "Datenschutz" are never translated (guide §2). */
  legal: string;
  /** First entry of the legal line, linking the Miragon home page: "© 2026 Miragon GmbH". */
  copyright(year: number): string;
  /** The description of every legal link for screen readers: they open in a new tab. */
  opensInNewTab: string;
  /** File group (web app) and the empty state's primary button. */
  newDiagram: string;
  /** File group: "Open…" (U+2026, it opens the browser's file dialog). */
  openFile: string;
  /** File group and the empty state's ghost button. */
  showExample: string;
  /** File group: "Import…". */
  importFile: string;
  /** Heading and `aria-label` of the Appearance radio group (web app with dark only, guide §13.3). */
  appearance: string;
  appearanceSystem: string;
  appearanceLight: string;
  appearanceDark: string;
  /** Title of the problems popover (web app). */
  problemsTitle: string;
  /** A row's severity for screen readers, the `aria-label` of its icon: "Error", "Warning". */
  problemSeverity(severity: ProblemSeverity): string;
  /** `aria-label` of a Close button (toasts). */
  close: string;
  /** Chip of the drop zone while a drag can be dropped (guide §9 Drag-over). */
  dropFile: string;
  /** Chip of the drop zone while the drag cannot be dropped (guide §9 Drop forbidden). */
  dropForbidden(reason: DropForbiddenReason): string;
  /** The empty state's drag-and-drop hint when the modeler has a drop zone. */
  dropHint: string;
  /** The text link after the empty state's hint that runs the File group's "Open…". */
  openFileLink: string;
  /**
   * Danger toast for a dropped file outside `DropZoneOptions.accept`; `accepted` is the accept list
   * joined by `Intl.ListFormat` (disjunction) in `lang`: ".storm, .json, or .txt".
   */
  cannotOpenFile(name: string, accepted: string): string;

  // ---- Keyboard shortcuts dialog (0.7): guide §5.4, §8 ----

  /** Title of the "Keyboard shortcuts…" dialog of the Help group. */
  shortcutsTitle: string;
  /** The dialog's View group, which the shell fills with the chrome's zoom and fit keys. */
  shortcutsView: string;
  /** Title of a modeler's Edit group, so every modeler names it alike. */
  shortcutsEdit: string;
  /** Title of a modeler's group of the notation's tools. */
  shortcutsTools: string;
}

/** Every key optional; an `undefined` value keeps the default (a conditional override). */
export type ShellMessageOverrides = {
  [Key in Exclude<keyof ShellMessages, "keyNames">]?: ShellMessages[Key] | undefined;
} & {
  keyNames?: { [Key in keyof ShellMessages["keyNames"]]?: string | undefined } | undefined;
};

export const defaultMessages: ShellMessages = {
  menu: "Menu",
  tools: "Tools",
  canvas: "Diagram",
  zoom: "Zoom",
  zoomOut: "Zoom out",
  zoomIn: "Zoom in",
  zoomToActual: (percent) => `Zoom to ${percent}`,
  zoomToActualNow: (percent, now) => `Zoom to ${percent} (now ${now})`,
  fit: "Fit to view",
  legend: "Legend",
  closeLegend: "Close legend",
  problems: (count, formattedCount) => `${formattedCount} ${count === 1 ? "problem" : "problems"}`,
  problemsLabel: (count, errors, formattedCount, formattedErrors) =>
    `${formattedCount} ${count === 1 ? "problem" : "problems"}, ${
      errors === 0 ? "no errors" : `${formattedErrors} ${errors === 1 ? "error" : "errors"}`
    }`,
  showProblems: "Show in Problems view",
  emptyHint: "Pick a tool from the palette to start.",
  insertExample: "Insert example",
  invalidFile: (diagram) =>
    `This file isn't a valid ${diagram} right now. The diagram shows the last valid version and is read-only until you fix the text.`,
  keyNames: { ctrl: "Ctrl", shift: "Shift", plus: "Plus", minus: "Minus" },
  share: "Share",
  legal: "Legal",
  copyright: (year) => `© ${year} Miragon GmbH`,
  opensInNewTab: "Opens in a new tab",
  newDiagram: "New diagram",
  openFile: "Open…",
  showExample: "Show example",
  importFile: "Import…",
  appearance: "Appearance",
  appearanceSystem: "System",
  appearanceLight: "Light",
  appearanceDark: "Dark",
  problemsTitle: "Problems",
  problemSeverity: (severity) => (severity === "error" ? "Error" : "Warning"),
  close: "Close",
  dropFile: "Drop file here",
  dropForbidden: (reason) =>
    reason === "multiple"
      ? "Drop one file at a time"
      : reason === "dialog"
        ? "Close the dialog to drop a file"
        : "This modeler can't open this file type",
  dropHint: "Or drop a file here",
  openFileLink: "Open a file…",
  cannotOpenFile: (name, accepted) => `Couldn't open “${name}”. Drop a ${accepted} file.`,
  shortcutsTitle: "Keyboard shortcuts",
  shortcutsView: "View",
  shortcutsEdit: "Edit",
  shortcutsTools: "Tools",
};

/** `defaultMessages` with `overrides` applied (`keyNames` merged key by key). */
export function resolveMessages(overrides?: ShellMessageOverrides | undefined): ShellMessages {
  const { keyNames, ...texts } = overrides ?? {};
  return {
    ...defaultMessages,
    ...definedEntries(texts),
    keyNames: { ...defaultMessages.keyNames, ...definedEntries(keyNames ?? {}) },
  };
}

// `{ menu: undefined }` (a spread of optional fields, a conditional override) keeps the default
// instead of blanking the text.
function definedEntries<T extends object>(
  partial: T,
): { [Key in keyof T]?: Exclude<T[Key], undefined> } {
  return Object.fromEntries(Object.entries(partial).filter(([, value]) => value !== undefined)) as {
    [Key in keyof T]?: Exclude<T[Key], undefined>;
  };
}
