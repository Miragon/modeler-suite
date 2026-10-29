// First: zod must not probe for eval once the CSP is in place (see zod-jitless.ts).
import "./zod-jitless.js";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
// The renderer's stylesheet brings the tokens, diagram-js.css, cd-canvas.css and the content of
// legend and dialogs, the ui package the inspector's; the shell's stylesheet comes last.
import {
  TEAM_TOPOLOGIES_THEMES,
  createCollaborativeModeler,
  diagramMenu,
  diagramShortcuts,
  isTtElement,
  parseDocumentText,
  renderLegend,
  type CollaborativeTeamTopologiesModeler,
  type Modeler,
  type TtReadOnly,
} from "@miragon/team-topologies-renderer";
import { serializeDocument } from "@miragon/team-topologies-schema-model";
import { makeRoomForLegend, mountInspector } from "@miragon/team-topologies-ui";
import "@miragon/modeler-shell/shell.css";
import type { ShellHandle } from "@miragon/modeler-shell";
import { INVALID_STATUS_DELAY_MS } from "@miragon/modeler-shell/core";
import {
  connectDiagramJs,
  shellModule,
  type DiagramJsConnection,
} from "@miragon/modeler-shell/diagram-js";
import {
  connectDocumentSync,
  mountVsCodeShell,
  persistView,
  readShellState,
  writeShellState,
  type DocumentImportContext,
  type TypedMessage,
} from "@miragon/modeler-shell/vscode/webview";
import type { WebviewCommand, WebviewToHost } from "../protocol.js";
import { blobToBase64, embedSvg, svgToEmbeddedPng } from "./io.js";
import { takeLegacyLegendOpen } from "./state.js";

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare const acquireVsCodeApi: () => VsCodeApi;

interface DiagramElement {
  id: string;
}
interface ElementRegistryLike {
  getAll(): DiagramElement[];
  get(id: string): DiagramElement | undefined;
}
interface SelectionLike {
  get(): DiagramElement[];
  select(elements: DiagramElement[] | null): void;
}
const DIAGRAM_NAME = "Team Topologies diagram";

const vscode = acquireVsCodeApi();
const storedShellState = readShellState(vscode);
const legacyLegendOpen = takeLegacyLegendOpen(vscode);
if (storedShellState.legendOpen === undefined && legacyLegendOpen !== undefined) {
  writeShellState(vscode, { legendOpen: legacyLegendOpen });
}

// The diagram first: the renderer's keyboard listens on document and must run before the shell's
// key listener. Undo and redo keys stay unbound: VS Code's document history owns them (guide
// §13.5). The shell's viewport fits, so the contract's own fit after every import stays off.
// The shell's fit insets are the free area: keyboard creation places into its centre and the
// context pad keeps inside it. The shell is mounted below, long before an element is selected.
const collaborative = createCollaborativeModeler({
  additionalModules: [shellModule],
  undoRedoKeys: false,
  fitOnImport: false,
  freeArea: { insets: () => shell.fitInsets() },
});
const modeler = collaborative.diagram as Modeler;
modeler.get("canvas");
const registry = modeler.get<ElementRegistryLike>("elementRegistry");
const selection = modeler.get<SelectionLike>("selection");
const canvasLock = modeler.get<TtReadOnly>("ttReadOnly");

const app = document.getElementById("app");
if (!app) throw new Error("The webview HTML has no #app root.");

const shell: ShellHandle = mountVsCodeShell(app, {
  themes: TEAM_TOPOLOGIES_THEMES,
  canvas: modeler.container,
  messages: { canvas: DIAGRAM_NAME },
  menu: diagramMenu({
    exports: {
      png: { onSelect: () => void exportPng() },
      svg: { onSelect: () => exportSvg() },
    },
    showKeyboardShortcuts: () => shell.showShortcutsDialog(diagramShortcuts(shell)),
  }),
  legend: {
    render: renderLegend,
    open: storedShellState.legendOpen ?? legacyLegendOpen,
    onToggle: (open) => {
      // A bottom sheet hides the legend; asking for the legend closes the sheet.
      if (open) makeRoomForLegend(modeler);
      writeShellState(vscode, { legendOpen: open });
    },
  },
  inspector: { label: "Properties" },
  problems: { onActivate: () => post({ type: "showProblems" }) },
  emptyHint: { onInsertExample: () => post({ type: "insertExample" }) },
});
if (!shell.inspector) throw new Error("The shell mounted no inspector slot.");
const inspector = mountInspector(shell.inspector, modeler);
modeler.on("diagram.destroy", () => inspector.destroy());

// A cheap test only: the shell asks on every content change. The shell fits to the content bounds
// the renderer reports (contract 1.3), tight, so its fit insets are the only margin (§5.9).
const isEmpty = (): boolean => !registry.getAll().some(isTtElement);

const connection: DiagramJsConnection = connectDiagramJs(shell, modeler, {
  modeler: collaborative,
  isEmpty,
});
const { viewport } = connection;
persistView(vscode, viewport);

// ---------------------------------------------------------------------------
// Two-way sync with the document (native JSON is the source of truth)
// ---------------------------------------------------------------------------

function post(message: WebviewToHost): void {
  vscode.postMessage(message);
}

/** True when `text` describes the diagram the canvas shows (only formatting differs). */
function showsText(text: string): boolean {
  try {
    return serializeDocument(parseDocumentText(text)) === collaborative.exportText();
  } catch {
    return false;
  }
}

function selectedIds(): string[] {
  return selection.get().map((element) => element.id);
}

/**
 * An import replaces every element object and clears the selection. Selecting the same ids again
 * keeps the inspector on the element it was editing; ids the new text no longer has drop out.
 */
function reselect(ids: readonly string[]): void {
  const elements = ids
    .map((id) => registry.get(id))
    .filter((element): element is DiagramElement => element !== undefined);
  if (elements.length > 0) selection.select(elements);
}

function showValidDiagram(): void {
  canvasLock.setReadOnly(false);
  shell.setReadOnly(false);
  shell.setStatus(null);
  inspector.setReadOnly(false);
}

function showInvalidDiagram(): void {
  // Locked at once, so no edit on the canvas overwrites the text the user is fixing; the marks and
  // the status box follow after 800ms without a valid import, so typing in the text editor neither
  // flickers nor re-announces the alert (guide §13.5).
  canvasLock.setReadOnly(true);
  inspector.setReadOnly(true);
  shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
  shell.setStatus(
    { severity: "danger", text: shell.messages.invalidFile(DIAGRAM_NAME) },
    { delayMs: INVALID_STATUS_DELAY_MS },
  );
}

/**
 * Loads `text` into the modeler. The first import takes the stored view or fits; every later one
 * (a host undo, the text editor, Git) keeps viewbox and selection. An update that describes the
 * diagram the canvas already shows (only formatting differs, e.g. `insertFinalNewline` on save) is
 * not re-imported at all.
 */
async function importText(text: string, { first }: DocumentImportContext): Promise<boolean> {
  if (!first && showsText(text)) {
    showValidDiagram();
    return true;
  }
  const keep = first ? undefined : viewport.getViewbox();
  const selected = first ? [] : selectedIds();
  try {
    await collaborative.importText(text);
    showValidDiagram();
    if (keep) viewport.restore(keep);
    else if (first && storedShellState.view) viewport.setState(storedShellState.view);
    reselect(selected);
    viewport.afterImport();
    shell.menu.refresh();
    return true;
  } catch {
    showInvalidDiagram();
    return false;
  }
}

modeler.on("commandStack.changed", () => shell.menu.refresh());

/**
 * An inspector field commits its draft on blur, and a save shortcut doesn't move the focus, so the
 * save would miss text the user can see. Blurring and refocusing commits it without losing the
 * caret. Only while this document has focus: when it lost focus the field already blurred, and
 * refocusing it then would pull the focus back from the rest of VS Code.
 */
function commitPanelDraft(): void {
  const active = document.activeElement;
  const panel = shell.inspector?.element;
  if (!document.hasFocus() || !(active instanceof HTMLElement) || !panel?.contains(active)) {
    return;
  }
  active.blur();
  active.focus({ preventScroll: true });
}

/** The text editor is about to save: commit a draft (its `edit` goes out first), then answer. */
async function respondFlush(id: number): Promise<void> {
  await sync.imported();
  commitPanelDraft();
  post({ type: "flushed", id });
}

/**
 * PNG editor: the host requests the finished, embedded PNG (save/backup). We rasterize the current
 * state and send back Base64 — errors are reported as `error` so the host can cleanly abort the save
 * instead of writing a corrupt file. First wait for all imports queued up to this point so a
 * currently running init/update doesn't rasterize a half-imported state into the PNG.
 */
async function respondPng(id: number, includeDraft: boolean): Promise<void> {
  let fontFallback = false;
  try {
    await sync.imported();
    if (includeDraft) commitPanelDraft();
    const { svg } = modeler.saveSVG();
    const blob = await svgToEmbeddedPng(svg, collaborative.exportText(), {
      onFontFallback: () => {
        fontFallback = true;
      },
    });
    const data = await blobToBase64(blob);
    // A backup runs on its own timer, and a warning belongs to an action the user started.
    post({
      type: "pngResponse",
      id,
      data,
      ...(includeDraft && fontFallback ? { fontFallback: true as const } : {}),
    });
  } catch (error) {
    console.error("Team Topologies PNG render failed", error);
    post({ type: "pngResponse", id, error: "Couldn't render the PNG. Try saving again." });
  }
}

// ---------------------------------------------------------------------------
// Export (the webview rasterizes/serializes; the host shows the save dialog)
// ---------------------------------------------------------------------------

function exportSvg(): void {
  try {
    const { svg } = modeler.saveSVG();
    post({ type: "export", format: "svg", data: embedSvg(svg, collaborative.exportText()) });
  } catch (error) {
    console.error("Team Topologies SVG export failed", error);
    post({ type: "error", message: "Couldn't export the SVG. Try again, or export as PNG." });
  }
}

async function exportPng(): Promise<void> {
  let fontFallback = false;
  try {
    const { svg } = modeler.saveSVG();
    const blob = await svgToEmbeddedPng(svg, collaborative.exportText(), {
      onFontFallback: () => {
        fontFallback = true;
      },
    });
    post({
      type: "export",
      format: "png",
      data: await blobToBase64(blob),
      ...(fontFallback ? { fontFallback: true as const } : {}),
    });
  } catch (error) {
    console.error("Team Topologies PNG export failed", error);
    post({ type: "error", message: "Couldn't export the PNG. Try again, or export as SVG." });
  }
}

// ---------------------------------------------------------------------------
// The extension host: init, updates, problems and commands in; ready and edits out
// ---------------------------------------------------------------------------

const COMMANDS: Readonly<Record<WebviewCommand, () => void>> = {
  fitView: () => viewport.fit(),
  exportPng: () => void exportPng(),
  exportSvg: () => exportSvg(),
};

/** The text editor's flush before a save, and the PNG editor's request for its file. */
function answerHost(message: TypedMessage): void {
  if (typeof message.id !== "number") return;
  switch (message.type) {
    case "flush":
      void respondFlush(message.id);
      break;
    case "requestPng":
      void respondPng(message.id, message.includeDraft === true);
      break;
  }
}

// Before the first import the canvas does not show the document yet; read-only, it shows the last
// valid diagram. Either way an edit would overwrite text the canvas never saw, so the sync writes
// none. The PNG editor's provider speaks the same messages, so one sync serves both editors.
const sync = connectDocumentSync({
  api: vscode,
  importText,
  exportText: () => collaborative.exportText(),
  canWrite: () => !shell.isReadOnly(),
  onProblems: (counts) => shell.setProblems(counts),
  commands: COMMANDS,
  onMessage: answerHost,
});
collaborative.onContentChanged(sync.pushEdit);

/** For test pages: the mounted parts, and `ready` once the first `init` import settled. */
export const webview: {
  shell: ShellHandle;
  modeler: CollaborativeTeamTopologiesModeler;
  connection: DiagramJsConnection;
  ready: Promise<void>;
} = { shell, modeler: collaborative, connection, ready: sync.ready };
