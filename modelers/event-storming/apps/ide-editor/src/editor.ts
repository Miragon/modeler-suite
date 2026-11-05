import {
  EVENT_STORMING_THEMES,
  boardMenu,
  boardShortcuts,
  createCollaborativeModeler,
  type BoardLevels,
  type CollaborativeEventStormingModeler,
  type EventStormingAggregates,
  type EventStormingReadOnly,
  type TypeCaptions,
} from "@miragon/event-storming-renderer";
import { openShellDialog } from "@miragon/modeler-shell";
import type { IdeEditorContext, IdeEditorDefinition } from "@miragon/modeler-shell/ide";
import { withExampleInserted } from "./examples.js";
import { boardPng } from "./io.js";
import { readTypeCaptionsVisible, writeTypeCaptionsVisible } from "./state.js";

interface DiagramElement {
  parent?: unknown;
  waypoints?: unknown;
}

type BoardEditorContext = IdeEditorContext<CollaborativeEventStormingModeler>;

const service = <T>(modeler: CollaborativeEventStormingModeler, name: string): T =>
  modeler.diagram.get<T>(name);

/** Compares two DSL texts modulo line endings and trailing whitespace, what a save changes. */
function sameBoardText(a: string, b: string): boolean {
  return a.replace(/\r\n/g, "\n").trim() === b.replace(/\r\n/g, "\n").trim();
}

function menu(context: BoardEditorContext) {
  const { modeler, host } = context;
  const aggregates = service<EventStormingAggregates>(modeler, "eventStormingAggregates");
  return boardMenu({
    levels: service<BoardLevels>(modeler, "eventStormingModeling"),
    typeCaptions: service<TypeCaptions>(modeler, "eventStormingViewOptions"),
    onTypeCaptionsToggled: (visible) => writeTypeCaptionsVisible(host.state, visible),
    aggregates: {
      hasAggregates: () => aggregates.hasAggregates(),
      showAggregates: () =>
        aggregates.showDialog({ container: context.shell.root, openDialog: openShellDialog }),
    },
    exports: {
      png: context.exportAction("png"),
      svg: context.exportAction("svg"),
      transparentPng: context.exportAction("png-transparent"),
      json: context.exportAction("json"),
    },
    showKeyboardShortcuts: () => context.shell.showShortcutsDialog(boardShortcuts(context.shell)),
  });
}

async function boardPicture(
  modeler: CollaborativeEventStormingModeler,
  transparent: boolean,
): Promise<{ data: Blob; fontFallback: boolean }> {
  const { svg } = await modeler.diagram.saveSVG();
  const { png, fontFallback } = await boardPng(svg, transparent);
  return { data: png, fontFallback };
}

const PNG_EXPORT_FAILED = "Couldn't export the board as PNG. Try again, or export it as SVG.";

/**
 * The Event Storming board as an IDE editor, shared by the VS Code webview and the Orca editor.
 * Event Storming's keyboard listens on `document` and must run before the shell's key listener, so
 * the diagram comes first; its imports are silent and fitted, as the contract defines.
 */
export const boardEditor: IdeEditorDefinition<CollaborativeEventStormingModeler> = {
  name: "Event Storming board",
  themes: EVENT_STORMING_THEMES,
  createModeler: ({ additionalModules, undoRedoKeys, fitInsets }) =>
    createCollaborativeModeler({
      additionalModules,
      undoRedoKeys,
      freeArea: { insets: fitInsets },
    }),
  setCanvasReadOnly: (modeler, readOnly, options) =>
    service<EventStormingReadOnly>(modeler, "eventStormingReadOnly").setReadOnly(readOnly, options),
  isEmpty: (modeler) =>
    !service<{ getAll(): DiagramElement[] }>(modeler, "elementRegistry")
      .getAll()
      .some((element) => element.parent && !element.waypoints),
  menu,
  sameText: sameBoardText,
  exports: {
    png: {
      suggestedName: "board.png",
      mimeType: "image/png",
      failure: PNG_EXPORT_FAILED,
      picture: true,
      produce: (modeler) => boardPicture(modeler, false),
    },
    svg: {
      suggestedName: "board.svg",
      mimeType: "image/svg+xml",
      failure: "Couldn't export the board as SVG. Try again.",
      picture: true,
      produce: async (modeler) => ({ data: (await modeler.diagram.saveSVG()).svg }),
    },
    "png-transparent": {
      suggestedName: "board.png",
      mimeType: "image/png",
      failure: PNG_EXPORT_FAILED,
      picture: true,
      produce: (modeler) => boardPicture(modeler, true),
    },
    json: {
      suggestedName: "board.json",
      mimeType: "application/json",
      failure: "Couldn't export the board as JSON. Try again.",
      produce: (modeler) => ({ data: JSON.stringify(modeler.diagram.exportMap(), null, 2) }),
    },
  },
  withExampleInserted,
  afterMount({ modeler, host }) {
    if (readTypeCaptionsVisible(host.state) === false) {
      service<TypeCaptions>(modeler, "eventStormingViewOptions").setTypeCaptionsVisible(false);
    }
  },
};
