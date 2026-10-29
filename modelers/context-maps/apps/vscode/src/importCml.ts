import * as vscode from "vscode";
import { parseCml } from "@miragon/context-maps-cml";
import { parseDocument, serializeDocumentText } from "@miragon/context-maps-schema-model";
import { MAP_VIEW_TYPE } from "./mapEditorOptions.js";

/**
 * "New Diagram from CML…": a Context Mapper `.cml` file becomes a new `.cm` file next to it, which
 * opens in the diagram editor. An import never replaces the content of an open diagram (guide
 * §13.5); what the CML parser could not take shows as a warning with the count.
 */
export async function newDiagramFromCml(): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Import",
    title: "New Diagram from CML",
    filters: { "Context Mapper CML": ["cml"] },
  });
  const source = picked?.[0];
  if (!source) return;

  const sourceName = source.path.slice(source.path.lastIndexOf("/") + 1);
  let text: string;
  let skipped: number;
  try {
    const { document, diagnostics } = parseCml(
      new TextDecoder().decode(await vscode.workspace.fs.readFile(source)),
    );
    const parsed = parseDocument(document);
    if (!parsed.ok) throw new Error(parsed.error);
    text = serializeDocumentText(parsed.document);
    skipped = diagnostics.length;
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Could not read ${sourceName} as Context Mapper CML: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  const target = await vscode.window.showSaveDialog({
    title: "New Diagram from CML",
    saveLabel: "Create diagram",
    defaultUri: source.with({ path: source.path.replace(/\.cml$/i, "") + ".cm" }),
    filters: { "Context Maps": ["cm", "cm.json"] },
  });
  if (!target) return;
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(text));
  await vscode.commands.executeCommand("vscode.openWith", target, MAP_VIEW_TYPE);
  if (skipped > 0) {
    void vscode.window.showWarningMessage(
      `Imported ${sourceName}; ${skipped} construct${skipped === 1 ? "" : "s"} that a context map cannot show were left out.`,
    );
  }
}
