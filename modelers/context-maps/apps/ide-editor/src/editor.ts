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
import type { IdeEditorDefinition, IdeExportDefinition } from "@miragon/modeler-shell/ide";
import { withExampleInserted } from "./examples.js";
import { CONTEXT_MAPS_THEMES as WEBVIEW_THEMES } from "../../../packages/renderer/src/theme/themes.js";
import { embedSvg, svgToEmbeddedPng } from "./io.js";

type Modeler = CollaborativeContextMapsModeler;

/** The canonical text of `text`, or undefined when it is no map right now. */
function canonicalTextOf(text: string): string | undefined {
  const parsed = parseDocumentText(text);
  return parsed.ok ? serializeDocumentText(parsed.document) : undefined;
}

const failure = (format: string): string =>
  format === "png"
    ? "Couldn't export the map as PNG. Try again, or export it as SVG."
    : `Couldn't export the map as ${format.toUpperCase()}. Try again.`;

/** "Export as PNG": the map on its ground with the document inside, so it opens again as the map. */
export async function embeddedPng(modeler: Modeler) {
  const { svg } = await modeler.diagram.saveSVG();
  const { blob, fontFallback } = await svgToEmbeddedPng(svg, modeler.exportText());
  return { data: blob, fontFallback };
}

const EXPORTS: Readonly<Record<"png" | "svg" | "json" | "cml", IdeExportDefinition<Modeler>>> = {
  png: {
    suggestedName: "context-map.png",
    mimeType: "image/png",
    failure: failure("png"),
    picture: true,
    produce: embeddedPng,
  },
  svg: {
    suggestedName: "context-map.svg",
    mimeType: "image/svg+xml",
    failure: failure("svg"),
    picture: true,
    produce: async (modeler) => ({
      data: embedSvg((await modeler.diagram.saveSVG()).svg, modeler.exportText()),
    }),
  },
  json: {
    suggestedName: "context-map.cm.json",
    mimeType: "application/json",
    failure: failure("json"),
    produce: (modeler) => ({ data: modeler.exportText() }),
  },
  cml: {
    suggestedName: "context-map.cml",
    mimeType: "text/plain",
    failure: failure("cml"),
    produce: (modeler) => ({ data: serializeCml(modeler.diagram.exportDocument()) }),
  },
};

/**
 * The context map as an IDE editor, shared by the VS Code webview and the Orca editor: one per
 * mount, as it keeps the title dialog it creates.
 */
export function createContextMapEditor(): IdeEditorDefinition<Modeler> {
  let titleDialog: ReturnType<typeof createTitleDialog> | undefined;
  return {
    name: "context map",
    themes: WEBVIEW_THEMES,
    createModeler: ({ additionalModules, undoRedoKeys, fitInsets }) =>
      createCollaborativeModeler({
        additionalModules,
        undoRedoKeys,
        freeArea: { insets: fitInsets },
      }),
    setCanvasReadOnly: (modeler, readOnly) =>
      modeler.diagram.get<CmReadOnly>("cmReadOnly").setReadOnly(readOnly),
    isEmpty: (modeler) =>
      !modeler.diagram
        .get<{ getAll(): Parameters<typeof isCmElement>[0][] }>("elementRegistry")
        .getAll()
        .some(isCmElement),
    menu: (context) =>
      contextMapMenu({
        exports: {
          png: context.exportAction("png"),
          svg: context.exportAction("svg"),
          json: context.exportAction("json"),
          cml: context.exportAction("cml"),
        },
        showKeyboardShortcuts: () =>
          context.shell.showShortcutsDialog(contextMapShortcuts(context.shell)),
        editTitle: () => titleDialog?.open(),
      }),
    sameText: (text, exported) => canonicalTextOf(text) === exported,
    exports: EXPORTS,
    withExampleInserted: (text) => withExampleInserted(text) ?? text,
    shellOptions: (_modeler, host) => ({
      legend: {
        render: () => undefined,
        open: host.state.legendOpen,
        onToggle: (open) => host.state.writeLegendOpen(open),
      },
    }),
    afterMount({ shell, modeler }) {
      // The rows need the shell's tooltip, which exists only once the shell is mounted.
      if (shell.legend) renderLegend(shell.legend.body, { tooltip: shell.tooltip });
      const dialog = createTitleDialog(shell, {
        title: () => modeler.diagram.getMeta()?.title ?? "",
        setTitle: (title) => modeler.diagram.setMeta({ title }),
      });
      titleDialog = dialog;
      modeler.diagram.on<{ readOnly?: boolean }>(READ_ONLY_CHANGED_EVENT, (event) => {
        if (event.readOnly) dialog.close();
      });
      return () => dialog.destroy();
    },
  };
}
