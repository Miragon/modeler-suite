import "./zod-jitless.js";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
// The renderer's stylesheet (through its entry) brings the tokens, diagram-js.css and cd-canvas.css.
import {
  contextMapMenu,
  contextMapShortcuts,
  createCollaborativeModeler,
  createTitleDialog,
  isCmElement,
  renderLegend,
  READ_ONLY_CHANGED_EVENT,
  type CmReadOnly,
  type CollaborativeContextMapsModeler,
} from "@miragon/context-maps-renderer";
import { parseDocumentText, serializeDocumentText } from "@miragon/context-maps-schema-model";
import { serializeCml } from "@miragon/context-maps-cml";
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
} from "@miragon/modeler-shell/vscode/webview";
import type { ExportFormat, WebviewCommand, WebviewToHost } from "../protocol.js";
import { WEBVIEW_THEMES } from "../themes.js";
import { blobToBase64, embedSvg, svgToEmbeddedPng } from "./io.js";

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
const MAP_NAME = "context map";

const vscode = acquireVsCodeApi();
const storedShellState = readShellState(vscode);

// The diagram first: the map's keyboard listens on document and must run before the shell's key
// listener, and the Modeler builds its diagram lazily on the first get(). Undo and redo keys stay
// unbound: VS Code's document history owns them (guide §13.5). The webview runs the same
// collaborative-modeler contract as every other host, so its imports are silent and fitted.
const collaborative = createCollaborativeModeler({
  additionalModules: [shellModule],
  undoRedoKeys: false,
  freeArea: { insets: () => shell.fitInsets() },
});
const modeler = collaborative.diagram;
modeler.get("canvas");
const registry = modeler.get<ElementRegistryLike>("elementRegistry");
const selection = modeler.get<SelectionLike>("selection");
const canvasLock = modeler.get<CmReadOnly>("cmReadOnly");

const app = document.getElementById("app");
if (!app) throw new Error("The webview HTML has no #app root.");

const shell = mountVsCodeShell(app, {
  themes: WEBVIEW_THEMES,
  canvas: modeler.container,
  messages: { canvas: "Context map" },
  menu: contextMapMenu({
    exports: {
      png: { onSelect: () => void exportAs("png") },
      svg: { onSelect: () => void exportAs("svg") },
      json: { onSelect: () => void exportAs("json") },
      cml: { onSelect: () => void exportAs("cml") },
    },
    showKeyboardShortcuts: () => shell.showShortcutsDialog(contextMapShortcuts(shell)),
    editTitle: () => titleDialog.open(),
  }),
  // The rows come after the mount, which hands out the chrome tooltip they explain themselves in.
  legend: {
    render: () => undefined,
    open: storedShellState.legendOpen,
    onToggle: (open) => writeShellState(vscode, { legendOpen: open }),
  },
  problems: { onActivate: () => post({ type: "showProblems" }) },
  emptyHint: { onInsertExample: () => post({ type: "insertExample" }) },
});
if (shell.legend) renderLegend(shell.legend.body, { tooltip: shell.tooltip });
// A title change is a canvas edit like any other: one command, posted to the document as one edit.
const titleDialog = createTitleDialog(shell, {
  title: () => modeler.getMeta()?.title ?? "",
  setTitle: (title) => modeler.setMeta({ title }),
});
// The lock disables "Map title…" in the menu; an open dialog would apply a title the file never gets.
modeler.on<{ readOnly?: boolean }>(READ_ONLY_CHANGED_EVENT, (event) => {
  if (event.readOnly) titleDialog.close();
});
modeler.on("diagram.destroy", () => titleDialog.destroy());

// Cheap tests only: the shell asks on every content change.
const connection = connectDiagramJs(shell, modeler, {
  modeler: collaborative,
  isEmpty: () => !registry.getAll().some(isCmElement),
});
const { viewport } = connection;
persistView(vscode, viewport);

// ---------------------------------------------------------------------------
// Two-way sync with the document
// ---------------------------------------------------------------------------

function post(message: WebviewToHost): void {
  vscode.postMessage(message);
}

/** The canonical text of `text`, or undefined when it is no map right now. */
function canonicalTextOf(text: string): string | undefined {
  const parsed = parseDocumentText(text);
  return parsed.ok ? serializeDocumentText(parsed.document) : undefined;
}

function selectedIds(): string[] {
  return selection.get().map((element) => element.id);
}

function reselect(ids: readonly string[]): void {
  const elements = ids
    .map((id) => registry.get(id))
    .filter((element): element is DiagramElement => element !== undefined);
  if (elements.length) selection.select(elements);
}

function showValidMap(): void {
  canvasLock.setReadOnly(false);
  shell.setReadOnly(false);
  shell.setStatus(null);
}

function showInvalidMap(): void {
  // Locked at once; the marks and the status box follow after 800ms without a valid import, so
  // typing in the text editor neither flickers nor re-announces the alert (guide §13.5).
  canvasLock.setReadOnly(true);
  shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
  shell.setStatus(
    { severity: "danger", text: shell.messages.invalidFile(MAP_NAME) },
    { delayMs: INVALID_STATUS_DELAY_MS },
  );
}

/**
 * Loads `text` into the modeler. The first import takes the stored view or fits; every later one
 * (a host undo, the text editor, Git) keeps viewbox and selection. An update that describes the
 * map the canvas already shows (only its formatting differs, e.g. `insertFinalNewline` on save) is
 * not re-imported at all.
 */
async function importText(text: string, { first }: DocumentImportContext): Promise<boolean> {
  if (!first && canonicalTextOf(text) === collaborative.exportText()) {
    showValidMap();
    return true;
  }
  const keep = first ? undefined : viewport.getViewbox();
  const selected = first ? [] : selectedIds();
  try {
    await collaborative.importText(text);
    showValidMap();
    if (keep) viewport.restore(keep);
    else if (first && storedShellState.view) viewport.setState(storedShellState.view);
    reselect(selected);
    viewport.afterImport();
    return true;
  } catch {
    showInvalidMap();
    return false;
  }
}

// ---------------------------------------------------------------------------
// Export (the webview rasterizes/serializes; the host shows the save dialog)
// ---------------------------------------------------------------------------

interface ExportedData {
  readonly data: string;
  readonly fontFallback: boolean;
}

function plainData(data: string): ExportedData {
  return { data, fontFallback: false };
}

/** The picture shows the map, not the current selection outlines. */
async function withoutSelection<T>(task: () => Promise<T> | T): Promise<T> {
  const ids = selectedIds();
  selection.select(null);
  try {
    return await task();
  } finally {
    reselect(ids);
  }
}

async function exportData(format: ExportFormat): Promise<ExportedData> {
  const text = collaborative.exportText();
  switch (format) {
    case "json":
      return plainData(text);
    case "cml":
      return plainData(serializeCml(modeler.exportDocument()));
    case "svg":
      return plainData(embedSvg((await withoutSelection(() => modeler.saveSVG())).svg, text));
    case "png": {
      const { svg } = await withoutSelection(() => modeler.saveSVG());
      const { blob, fontFallback } = await svgToEmbeddedPng(svg, text);
      return { data: await blobToBase64(blob), fontFallback };
    }
  }
}

/** What the user reads when an export fails; the cause goes to the console (guide §2, §9). */
function exportFailureText(format: ExportFormat): string {
  return format === "png"
    ? "Couldn't export the map as PNG. Try again, or export it as SVG."
    : `Couldn't export the map as ${format.toUpperCase()}. Try again.`;
}

async function exportAs(format: ExportFormat): Promise<void> {
  try {
    const { data, fontFallback } = await exportData(format);
    post({ type: "export", format, data, fontFallback });
  } catch (error) {
    console.error("Context Maps export failed", error);
    post({ type: "error", message: exportFailureText(format) });
  }
}

/**
 * PNG editor: the host requests the embedded PNG (save/backup). The queued imports finish first,
 * so a running init/update never rasterizes a half-imported map; an error reaches the host, which
 * aborts the save instead of writing a broken file.
 */
async function respondPng(id: number): Promise<void> {
  try {
    await sync.imported();
    const { data, fontFallback } = await exportData("png");
    post({ type: "pngResponse", id, data, fontFallback });
  } catch (error) {
    console.error("Context Maps PNG render failed", error);
    post({ type: "pngResponse", id, error: "Couldn't render the map as PNG. Try again." });
  }
}

// ---------------------------------------------------------------------------
// The extension host: init, updates, problems, commands and PNG requests in; ready and edits out
// ---------------------------------------------------------------------------

const COMMANDS: Readonly<Record<WebviewCommand, () => void>> = {
  fitView: () => viewport.fit(),
  exportPng: () => void exportAs("png"),
  exportSvg: () => void exportAs("svg"),
  exportJson: () => void exportAs("json"),
  exportCml: () => void exportAs("cml"),
};

// Before the first import the canvas does not show the document yet; read-only, it shows the last
// valid map. Either way an edit would overwrite text the canvas never saw, so the sync writes none.
const sync = connectDocumentSync({
  api: vscode,
  importText,
  exportText: () => collaborative.exportText(),
  canWrite: () => !shell.isReadOnly(),
  onProblems: (counts) => shell.setProblems(counts),
  commands: COMMANDS,
  onMessage: (message) => {
    if (message.type === "requestPng" && typeof message.id === "number") {
      void respondPng(message.id);
    }
  },
});
collaborative.onContentChanged(sync.pushEdit);

/** For test pages: the mounted parts, and `ready` once the first `init` import settled. */
export const webview: {
  shell: ShellHandle;
  modeler: CollaborativeContextMapsModeler;
  connection: DiagramJsConnection;
  ready: Promise<void>;
} = { shell, modeler: collaborative, connection, ready: sync.ready };
