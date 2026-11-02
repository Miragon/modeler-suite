/*
 * The diagram's entries of the chrome menu (guide §5.4), the same in every host. The types mirror
 * the menu groups of `@miragon/modeler-shell` structurally, so an app hands the result to the
 * shell as it is while the renderer never imports the shell; apps/vscode/test/menu.sync.test.ts
 * pins the mirror. The Model group's entries read their state when the menu opens, so an app calls
 * `shell.menu.refresh()` after every import, command and `c4.view.changed`.
 */
import type { C4ModelingMethods, C4Views } from "../services.js";
import type C4Dialogs from "../navigation/C4Dialogs.js";

/** The icons the guide gives these entries (guide §5.14, the shell's common set). */
export type DiagramMenuIcon = "file-image" | "file-code-corner" | "keyboard";

interface DiagramMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: DiagramMenuIcon;
  /** Read whenever the menu opens and on `menu.refresh()`. */
  readonly disabled?: () => boolean;
  /** A Model entry that only navigates or shows: usable on a read-only canvas (guide §13.5). */
  readonly keepEnabledWhenReadOnly?: boolean;
}

export interface DiagramMenuAction extends DiagramMenuItem {
  readonly kind: "action";
  readonly shortcut?: string;
  readonly danger?: boolean;
  onSelect(): void;
}

export interface DiagramMenuDialog extends DiagramMenuItem {
  readonly kind: "dialog";
  /** The chip of the key that opens the dialog, e.g. "?". */
  readonly shortcut?: string;
  onSelect(): void;
}

export type DiagramMenuEntry = DiagramMenuAction | DiagramMenuDialog;

export interface DiagramMenu {
  /** Absent without a diagram to navigate and edit (`diagramMenu`). */
  readonly model?: readonly DiagramMenuEntry[];
  readonly export: readonly DiagramMenuAction[];
  readonly help: readonly DiagramMenuDialog[];
}

export interface DiagramExport {
  onSelect(): void;
  /** The chip of an app key that runs the same export, e.g. "⌘S". */
  readonly shortcut?: string | undefined;
}

export interface DiagramMenuActions {
  /**
   * PNG first (the more frequent target), then SVG, then the file itself where the host is not the
   * file: the native `.c4` file and the same bytes as Structurizr DSL for Structurizr's own tools.
   */
  readonly exports: {
    readonly png: DiagramExport;
    readonly svg: DiagramExport;
    readonly text?: DiagramExport | undefined;
    readonly structurizr?: DiagramExport | undefined;
  };
  showKeyboardShortcuts(): void;
  /** The key that opens the shortcuts dialog, shown as the chip of its Help entry. */
  readonly shortcutsKey?: string | undefined;
}

/**
 * What the Model group navigates and edits: a `CollaborativeDiagram` fits. Its dialogs open on
 * the chrome the app connected to the diagram (`connectDialogs`).
 */
export interface C4MenuModeler {
  readonly views: Pick<C4Views, "active" | "parent" | "open">;
  readonly c4: Pick<C4ModelingMethods, "layOutAutomatically" | "applyC4Colours">;
  readonly diagram: { get<T>(name: string): T };
}

export interface C4MenuActions extends DiagramMenuActions {
  readonly modeler: C4MenuModeler;
}

/** The label of the text export: the workspace as the native `.c4` file. */
export const TEXT_EXPORT_LABEL = "Export as .c4";

/** The label of the same text under the name Structurizr's own tools open (`workspace.dsl`). */
export const STRUCTURIZR_EXPORT_LABEL = "Export as Structurizr DSL (.dsl)";

/** The key the web app opens the shortcuts dialog with (`createShortcutsDialog`, `diagramMenu`). */
export const SHORTCUTS_KEY = "?";

/** The Model group's keys (SPEC 5.7), also its chips. */
export const VIEWS_KEY = "G";
export const PARENT_VIEW_KEY = "U";

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

/** The Export and Help groups every host shows. */
export function diagramMenu(actions: DiagramMenuActions): DiagramMenu {
  const { exports } = actions;
  return {
    export: [
      exportEntry("export-png", "Export as PNG", exports.png, "file-image"),
      exportEntry("export-svg", "Export as SVG", exports.svg, "file-code-corner"),
      ...(exports.text ? [exportEntry("export-text", TEXT_EXPORT_LABEL, exports.text)] : []),
      ...(exports.structurizr
        ? [exportEntry("export-structurizr", STRUCTURIZR_EXPORT_LABEL, exports.structurizr)]
        : []),
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

function dialogsOf(modeler: C4MenuModeler): C4Dialogs | undefined {
  try {
    return modeler.diagram.get<C4Dialogs>("c4Dialogs");
  } catch {
    return undefined;
  }
}

/**
 * The Model group (SPEC 7.1), in this order: "Views…", "Parent view", "Lay out automatically",
 * "Add existing element…", "Add relationship…", "View settings…", "Workspace settings…", "Apply C4
 * colours"; the shell appends its "Legend" checkbox. Navigation stays usable on a read-only canvas.
 * "Parent view" is disabled at a landscape, so the first enabled action of the group there is "Lay
 * out automatically", which keeps the view and does nothing on a second run.
 */
export function c4ModelMenu(modeler: C4MenuModeler): DiagramMenuEntry[] {
  const notEditable = () => !modeler.views.active().editable;
  return [
    {
      kind: "dialog",
      id: "views",
      label: "Views…",
      shortcut: VIEWS_KEY,
      keepEnabledWhenReadOnly: true,
      onSelect: () => void dialogsOf(modeler)?.showViews(),
    },
    {
      kind: "action",
      id: "parent-view",
      label: "Parent view",
      shortcut: PARENT_VIEW_KEY,
      keepEnabledWhenReadOnly: true,
      disabled: () => modeler.views.parent() === undefined,
      onSelect: () => {
        const parent = modeler.views.parent();
        if (parent) modeler.views.open(parent.key, { cause: "user" });
      },
    },
    {
      kind: "action",
      id: "lay-out-automatically",
      label: "Lay out automatically",
      disabled: notEditable,
      onSelect: () => void modeler.c4.layOutAutomatically(),
    },
    {
      kind: "dialog",
      id: "add-existing-element",
      label: "Add existing element…",
      disabled: notEditable,
      onSelect: () => void dialogsOf(modeler)?.showAddElement(),
    },
    {
      kind: "dialog",
      id: "add-relationship",
      label: "Add relationship…",
      disabled: notEditable,
      onSelect: () => void dialogsOf(modeler)?.showNewRelationship(),
    },
    {
      kind: "dialog",
      id: "view-settings",
      label: "View settings…",
      disabled: notEditable,
      onSelect: () => void dialogsOf(modeler)?.showViewSettings(),
    },
    {
      kind: "dialog",
      id: "workspace-settings",
      label: "Workspace settings…",
      onSelect: () => void dialogsOf(modeler)?.showWorkspaceSettings(),
    },
    {
      kind: "action",
      id: "apply-c4-colours",
      label: "Apply C4 colours",
      onSelect: () => void modeler.c4.applyC4Colours(),
    },
  ];
}

/** The C4 Modeler's menu: the Model group, then Export and Help (`diagramMenu`). */
export function c4Menu(actions: C4MenuActions): DiagramMenu {
  return { model: c4ModelMenu(actions.modeler), ...diagramMenu(actions) };
}
