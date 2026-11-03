import * as vscode from "vscode";
import {
  IMAGE_EXPORT_KINDS,
  exportToFile,
  registerModelerEditor,
  type ModelerEditor,
  type ModelerEditorRegistration,
  type ProblemCounts,
} from "@miragon/modeler-shell/vscode/extension";
import type { WardleyDiagnostics } from "./diagnostics.js";
import { MAP_EDITOR_OPTIONS } from "./mapEditorOptions.js";
import { chooseMapLink, openMapLink } from "./mapLinks.js";
import type { HostToWebview, WebviewToHost } from "./protocol.js";

export { MAP_VIEW_TYPE } from "./mapEditorOptions.js";

/** The open map editors: the focused one, the one focused last, and their Command Palette commands. */
export type MapEditors = ModelerEditorRegistration<vscode.TextDocument>;

/**
 * The problems pill of one map editor. The shell posts the counts its own refreshes find, after
 * a change of the text, and only when they differ from the ones it posted last. A linked map that
 * appears or goes away changes the count without such a change: the pill hears it from here, and
 * from then on hears every count that differs from the one posted here, since the shell's memory
 * of what the pill shows is out of date and might hold a later change back.
 */
class ProblemsPill {
  private shown: string | undefined;

  constructor(private readonly editor: ModelerEditor<vscode.TextDocument>) {}

  show(counts: ProblemCounts): void {
    this.shown = `${counts.count}:${counts.errors}`;
    void this.editor.post({ type: "problems", ...counts } satisfies HostToWebview);
  }

  /** After a refresh of the shell, which posts its counts itself while this pill posted none. */
  follow(counts: ProblemCounts): void {
    if (this.shown !== undefined && this.shown !== `${counts.count}:${counts.errors}`) {
      this.show(counts);
    }
  }
}

/**
 * The custom editor for `.wmap`/`.owm`, on the shell's document plumbing: the OWM text stays the
 * document, so VS Code keeps dirty state, saving, Git, diff and undo, and every change on the
 * canvas comes back as a minimal line edit that keeps the comments and statement order around it.
 * An export is a picture beside the map, saved through the shell's dialog; the map stays the
 * editable original.
 */
export function registerMapEditor(
  context: Pick<vscode.ExtensionContext, "extensionUri">,
  diagnostics?: WardleyDiagnostics,
): MapEditors {
  const pills = new Map<string, ProblemsPill>();
  const registration = registerModelerEditor<vscode.TextDocument, WebviewToHost>(vscode, context, {
    ...MAP_EDITOR_OPTIONS,
    diagnostics: diagnostics && {
      refresh: (document) => {
        // The parser's findings are warnings: the map stays editable (guide §13.5), so no errors.
        const counts = { count: diagnostics.refresh(document), errors: 0 };
        pills.get(document.uri.toString())?.follow(counts);
        return counts;
      },
    },
    onDidOpen: (editor) => {
      const key = editor.document.uri.toString();
      const pill = new ProblemsPill(editor);
      pills.set(key, pill);
      return {
        dispose: () => {
          if (pills.get(key) === pill) pills.delete(key);
        },
      };
    },
    onMessage: (message, editor) => {
      switch (message.type) {
        case "export":
          return exportToFile(vscode, {
            kind: IMAGE_EXPORT_KINDS[message.format],
            data: message.data,
            sourceUri: editor.document.uri,
            defaultName: "wardley-map",
            fontFallback: message.fontFallback === true,
            platform: process.platform,
          });
        case "openLink":
          return openMapLink(editor.document.uri, message.address);
        case "chooseLinkTarget":
          return chooseMapLink(editor.document.uri).then((address) =>
            editor.post({
              type: "linkTargetChosen",
              requestId: message.requestId,
              ...(address === undefined ? {} : { address }),
            } satisfies HostToWebview),
          );
        default:
          return undefined;
      }
    },
  });
  const countChanges = diagnostics?.onDidChangeCount(({ document, count }) =>
    pills.get(document.uri.toString())?.show({ count, errors: 0 }),
  );
  return {
    ...registration,
    dispose: () => {
      countChanges?.dispose();
      registration.dispose();
    },
  };
}
