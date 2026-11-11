// Geist and Geist Mono (Miragon's typefaces, SIL OFL), self-hosted: no font CDN (offline, GDPR).
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
// The renderer's stylesheet brings the vendored tokens, diagram-js.css and the canvas mapping; the
// chrome's stylesheet comes last.
import "@miragon/business-model-canvas-renderer/assets/business-model-canvas.css";
import "@miragon/modeler-shell/shell.css";
import {
  COLORS,
  SHORTCUTS_KEY,
  THEMES,
  canvasModelActions,
  renderLegend,
  createCollaborativeModeler,
  createShortcutsDialog,
  diagramMenu,
  connectNotes,
  type ContentBounds,
  type NotesConnection,
} from "@miragon/business-model-canvas-renderer";
import { parseText, readText, serializeText } from "@miragon/business-model-canvas-dsl";
import { isEmptyBlock, titleOf } from "@miragon/business-model-canvas-schema-model";
import {
  commandKeyLabel,
  defaultMessages,
  detectPlatform,
  isTextField,
  isUndoRedoKey,
  mountShell,
  openShellDialog,
  type ToastHandle,
} from "@miragon/modeler-shell";
import { connectDiagramJs, shellModule } from "@miragon/modeler-shell/diagram-js";
import { svgToPng } from "@miragon/modeler-shell/export";
import { copyTextWhenReady } from "./clipboard.js";
import { EMPTY_DOCUMENT, EXAMPLE_DOCUMENT } from "./example.js";
import { canvasFileName, downloadBlob, downloadText, isDefaultName } from "./files.js";
import { documentHash, hashHoldsDocument, readHashDocument, shareUrl } from "./share.js";
import { forgetStoredDocument, readStoredDocument, storeDocument } from "./storage.js";

interface DiagramElement {
  id: string;
}
interface SelectionLike {
  get(): DiagramElement[];
  select(elements: DiagramElement[] | null): void;
}
interface CommandStackLike {
  canUndo(): boolean;
}

const APP_NAME = "Business Model Canvas Modeler";
const REPOSITORY_URL =
  "https://github.com/Miragon/modeler-suite/tree/main/modelers/business-model-canvas";
// The MIME type decides during a drag, the extension at the drop (guide §9); a .bmc file has none.
const CANVAS_FILE_TYPES = [".bmc", ".txt", "text/plain"];
const CHECK_CANVAS_FILE = "Check that it contains a valid Business Model Canvas.";
const BROKEN_LINK_TEXT =
  "Couldn't read the canvas in this link. Check that you copied the whole link.";
const LOST_DRAFT_TEXT =
  "Couldn't restore the canvas of your last visit. Start a new canvas or open a file.";
const REFUSED_CANVAS_TEXT = "Couldn't open the canvas. Reload the page and try again.";

const app = document.getElementById("app");
if (!app) throw new Error("index.html has no #app root.");

// 1. The diagram first, so its services exist before the shell mounts around it. The web app keeps
//    the canvas's own undo and redo keys; the shell's viewport fits every new document itself.
const collaborative = createCollaborativeModeler({
  additionalModules: [shellModule],
  // Enter or Space on Sticky places one in the block in the centre of the free canvas.
  freeArea: { center: () => connection.viewport.freeRectCenter() },
  fitOnImport: false,
});
const modeler = collaborative.diagram;
modeler.get("canvas");
const selection = modeler.get<SelectionLike>("selection");
const commandStack = modeler.get<CommandStackLike>("commandStack");
const bounds = modeler.get<ContentBounds>("contentBounds");
const modelActions = canvasModelActions(modeler, () => ({
  container: shell.root,
  openDialog: openShellDialog,
}));

const platform = detectPlatform(navigator);
const openKey = commandKeyLabel("O", platform, defaultMessages.keyNames);
const saveKey = commandKeyLabel("S", platform, defaultMessages.keyNames);

// 2. The chrome around it: the whole web column of guide §5.2.
// The notes panel lives in the shell's inspector, so it connects once the shell is mounted.
const notesHolder: { connection?: NotesConnection | undefined } = {};
const shell = mountShell(app, {
  host: "web",
  canvas: modeler.container,
  lang: "en",
  platform,
  themes: THEMES,
  messages: { canvas: "Business Model Canvas" },
  primary: { onSelect: () => share() },
  legal: {
    links: [
      // The canvas's attribution is the line under every canvas and in every export, once.
      { label: "GitHub", href: REPOSITORY_URL },
    ],
  },
  file: {
    newDiagram: { onSelect: () => void newDiagram() },
    open: { onSelect: () => pickFile(), shortcut: openKey },
    showExample: { onSelect: () => void showExample() },
  },
  // Model, Export and Help: the entries the VS Code webview shows, plus the .bmc file itself.
  menu: diagramMenu({
    model: modelActions,
    exports: {
      png: { onSelect: () => void exportPng() },
      svg: { onSelect: () => exportSvg() },
      text: { onSelect: () => exportBmc(), shortcut: saveKey },
    },
    showKeyboardShortcuts: () => shortcutsDialog.open(),
    shortcutsKey: SHORTCUTS_KEY,
    notes: {
      isOpen: () => notesHolder.connection?.panel.isOpen() ?? false,
      toggle: () => notesHolder.connection?.panel.toggle(),
    },
  }),
  legend: { render: () => undefined },
  inspector: { label: "Notes" },
  // No empty-file hint: every empty block of the canvas carries its own (emptyHint "none" in the kit).
  emptyState: {
    title: APP_NAME,
    text: "Start a new diagram, or explore the example.",
    komet: "/miragon-komet-blau.svg",
    onNewDiagram: () => void newDiagram(),
    onShowExample: () => void showExample(),
    dropHint: "Or drop a .bmc file here",
  },
  dropZone: {
    accept: CANVAS_FILE_TYPES,
    onDrop: ([file]) => {
      if (file) void openDiagramFile(file);
    },
  },
});

// 3. Viewport, palette skin, keys. Cheap tests only: the shell asks on every content change.
const connection = connectDiagramJs(shell, modeler, {
  modeler: collaborative,
  isEmpty: () => bounds.isEmpty(),
});
const { viewport } = connection;
const shortcutsDialog = createShortcutsDialog(shell, {
  shortcutsKey: SHORTCUTS_KEY,
  fileKeys: true,
});
if (shell.legend) renderLegend(shell.legend.body);

notesHolder.connection = shell.inspector ? connectNotes(shell.inspector, modeler) : undefined;

let destroyed = false;

// ---------------------------------------------------------------------------
// Documents: every new diagram opens like the first (guide §5.9)
// ---------------------------------------------------------------------------

/** Blank text is an empty canvas, as in VS Code; anything else must be a valid document. */
function canonicalDocument(text: string): string {
  if (text.trim() === "") return EMPTY_DOCUMENT;
  return serializeText(readText(text).document);
}

function canonicalOrUndefined(text: string | null | undefined): string | undefined {
  if (text === null || text === undefined) return undefined;
  try {
    return canonicalDocument(text);
  } catch {
    return undefined;
  }
}

function documentName(): string | undefined {
  return titleOf(modeler.exportDocument());
}

/**
 * Opens a canonical text; false if the canvas refuses it all the same, and the renderer keeps the
 * diagram it showed. The app goes on: an autosave the canvas refuses must not stop every start.
 */
async function openDocument(text: string): Promise<boolean> {
  viewport.newDocument();
  try {
    await collaborative.importText(text);
  } catch (error) {
    console.error("[business-model-canvas-import]", error);
    return false;
  } finally {
    viewport.afterImport();
  }
  showStartScreen(false);
  updateDocumentTitle();
  persist();
  return true;
}

/**
 * The start card stands on the plain dot grid, as in every Miragon modeler: the canvas frame
 * behind it shows once a diagram is started.
 */
function showStartScreen(shown: boolean): void {
  shell.setEmptyState(shown);
  modeler
    .get<{ getContainer(): HTMLElement }>("canvas")
    .getContainer()
    .classList.toggle("bmc-start", shown);
}

/** The diagram's name in the tab (guide §5.4: the web app's title names the file), else the app. */
function updateDocumentTitle(): void {
  const name = shell.isEmptyStateShown() ? undefined : documentName();
  document.title = name && !isDefaultName(name) ? `${name.trim()} · ${APP_NAME}` : APP_NAME;
}

interface ReplaceUndo {
  readonly toast: ToastHandle;
  run(): void;
}

let replaceUndo: ReplaceUndo | undefined;

/** An undo offer would bring back the replaced diagram and silently drop what came after it. */
function withdrawReplaceUndo(): void {
  replaceUndo?.toast.dismiss();
  replaceUndo = undefined;
}

const NEW_CANVAS_HEADER = JSON.stringify(parseText(EMPTY_DOCUMENT).document.header);

/**
 * No sticky, no note, no field of its own and the fields of a new canvas: a canvas without
 * stickies is still worth keeping once it has a title or a note.
 */
function holdsNothing(text: string): boolean {
  const { header, notes, blocks, extras } = parseText(text).document;
  return (
    notes.length === 0 &&
    extras.length === 0 &&
    blocks.every(isEmptyBlock) &&
    (header.length === 0 || JSON.stringify(header) === NEW_CANVAS_HEADER)
  );
}

function currentTextUnlessEmpty(): string | undefined {
  const text = collaborative.exportText();
  return holdsNothing(text) ? undefined : text;
}

/**
 * Replacing a diagram clears the canvas history, so instead of asking first (guide §9) every
 * replacement keeps the previous diagram as text and offers it back: "Diagram replaced · Undo",
 * and Cmd/Ctrl+Z while the canvas has nothing else to undo (the toast's button is far down the tab
 * order).
 */
async function replaceDiagram(
  text: string,
  previous: string | undefined,
  refusal = REFUSED_CANVAS_TEXT,
): Promise<boolean> {
  if (!(await openDocument(text))) {
    shell.toast({ status: "danger", text: refusal });
    return false;
  }
  withdrawReplaceUndo();
  if (previous === undefined || previous === collaborative.exportText()) return true;
  const undo = (): void => {
    if (replaceUndo === offer) replaceUndo = undefined;
    void openDocument(previous);
  };
  const offer: ReplaceUndo = {
    toast: shell.toast({
      status: "info",
      text: "Canvas replaced",
      action: { label: "Undo", onSelect: undo },
    }),
    run: () => {
      offer.toast.dismiss();
      undo();
    },
  };
  replaceUndo = offer;
  return true;
}

function newDiagram(): Promise<boolean> {
  return replaceDiagram(EMPTY_DOCUMENT, currentTextUnlessEmpty());
}

function showExample(): Promise<boolean> {
  return replaceDiagram(EXAMPLE_DOCUMENT, currentTextUnlessEmpty());
}

/** Reads the file before the canvas is touched, so a file that is no diagram leaves it as it was. */
async function openDiagramFile(file: File): Promise<void> {
  const unreadable = `Couldn't read “${file.name}”. ${CHECK_CANVAS_FILE}`;
  let text: string;
  try {
    text = canonicalDocument(await file.text());
  } catch (error) {
    console.error("[business-model-canvas-open]", error);
    shell.toast({ status: "danger", text: unreadable });
    return;
  }
  await replaceDiagram(text, currentTextUnlessEmpty(), unreadable);
}

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = CANVAS_FILE_TYPES.join(",");
fileInput.hidden = true;
document.body.append(fileInput);
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (file) void openDiagramFile(file);
});

function pickFile(): void {
  fileInput.click();
}

// ---------------------------------------------------------------------------
// Autosave and the link: this browser keeps the open diagram; the address bar shows a link only
// while it holds the diagram on the canvas
// ---------------------------------------------------------------------------

/** The canonical text the link in the address bar holds, while it holds the open diagram. */
let linkedText: string | undefined;
// A link write takes a moment (compression); a later change or link makes it stale.
let linkWrites = 0;

function adoptLink(text: string): void {
  linkWrites += 1;
  linkedText = text;
}

function clearLink(): void {
  linkWrites += 1;
  linkedText = undefined;
  if (hashHoldsDocument()) {
    history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  }
}

async function showLink(text: string): Promise<void> {
  const write = ++linkWrites;
  const hash = await documentHash(text);
  if (write !== linkWrites || destroyed) return;
  history.replaceState(history.state, "", `${location.pathname}${location.search}${hash}`);
  linkedText = text;
}

/** Discrete edits are written at once, so a reload right after one keeps it. */
function persist(): void {
  const text = collaborative.exportText();
  if (holdsNothing(text)) forgetStoredDocument();
  else storeDocument(text);
  if (text !== linkedText) clearLink();
}

collaborative.onContentChanged(() => {
  // The first edit is a start as well; and an edit makes an open undo offer stale.
  showStartScreen(false);
  withdrawReplaceUndo();
  persist();
  updateDocumentTitle();
});

/** A link pasted into the open tab; the app's own link writes fire no hashchange. */
function onHashChange(): void {
  void (async () => {
    const text = canonicalOrUndefined(await readHashDocument());
    if (text === undefined) {
      if (hashHoldsDocument()) shell.toast({ status: "danger", text: BROKEN_LINK_TEXT });
      return;
    }
    adoptLink(text);
    if (text === collaborative.exportText()) return;
    const opened = await replaceDiagram(text, currentTextUnlessEmpty(), BROKEN_LINK_TEXT);
    // The address bar keeps the refused link, like a broken one, until the next edit takes it out.
    if (!opened) linkedText = undefined;
  })();
}

// ---------------------------------------------------------------------------
// Share and export
// ---------------------------------------------------------------------------

/** Copies the link inside the click (Safari keeps the gesture only there) and shows it in the URL. */
function share(): void {
  const text = collaborative.exportText();
  const copied = copyTextWhenReady(shareUrl(text));
  void (async () => {
    try {
      await showLink(text);
      await copied;
      shell.toast({ status: "success", text: "Link copied" });
    } catch (error) {
      console.error("[business-model-canvas-share]", error);
      shell.toast({
        status: "danger",
        text: "Couldn't copy the link. Copy it from the address bar instead.",
      });
    }
  })();
}

/** The picture shows the diagram, not the selection outlines; the selection comes back afterwards. */
function withoutSelection<T>(task: () => T): T {
  const selected = selection.get();
  selection.select(null);
  try {
    return task();
  } finally {
    if (selected.length > 0) selection.select(selected);
  }
}

function announceExport(fileName: string): void {
  shell.toast({ status: "success", text: `Exported ${fileName}.` });
}

async function exportPng(): Promise<void> {
  const fileName = canvasFileName(documentName(), "png");
  let labelsInSystemFont = false;
  try {
    const { svg } = withoutSelection(() => modeler.saveSVG());
    const png = await svgToPng(svg, {
      background: COLORS.surround,
      onFontFallback: () => {
        labelsInSystemFont = true;
      },
    });
    downloadBlob(png, fileName);
  } catch (error) {
    console.error("[business-model-canvas-export]", error);
    shell.toast({
      status: "danger",
      text: "Couldn't export the canvas as PNG. Try again, or export it as SVG.",
    });
    return;
  }
  if (labelsInSystemFont) {
    shell.toast({
      status: "warning",
      text: `Exported ${fileName} in a system font. Geist couldn't be embedded.`,
    });
    return;
  }
  announceExport(fileName);
}

function exportSvg(): void {
  const fileName = canvasFileName(documentName(), "svg");
  try {
    const { svg } = withoutSelection(() => modeler.saveSVG());
    downloadText(svg, fileName, "image/svg+xml");
    announceExport(fileName);
  } catch (error) {
    console.error("[business-model-canvas-export]", error);
    shell.toast({ status: "danger", text: "Couldn't export the canvas as SVG. Try again." });
  }
}

function exportBmc(): void {
  const fileName = canvasFileName(documentName(), "bmc");
  try {
    downloadText(collaborative.exportText(), fileName, "text/plain");
    announceExport(fileName);
  } catch (error) {
    console.error("[business-model-canvas-export]", error);
    shell.toast({ status: "danger", text: `Couldn't export ${fileName}. Try again.` });
  }
}

// ---------------------------------------------------------------------------
// The web app's own keys: Cmd/Ctrl+O opens a file, Cmd/Ctrl+S exports the .bmc file,
// Cmd/Ctrl+Z takes back a replaced canvas
// ---------------------------------------------------------------------------

function modalOpen(): boolean {
  return document.querySelector("dialog:modal") !== null;
}

/** After a replacement the canvas has nothing to undo (the import cleared it): Cmd/Ctrl+Z takes the diagram back. */
function onUndoReplaceKey(event: KeyboardEvent): void {
  const offer = replaceUndo;
  if (!offer || event.shiftKey || event.isComposing || !isUndoRedoKey(event)) return;
  // Cmd/Ctrl+Y is redo; the typed letter decides (QWERTZ swaps the keys), as in isUndoRedoKey.
  const ascii = event.key.length === 1 && event.key.charCodeAt(0) < 0x80;
  if ((ascii ? event.key.toLowerCase() : event.code === "KeyZ" ? "z" : "") !== "z") return;
  if (isTextField(event.target) || modalOpen() || commandStack.canUndo()) return;
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
    pickFile();
    return;
  }
  // The start screen has no diagram yet to save (guide §8: only the card and the legal line).
  if (shell.isEmptyStateShown()) return;
  // A label being typed belongs in the file: leaving the field commits it.
  const active = document.activeElement;
  if (active instanceof HTMLElement && isTextField(active)) active.blur();
  exportBmc();
}

window.addEventListener("keydown", onAppKey);
window.addEventListener("hashchange", onHashChange);

// ---------------------------------------------------------------------------
// Start: the diagram from the link, else the one this browser kept, else the start screen
// ---------------------------------------------------------------------------

const storedText = readStoredDocument();
const storedDiagram = canonicalOrUndefined(storedText);
const linkedDiagram = canonicalOrUndefined(await readHashDocument());
const brokenLink = linkedDiagram === undefined && hashHoldsDocument();
let started = false;
if (linkedDiagram !== undefined) {
  // A link replaces the diagram this browser kept; that one stays an Undo away.
  adoptLink(linkedDiagram);
  started = await replaceDiagram(linkedDiagram, storedDiagram, BROKEN_LINK_TEXT);
  if (!started) linkedText = undefined;
}
if (!started && storedDiagram !== undefined) started = await openDocument(storedDiagram);
if (!started) {
  await collaborative.importText(EMPTY_DOCUMENT);
  viewport.afterImport(); // an empty diagram at 100 %
  showStartScreen(true);
  updateDocumentTitle();
  // The stored text stays as it is until the next edit, for a manual rescue.
  if (storedText !== undefined) shell.toast({ status: "danger", text: LOST_DRAFT_TEXT });
}
if (brokenLink) shell.toast({ status: "danger", text: BROKEN_LINK_TEXT });

/** For the console and the e2e suite: the app's parts and its teardown, once it started. */
const businessModelCanvasApp = {
  ready: true,
  shell,
  modeler: collaborative,
  connection,
  destroy(): void {
    if (destroyed) return;
    destroyed = true;
    withdrawReplaceUndo();
    notesHolder.connection?.destroy();
    modelActions.close();
    shortcutsDialog.destroy();
    window.removeEventListener("keydown", onAppKey);
    window.removeEventListener("hashchange", onHashChange);
    fileInput.remove();
    connection.destroy();
    collaborative.destroy();
    shell.destroy();
  },
};
Object.assign(globalThis as Record<string, unknown>, {
  __businessModelCanvasApp: businessModelCanvasApp,
});
