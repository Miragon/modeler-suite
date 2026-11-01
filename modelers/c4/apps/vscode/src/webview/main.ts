import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import geistLatin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?dataurl";
import geistLatinExt from "@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?dataurl";
// The renderer's stylesheet (the vendored tokens, diagram-js.css, the canvas mapping, the
// inspector's and the dialogs' content) comes with its module, before the shell's, which is last.
import {
  COLORS,
  DELETE_DONE_EVENT,
  EDIT_NOTICE_EVENT,
  EDIT_REFUSED_EVENT,
  LAYOUT_APPLIED_EVENT,
  THEMES,
  VIEW_CHANGED_EVENT,
  c4Menu,
  connectDialogs,
  connectLegend,
  createCollaborativeModeler,
  createShortcutsDialog,
  insetsClearOfBreadcrumb,
  mountInspector,
  type CollaborativeDiagram,
  type DeleteDoneEvent,
  type EditNoticeEvent,
  type EditRefusedEvent,
  type LabelEditing,
  type ReadOnly,
  type ViewChangedEvent,
} from "@miragon/c4-renderer";
import "@miragon/modeler-shell/shell.css";
import type { ViewKey } from "@miragon/c4-schema-model";
import type { Bounds } from "@miragon/modeler-shell/core";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import { INVALID_STATUS_DELAY_MS, openShellDialog, type ShellHandle } from "@miragon/modeler-shell";
import {
  connectDiagramJs,
  shellModule,
  type DiagramJsConnection,
} from "@miragon/modeler-shell/diagram-js";
import { GEIST_UNICODE_RANGES, svgToPng, type GeistFace } from "@miragon/modeler-shell/export";
import {
  connectDocumentSync,
  mountVsCodeShell,
  persistView,
  readShellState,
  writeShellState,
  type TypedMessage,
} from "@miragon/modeler-shell/vscode/webview";
import type { WebviewCommand, WebviewToHost } from "../protocol.js";
import {
  NO_PARENT_VIEW_MESSAGE,
  deleteDoneNotification,
  noticeMessages,
  refusalNotification,
  viewMissingMessage,
} from "./messages.js";
import { connectViewportMemory, storedViewport } from "./state.js";

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare const acquireVsCodeApi: () => VsCodeApi;

const DIAGRAM_NAME = "C4 diagram";

// An SVG drawn as an image loads no file, and the webview's CSP lets the script fetch none: the
// PNG export gets Geist as data: URLs, the subsets a Latin label needs.
const GEIST: GeistFace[] = [
  { src: geistLatinExt, unicodeRange: GEIST_UNICODE_RANGES.latinExt },
  { src: geistLatin, unicodeRange: GEIST_UNICODE_RANGES.latin },
];

const vscode = acquireVsCodeApi();
const storedShell = readShellState(vscode);
const post = (message: WebviewToHost) => vscode.postMessage(message);

// The diagram first, through the contract factory every host uses. Undo and redo keys stay
// unbound: VS Code's document history owns them (guide §13.5). The shell's viewport fits, and a
// view switch restores or fits through the glue below (SPEC 7.5).
const modeler = createCollaborativeModeler({
  additionalModules: [shellModule],
  undoRedoKeys: false,
  fitOnImport: false,
  freeArea: { insets: () => fitInsets() },
});
const diagram = modeler.diagram;
diagram.get("canvas");
const canvasLock = diagram.get<ReadOnly>("readOnly");
const registry = diagram.get<ElementRegistry>("elementRegistry");
const selection = diagram.get<Selection>("selection");
const labelEditing = diagram.get<LabelEditing>("labelEditing");
let destroyed = false;

const app = document.getElementById("app");
if (!app) throw new Error("The webview HTML has no #app root.");

const shell = mountVsCodeShell(app, {
  themes: THEMES,
  canvas: diagram.container,
  messages: { canvas: DIAGRAM_NAME },
  // In VS Code the file is the document: no text export. No shortcuts key either: every key the
  // webview does not need goes on to VS Code (guide §13.5), so the dialog opens from the menu.
  menu: c4Menu({
    modeler,
    exports: {
      png: { onSelect: () => void exportPicture("png") },
      svg: { onSelect: () => void exportPicture("svg") },
    },
    showKeyboardShortcuts: () => shortcutsDialog.open(),
  }),
  // The rows follow the view on the canvas: connectLegend renders them into the body.
  legend: {
    render: () => undefined,
    open: storedShell.legendOpen,
    onToggle: (open) => writeShellState(vscode, { legendOpen: open }),
  },
  inspector: { label: "Properties" },
  problems: { onActivate: () => post({ type: "showProblems" }) },
  emptyHint: { onInsertExample: () => post({ type: "insertExample" }) },
});
if (!shell.inspector || !shell.legend) throw new Error("The shell mounted no inspector or legend.");

// Before the user can press G or Shift+Delete: the dialogs open on the shell's chrome.
connectDialogs(modeler, { container: shell.root, openDialog: openShellDialog });
const shortcutsDialog = createShortcutsDialog(shell, { host: "ide" });
const inspector = mountInspector(shell.inspector, modeler, {
  onRevealSource: (line) => post({ type: "c4.revealSource", line }),
});
connectLegend(shell.legend.body, modeler);

// Empty means the model has no element (guide §13.5: the hint is about an empty file), not that
// the view shows nothing. The fit keeps clear of the breadcrumb, which the shell's insets don't know.
function fitInsets() {
  return insetsClearOfBreadcrumb(diagram.container, shell.fitInsets());
}
const connection = connectDiagramJs({ ...shell, fitInsets }, diagram, {
  modeler,
  isEmpty: () => modeler.isModelEmpty(),
});
const { viewport } = connection;
persistView(vscode, viewport);
const memory = connectViewportMemory(vscode, {
  viewport,
  activeView: () => modeler.views.active().key,
});

diagram.on("diagram.destroy", () => {
  destroyed = true;
  memory.stop();
  shortcutsDialog.destroy();
});

/** Where `view` was left: in this webview's life (the renderer's memory) or before a reload. */
function rememberedViewbox(view: ViewKey): Bounds | undefined {
  return modeler.views.viewboxFor(view) ?? memory.placeOf(view)?.viewbox;
}

// A switch on the canvas (badge, Enter, U, Views…, Go to View) comes back to the place the view
// was left at, or fits a view seen for the first time; a re-keyed view keeps its place.
diagram.on<ViewChangedEvent>(VIEW_CHANGED_EVENT, ({ view, previous, cause }) => {
  if (destroyed) return;
  memory.switched(previous, view, cause);
  if (cause !== "rekey" && cause !== "host") {
    const remembered = rememberedViewbox(view);
    if (remembered) viewport.restore(remembered);
    else viewport.fit({ animate: false });
  }
  shell.menu.refresh();
});
diagram.on("commandStack.changed", () => {
  if (!destroyed) shell.menu.refresh();
});
// The new layout may lie where the viewport doesn't look.
diagram.on(LAYOUT_APPLIED_EVENT, () => {
  if (!destroyed) viewport.fit();
});
// No toasts in the webview (guide §13.5): the host shows them as its notifications. The label
// editor, the inspector and the dialog forms show their own refusals at the field.
diagram.on<EditRefusedEvent>(EDIT_REFUSED_EVENT, (event) => {
  if (!destroyed) post(refusalNotification(event));
});
diagram.on<DeleteDoneEvent>(DELETE_DONE_EVENT, (event) => {
  const notification = destroyed ? undefined : deleteDoneNotification(event);
  if (notification) post(notification);
});
const noticeMessage = noticeMessages();
diagram.on<EditNoticeEvent>(EDIT_NOTICE_EVENT, ({ notice }) => {
  const message = destroyed ? undefined : noticeMessage(notice);
  if (message) post({ type: "info", message });
});

function showValid(): void {
  canvasLock.setReadOnly(false);
  inspector.setReadOnly(false);
  shell.setReadOnly(false);
  shell.setStatus(null);
}

function showInvalid(): void {
  // Locked at once; the marks and the status box follow after 800ms without a valid import, so
  // typing in the text editor neither flickers nor re-announces the alert (guide §13.5).
  canvasLock.setReadOnly(true);
  inspector.setReadOnly(true);
  shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
  shell.setStatus(
    { severity: "danger", text: shell.messages.invalidFile(DIAGRAM_NAME) },
    { delayMs: INVALID_STATUS_DELAY_MS },
  );
}

/** Canvas ids: a boundary's frame and a relationship stay selected too. */
function selectedIds(): string[] {
  return selection.get().map((element) => element.id);
}

function reselect(ids: readonly string[]): void {
  const again = ids.flatMap((id) => registry.get(id) ?? []);
  const current = selection.get();
  const unchanged =
    again.length === current.length && again.every((element) => current.includes(element));
  if (again.length > 0 && !unchanged) selection.select(again);
}

let importedOnce = false;

/**
 * Takes the document's text (SPEC 8.2). A text that differs from the canvas's only in formatting
 * or comments (a formatter, `insertFinalNewline` on a save) is rebased: the canvas, a running
 * drag and an open label editor stay, and the next canvas edit builds on the new bytes. Any other
 * text is imported into the view the canvas shows, while the file still has it: a VS Code undo or
 * a keystroke in the text editor keeps view, viewbox and selection. The first import the canvas
 * accepts comes back to the view and place the webview state remembers, also when the file was
 * invalid at the `init`. False when the canvas refused the text: it then shows the file as invalid
 * and read-only.
 */
async function importText(text: string): Promise<boolean> {
  if (importedOnce && modeler.rebaseText(text)) {
    showValid();
    return true;
  }
  const restoring = !importedOnce;
  const shown = restoring ? memory.stored.activeView : modeler.views.active().key;
  const keep = restoring ? undefined : viewport.getViewbox();
  const selected = restoring ? [] : selectedIds();
  try {
    await modeler.importText(text, shown === undefined ? {} : { view: shown });
    importedOnce = true;
    showValid();
    const view = modeler.views.active().key;
    if (restoring) {
      // setState ends the wait for the first fit; restore would not.
      const remembered = storedViewport(memory.stored, storedShell.view, view);
      if (remembered) viewport.setState(remembered);
    } else if (view === shown && keep) {
      viewport.restore(keep);
    } else {
      // The import landed on another view: the one shown is no longer in the file.
      const box = rememberedViewbox(view);
      if (box) viewport.restore(box);
      else viewport.fit({ animate: false });
    }
    reselect(selected);
    viewport.afterImport();
    shell.menu.refresh();
    return true;
  } catch {
    showInvalid();
    return false;
  }
}

async function exportPicture(format: "png" | "svg"): Promise<void> {
  try {
    const { svg } = diagram.saveSVG();
    if (format === "svg") {
      post({ type: "export", format, data: svg });
      return;
    }
    let fontFallback = false;
    const png = await svgToPng(svg, {
      background: COLORS.paper,
      fonts: GEIST,
      onFontFallback: () => {
        fontFallback = true;
      },
    });
    post({
      type: "export",
      format,
      data: await blobToBase64(png),
      ...(fontFallback ? { fontFallback } : {}),
    });
  } catch (error) {
    // The shell's rejections are developer text: the console keeps them, the user reads the app's.
    console.error(error);
    post({
      type: "error",
      message:
        format === "png"
          ? "Couldn't export the diagram as PNG. Try again, or export it as SVG."
          : "Couldn't export the diagram as SVG. Try again.",
    });
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the export."));
    reader.readAsDataURL(blob);
  });
}

/** Go to View… and the Parent View command arrive any time, also before the first import. */
async function afterImports(): Promise<void> {
  await sync.ready;
  await sync.imported();
}

async function showView(key: unknown): Promise<void> {
  if (typeof key !== "string") return;
  await afterImports();
  if (destroyed) return;
  if (!modeler.views.open(key, { cause: "user" })) {
    post({ type: "error", message: viewMissingMessage(key) });
  }
}

async function showParentView(): Promise<void> {
  await afterImports();
  if (destroyed) return;
  const parent = modeler.views.parent();
  if (parent) modeler.views.open(parent.key, { cause: "user" });
  else post({ type: "info", message: NO_PARENT_VIEW_MESSAGE });
}

/**
 * A save keeps the focus where it is, so a label still being typed in has not blurred: it commits
 * as on blur, and the canvas takes the focus the field had.
 */
function commitLabelDraft(): void {
  if (!labelEditing.openEdit()) return;
  const active = document.activeElement;
  const typing =
    document.hasFocus() &&
    active instanceof HTMLTextAreaElement &&
    active.classList.contains("diagram-label-editor");
  if (labelEditing.complete() && typing) viewport.focus?.();
}

/**
 * The text editor is about to be saved (SPEC 8.2): once the imports queued so far have settled,
 * commit a field still being typed in, in the inspector or on the canvas. Their `edit` goes out
 * before the answer, so the save waits for it.
 */
async function respondFlush(id: number): Promise<void> {
  try {
    await sync.imported();
    if (!destroyed) {
      inspector.commitDraft();
      commitLabelDraft();
    }
  } catch (error) {
    console.error(error);
  } finally {
    post({ type: "c4.flushed", id });
  }
}

const COMMANDS: Readonly<Record<WebviewCommand, () => void>> = {
  fitView: () => viewport.fit(),
  exportPng: () => void exportPicture("png"),
  exportSvg: () => void exportPicture("svg"),
  parentView: () => void showParentView(),
};

/** The host's own messages: Go to View… and the save's flush. */
function answerHost(message: TypedMessage): void {
  switch (message.type) {
    case "c4.showView":
      void showView(message.key);
      break;
    case "c4.flush":
      if (typeof message.id === "number") void respondFlush(message.id);
      break;
  }
}

// Connected last, since it posts `ready` at once. It imports `init` and every `update` strictly one
// after another (two quick undos must not finish in the wrong order) and posts each canvas edit's
// text, which the extension writes as one minimal edit. Before the first import the canvas does
// not show the document; read-only, it shows the last valid one: either way an edit would
// overwrite text the canvas never saw, so `canWrite` holds it back.
const sync = connectDocumentSync({
  api: vscode,
  importText,
  exportText: () => modeler.exportText(),
  canWrite: () => !shell.isReadOnly(),
  onProblems: (counts) => shell.setProblems(counts),
  commands: COMMANDS,
  onMessage: answerHost,
});
modeler.onContentChanged(sync.pushEdit);

/** For the e2e test page: the mounted parts, and `ready` once the first `init` import settled. */
export const webview: {
  shell: ShellHandle;
  modeler: CollaborativeDiagram;
  connection: DiagramJsConnection;
  ready: Promise<void>;
} = { shell, modeler, connection, ready: sync.ready };
