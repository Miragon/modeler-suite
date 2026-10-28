import './zod-jitless.js';
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import '@miragon/modeler-shell/shell.css';
import geistLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?dataurl';
import geistLatinExt from '@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?dataurl';
import {
  COLORS,
  createCollaborativeModeler,
  createShortcutsDialog,
  diagramMenu,
  type CollaborativeDiagram,
  type ReadOnly,
} from '@miragon/__NOTATION__-renderer';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import { INVALID_STATUS_DELAY_MS, type ShellHandle } from '@miragon/modeler-shell';
import {
  connectDiagramJs,
  shellModule,
  type DiagramJsConnection,
} from '@miragon/modeler-shell/diagram-js';
import { GEIST_UNICODE_RANGES, svgToPng, type GeistFace } from '@miragon/modeler-shell/export';
import {
  mountVsCodeShell,
  persistView,
  readShellState,
} from '@miragon/modeler-shell/vscode/webview';
import type { HostToWebview, WebviewToHost } from '../protocol.js';
import { WEBVIEW_THEMES } from '../themes.js';

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare const acquireVsCodeApi: () => VsCodeApi;

const DIAGRAM_NAME = '__DISPLAY_NAME__ diagram';

// An SVG drawn as an image loads no file, and the webview's CSP lets the script fetch none: the
// PNG export gets Geist as data: URLs, the subsets a Latin label needs.
const GEIST: GeistFace[] = [
  { src: geistLatinExt, unicodeRange: GEIST_UNICODE_RANGES.latinExt },
  { src: geistLatin, unicodeRange: GEIST_UNICODE_RANGES.latin },
];

const vscode = acquireVsCodeApi();
const stored = readShellState(vscode);
const post = (message: WebviewToHost) => vscode.postMessage(message);

// The diagram first, through the contract factory every host uses. Undo and redo keys stay
// unbound: VS Code's document history owns them (guide §13.5). The shell's viewport fits.
const modeler = createCollaborativeModeler({
  additionalModules: [shellModule],
  undoRedoKeys: false,
  fitOnImport: false,
  freeArea: { insets: () => shell.fitInsets() },
});
const diagram = modeler.diagram;
diagram.get('canvas');
const canvasLock = diagram.get<ReadOnly>('readOnly');
const registry = diagram.get<ElementRegistry>('elementRegistry');
const selection = diagram.get<Selection>('selection');

const app = document.getElementById('app');
if (!app) throw new Error('The webview HTML has no #app root.');

const shell = mountVsCodeShell(app, {
  themes: WEBVIEW_THEMES,
  canvas: diagram.container,
  messages: { canvas: DIAGRAM_NAME },
  // In VS Code the file is the document: no text export. No shortcuts key either: every key the
  // webview does not need goes on to VS Code (guide §13.5), so the dialog opens from the menu.
  menu: diagramMenu({
    exports: {
      png: { onSelect: () => void exportPicture('png') },
      svg: { onSelect: () => void exportPicture('svg') },
    },
    showKeyboardShortcuts: () => shortcutsDialog.open(),
  }),
  problems: { onActivate: () => post({ type: 'showProblems' }) },
  emptyHint: { onInsertExample: () => post({ type: 'insertExample' }) },
});
const shortcutsDialog = createShortcutsDialog(shell);
diagram.on('diagram.destroy', () => shortcutsDialog.destroy());

// Fitted to the contract's contentBounds(); empty means no element, not empty bounds.
const connection = connectDiagramJs(shell, diagram, {
  modeler,
  isEmpty: () => modeler.elements.list().length === 0,
});
const { viewport } = connection;
persistView(vscode, viewport);

let lastText = '';
let initialized = false;

function showValid(): void {
  canvasLock.setReadOnly(false);
  shell.setReadOnly(false);
  shell.setStatus(null);
}

function showInvalid(): void {
  // Locked at once; the marks and the status box follow after 800ms without a valid import, so
  // typing in the text editor neither flickers nor re-announces the alert (guide §13.5).
  canvasLock.setReadOnly(true);
  shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
  shell.setStatus(
    { severity: 'danger', text: shell.messages.invalidFile(DIAGRAM_NAME) },
    { delayMs: INVALID_STATUS_DELAY_MS },
  );
}

/**
 * The first import takes the stored view (or fits); every later one (an undo in VS Code, the text
 * editor, Git) keeps view and selection, as the contract's view state survives a re-import (L5).
 */
async function importText(text: string): Promise<void> {
  const first = !initialized;
  const keep = first ? undefined : viewport.getViewbox();
  const selected = modeler.elements.selection();
  try {
    await modeler.importText(text);
    lastText = text;
    showValid();
    if (keep) viewport.restore(keep);
    else if (first && stored.view) viewport.setState(stored.view);
    // An import replaces every element object: select the same ids again, without scrolling.
    const again = selected.flatMap((id) => registry.get(id) ?? []);
    if (again.length > 0) selection.select(again);
    viewport.afterImport();
  } catch {
    showInvalid();
  } finally {
    initialized = true;
  }
}

// Strictly one after another: two quick updates must not finish in the wrong order.
let imports: Promise<void> = Promise.resolve();
const enqueueImport = (text: string) => (imports = imports.then(() => importText(text)));

/** A canvas edit: the canonical text goes to the host, which writes it as one minimal edit. */
modeler.onContentChanged(() => {
  // Before the first import the canvas does not show the document; read-only, it shows the last
  // valid one: either way an edit would overwrite text the canvas never saw.
  if (!initialized || shell.isReadOnly()) return;
  const text = modeler.exportText();
  if (text === lastText) return;
  lastText = text;
  post({ type: 'edit', text });
});

async function exportPicture(format: 'png' | 'svg'): Promise<void> {
  try {
    const { svg } = diagram.saveSVG();
    if (format === 'svg') {
      post({ type: 'export', format, data: svg });
      return;
    }
    let inSystemFont = false;
    const png = await svgToPng(svg, {
      background: COLORS.paper,
      fonts: GEIST,
      onFontFallback: () => {
        inSystemFont = true;
      },
    });
    post({
      type: 'export',
      format,
      data: await blobToBase64(png),
      ...(inSystemFont ? { inSystemFont } : {}),
    });
  } catch (error) {
    post({ type: 'error', message: `Could not export the diagram: ${String(error)}` });
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the export.'));
    reader.readAsDataURL(blob);
  });
}

let firstImportSettled: () => void = () => undefined;
const ready = new Promise<void>((resolve) => (firstImportSettled = resolve));

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  // The shell's appearance messages arrive here too; they are its own to apply.
  const message = event.data as HostToWebview | undefined;
  switch (message?.type) {
    case 'init':
      void enqueueImport(message.text).then(firstImportSettled);
      break;
    case 'update':
      void enqueueImport(message.text);
      break;
    case 'problems':
      shell.setProblems({ count: message.count, errors: message.errors });
      break;
  }
});

post({ type: 'ready' });

/** For the e2e test page: the mounted parts, and `ready` once the first `init` import settled. */
export const webview: {
  shell: ShellHandle;
  modeler: CollaborativeDiagram;
  connection: DiagramJsConnection;
  ready: Promise<void>;
} = { shell, modeler, connection, ready };
