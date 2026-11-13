import geistLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?dataurl';
import geistLatinExt from '@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?dataurl';
import {
  COLORS,
  THEMES,
  createCollaborativeModeler,
  diagramMenu,
  diagramShortcuts,
  type CollaborativeDiagram,
  type ReadOnly,
} from '@miragon/__NOTATION__-renderer';
import { GEIST_UNICODE_RANGES, svgToPng, type GeistFace } from '@miragon/modeler-shell/export';
import type { IdeEditorDefinition } from '@miragon/modeler-shell/ide';
import { withExampleInserted } from './examples.js';

// An SVG drawn as an image loads no file, and the frame's CSP lets the script fetch none: the PNG
// export gets Geist as data: URLs, the subsets a Latin label needs.
const GEIST: GeistFace[] = [
  { src: geistLatinExt, unicodeRange: GEIST_UNICODE_RANGES.latinExt },
  { src: geistLatin, unicodeRange: GEIST_UNICODE_RANGES.latin },
];

/** Two texts of one diagram: only the line breaks and the whitespace at either end differ. */
function sameDiagramText(a: string, b: string): boolean {
  return a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim();
}

/**
 * The diagram as an IDE editor, shared by the VS Code webview and the Orca editor. Undo and redo
 * keys stay with the host's document history when it has one (guide §13.5), and the shell's
 * viewport fits, so the modeler's own fit is off.
 */
export const diagramEditor: IdeEditorDefinition<CollaborativeDiagram> = {
  name: '__DISPLAY_NAME__ diagram',
  themes: THEMES,
  createModeler: ({ additionalModules, undoRedoKeys, fitInsets }) =>
    createCollaborativeModeler({
      additionalModules,
      undoRedoKeys,
      fitOnImport: false,
      freeArea: { insets: fitInsets },
    }),
  setCanvasReadOnly: (modeler, readOnly) =>
    modeler.diagram.get<ReadOnly>('readOnly').setReadOnly(readOnly),
  isEmpty: (modeler) => modeler.elements.list().length === 0,
  // No shortcuts key: every key the editor does not need goes on to the IDE (guide §13.5), so the
  // dialog opens from the menu.
  menu: (context) =>
    diagramMenu({
      exports: { png: context.exportAction('png'), svg: context.exportAction('svg') },
      showKeyboardShortcuts: () =>
        void context.shell.showShortcutsDialog(diagramShortcuts(context.shell)),
    }),
  sameText: sameDiagramText,
  exports: {
    png: {
      suggestedName: 'diagram.png',
      mimeType: 'image/png',
      failure: "Couldn't export the diagram as PNG. Try again, or export it as SVG.",
      picture: true,
      async produce(modeler) {
        let fontFallback = false;
        const png = await svgToPng(modeler.diagram.saveSVG().svg, {
          background: COLORS.paper,
          fonts: GEIST,
          onFontFallback: () => {
            fontFallback = true;
          },
        });
        return { data: png, fontFallback };
      },
    },
    svg: {
      suggestedName: 'diagram.svg',
      mimeType: 'image/svg+xml',
      failure: "Couldn't export the diagram as SVG. Try again.",
      picture: true,
      produce: (modeler) => ({ data: modeler.diagram.saveSVG().svg }),
    },
  },
  withExampleInserted,
};
