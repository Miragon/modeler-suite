/*
 * The diagram's entries of the chrome menu (guide §5.4), the same in every host. The types mirror
 * the menu groups of `@miragon/modeler-shell` structurally, so an app hands the result to the
 * shell as it is while the renderer never imports the shell; apps/vscode/test/menu.sync.test.ts
 * pins the mirror. The Model group's dialog edits the document, so the shell locks it on a
 * read-only canvas.
 */

import {
  STICKY_COLUMNS,
  isStickyColumns,
  type StickyColumns,
} from "@miragon/business-model-canvas-schema-model";

/** The icons the guide gives these entries (guide §5.14, the shell's common set). */
export type DiagramMenuIcon = "file-image" | "file-code-corner" | "keyboard";

interface DiagramMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: DiagramMenuIcon;
}

export interface DiagramMenuAction extends DiagramMenuItem {
  readonly kind: "action";
  readonly shortcut?: string;
  onSelect(): void;
}

export interface DiagramMenuDialog extends DiagramMenuItem {
  readonly kind: "dialog";
  /** The chip of the key that opens the dialog, e.g. "?". */
  readonly shortcut?: string;
  onSelect(): void;
}

export interface DiagramMenuCheckbox extends DiagramMenuItem {
  readonly kind: "checkbox";
  /** A Model entry that is view state only stays usable on a read-only canvas. */
  readonly keepEnabledWhenReadOnly?: boolean;
  checked(): boolean;
  onToggle(checked: boolean): void;
}

export interface DiagramMenuRadioOption {
  readonly value: string;
  readonly label: string;
}

export interface DiagramMenuRadio {
  readonly kind: "radio";
  readonly id: string;
  readonly label: string;
  readonly options: readonly DiagramMenuRadioOption[];
  value(): string | undefined;
  onSelect(value: string): void;
}

export interface DiagramMenu {
  readonly model: readonly (DiagramMenuDialog | DiagramMenuRadio | DiagramMenuCheckbox)[];
  readonly export: readonly DiagramMenuAction[];
  readonly help: readonly DiagramMenuDialog[];
}

export interface DiagramExport {
  onSelect(): void;
  /** The chip of an app key that runs the same export, e.g. "⌘S". */
  readonly shortcut?: string | undefined;
}

export interface DiagramModelActions {
  showCanvasTitle(): void;
  stickyColumns(): StickyColumns;
  setStickyColumns(columns: StickyColumns): void;
}

/** The notes panel, opened and closed from the Model group. */
export interface DiagramNotesToggle {
  isOpen(): boolean;
  toggle(): void;
}

export interface DiagramMenuActions {
  readonly model: DiagramModelActions;
  readonly notes?: DiagramNotesToggle | undefined;
  /** PNG first (the more frequent target), then SVG, then the file itself where the host is not the file. */
  readonly exports: {
    readonly png: DiagramExport;
    readonly svg: DiagramExport;
    readonly text?: DiagramExport | undefined;
  };
  showKeyboardShortcuts(): void;
  /** The key that opens the shortcuts dialog, shown as the chip of its Help entry. */
  readonly shortcutsKey?: string | undefined;
}

/** The label of the text export, also its row in the shortcuts dialog. */
export const TEXT_EXPORT_LABEL = "Export as .bmc";

/** The key the web app opens the shortcuts dialog with (`createShortcutsDialog`, `diagramMenu`). */
export const SHORTCUTS_KEY = "?";

function exportEntry(id: string, label: string, action: DiagramExport, icon?: DiagramMenuIcon) {
  return {
    kind: "action" as const,
    id,
    label,
    ...(icon ? { icon } : {}),
    ...(action.shortcut ? { shortcut: action.shortcut } : {}),
    onSelect: () => action.onSelect(),
  };
}

function stickyColumnsEntry(model: DiagramModelActions): DiagramMenuRadio {
  return {
    kind: "radio",
    id: "sticky-columns",
    label: "Stickies side by side",
    options: STICKY_COLUMNS.map((columns) => ({ value: String(columns), label: String(columns) })),
    value: () => String(model.stickyColumns()),
    onSelect: (value) => {
      const columns = Number(value);
      if (isStickyColumns(columns)) model.setStickyColumns(columns);
    },
  };
}

function notesEntry(notes: DiagramNotesToggle): DiagramMenuCheckbox {
  return {
    kind: "checkbox",
    id: "notes",
    label: "Notes",
    keepEnabledWhenReadOnly: true,
    checked: () => notes.isOpen(),
    onToggle: () => notes.toggle(),
  };
}

export function diagramMenu(actions: DiagramMenuActions): DiagramMenu {
  const { exports, model } = actions;
  return {
    model: [
      {
        kind: "dialog",
        id: "canvas-title",
        label: "Canvas title…",
        onSelect: () => model.showCanvasTitle(),
      },
      stickyColumnsEntry(model),
      ...(actions.notes ? [notesEntry(actions.notes)] : []),
    ],
    export: [
      exportEntry("export-png", "Export as PNG", exports.png, "file-image"),
      exportEntry("export-svg", "Export as SVG", exports.svg, "file-code-corner"),
      ...(exports.text ? [exportEntry("export-text", TEXT_EXPORT_LABEL, exports.text)] : []),
    ],
    help: [
      {
        kind: "dialog",
        id: "keyboard-shortcuts",
        label: "Keyboard shortcuts…",
        icon: "keyboard",
        ...(actions.shortcutsKey ? { shortcut: actions.shortcutsKey } : {}),
        onSelect: () => actions.showKeyboardShortcuts(),
      },
    ],
  };
}
