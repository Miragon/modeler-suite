import {
  TEAM_TOPOLOGIES_THEMES,
  createCollaborativeModeler,
  diagramMenu,
  diagramShortcuts,
  isTtElement,
  parseDocumentText,
  renderLegend,
  type CollaborativeTeamTopologiesModeler,
  type Modeler,
  type TtReadOnly,
} from "@miragon/team-topologies-renderer";
import { serializeDocument } from "@miragon/team-topologies-schema-model";
import { makeRoomForLegend, mountInspector } from "@miragon/team-topologies-ui";
import type { ShellHandle } from "@miragon/modeler-shell";
import type { IdeEditorDefinition } from "@miragon/modeler-shell/ide";
import { withExampleInserted } from "./examples.js";
import { embedSvg, svgToEmbeddedPng } from "./io.js";

type TeamTopologiesEditor = IdeEditorDefinition<CollaborativeTeamTopologiesModeler> & {
  /**
   * Commits the inspector field the user is typing in: it commits on blur, and a save shortcut
   * moves no focus, so the save would miss text the user can see. Only while this document has
   * focus; otherwise the field blurred already, and refocusing it would pull the focus back.
   */
  commitPanelDraft(shell: ShellHandle): void;
};

const diagramOf = (modeler: CollaborativeTeamTopologiesModeler): Modeler =>
  modeler.diagram as Modeler;

export async function embeddedPng(modeler: CollaborativeTeamTopologiesModeler) {
  let fontFallback = false;
  const { svg } = diagramOf(modeler).saveSVG();
  const data = await svgToEmbeddedPng(svg, modeler.exportText(), {
    onFontFallback: () => {
      fontFallback = true;
    },
  });
  return { data, fontFallback };
}

/**
 * The Team Topologies diagram as an IDE editor, shared by the VS Code webview and the Orca editor:
 * one per mount, as it keeps the inspector it mounts. Exports embed the document, so a picture
 * opens again as the diagram.
 */
export function createDiagramEditor(): TeamTopologiesEditor {
  let inspector: ReturnType<typeof mountInspector> | undefined;
  return {
    name: "Team Topologies diagram",
    themes: TEAM_TOPOLOGIES_THEMES,
    createModeler: ({ additionalModules, undoRedoKeys, fitInsets }) =>
      createCollaborativeModeler({
        additionalModules,
        undoRedoKeys,
        fitOnImport: false,
        freeArea: { insets: fitInsets },
      }),
    setCanvasReadOnly(modeler, readOnly) {
      diagramOf(modeler).get<TtReadOnly>("ttReadOnly").setReadOnly(readOnly);
      inspector?.setReadOnly(readOnly);
    },
    isEmpty: (modeler) =>
      !diagramOf(modeler)
        .get<{ getAll(): Parameters<typeof isTtElement>[0][] }>("elementRegistry")
        .getAll()
        .some(isTtElement),
    menu: (context) =>
      diagramMenu({
        exports: { png: context.exportAction("png"), svg: context.exportAction("svg") },
        showKeyboardShortcuts: () =>
          context.shell.showShortcutsDialog(diagramShortcuts(context.shell)),
      }),
    sameText(text, exported) {
      try {
        return serializeDocument(parseDocumentText(text)) === exported;
      } catch {
        return false;
      }
    },
    exports: {
      png: {
        suggestedName: "team-topology.png",
        mimeType: "image/png",
        failure: "Couldn't export the PNG. Try again, or export as SVG.",
        produce: embeddedPng,
      },
      svg: {
        suggestedName: "team-topology.svg",
        mimeType: "image/svg+xml",
        failure: "Couldn't export the SVG. Try again, or export as PNG.",
        produce: (modeler) => ({
          data: embedSvg(diagramOf(modeler).saveSVG().svg, modeler.exportText()),
        }),
      },
    },
    withExampleInserted: (text) => withExampleInserted(text) ?? text,
    shellOptions: (modeler, host) => ({
      legend: {
        render: renderLegend,
        open: host.state.legendOpen,
        onToggle: (open) => {
          if (open) makeRoomForLegend(diagramOf(modeler));
          host.state.writeLegendOpen(open);
        },
      },
      inspector: { label: "Properties" },
    }),
    afterMount({ shell, modeler }) {
      if (!shell.inspector) throw new Error("The shell mounted no inspector slot.");
      const mounted = mountInspector(shell.inspector, diagramOf(modeler));
      inspector = mounted;
      return () => mounted.destroy();
    },
    commitPanelDraft(shell) {
      const active = document.activeElement;
      const panel = shell.inspector?.element;
      if (!document.hasFocus() || !(active instanceof HTMLElement) || !panel?.contains(active)) {
        return;
      }
      active.blur();
      active.focus({ preventScroll: true });
    },
  };
}
