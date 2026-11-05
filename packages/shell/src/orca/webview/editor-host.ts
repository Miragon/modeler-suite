import type { IdeEditorHost } from "../../ide/index.js";
import { connectOrcaDocumentSync } from "./document-sync.js";
import { mountOrcaShell } from "./mount.js";
import { saveExport } from "./save-export.js";

export interface OrcaEditorHostOptions {
  /** Orca's quiet time before it sends a change, default 250 ms. */
  debounceMs?: number | undefined;
}

/** Orca keeps one store per plugin, not per file, so these are the modeler's preferences. */
const STATE_PREFIX = "miragon.modeler.";

function storedValue(key: string): unknown {
  try {
    const raw = localStorage.getItem(STATE_PREFIX + key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

function storeValue(key: string, value: unknown): void {
  try {
    localStorage.setItem(STATE_PREFIX + key, JSON.stringify(value));
  } catch {
    // A frame without storage keeps the preference for the session only.
  }
}

const LEGEND_KEY = "legendOpen";

/**
 * An Orca custom editor frame as an `IdeEditorHost`: `mountOrcaShell`, `orca.document.session()`,
 * exports through Orca's save dialog. Orca never tells the frame the
 * file's path, so no view is kept per file; the legend and the modeler's own keys are kept per
 * plugin. The canvas owns undo, and Orca has neither diagnostics nor palette commands for an editor.
 */
export function orcaEditorHost(options: OrcaEditorHostOptions = {}): IdeEditorHost {
  const legendOpen = storedValue(LEGEND_KEY);
  return {
    kind: "orca",
    canvasOwnsHistory: true,
    state: {
      view: undefined,
      legendOpen: typeof legendOpen === "boolean" ? legendOpen : undefined,
      writeLegendOpen: (open) => storeValue(LEGEND_KEY, open),
      read: storedValue,
      write: storeValue,
      persistView: () => () => undefined,
    },
    mountShell: (root, shellOptions) => mountOrcaShell(root, shellOptions),
    async connectDocument(_shell, documentOptions) {
      const sync = await connectOrcaDocumentSync({
        importText: documentOptions.importText,
        exportText: documentOptions.exportText,
        canWrite: documentOptions.canWrite,
        debounceMs: options.debounceMs,
      });
      const { withExampleInserted } = documentOptions;
      return {
        pushEdit: sync.pushEdit,
        ready: sync.ready,
        imported: sync.imported,
        get readOnly() {
          return sync.readOnly;
        },
        insertExample: () => {
          if (!withExampleInserted || sync.readOnly) return;
          sync.replaceDocument(withExampleInserted(sync.session.value));
        },
        disconnect: sync.disconnect,
      };
    },
    async saveExport(file) {
      await saveExport({
        suggestedName: file.suggestedName,
        mimeType: file.mimeType,
        data: file.data,
      });
    },
    notify: (severity, message) =>
      severity === "error" ? console.error(message) : console.warn(message),
  };
}
