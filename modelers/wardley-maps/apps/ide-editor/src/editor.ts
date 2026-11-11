import {
  EXPLORE_CHANGED,
  WARDLEY_THEMES,
  createAxisLabelsPopover,
  createCollaborativeModeler,
  createMapSizePopover,
  isWardleyShape,
  mapMenu,
  mapShortcuts,
  type CollaborativeWardleyModeler,
  type CollaborativeWardleyOptions,
  type LabelDeduplicatedEvent,
  type Modeler,
  type WardleyExplore,
  type WardleyReadOnly,
} from "@miragon/wardley-renderer";
import { patchDSL } from "@miragon/wardley-dsl";
import type { WardleyMap } from "@miragon/wardley-schema-model";
import type { IdeEditorDefinition } from "@miragon/modeler-shell/ide";
import { withExampleInserted } from "./examples.js";
import { GEIST_FACES } from "./geist-faces.js";
import { PNG_EXPORT_FAILED, pngExport } from "./png-export.js";

/** Where a map's links go: the host opens a map or a page, and asks for a link's target. */
export type MapLinks = Pick<
  CollaborativeWardleyOptions,
  "openRelativeLink" | "openExternalLink" | "chooseLinkTarget"
>;

const diagramOf = (modeler: CollaborativeWardleyModeler): Modeler => modeler.diagram as Modeler;

function sameMapText(a: string, b: string): boolean {
  return a.replace(/\r\n/g, "\n").trim() === b.replace(/\r\n/g, "\n").trim();
}

/**
 * The Wardley map as an IDE editor, shared by the VS Code webview and the Orca editor: one per
 * mount, as it keeps the popovers it creates and the map its text was last written from, so a
 * canvas edit patches the user's text (comments and order kept) instead of rewriting it.
 */
export function createMapEditor(links: MapLinks): IdeEditorDefinition<CollaborativeWardleyModeler> {
  let lastMap: WardleyMap | undefined;
  let popovers:
    | {
        mapSize: ReturnType<typeof createMapSizePopover>;
        axisLabels: ReturnType<typeof createAxisLabelsPopover>;
      }
    | undefined;
  const isEmpty = (modeler: CollaborativeWardleyModeler): boolean =>
    !diagramOf(modeler)
      .get<{ getAll(): unknown[] }>("elementRegistry")
      .getAll()
      .some(isWardleyShape);
  const picture = (format: "png" | "png-transparent") => ({
    suggestedName: "wardley-map.png",
    mimeType: "image/png",
    failure: PNG_EXPORT_FAILED,
    produce: async (modeler: CollaborativeWardleyModeler) =>
      pngExport((await diagramOf(modeler).saveSVG()).svg, format, GEIST_FACES),
  });
  return {
    name: "Wardley map",
    themes: WARDLEY_THEMES,
    createModeler: ({ additionalModules, undoRedoKeys, fitInsets }) =>
      createCollaborativeModeler({
        additionalModules,
        undoRedoKeys,
        freeArea: { insets: fitInsets },
        ...links,
      }),
    setCanvasReadOnly: (modeler, readOnly) =>
      diagramOf(modeler).get<WardleyReadOnly>("wardleyReadOnly").setReadOnly(readOnly),
    isEmpty,
    menu: (context) =>
      mapMenu({
        explore: diagramOf(context.modeler).get<WardleyExplore>("wardleyExplore"),
        mapSize: () => popovers?.mapSize.open(),
        axisLabels: () => popovers?.axisLabels.open(),
        exports: {
          png: context.exportAction("png"),
          svg: context.exportAction("svg"),
          transparentPng: context.exportAction("png-transparent"),
        },
        showKeyboardShortcuts: () => context.shell.showShortcutsDialog(mapShortcuts(context.shell)),
      }),
    sameText: (text, exported, reconciledText) =>
      sameMapText(text, reconciledText) || sameMapText(text, exported),
    exportText(modeler, reconciledText) {
      const map = diagramOf(modeler).exportMap();
      const text = patchDSL(reconciledText, map, lastMap ? { previous: lastMap } : {});
      lastMap = map;
      return text;
    },
    exports: {
      png: picture("png"),
      svg: {
        suggestedName: "wardley-map.svg",
        mimeType: "image/svg+xml",
        failure: "Couldn't export the map as SVG. Try again.",
        produce: async (modeler) => ({ data: (await diagramOf(modeler).saveSVG()).svg }),
      },
      "png-transparent": picture("png-transparent"),
    },
    withExampleInserted,
    imported({ modeler, connection }, { first, wasEmpty }) {
      lastMap = diagramOf(modeler).exportMap();
      // The plot counts as content, so the first elements of an empty map get a fit of their own.
      if (!first && wasEmpty && !isEmpty(modeler) && connection.viewport.isAutomatic()) {
        connection.viewport.fit({ animate: false });
      }
    },
    afterMount({ shell, modeler, host, refreshMenu }) {
      const diagram = diagramOf(modeler);
      // Explore mode runs no command, so the shell's refresh on commandStack.changed misses it.
      diagram.on(EXPLORE_CHANGED, () => refreshMenu());
      const mapSize = createMapSizePopover(shell, diagram);
      const axisLabels = createAxisLabelsPopover(shell, diagram);
      popovers = { mapSize, axisLabels };
      diagram.on("wardley.label.deduplicated", (event: LabelDeduplicatedEvent) =>
        host.notify(
          "info",
          `“${event.requested}” already exists. Renamed to “${event.applied}”, because links refer to names.`,
        ),
      );
      return () => {
        mapSize.destroy();
        axisLabels.destroy();
      };
    },
  };
}
