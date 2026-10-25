// Geist and Geist Mono, bundled: no font CDN (offline use, GDPR).
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
// The renderer's stylesheet (the vendored tokens, diagram-js.css, the canvas mapping), then the
// chrome's. Imported by name: the production build drops the renderer entry's own CSS import, since
// the package declares only its CSS files as side effects.
import '@miragon/__NOTATION__-renderer/assets/__NOTATION__.css';
import '@miragon/modeler-shell/shell.css';
import {
  SHORTCUTS_KEY,
  createCollaborativeModeler,
  createShortcutsDialog,
  diagramMenu,
  svgToPng,
} from '@miragon/__NOTATION__-renderer';
import { mountShell, problemSummary } from '@miragon/modeler-shell';
import { connectDiagramJs, shellModule } from '@miragon/modeler-shell/diagram-js';
import { EXAMPLE } from './example.js';
import { linkHash, linkedText } from './link.js';
import { THEMES } from './themes.js';

const APP_NAME = '__DISPLAY_NAME__ Modeler';
const REPOSITORY_URL = 'https://github.com/Miragon/__REPO__';
const FILE_TYPES = ['.__EXT__', '.txt', 'text/plain'];

const app = document.getElementById('app');
if (!app) throw new Error('index.html has no #app root.');

// 1. The diagram first, through the contract factory every host uses. The web app keeps the
//    canvas's undo keys; the shell's viewport fits after every import, so the renderer does not.
const modeler = createCollaborativeModeler({
  additionalModules: [shellModule],
  fitOnImport: false,
  freeArea: { insets: () => shell.fitInsets() },
});
const diagram = modeler.diagram;
diagram.get('canvas');

// 2. The chrome around it: the whole web column of guide §5.2.
const shell = mountShell(app, {
  host: 'web',
  canvas: diagram.container,
  lang: 'en',
  themes: THEMES,
  primary: { onSelect: () => void share() },
  legal: { links: [{ label: 'GitHub', href: REPOSITORY_URL }] },
  file: {
    newDiagram: { onSelect: () => void replaceDocument('') },
    open: { onSelect: () => fileInput.click() },
    showExample: { onSelect: () => void replaceDocument(EXAMPLE) },
  },
  problems: {},
  menu: diagramMenu({
    exports: {
      png: { onSelect: () => void exportPicture('png') },
      svg: { onSelect: () => void exportPicture('svg') },
      text: { onSelect: () => download(modeler.exportText(), 'text/plain', '__EXT__') },
    },
    showKeyboardShortcuts: () => shortcutsDialog.open(),
    shortcutsKey: SHORTCUTS_KEY,
  }),
  // Guide §8 (design system 1.23.0): an empty diagram after the start screen shows the empty-file
  // hint, without "Insert example": the File group's "Show example" opens the example.
  emptyHint: {},
  emptyState: {
    title: APP_NAME,
    text: 'Start a new diagram, or explore the example.',
    komet: '/miragon-komet-blau.svg',
    onNewDiagram: () => void replaceDocument(''),
    onShowExample: () => void replaceDocument(EXAMPLE),
    dropHint: 'Or drop a .__EXT__ file here',
  },
  dropZone: {
    accept: FILE_TYPES,
    onDrop: ([file]) => {
      if (file) void openFile(file);
    },
  },
});
const shortcutsDialog = createShortcutsDialog(shell, { shortcutsKey: SHORTCUTS_KEY });
diagram.on('diagram.destroy', () => shortcutsDialog.destroy());

// 3. Viewport, palette skin and keys. The viewport fits to the contract's contentBounds(), tight
//    as guide §5.9 wants it. Empty means no element, which the shell asks on every content change:
//    a notation that always draws something (a plot, axes) has bounds without one.
const connection = connectDiagramJs(shell, diagram, {
  modeler,
  isEmpty: () => modeler.elements.list().length === 0,
});
const { viewport } = connection;

/** Every new document opens like the first (guide §5.9); findings go to the problems pill. */
async function openDocument(text: string, announce: boolean): Promise<void> {
  viewport.newDocument();
  let warnings: string[];
  try {
    ({ warnings } = await modeler.importText(text));
  } finally {
    viewport.afterImport();
  }
  shell.setEmptyState(false);
  shell.setProblems(
    problemSummary(warnings.map((message) => ({ severity: 'warning' as const, message }))),
  );
  if (announce && warnings.length > 0) {
    shell.toast({ status: 'warning', text: 'Some lines could not be read. See Problems.' });
  }
  syncLink();
}

/** Replacing a document clears the canvas history, so the previous one comes back by a toast. */
async function replaceDocument(text: string): Promise<void> {
  const previous = modeler.exportText();
  await openDocument(text, true);
  if (previous.trim() === '' || previous === modeler.exportText()) return;
  shell.toast({
    status: 'info',
    text: 'Diagram replaced',
    action: { label: 'Undo', onSelect: () => void openDocument(previous, false) },
  });
}

async function openFile(file: File): Promise<void> {
  try {
    await replaceDocument(await file.text());
  } catch {
    shell.toast({ status: 'danger', text: `Couldn't read “${file.name}”.` });
  }
}

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = FILE_TYPES.join(',');
fileInput.hidden = true;
document.body.append(fileInput);
fileInput.addEventListener('change', () => {
  const [file] = fileInput.files ?? [];
  fileInput.value = '';
  if (file) void openFile(file);
});

function fileName(extension: string): string {
  return `${APP_NAME.toLowerCase().replace(/\s+/g, '-')}.${extension}`;
}

function download(content: Blob | string, type: string, extension: string): void {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type }),
  );
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: fileName(extension),
  });
  link.click();
  URL.revokeObjectURL(url);
  shell.toast({ status: 'success', text: `Exported ${fileName(extension)}.` });
}

async function exportPicture(kind: 'png' | 'svg'): Promise<void> {
  try {
    const { svg } = diagram.saveSVG();
    if (kind === 'svg') download(svg, 'image/svg+xml', 'svg');
    else download(await svgToPng(svg), 'image/png', 'png');
  } catch {
    shell.toast({
      status: 'danger',
      text: `Couldn't export the diagram as ${kind.toUpperCase()}.`,
    });
  }
}

/** The link carries the document; the clipboard write happens inside the click (Safari). */
async function share(): Promise<void> {
  const url = `${location.origin}${location.pathname}${linkHash(modeler.exportText())}`;
  try {
    await navigator.clipboard.writeText(url);
    shell.toast({ status: 'success', text: 'Link copied' });
  } catch {
    shell.toast({
      status: 'danger',
      text: "Couldn't copy the link. Copy it from the address bar.",
    });
  }
  syncLink();
}

function syncLink(): void {
  const text = modeler.exportText();
  const hash = text.trim() === '' ? '' : linkHash(text);
  history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
}

modeler.onContentChanged(() => {
  shell.setEmptyState(false);
  syncLink();
});

/** A link pasted into the open tab replaces the diagram (syncLink's replaceState fires no event). */
function onHashChange(): void {
  const text = linkedText(location.hash);
  if (text !== undefined && text !== modeler.exportText()) void replaceDocument(text);
}
window.addEventListener('hashchange', onHashChange);

// Start: the document of the link, else the start screen on an empty diagram.
const linked = linkedText(location.hash);
if (linked !== undefined) await openDocument(linked, true);
else {
  await modeler.importText('');
  viewport.afterImport();
  shell.setEmptyState(true);
}

let destroyed = false;

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
      window.removeEventListener('hashchange', onHashChange);
      fileInput.remove();
      connection.destroy();
      modeler.destroy();
      shell.destroy();
    },
  },
});
