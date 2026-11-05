import {
  BLANK_DOCUMENT_NAME,
  COLORS,
  VALUE_CHAIN_THEMES,
  createCollaborativeModeler,
  diagramMenu,
  diagramShortcuts,
  type CollaborativeValueChainModeler,
  type VcBounds,
  type VcReadOnly,
} from "@miragon/value-chain-renderer";
import {
  createEmptyDocument,
  parseDocumentJSON,
  serializeDocument,
} from "@miragon/value-chain-schema-model";
import type { IdeEditorDefinition } from "@miragon/modeler-shell/ide";
import { svgToPng } from "@miragon/modeler-shell/export";
import { withExampleInserted } from "./examples.js";
import { GEIST_FACES } from "./geist.js";

const service = <T>(modeler: CollaborativeValueChainModeler, name: string): T =>
  modeler.diagram.get<T>(name);

/** The canonical form of a document text, or undefined while it is invalid. */
function canonical(text: string): string | undefined {
  try {
    return serializeDocument(
      text.trim() === "" ? createEmptyDocument(BLANK_DOCUMENT_NAME) : parseDocumentJSON(text),
    );
  } catch {
    return undefined;
  }
}

/**
 * The value chain diagram as an IDE editor, shared by the VS Code webview and the Orca editor. The
 * shell fits the content into the free area itself, so the modeler's own fit is off.
 */
export const diagramEditor: IdeEditorDefinition<CollaborativeValueChainModeler> = {
  name: "value chain diagram",
  themes: VALUE_CHAIN_THEMES,
  createModeler: ({ additionalModules, undoRedoKeys, freeRectCenter }) =>
    createCollaborativeModeler({
      additionalModules,
      undoRedoKeys,
      freeArea: { center: freeRectCenter },
      fitOnImport: false,
    }),
  setCanvasReadOnly: (modeler, readOnly) =>
    service<VcReadOnly>(modeler, "vcReadOnly").setReadOnly(readOnly),
  isEmpty: (modeler) => service<VcBounds>(modeler, "vcBounds").isEmpty(),
  menu: (context) =>
    diagramMenu({
      exports: { png: context.exportAction("png"), svg: context.exportAction("svg") },
      showKeyboardShortcuts: () =>
        void context.shell.showShortcutsDialog(diagramShortcuts(context.shell)),
    }),
  sameText: (text, exported) => canonical(text) === exported,
  // The document's own text while the canvas shows the same diagram, so its formatting stays.
  exportText: (modeler, reconciledText) => {
    const text = modeler.exportText();
    return canonical(reconciledText) === text ? reconciledText : text;
  },
  exports: {
    png: {
      suggestedName: "value-chain.png",
      mimeType: "image/png",
      failure: "Couldn't export the diagram as PNG. Try again, or export it as SVG.",
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
      suggestedName: "value-chain.svg",
      mimeType: "image/svg+xml",
      failure: "Couldn't export the diagram as SVG. Try again.",
      picture: true,
      produce: (modeler) => ({ data: modeler.diagram.saveSVG().svg }),
    },
  },
  withExampleInserted,
};
