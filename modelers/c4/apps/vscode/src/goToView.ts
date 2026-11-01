import * as vscode from "vscode";
import type { ParseResult } from "@miragon/c4-dsl";
import {
  viewCatalog,
  type StaticViewType,
  type ViewEntry,
  type ViewKey,
  type ViewType,
  type Workspace,
} from "@miragon/c4-schema-model";
import { GO_TO_VIEW_COMMAND, NO_DIAGRAM_MESSAGE, resourceArgument } from "./commands.js";
import type { ShowViewMessage } from "./protocol.js";

/** The types the canvas shows and edits, in the order of the Views… dialog (SPEC 7.1). */
const STATIC_TYPES: readonly { readonly type: StaticViewType; readonly label: string }[] = [
  { type: "systemLandscape", label: "System Landscape" },
  { type: "systemContext", label: "System Context" },
  { type: "container", label: "Container" },
  { type: "component", label: "Component" },
];

const OTHER_TYPE_LABELS: Readonly<Record<Exclude<ViewType, StaticViewType>, string>> = {
  dynamic: "Dynamic",
  deployment: "Deployment",
  filtered: "Filtered",
  custom: "Custom",
  image: "Image",
};

export const GO_TO_VIEW_TITLE = "Go to View";
export const GO_TO_VIEW_PLACEHOLDER = "Type a title or a key";
export const OTHER_VIEWS_LABEL = "Other views";
export const DRAFT_NOTE = "Not in the file yet";
export const NO_READABLE_VIEWS_MESSAGE =
  "Couldn't read the views of this file. Fix the errors the Problems view lists, then try again.";

export interface ViewPickItem extends vscode.QuickPickItem {
  /** Absent on a separator and on a view the canvas doesn't show. */
  readonly key?: ViewKey;
}

function isStatic(type: ViewType): type is StaticViewType {
  return STATIC_TYPES.some((candidate) => candidate.type === type);
}

function otherTypeLabel(type: ViewType): string {
  return isStatic(type) ? type : OTHER_TYPE_LABELS[type];
}

function separator(label: string): ViewPickItem {
  return { label, kind: vscode.QuickPickItemKind.Separator };
}

function noteOf(entry: ViewEntry): string | undefined {
  if (entry.state !== "written") return DRAFT_NOTE;
  if (entry.editable) return undefined;
  return entry.definition?.readOnlyReason === "scope"
    ? "Read-only: the modeler can't show its scope"
    : "Read-only: it uses an expression the modeler can't show";
}

/**
 * The QuickPick's rows (SPEC 7.3): title and key of every view of the four types the canvas
 * shows, each type under its separator in the catalog's order (written, implicit, then the missing
 * defaults marked as not in the file yet), then the views only Structurizr shows. Those carry no key: they are listed so the list is the
 * whole workspace, and choosing one opens nothing.
 */
export function viewPickItems(workspace: Workspace): ViewPickItem[] {
  const entries = viewCatalog(workspace).list();
  const items: ViewPickItem[] = [];
  for (const { type, label } of STATIC_TYPES) {
    const ofType = entries.filter((entry) => entry.type === type);
    if (ofType.length === 0) continue;
    items.push(separator(label));
    for (const entry of ofType) {
      const note = noteOf(entry);
      items.push({
        label: entry.title,
        description: entry.key,
        ...(note === undefined ? {} : { detail: note }),
        key: entry.key,
      });
    }
  }
  const others = entries.filter((entry) => !isStatic(entry.type));
  if (others.length > 0) {
    items.push(separator(OTHER_VIEWS_LABEL));
    for (const entry of others) {
      items.push({
        label: entry.title,
        description: entry.key,
        detail: `${otherTypeLabel(entry.type)} view, shown in Structurizr only`,
      });
    }
  }
  return items;
}

/** Resolves to the key the user chose, or `undefined` once the QuickPick closes without one. */
export function pickView(workspace: Workspace): Promise<ViewKey | undefined> {
  const picker = vscode.window.createQuickPick<ViewPickItem>();
  picker.title = GO_TO_VIEW_TITLE;
  picker.placeholder = GO_TO_VIEW_PLACEHOLDER;
  picker.matchOnDescription = true;
  picker.items = viewPickItems(workspace);
  return new Promise((resolve) => {
    picker.onDidAccept(() => {
      const key = picker.selectedItems[0]?.key;
      if (key === undefined) return;
      resolve(key);
      picker.hide();
    });
    picker.onDidHide(() => {
      resolve(undefined);
      picker.dispose();
    });
    picker.show();
  });
}

/** An open C4 editor, as far as Go to View needs it. */
export interface GoToViewTarget {
  readonly document: vscode.TextDocument;
  post(message: ShowViewMessage): PromiseLike<boolean>;
}

/**
 * "Go to View…" (SPEC 7.3): the extension host reads the document itself, lists its views and
 * posts the chosen key to the editor, whose canvas switches to it. An invalid file lists the views
 * of the last version the canvas could read, which is what the canvas shows.
 */
export function registerGoToViewCommand(
  findEditor: (uri: vscode.Uri | undefined) => Promise<GoToViewTarget | undefined>,
  readableParse: (document: vscode.TextDocument) => ParseResult | undefined,
): vscode.Disposable {
  return vscode.commands.registerCommand(GO_TO_VIEW_COMMAND, async (argument?: unknown) => {
    const editor = await findEditor(resourceArgument(argument));
    if (!editor) return void vscode.window.showInformationMessage(NO_DIAGRAM_MESSAGE);
    const parse = readableParse(editor.document);
    if (!parse) return void vscode.window.showInformationMessage(NO_READABLE_VIEWS_MESSAGE);
    const key = await pickView(parse.workspace);
    if (key !== undefined) await editor.post({ type: "c4.showView", key });
    return undefined;
  });
}
