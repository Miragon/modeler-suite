import { readText, serializeText } from "@miragon/business-model-canvas-dsl";
import {
  COLORS,
  THEMES,
  canvasModelActions,
  renderLegend,
  connectNotes,
  createCollaborativeModeler,
  diagramMenu,
  diagramShortcuts,
  type CanvasModelActions,
  type CollaborativeDiagram,
  type ContentBounds,
  type NotesConnection,
  type ReadOnly,
} from "@miragon/business-model-canvas-renderer";
import { openShellDialog } from "@miragon/modeler-shell";
import type { IdeEditorDefinition } from "@miragon/modeler-shell/ide";
import { svgToPng } from "@miragon/modeler-shell/export";
import { GEIST_FACES } from "./geist.js";

const service = <T>(modeler: CollaborativeDiagram, name: string): T => modeler.diagram.get<T>(name);

/** Line endings and trailing whitespace are no change of the canvas. */
function normalized(text: string): string {
  return text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
}

/** The canonical form of a document text, or undefined while it is invalid. */
function canonical(text: string): string | undefined {
  try {
    return serializeText(readText(text).document);
  } catch {
    return undefined;
  }
}

function sameCanvas(text: string, exported: string): boolean {
  return normalized(text) === normalized(exported) || canonical(text) === exported;
}

const modelActions = new WeakMap<CollaborativeDiagram, CanvasModelActions>();
const notesOf = new WeakMap<CollaborativeDiagram, NotesConnection>();

/**
 * The Business Model Canvas as an IDE editor, shared by the VS Code webview and the Orca editor.
 * The shell fits the content into the free area itself, so the modeler's own fit is off.
 */
export const canvasEditor: IdeEditorDefinition<CollaborativeDiagram> = {
  name: "business model canvas",
  themes: THEMES,
  createModeler: ({ additionalModules, undoRedoKeys, freeRectCenter }) =>
    createCollaborativeModeler({
      additionalModules,
      undoRedoKeys,
      freeArea: { center: freeRectCenter },
      fitOnImport: false,
    }),
  setCanvasReadOnly: (modeler, readOnly) =>
    service<ReadOnly>(modeler, "readOnly").setReadOnly(readOnly),
  isEmpty: (modeler) => service<ContentBounds>(modeler, "contentBounds").isEmpty(),
  menu: (context) => {
    const { modeler } = context;
    let actions = modelActions.get(modeler);
    if (!actions) {
      actions = canvasModelActions(modeler.diagram, () => ({
        container: context.shell.root,
        openDialog: openShellDialog,
      }));
      modelActions.set(modeler, actions);
    }
    return diagramMenu({
      model: actions,
      exports: { png: context.exportAction("png"), svg: context.exportAction("svg") },
      showKeyboardShortcuts: () =>
        void context.shell.showShortcutsDialog(diagramShortcuts(context.shell)),
      notes: {
        isOpen: () => notesOf.get(modeler)?.panel.isOpen() ?? false,
        toggle: () => notesOf.get(modeler)?.panel.toggle(),
      },
    });
  },
  sameText: (text, exported) => sameCanvas(text, exported),
  // The document's own text while the canvas shows the same canvas, so its formatting stays.
  exportText: (modeler, reconciledText) => {
    const text = modeler.exportText();
    return sameCanvas(reconciledText, text) ? reconciledText : text;
  },
  exports: {
    png: {
      suggestedName: "canvas.png",
      mimeType: "image/png",
      failure: "Couldn't export the canvas as PNG. Try again, or export it as SVG.",
      picture: true,
      async produce(modeler) {
        let fontFallback = false;
        const { svg } = modeler.diagram.saveSVG();
        const png = await svgToPng(svg, {
          background: COLORS.surround,
          fonts: GEIST_FACES,
          onFontFallback: () => {
            fontFallback = true;
          },
        });
        return { data: png, fontFallback };
      },
    },
    svg: {
      suggestedName: "canvas.svg",
      mimeType: "image/svg+xml",
      failure: "Couldn't export the canvas as SVG. Try again.",
      picture: true,
      produce: async (modeler) => ({ data: modeler.diagram.saveSVG().svg }),
    },
  },
  shellOptions: (_modeler, host) => ({
    legend: {
      render: () => undefined,
      open: host.state.legendOpen,
      onToggle: (open) => host.state.writeLegendOpen(open),
    },
    inspector: { label: "Notes" },
    // No empty-file hint: every empty block of the canvas carries its own.
    emptyHint: undefined,
  }),
  afterMount({ shell, modeler }) {
    if (shell.legend) renderLegend(shell.legend.body);
    const notes = shell.inspector ? connectNotes(shell.inspector, modeler.diagram) : undefined;
    if (notes) notesOf.set(modeler, notes);
    return () => {
      notes?.destroy();
      notesOf.delete(modeler);
      modelActions.get(modeler)?.close();
    };
  },
};
