// Geist and Geist Mono, bundled: no font CDN (offline use, GDPR).
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
// The renderer's stylesheet (the vendored tokens, diagram-js.css, the canvas mapping), then the
// chrome's. Imported by name: the production build drops the renderer entry's own CSS import, since
// the package declares only its CSS files as side effects.
import "@miragon/c4-renderer/assets/c4.css";
import "@miragon/modeler-shell/shell.css";
import {
  COLORS,
  DELETE_DONE_EVENT,
  EDIT_NOTICE_EVENT,
  EDIT_REFUSED_EVENT,
  LAYOUT_APPLIED_EVENT,
  SHORTCUTS_KEY,
  THEMES,
  VIEW_CHANGED_EVENT,
  c4Menu,
  connectDialogs,
  connectLegend,
  createCollaborativeModeler,
  createShortcutsDialog,
  insetsClearOfBreadcrumb,
  mountInspector,
  type C4Engine,
  type LabelEditing,
  type DeleteDoneEvent,
  type DocumentStore,
  type EditNoticeEvent,
  type EditRefusedEvent,
  type ViewChangedEvent,
} from "@miragon/c4-renderer";
import { newWorkspaceText } from "@miragon/c4-dsl";
import type { ViewKey } from "@miragon/c4-schema-model";
import {
  commandKeyLabel,
  defaultMessages,
  detectPlatform,
  formatNumber,
  isTextField,
  isUndoRedoKey,
  mountShell,
  openShellDialog,
  problemSummary,
  type ToastHandle,
} from "@miragon/modeler-shell";
import { connectDiagramJs, shellModule } from "@miragon/modeler-shell/diagram-js";
import { svgToPng } from "@miragon/modeler-shell/export";
import { copyTextWhenReady } from "./clipboard.js";
import { EXAMPLE } from "./example.js";
import {
  OPENABLE_FILE_TYPES,
  WORKSPACE_FILE_NAME,
  downloadBlob,
  downloadText,
  nativeFileName,
  pictureFileName,
} from "./files.js";
import { createLinkWriter, holdsLink, readLink, shareUrl } from "./link.js";
import { deleteDoneText, noticeText } from "./notices.js";
import { openedWithProblemsText, problemItems } from "./problems.js";
import {
  forgetStoredDocument,
  readLegendOpen,
  readStoredDocument,
  storeDocument,
  writeLegendOpen,
} from "./storage.js";

interface CommandStackLike {
  canUndo(): boolean;
  undo(): void;
}

/** A workspace text and the view to show it on; without one the default view shows. */
interface Workspace {
  readonly text: string;
  readonly view: ViewKey | undefined;
}

type Opened = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const APP_NAME = "C4 Modeler";
const REPOSITORY_URL = "https://github.com/Miragon/modeler-suite/tree/main/modelers/c4";
const BROKEN_LINK_TEXT =
  "Couldn't read the workspace in this link. Check that you copied the whole link.";
const LOST_DRAFT_TEXT =
  "Couldn't restore the workspace of your last visit. Start a new diagram or open a file.";

const app = document.getElementById("app");
if (!app) throw new Error("index.html has no #app root.");

// 1. The diagram first, through the contract factory every host uses. The web app keeps the
//    canvas's undo keys (its history crosses views); the shell's viewport fits, so the renderer
//    does not, and the app fits or restores on a view switch itself (SPEC 7.5).
const modeler = createCollaborativeModeler({
  additionalModules: [shellModule],
  fitOnImport: false,
  freeArea: { insets: () => fitInsets() },
});
const diagram = modeler.diagram;
diagram.get("canvas");
const store = diagram.get<DocumentStore>("c4Document");
const engine = diagram.get<C4Engine>("c4Engine");
const commandStack = diagram.get<CommandStackLike>("commandStack");
const labelEditing = diagram.get<LabelEditing>("labelEditing");

const platform = detectPlatform(navigator);
const openKey = commandKeyLabel("O", platform, defaultMessages.keyNames);
const saveKey = commandKeyLabel("S", platform, defaultMessages.keyNames);

// 2. The chrome around it: the whole web column of guide §5.2.
const shell = mountShell(app, {
  host: "web",
  canvas: diagram.container,
  lang: "en",
  platform,
  themes: THEMES,
  messages: { canvas: "C4 diagram" },
  primary: { onSelect: () => share() },
  legal: { links: [{ label: "GitHub", href: REPOSITORY_URL }] },
  file: {
    newDiagram: { onSelect: () => void newDiagram() },
    open: { onSelect: () => pickFile(), shortcut: openKey },
    showExample: { onSelect: () => void showExample() },
  },
  menu: c4Menu({
    modeler,
    exports: {
      png: { onSelect: () => void exportPng() },
      svg: { onSelect: () => exportSvg() },
      text: { onSelect: () => exportNativeFile(), shortcut: saveKey },
      structurizr: { onSelect: () => exportText(WORKSPACE_FILE_NAME) },
    },
    showKeyboardShortcuts: () => shortcutsDialog.open(),
    shortcutsKey: SHORTCUTS_KEY,
  }),
  // The renderer draws the rows into the live body after the mount (connectLegend).
  legend: { render: () => undefined, open: readLegendOpen(), onToggle: writeLegendOpen },
  inspector: { label: "Properties" },
  problems: { onSelectItem: (item) => revealElement(item.elementId) },
  // Guide §8 (design system 1.23.0): an empty diagram after the start screen shows the empty-file
  // hint, without "Insert example": the File group's "Show example" opens the example.
  emptyHint: {},
  emptyState: {
    title: APP_NAME,
    text: "Start a new diagram, or explore the example.",
    komet: "/miragon-komet-blau.svg",
    onNewDiagram: () => void newDiagram(),
    onShowExample: () => void showExample(),
    dropHint: "Or drop a .c4, .dsl, or .txt file here",
  },
  dropZone: {
    accept: OPENABLE_FILE_TYPES,
    onDrop: ([file]) => {
      if (file) void openFile(file);
    },
  },
});

// The dialogs (Views…, the settings, Add existing element…, Delete from model…) open on the
// shell's dialog before the user can press G or Shift+Delete. The inspector, the legend's rows
// and the shortcuts dialog live in the shell's slots and go with the diagram.
connectDialogs(modeler, { container: shell.root, openDialog: openShellDialog });
if (!shell.inspector || !shell.legend) throw new Error("The shell mounted no inspector or legend.");
const inspector = mountInspector(shell.inspector, modeler);
connectLegend(shell.legend.body, modeler);
const shortcutsDialog = createShortcutsDialog(shell, {
  shortcutsKey: SHORTCUTS_KEY,
  fileKeys: true,
});
diagram.on("diagram.destroy", () => shortcutsDialog.destroy());

// 3. Viewport, palette skin and keys. The viewport fits to the contract's contentBounds(), tight
//    as guide §5.9 wants it, clear of the breadcrumb, which the shell's insets don't know. The
//    empty-file hint is about the file, not the view (G §13.5).
function fitInsets() {
  return insetsClearOfBreadcrumb(diagram.container, shell.fitInsets());
}
const connection = connectDiagramJs({ ...shell, fitInsets }, diagram, {
  modeler,
  isEmpty: () => modeler.isModelEmpty(),
});
const { viewport } = connection;

let destroyed = false;

// ---------------------------------------------------------------------------
// What the chrome shows of the document: title, menu state, problems
// ---------------------------------------------------------------------------

function workspaceName(): string {
  return store.current().parse.workspace.name.trim();
}

/** The workspace's name in the tab (guide §5.4: the web app's title names the file), else the app. */
function updateDocumentTitle(): void {
  const name = shell.isEmptyStateShown() ? "" : workspaceName();
  document.title = name ? `${name} · ${APP_NAME}` : APP_NAME;
}

/** The elements a problem row can reveal: on the canvas, or in a written view that shows them. */
function revealableElements(): ReadonlySet<string> {
  const ids = new Set(modeler.elements.list().map((element) => element.id));
  const { workspace } = store.current().parse;
  for (const entry of modeler.views.catalog().list()) {
    if (entry.state !== "written" || !entry.editable) continue;
    const members = engine.members(workspace, entry);
    for (const id of members.elements) ids.add(id);
    for (const boundary of members.boundaries) ids.add(boundary.elementId);
  }
  return ids;
}

/**
 * The parser's findings of the text as it is now go to the problems pill. A toast points at them
 * after an open the user started (file, example, link), never after a restore or an edit (§9).
 */
function showProblems(announce: boolean): void {
  const { diagnostics, text } = store.current().parse;
  const revealable = diagnostics.some((diagnostic) => diagnostic.elementId !== undefined)
    ? revealableElements()
    : new Set<string>();
  const items = problemItems(diagnostics, text, (id) => revealable.has(id));
  shell.setProblems(problemSummary(items));
  if (!announce || items.length === 0) return;
  const pill = shell.messages.problems(items.length, formatNumber(items.length, shell.lang));
  shell.toast({ status: "warning", text: openedWithProblemsText(items, pill) });
}

/** A problem row's element; revealing it may open another view (SPEC 8.1). */
function revealElement(id: string | undefined): void {
  if (id !== undefined) modeler.elements.reveal(id);
}

// ---------------------------------------------------------------------------
// Documents: every new workspace opens like the first (guide §5.9)
// ---------------------------------------------------------------------------

function currentWorkspace(): Workspace & { readonly view: ViewKey } {
  return { text: modeler.exportText(), view: modeler.views.active().key };
}

/**
 * Opens a workspace on its view; the renderer refuses a text that is no workspace before it
 * touches the canvas (contract L7), which then keeps the diagram and the place it showed.
 */
async function openDocument(next: Workspace, announce: boolean): Promise<Opened> {
  const kept = viewport.getState();
  viewport.newDocument();
  try {
    await modeler.importText(next.text, { view: next.view });
  } catch (error) {
    console.error("[c4-modeler] Couldn't open the workspace:", error);
    if (kept) viewport.setState(kept);
    else viewport.afterImport();
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  viewport.afterImport();
  leftViews = new Set();
  shell.setEmptyState(false);
  updateDocumentTitle();
  showProblems(announce);
  persist();
  return { ok: true };
}

interface ReplaceUndo {
  readonly toast: ToastHandle;
  run(): void;
}

let replaceUndo: ReplaceUndo | undefined;

/** An undo offer would bring back the replaced workspace and silently drop what came after it. */
function withdrawReplaceUndo(): void {
  replaceUndo?.toast.dismiss();
  replaceUndo = undefined;
}

function currentUnlessEmpty(): Workspace | undefined {
  return modeler.isModelEmpty() ? undefined : currentWorkspace();
}

/**
 * Replacing a workspace clears the canvas history, so instead of asking first (guide §9) every
 * replacement keeps the previous workspace and offers it back: "Diagram replaced · Undo", and
 * Cmd/Ctrl+Z while the canvas has nothing else to undo (the toast's button is far down the tab
 * order).
 */
async function replaceDocument(
  next: Workspace,
  previous: Workspace | undefined,
  refusal: (reason: string) => string,
): Promise<boolean> {
  const opened = await openDocument(next, true);
  if (!opened.ok) {
    shell.toast({ status: "danger", text: refusal(opened.reason) });
    return false;
  }
  withdrawReplaceUndo();
  if (previous === undefined || previous.text === modeler.exportText()) return true;
  const undo = (): void => {
    if (replaceUndo === offer) replaceUndo = undefined;
    void openDocument(previous, false).then((back) => {
      if (!back.ok) {
        shell.toast({ status: "danger", text: "Couldn't bring the previous workspace back." });
      }
    });
  };
  const offer: ReplaceUndo = {
    toast: shell.toast({
      status: "info",
      text: "Diagram replaced",
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

const refusedText = (reason: string) => `Couldn't open the workspace. ${reason}`;

function newDiagram(): Promise<boolean> {
  return replaceDocument(
    { text: newWorkspaceText(), view: undefined },
    currentUnlessEmpty(),
    refusedText,
  );
}

function showExample(): Promise<boolean> {
  return replaceDocument({ text: EXAMPLE, view: undefined }, currentUnlessEmpty(), refusedText);
}

/** Reads the file before the canvas is touched; a text that is no workspace leaves it as it was. */
async function openFile(file: File): Promise<void> {
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    console.error("[c4-modeler] Couldn't read the file:", error);
    shell.toast({
      status: "danger",
      text: `Couldn't read “${file.name}”. Check that it's a text file.`,
    });
    return;
  }
  await replaceDocument(
    { text, view: undefined },
    currentUnlessEmpty(),
    (reason) => `Couldn't open “${file.name}”. ${reason}`,
  );
}

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = OPENABLE_FILE_TYPES.join(",");
fileInput.hidden = true;
document.body.append(fileInput);
fileInput.addEventListener("change", () => {
  const [file] = fileInput.files ?? [];
  fileInput.value = "";
  if (file) void openFile(file);
});

function pickFile(): void {
  fileInput.click();
}

// ---------------------------------------------------------------------------
// The link and the autosave: every change is in the URL hash and in this browser, and a pasted
// link replaces the workspace
// ---------------------------------------------------------------------------

const addressBar = createLinkWriter(window);

/**
 * Edits, view switches and opens are written at once, so a reload right after one keeps it: the
 * address bar holds the workspace and the view on the canvas, and an empty workspace drops the
 * hash, so a fresh start keeps a clean URL.
 */
function persist(): void {
  if (modeler.isModelEmpty()) {
    forgetStoredDocument();
    addressBar.clear();
    return;
  }
  const current = currentWorkspace();
  storeDocument(current.text, current.view);
  void addressBar.show(current);
}

modeler.onContentChanged(() => {
  // The first edit is a start as well; and an edit makes an open undo offer stale.
  shell.setEmptyState(false);
  withdrawReplaceUndo();
  withdrawDeleteUndo();
  updateDocumentTitle();
  showProblems(false);
  persist();
});

const linkRefusedText = (reason: string) => `Couldn't open the workspace in this link. ${reason}`;

/**
 * A link pasted into the open tab; the app's own writes use replaceState and fire no hashchange.
 * The address bar keeps a broken or refused link, as Event Storming's does, until the next change.
 */
function onHashChange(): void {
  const hash = location.hash;
  // The pasted link overtakes the write of a change that is still being compressed.
  addressBar.cancel();
  void (async () => {
    const link = await readLink(hash);
    if (destroyed) return;
    if (link === undefined) {
      if (holdsLink(hash)) shell.toast({ status: "danger", text: BROKEN_LINK_TEXT });
      return;
    }
    if (link.text !== modeler.exportText()) {
      await replaceDocument(link, currentUnlessEmpty(), linkRefusedText);
      return;
    }
    // The same workspace: a view it names opens; otherwise the link of the canvas comes back.
    if (link.view === undefined || !modeler.views.open(link.view, { cause: "user" })) persist();
  })();
}

// ---------------------------------------------------------------------------
// The canvas: a view switch, a refused edit and what an edit did besides what was asked
// ---------------------------------------------------------------------------

/**
 * The views the user left since the workspace opened. The renderer remembers a view's place by
 * key across imports, but a new workspace opens like the first (guide §5.9): a place remembered
 * in the previous one does not apply.
 */
let leftViews = new Set<ViewKey>();

diagram.on<ViewChangedEvent>(VIEW_CHANGED_EVENT, ({ view, previous, cause }) => {
  if (destroyed) return;
  if (cause === "rekey") {
    if (leftViews.delete(previous)) leftViews.add(view);
  } else if (cause === "removed") leftViews.delete(previous);
  else leftViews.add(previous);
  // A re-key is the same view under a new key, and a host's switch brings its own box (SPEC 7.5).
  if (cause !== "rekey" && cause !== "host") {
    const remembered = leftViews.has(view) ? modeler.views.viewboxFor(view) : undefined;
    if (remembered) viewport.restore(remembered);
    else viewport.fit({ animate: false });
  }
  shell.menu.refresh();
  // A row can reveal what the canvas shows, so a draft view's elements become revealable here.
  showProblems(false);
  persist();
});

// The Model entries read their state whenever the menu opens; an open menu reads it again.
diagram.on("import.done", () => shell.menu.refresh());
diagram.on("commandStack.changed", () => shell.menu.refresh());

diagram.on<EditRefusedEvent>(EDIT_REFUSED_EVENT, ({ message }) => {
  if (!destroyed) shell.toast({ status: "danger", text: message });
});
diagram.on<EditNoticeEvent>(EDIT_NOTICE_EVENT, ({ notice }) => {
  if (!destroyed) shell.toast({ status: "info", text: noticeText(notice) });
});

// The new layout may lie where the viewport doesn't look.
diagram.on(LAYOUT_APPLIED_EVENT, () => {
  if (!destroyed) viewport.fit();
});

let deleteUndo: ToastHandle | undefined;

/** The offer would undo whatever came after the delete. */
function withdrawDeleteUndo(): void {
  deleteUndo?.dismiss();
  deleteUndo = undefined;
}

// Delete chose between the view and the model without asking, so the toast says which it was.
diagram.on<DeleteDoneEvent>(DELETE_DONE_EVENT, (event) => {
  const text = destroyed ? undefined : deleteDoneText(event);
  if (text === undefined) return;
  withdrawDeleteUndo();
  const offer = shell.toast({
    status: "info",
    text,
    action: {
      label: "Undo",
      onSelect: () => {
        if (deleteUndo === offer) commandStack.undo();
      },
    },
  });
  deleteUndo = offer;
});

// Every import clears the history, so the offer would undo nothing: another workspace replaced
// the one the delete happened in.
diagram.on("import.done", withdrawDeleteUndo);

// ---------------------------------------------------------------------------
// Share and export
// ---------------------------------------------------------------------------

/**
 * Copies the page's URL, which holds the workspace and its view, inside the click (Safari keeps
 * the gesture only there). An empty workspace has no hash yet; it gets one, so the address bar
 * holds what was copied.
 */
function share(): void {
  const current = currentWorkspace();
  const copied = copyTextWhenReady(shareUrl(location, current.text, current.view));
  void (async () => {
    try {
      await addressBar.show(current);
      await copied;
      shell.toast({ status: "success", text: "Link copied" });
    } catch (error) {
      console.error("[c4-modeler] Couldn't copy the link:", error);
      shell.toast({
        status: "danger",
        text: "Couldn't copy the link. Copy it from the address bar instead.",
      });
    }
  })();
}

function pictureName(extension: "png" | "svg"): string {
  return pictureFileName(workspaceName(), modeler.views.active().key, extension);
}

function announceExport(fileName: string): void {
  shell.toast({ status: "success", text: `Exported ${fileName}.` });
}

/** The current view, light, on the ground colour (guide §10.7). */
async function exportPng(): Promise<void> {
  const fileName = pictureName("png");
  let labelsInSystemFont = false;
  try {
    const { svg } = diagram.saveSVG();
    const png = await svgToPng(svg, {
      background: COLORS.paper,
      onFontFallback: () => {
        labelsInSystemFont = true;
      },
    });
    downloadBlob(png, fileName);
  } catch (error) {
    console.error("[c4-modeler] PNG export failed:", error);
    shell.toast({
      status: "danger",
      text: "Couldn't export the diagram as PNG. Try again, or export it as SVG.",
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
  const fileName = pictureName("svg");
  try {
    downloadText(diagram.saveSVG().svg, fileName, "image/svg+xml");
    announceExport(fileName);
  } catch (error) {
    console.error("[c4-modeler] SVG export failed:", error);
    shell.toast({ status: "danger", text: "Couldn't export the diagram as SVG. Try again." });
  }
}

function exportNativeFile(): void {
  exportText(nativeFileName(workspaceName()));
}

/**
 * The whole workspace, byte for byte: as the native `.c4` file, or under the name Structurizr's
 * own tools open. Both are Structurizr DSL.
 */
function exportText(fileName: string): void {
  try {
    downloadText(modeler.exportText(), fileName, "text/plain;charset=utf-8");
    announceExport(fileName);
  } catch (error) {
    console.error("[c4-modeler] Text export failed:", error);
    shell.toast({ status: "danger", text: `Couldn't export ${fileName}. Try again.` });
  }
}

// ---------------------------------------------------------------------------
// The web app's own keys: Cmd/Ctrl+O opens a file, Cmd/Ctrl+S exports the .c4 file, Cmd/Ctrl+Z
// takes back a replaced workspace (the import cleared the canvas history)
// ---------------------------------------------------------------------------

function modalOpen(): boolean {
  return document.querySelector("dialog:modal") !== null;
}

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

function onUndoKey(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
  onUndoReplaceKey(event);
}

/**
 * In the capture phase: the label editor keeps its keys from the page, and Cmd/Ctrl+S there would
 * otherwise open the browser's "Save page as".
 */
function onFileKey(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
  const key = event.key.toLowerCase();
  if ((key !== "o" && key !== "s") || event.isComposing) return;
  // Never the browser's "Open file" or "Save page as" instead, also not over a dialog.
  event.preventDefault();
  if (event.repeat || modalOpen()) return;
  if (key === "o") {
    pickFile();
    return;
  }
  // The start screen has no workspace yet to save (guide §8: only the card and the legal line).
  if (shell.isEmptyStateShown()) return;
  commitTyping();
  exportNativeFile();
}

/**
 * What is still being typed belongs in the file. A blur would commit it too, but leave the focus on
 * `<body>`, where the canvas's keys do nothing: an inspector draft commits and keeps its field, a
 * label commits as on Enter and hands the focus to the canvas.
 */
function commitTyping(): void {
  inspector.commitDraft();
  const active = document.activeElement;
  const typingLabel =
    active instanceof HTMLTextAreaElement && active.classList.contains("diagram-label-editor");
  if (typingLabel && labelEditing.complete()) viewport.focus?.();
}

window.addEventListener("keydown", onUndoKey);
window.addEventListener("keydown", onFileKey, true);
window.addEventListener("hashchange", onHashChange);

// ---------------------------------------------------------------------------
// Start: the workspace of the link, else the one this browser kept, else the start screen
// ---------------------------------------------------------------------------

const stored = readStoredDocument();
const linkedAtStart = await readLink(location.hash);
const brokenLink = linkedAtStart === undefined && holdsLink(location.hash);
let started = false;
if (linkedAtStart !== undefined) {
  if (linkedAtStart.text === stored?.text) {
    // A reload: the workspace this browser kept, on the view of the link, restored without a toast.
    started = (await openDocument(linkedAtStart, false)).ok;
  } else {
    // Another workspace's link replaces the one this browser kept; that one stays an Undo away.
    started = await replaceDocument(linkedAtStart, stored, linkRefusedText);
  }
}
if (!started && stored !== undefined) started = (await openDocument(stored, false)).ok;
if (!started) {
  await modeler.importText("");
  viewport.afterImport(); // an empty diagram at 100 %
  shell.setEmptyState(true);
  updateDocumentTitle();
  // The stored text stays as it is until the next edit, for a manual rescue.
  if (stored !== undefined) shell.toast({ status: "danger", text: LOST_DRAFT_TEXT });
}
if (brokenLink) shell.toast({ status: "danger", text: BROKEN_LINK_TEXT });

/** For the e2e suite and the console: the app's parts and its teardown. */
Object.assign(globalThis, {
  app: {
    ready: true,
    shell,
    modeler,
    connection,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      addressBar.stop();
      withdrawReplaceUndo();
      withdrawDeleteUndo();
      window.removeEventListener("keydown", onUndoKey);
      window.removeEventListener("keydown", onFileKey, true);
      window.removeEventListener("hashchange", onHashChange);
      fileInput.remove();
      connection.destroy();
      modeler.destroy();
      shell.destroy();
    },
  },
});
