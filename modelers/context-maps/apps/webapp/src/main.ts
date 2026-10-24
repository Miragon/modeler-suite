// Geist and Geist Mono (Miragon's typefaces, SIL OFL), self-hosted: no font CDN (offline, GDPR).
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
// The renderer's stylesheet brings the vendored tokens, diagram-js.css and cd-canvas.css. It is
// imported here because the production build drops the renderer entry's own side-effect import;
// the chrome's stylesheet comes last.
import "@miragon/context-maps-renderer/assets/context-maps.css";
import "@miragon/modeler-shell/shell.css";
import {
  Modeler,
  contextMapMenu,
  createShortcutsDialog,
  createTitleDialog,
  isCmElement,
  renderLegend,
  type CmImporter,
} from "@miragon/context-maps-renderer";
import {
  SAMPLE_DOCUMENT,
  emptyDocument,
  serializeDocument,
  type CmDocument,
} from "@miragon/context-maps-schema-model";
import {
  commandKeyLabel,
  defaultMessages,
  detectPlatform,
  formatNumber,
  isTextField,
  isUndoRedoKey,
  mountShell,
  problemSummary,
  type ProblemItem,
  type ShellHandle,
  type ToastHandle,
} from "@miragon/modeler-shell";
import {
  connectDiagramJs,
  shellModule,
  type DiagramJsConnection,
} from "@miragon/modeler-shell/diagram-js";
import { CML_EXTENSION, exportCml, readCmlFile } from "./io/cml";
import { mapFileName } from "./io/download";
import { downloadPng, downloadSvg } from "./io/image";
import { JSON_EXTENSION, exportJson, readMapFile } from "./io/json";
import {
  buildShareUrl,
  clearLocationHash,
  hashHoldsDocument,
  readDocumentFromLocation,
  writeDocumentToLocation,
} from "./io/url";
import { importNotes, importNotesText, mapProblems } from "./problems";
import {
  hasStoredDocument,
  loadFromStorage,
  readLegendOpen,
  saveToStorage,
  writeLegendOpen,
} from "./state/persistence";
import { THEMES } from "./themes";

interface DiagramElement {
  id: string;
}
interface ElementRegistryLike {
  getAll(): DiagramElement[];
  get(id: string): DiagramElement | undefined;
}
interface SelectionLike {
  get(): DiagramElement[];
  select(elements: DiagramElement | DiagramElement[] | null): void;
}
interface CanvasLike {
  scrollToElement(element: DiagramElement): void;
}
const APP_NAME = "Context Maps Modeler";
const CANVAS_NAME = "Context map";
const DEFAULT_TITLE = emptyDocument().title;
const REPOSITORY_URL = "https://github.com/Miragon/modeler-suite/tree/main/modelers/context-maps";
/** Extensions for the file pickers and the drop; the MIME type decides during a drag (guide §9). */
const OPEN_TYPES = [".cm", ".json", "application/json"];
const IMPORT_TYPES = [CML_EXTENSION];
const DROP_TYPES = [".cm", ".json", CML_EXTENSION, "application/json"];
const BROKEN_LINK_TEXT =
  "Couldn't read the map in this link. Check that you copied the whole link.";
const UNREADABLE_COPY_TEXT =
  "Couldn't open the map saved in this browser. The next map you start or open replaces it.";

const app = document.getElementById("app");
if (!app) throw new Error("index.html has no #app root.");

// 1. The diagram first: the map's keyboard listens on document and must run before the chrome's
//    key listener, and the Modeler builds its diagram lazily on the first get(). The web app keeps
//    the canvas's own undo and redo keys.
const modeler = new Modeler({
  width: "100%",
  height: "100%",
  additionalModules: [shellModule],
  // Where Enter or Space on a palette entry places the new context (guide §5.5).
  freeArea: { insets: () => shell.fitInsets() },
});
modeler.get("canvas");
const registry = modeler.get<ElementRegistryLike>("elementRegistry");
const selection = modeler.get<SelectionLike>("selection");
const canvas = modeler.get<CanvasLike>("canvas");
const importer = modeler.get<CmImporter>("cmImporter");

const platform = detectPlatform(navigator);
const openKey = commandKeyLabel("O", platform, defaultMessages.keyNames);
const saveKey = commandKeyLabel("S", platform, defaultMessages.keyNames);

// 2. The chrome around it: the whole web column of guide §5.2.
const shell = mountShell(app, {
  host: "web",
  canvas: modeler.container,
  lang: "en",
  platform,
  themes: THEMES,
  messages: { canvas: CANVAS_NAME },
  primary: { onSelect: () => share() },
  legal: { links: [{ label: "GitHub", href: REPOSITORY_URL }] },
  file: {
    newDiagram: { onSelect: () => newDiagram() },
    open: { onSelect: () => pickFile(OPEN_TYPES), shortcut: openKey },
    showExample: { onSelect: () => showExample() },
    import: { onSelect: () => pickFile(IMPORT_TYPES) },
  },
  // Model (Map title…), Export and Help: the same entries the VS Code webview shows.
  menu: contextMapMenu({
    exports: {
      png: { onSelect: () => void exportPicture("png") },
      svg: { onSelect: () => void exportPicture("svg") },
      json: { onSelect: () => exportMapFile("json"), shortcut: saveKey },
      cml: { onSelect: () => exportMapFile("cml") },
    },
    showKeyboardShortcuts: () => shortcutsDialog.open(),
    editTitle: () => titleDialog.open(),
  }),
  // The rows come after the mount, which hands out the chrome tooltip they explain themselves in.
  legend: { render: () => undefined, open: readLegendOpen(), onToggle: writeLegendOpen },
  problems: { onSelectItem: (item) => selectElement(item.elementId) },
  // Guide §8 (design system 1.23.0): an empty diagram after the start screen shows the empty-file
  // hint, without "Insert example": the File group's "Show example" opens the example.
  emptyHint: {},
  emptyState: {
    title: APP_NAME,
    text: "Start a new diagram, or explore the example.",
    komet: `${import.meta.env.BASE_URL}miragon-komet-blau.svg`,
    onNewDiagram: () => newDiagram(),
    onShowExample: () => showExample(),
    // The same types the reject toast names (the accept list's extensions).
    dropHint: "Or drop a .cm, .json, or .cml file here",
  },
  dropZone: {
    accept: DROP_TYPES,
    onDrop: ([file]) => {
      if (file) void openFile(file);
    },
  },
});
if (shell.legend) renderLegend(shell.legend.body, { tooltip: shell.tooltip });
const shortcutsDialog = createShortcutsDialog(shell, { fileKeys: true });
const titleDialog = createTitleDialog(shell, {
  title: () => mapTitle(),
  setTitle: (title) => modeler.setMeta({ title }),
});
modeler.on("diagram.destroy", () => {
  shortcutsDialog.destroy();
  titleDialog.destroy();
});

// 3. Viewport, palette skin, keys. Cheap tests only: the chrome asks on every content change.
const connection = connectDiagramJs(shell, modeler, {
  modeler,
  isEmpty: () => !registry.getAll().some(isCmElement),
});
const { viewport } = connection;

// ---------------------------------------------------------------------------
// Documents: every new map opens like the first (guide §5.9)
// ---------------------------------------------------------------------------

function mapTitle(): string {
  return modeler.getMeta()?.title ?? "";
}

function isEmptyMap(doc: CmDocument): boolean {
  return doc.contexts.length === 0 && doc.relationships.length === 0;
}

/** Whether the canvas can draw `doc`; checked before anything is replaced. */
function isImportable(doc: CmDocument): boolean {
  try {
    importer.assertImportable(doc);
    return true;
  } catch {
    return false;
  }
}

/** What the last import could not take (skipped CML statements); they stay until the next map. */
let importedNotes: readonly ProblemItem[] = [];

/** The pill and its list: the import's notes, then the map's semantic findings, live. */
function updateProblems(): number {
  const findings = mapProblems(modeler.exportDocument(), (id) => registry.get(id) !== undefined);
  const summary = problemSummary([...importedNotes, ...findings]);
  shell.setProblems(summary);
  return summary.count;
}

/** The map's title in the tab (guide §5.4: the web app's title names the file), else the app. */
function updateDocumentTitle(): void {
  const title = shell.isEmptyStateShown() ? undefined : mapTitle().trim();
  document.title = title && title !== DEFAULT_TITLE ? `${title} · ${APP_NAME}` : APP_NAME;
}

let storageFullAnnounced = false;

/**
 * The browser's copy of the map after every change, and the map in the address bar, so a reload
 * keeps it and the URL is always a shareable snapshot. An empty map keeps a clean URL.
 */
function persist(): void {
  const doc = modeler.exportDocument();
  if (saveToStorage(doc) === "full" && !storageFullAnnounced) {
    storageFullAnnounced = true;
    shell.toast({
      status: "warning",
      text: "Couldn't autosave: the browser storage is full. Export the map as JSON to keep it.",
    });
  }
  if (shell.isEmptyStateShown() || isEmptyMap(doc)) clearLocationHash();
  else writeDocumentToLocation(doc);
}

/**
 * Loads a map as a new document. A toast points at the pill after an import the user started
 * (open, drop, example, link) that could not take everything, never after one that restores a map
 * (guide §9).
 */
function openDocument(doc: CmDocument, notes: readonly ProblemItem[], announce: boolean): void {
  viewport.newDocument();
  let warnings: readonly unknown[];
  try {
    ({ warnings } = modeler.importDocument(doc));
  } finally {
    viewport.afterImport();
  }
  importedNotes = notes;
  shell.setEmptyState(false);
  updateDocumentTitle();
  const problems = updateProblems();
  persist();
  const count = notes.length + warnings.length;
  if (!announce || count === 0) return;
  const pill = shell.messages.problems(problems, formatNumber(problems, shell.lang));
  shell.toast({ status: "warning", text: importNotesText(count, pill) });
}

interface ReplaceUndo {
  readonly toast: ToastHandle;
  run(): void;
}

let replaceUndo: ReplaceUndo | undefined;

/** An undo offer would bring back the replaced map and silently drop what came after it. */
function withdrawReplaceUndo(): void {
  replaceUndo?.toast.dismiss();
  replaceUndo = undefined;
}

/**
 * Replacing a map clears the canvas history, so instead of asking first (guide §9) every
 * replacement keeps the previous map and offers it back: "Map replaced · Undo", and Cmd/Ctrl+Z
 * while the canvas has nothing else to undo (the toast's button is far down the tab order).
 */
function replaceMap(doc: CmDocument, notes: readonly ProblemItem[], announce: boolean): void {
  const previous = modeler.exportDocument();
  const previousNotes = importedNotes;
  openDocument(doc, notes, announce);
  withdrawReplaceUndo();
  if (isEmptyMap(previous)) return;
  if (serializeDocument(previous) === serializeDocument(modeler.exportDocument())) return;
  const undo = (): void => {
    if (replaceUndo === offer) replaceUndo = undefined;
    openDocument(previous, previousNotes, false);
  };
  const offer: ReplaceUndo = {
    toast: shell.toast({
      status: "info",
      text: "Map replaced",
      action: { label: "Undo", onSelect: undo },
    }),
    run: () => {
      offer.toast.dismiss();
      undo();
    },
  };
  replaceUndo = offer;
}

function newDiagram(): void {
  replaceMap(emptyDocument(), [], false);
}

function showExample(): void {
  replaceMap(SAMPLE_DOCUMENT, [], true);
}

/** Reads a map file (or a Context Mapper file) before the canvas is touched, then replaces the map. */
async function openFile(file: File): Promise<void> {
  const isCml = file.name.toLowerCase().endsWith(CML_EXTENSION);
  let doc: CmDocument;
  let notes: ProblemItem[] = [];
  try {
    if (isCml) {
      const imported = await readCmlFile(file);
      doc = imported.document;
      notes = importNotes(file.name, imported.skipped);
    } else doc = await readMapFile(file);
    importer.assertImportable(doc);
  } catch (error) {
    console.error("[cm-modeler] open", error);
    shell.toast({
      status: "danger",
      text: isCml
        ? `Couldn't import “${file.name}”. Check that it contains a Context Mapper context map.`
        : `Couldn't read “${file.name}”. Check that it contains a valid context map.`,
    });
    return;
  }
  replaceMap(doc, notes, true);
}

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.hidden = true;
document.body.append(fileInput);
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (file) void openFile(file);
});

function pickFile(types: readonly string[]): void {
  fileInput.accept = types.join(",");
  fileInput.click();
}

function selectElement(id: string | undefined): void {
  const element = id ? registry.get(id) : undefined;
  if (!element) return;
  selection.select(element);
  canvas.scrollToElement(element);
}

// ---------------------------------------------------------------------------
// Share and export
// ---------------------------------------------------------------------------

function copyText(text: string): Promise<void> {
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (!clipboard) return Promise.reject(new Error("The clipboard is not available here."));
  return clipboard.writeText(text);
}

/** Copies the link inside the click (Safari keeps the gesture only there) and shows it in the URL. */
function share(): void {
  const url = buildShareUrl(modeler.exportDocument());
  const copied = copyText(url);
  history.replaceState(null, "", url);
  copied.then(
    () => shell.toast({ status: "success", text: "Link copied" }),
    (error: unknown) => {
      console.error("[cm-modeler] share", error);
      shell.toast({
        status: "danger",
        text: "Couldn't copy the link. Copy it from the address bar instead.",
      });
    },
  );
}

/** The picture shows the map, not the selection outlines; the selection comes back afterwards. */
async function withoutSelection<T>(task: () => T | Promise<T>): Promise<T> {
  const selected = selection.get();
  selection.select(null);
  try {
    return await task();
  } finally {
    if (selected.length > 0) selection.select(selected);
  }
}

function announceExport(fileName: string): void {
  shell.toast({ status: "success", text: `Exported ${fileName}.` });
}

async function exportPicture(kind: "png" | "svg"): Promise<void> {
  const fileName = mapFileName(mapTitle(), `.${kind}`);
  try {
    const { svg } = await withoutSelection(() => modeler.saveSVG());
    if (kind === "svg") downloadSvg(svg, fileName);
    else await downloadPng(svg, fileName);
    announceExport(fileName);
  } catch (error) {
    console.error("[cm-modeler] export", error);
    shell.toast({
      status: "danger",
      text:
        kind === "svg"
          ? "Couldn't export the map as SVG. Try again."
          : "Couldn't export the map as PNG. Try again, or export it as SVG.",
    });
  }
}

function exportMapFile(kind: "json" | "cml"): void {
  const fileName = mapFileName(mapTitle(), kind === "json" ? JSON_EXTENSION : CML_EXTENSION);
  try {
    const doc = modeler.exportDocument();
    if (kind === "json") exportJson(doc, fileName);
    else exportCml(doc, fileName);
    announceExport(fileName);
  } catch (error) {
    console.error("[cm-modeler] export", error);
    shell.toast({ status: "danger", text: `Couldn't export ${fileName}. Try again.` });
  }
}

// ---------------------------------------------------------------------------
// The web app's own keys: Cmd/Ctrl+O opens a file, Cmd/Ctrl+S exports the map as JSON,
// Cmd/Ctrl+Z takes back a replaced map
// ---------------------------------------------------------------------------

function modalOpen(): boolean {
  return document.querySelector("dialog:modal") !== null;
}

/** The canvas has nothing to undo after a replacement (the import cleared it): Cmd/Ctrl+Z takes the map back. */
function onUndoReplaceKey(event: KeyboardEvent): void {
  const offer = replaceUndo;
  if (!offer || event.shiftKey || event.isComposing || !isUndoRedoKey(event)) return;
  // Cmd/Ctrl+Y is redo; the typed letter decides (QWERTZ swaps the keys), as in isUndoRedoKey.
  const ascii = event.key.length === 1 && event.key.charCodeAt(0) < 0x80;
  if ((ascii ? event.key.toLowerCase() : event.code === "KeyZ" ? "z" : "") !== "z") return;
  if (isTextField(event.target) || modalOpen() || modeler.canUndo()) return;
  event.preventDefault();
  if (!event.repeat) offer.run();
}

function onAppKey(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
  onUndoReplaceKey(event);
  if (event.shiftKey) return;
  const key = event.key.toLowerCase();
  if ((key !== "o" && key !== "s") || event.isComposing) return;
  // Never the browser's "Open file" or "Save page as" instead, also not over a dialog.
  event.preventDefault();
  if (event.repeat || modalOpen()) return;
  if (key === "o") {
    pickFile(OPEN_TYPES);
    return;
  }
  // The start screen has no map yet to save (guide §8: only the card and the legal line).
  if (shell.isEmptyStateShown()) return;
  // A name being typed belongs in the file: leaving the field commits it.
  const active = document.activeElement;
  if (active instanceof HTMLElement && isTextField(active)) active.blur();
  exportMapFile("json");
}

// ---------------------------------------------------------------------------
// Every change goes to the browser's copy and the link; a pasted link replaces the map
// ---------------------------------------------------------------------------

modeler.on<{ trigger?: string }>("commandStack.changed", (event) => {
  if (event.trigger !== "clear") {
    // The first edit is a start as well; and an edit makes an open undo offer stale.
    shell.setEmptyState(false);
    withdrawReplaceUndo();
  }
  updateDocumentTitle();
  updateProblems();
  persist();
});

/** A link pasted into an open tab: the app's own writes use replaceState and fire no hashchange. */
function onHashChange(): void {
  const linked = readDocumentFromLocation();
  if (linked === null || !isImportable(linked)) {
    if (hashHoldsDocument(location.hash)) shell.toast({ status: "danger", text: BROKEN_LINK_TEXT });
    return;
  }
  if (serializeDocument(linked) !== serializeDocument(modeler.exportDocument())) {
    replaceMap(linked, [], true);
  }
}

window.addEventListener("keydown", onAppKey);
window.addEventListener("hashchange", onHashChange);

// ---------------------------------------------------------------------------
// Start: the map from the link, else the browser's copy, else the start screen
// ---------------------------------------------------------------------------

const linked = readDocumentFromLocation();
const brokenLink = hashHoldsDocument(location.hash) && (linked === null || !isImportable(linked));
const stored = loadFromStorage();
const restored = stored !== null && isImportable(stored) ? stored : null;
// A copy this version cannot open (one a newer modeler wrote, say) is not overwritten with an empty
// map on the start screen: a reload with that modeler still finds it.
const unreadableCopy = restored === null && hasStoredDocument();
if (linked !== null && !brokenLink) openDocument(linked, [], true);
else if (restored !== null && !isEmptyMap(restored)) {
  openDocument(restored, [], false);
} else {
  modeler.importDocument(restored ?? emptyDocument());
  viewport.afterImport(); // an empty map at 100 %
  shell.setEmptyState(true);
  updateDocumentTitle();
  updateProblems();
  if (unreadableCopy) clearLocationHash();
  else persist();
}
if (brokenLink) shell.toast({ status: "danger", text: BROKEN_LINK_TEXT });
else if (unreadableCopy && shell.isEmptyStateShown()) {
  shell.toast({ status: "danger", text: UNREADABLE_COPY_TEXT });
}

let destroyed = false;

/** For the console and the e2e suite: the app's parts and its teardown, once it started. */
const contextMapsApp: {
  readonly ready: boolean;
  readonly shell: ShellHandle;
  readonly connection: DiagramJsConnection;
  destroy(): void;
} = {
  ready: true,
  shell,
  connection,
  destroy(): void {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener("keydown", onAppKey);
    window.removeEventListener("hashchange", onHashChange);
    fileInput.remove();
    connection.destroy();
    modeler.destroy();
    shell.destroy();
  },
};
Object.assign(globalThis as Record<string, unknown>, {
  __cmModeler: modeler,
  __contextMapsApp: contextMapsApp,
});
