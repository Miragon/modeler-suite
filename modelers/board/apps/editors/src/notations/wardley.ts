import type { EditorModule, TextRules } from "@miragon/board-host";
import { patchDSL } from "@miragon/wardley-dsl";
import {
  createCollaborativeModeler,
  type CollaborativeWardleyModeler,
} from "@miragon/wardley-renderer";
import "@miragon/wardley-renderer/assets/wardley.css";
import type { WardleyMap } from "@miragon/wardley-schema-model";

/** Line endings and the whitespace around a map are no change of the canvas. */
function sameMapText(a: string, b: string): boolean {
  return a.replace(/\r\n/g, "\n").trim() === b.replace(/\r\n/g, "\n").trim();
}

export const create: EditorModule["create"] = (options) => createCollaborativeModeler(options);

/**
 * A canvas edit patches the person's own text, so comments and the order of the lines stay. The
 * patch needs the map the text was last written from, kept here per mounted modeler.
 */
export const text: NonNullable<EditorModule["text"]> = (embedded): TextRules => {
  const modeler = embedded as CollaborativeWardleyModeler;
  let lastMap: WardleyMap | undefined;
  return {
    exported(reconciled) {
      const map = modeler.diagram.exportMap();
      const patched = patchDSL(reconciled, map, lastMap ? { previous: lastMap } : {});
      lastMap = map;
      return patched;
    },
    same: (candidate, reconciled) =>
      sameMapText(candidate, reconciled) || sameMapText(candidate, modeler.exportText()),
    imported() {
      lastMap = modeler.diagram.exportMap();
    },
  };
};
