import * as vscode from "vscode";
import { isStructurizrWorkspaceText } from "./diagnostics.js";

/**
 * LikeC4's extension claims `.c4` as well, for its own language and without a custom editor: with
 * both installed, the C4 Modeler would open every LikeC4 model, and VS Code would give every `.c4`
 * file the language of whichever extension it registered last. The text tells the two apart: a
 * Structurizr workspace starts with `workspace` or a directive, and a LikeC4 model never does.
 */
export const LIKEC4_EXTENSION_ID = "likec4.likec4-vscode";
export const LIKEC4_LANGUAGE_ID = "likec4";
export const STRUCTURIZR_LANGUAGE_ID = "structurizr-dsl";

type Content = Pick<vscode.TextDocument, "uri" | "getText">;

export function isLikeC4Installed(): boolean {
  return vscode.extensions.getExtension(LIKEC4_EXTENSION_ID) !== undefined;
}

function isC4File(uri: vscode.Uri): boolean {
  return /\.c4$/i.test(uri.path);
}

/** A blank file could become either, so it is nobody's in particular. */
function isOtherText(document: Content): boolean {
  const text = document.getText();
  return text.trim() !== "" && !isStructurizrWorkspaceText(text);
}

/** A `.c4` file the C4 Modeler can't show, which LikeC4 can: the canvas hands it over. */
export function isLikeC4Model(document: Content, likeC4Installed: boolean): boolean {
  return likeC4Installed && isC4File(document.uri) && isOtherText(document);
}

/**
 * The language a `.c4` text document should have instead of the one VS Code gave it, or
 * `undefined` to keep that one. Only the two languages that claim `.c4` here trade documents.
 */
export function correctedLanguage(
  document: Content & Pick<vscode.TextDocument, "languageId">,
  likeC4Installed: boolean,
): string | undefined {
  if (!isC4File(document.uri) || document.getText().trim() === "") return undefined;
  if (document.languageId === LIKEC4_LANGUAGE_ID && !isOtherText(document)) {
    return STRUCTURIZR_LANGUAGE_ID;
  }
  if (document.languageId === STRUCTURIZR_LANGUAGE_ID && isLikeC4Model(document, likeC4Installed)) {
    return LIKEC4_LANGUAGE_ID;
  }
  return undefined;
}

/**
 * Gives every `.c4` text document that opens the language of its text. VS Code reports a change
 * of the language, ours or one the user picked in Change Language Mode, as a close and an open of
 * the document in one go: such an open is left alone, so the user's choice stays.
 */
export function registerLanguageCorrection(): vscode.Disposable {
  const changingLanguage = new Set<string>();
  const correct = (document: vscode.TextDocument): void => {
    if (changingLanguage.has(document.uri.toString())) return;
    const language = correctedLanguage(document, isLikeC4Installed());
    if (language === undefined) return;
    vscode.languages.setTextDocumentLanguage(document, language).then(undefined, (error) => {
      console.error(`Couldn't give ${document.uri.path} the language ${language}`, error);
    });
  };
  for (const document of vscode.workspace.textDocuments) correct(document);
  return vscode.Disposable.from(
    vscode.workspace.onDidCloseTextDocument((document) => {
      const key = document.uri.toString();
      changingLanguage.add(key);
      queueMicrotask(() => changingLanguage.delete(key));
    }),
    vscode.workspace.onDidOpenTextDocument(correct),
  );
}

/** An editor of a LikeC4 model, as far as handing it over needs it. */
export interface HandedOverEditor {
  readonly document: Pick<vscode.TextDocument, "uri">;
  readonly panel: Pick<vscode.WebviewPanel, "viewColumn" | "dispose">;
}

/**
 * The C4 Modeler opened a LikeC4 model, as the default editor of `.c4` files: the text editor
 * takes its place, where LikeC4's language and preview work. Opening a file never notifies
 * (guide §13.5), so the hand-over is silent.
 */
export async function reopenForLikeC4(editor: HandedOverEditor): Promise<void> {
  await vscode.commands.executeCommand(
    "vscode.openWith",
    editor.document.uri,
    "default",
    editor.panel.viewColumn,
  );
  editor.panel.dispose();
}
