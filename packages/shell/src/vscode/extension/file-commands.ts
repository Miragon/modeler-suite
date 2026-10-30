import { revealFileLabel } from "./reveal.js";
import type {
  DisposableLike,
  FileUriLike,
  SaveDialogOptionsLike,
  UriLike,
  VsCodeFilesLike,
} from "./types.js";

/**
 * Every text of the file commands that is not the modeler's own (guide §2, §13.5): English by
 * default; a localized modeler overrides them in its language, as it does the webview's.
 */
export interface FileCommandMessages {
  /** The export's save dialog button: "Export". */
  exportSaveLabel: string;
  /** The notification after an export: "Exported map.png." */
  exported(fileName: string): string;
  /** The warning after a PNG export whose labels fell back to the system font. */
  exportedInSystemFont(fileName: string): string;
  /** The error when the export could not be written. */
  couldNotExport(fileName: string): string;
  /** The error when a new file could not be written. */
  couldNotCreate(fileName: string): string;
  /** The modal question before a new file replaces one the save dialog did not ask about. */
  alreadyExists(fileName: string): string;
  /** Its action that replaces the file: "Replace". */
  replaceLabel: string;
  /** The notification's action that shows the file, labelled like VS Code: `revealFileLabel`. */
  revealFile(platform: string): string;
}

/** Every key optional; an `undefined` value keeps the default (a conditional override). */
export type FileCommandMessageOverrides = {
  [Key in keyof FileCommandMessages]?: FileCommandMessages[Key] | undefined;
};

export const defaultFileCommandMessages: FileCommandMessages = {
  exportSaveLabel: "Export",
  exported: (fileName) => `Exported ${fileName}.`,
  exportedInSystemFont: (fileName) =>
    `Exported ${fileName} in a system font. Geist couldn't be embedded.`,
  couldNotExport: (fileName) => `Couldn't export ${fileName}. Try again, or choose another folder.`,
  couldNotCreate: (fileName) => `Couldn't create ${fileName}. Try again, or choose another folder.`,
  alreadyExists: (fileName) => `${fileName} already exists. Do you want to replace it?`,
  replaceLabel: "Replace",
  revealFile: revealFileLabel,
};

function fileCommandMessages(
  overrides: FileCommandMessageOverrides | undefined,
): FileCommandMessages {
  const defined = Object.entries(overrides ?? {}).filter(([, value]) => value !== undefined);
  return { ...defaultFileCommandMessages, ...Object.fromEntries(defined) };
}

function fileNameOf(uri: UriLike): string {
  return uri.path.slice(uri.path.lastIndexOf("/") + 1);
}

/** Fresh arrays: the dialog options are VS Code's to keep, the modeler's constants stay its own. */
function dialogFilters(filters: { readonly [name: string]: readonly string[] }): {
  [name: string]: string[];
} {
  return Object.fromEntries(
    Object.entries(filters).map(([name, extensions]) => [name, [...extensions]]),
  );
}

/** One kind of export: its save dialog, its suggested file name and how the webview hands it. */
export interface ExportKind {
  /** The save dialog's title, the menu entry's label: "Export as PNG". */
  readonly title: string;
  /** The save dialog's filters: `{ "PNG image": ["png"] }`. */
  readonly filters: { readonly [name: string]: readonly string[] };
  /** What follows the document's name in the suggested file name: ".png", "-transparent@4x.png". */
  readonly suffix: string;
  /** How the webview posts the file: "base64" for a PNG, "text" for SVG, JSON or CML. */
  readonly encoding: "base64" | "text";
}

/** The image exports of guide §2 and §5.4, named as the web apps name their files. */
export const IMAGE_EXPORT_KINDS: Readonly<Record<"png" | "svg" | "png-transparent", ExportKind>> =
  Object.freeze({
    png: Object.freeze({
      title: "Export as PNG",
      filters: { "PNG image": ["png"] },
      suffix: ".png",
      encoding: "base64",
    } as const),
    svg: Object.freeze({
      title: "Export as SVG",
      filters: { "SVG image": ["svg"] },
      suffix: ".svg",
      encoding: "text",
    } as const),
    "png-transparent": Object.freeze({
      title: "Export as PNG (4×, transparent)",
      filters: { "PNG image": ["png"] },
      suffix: "-transparent@4x.png",
      encoding: "base64",
    } as const),
  });

export interface ExportToFileOptions<Uri extends FileUriLike = FileUriLike> {
  readonly kind: ExportKind;
  /** The file as the webview posted it, in the kind's `encoding`. */
  readonly data: string;
  /** The exported document; a file on disk suggests the export beside it. */
  readonly sourceUri?: Uri | undefined;
  /**
   * What the suggested name drops from the document's file name; default its last extension.
   * Team Topologies passes `/(\.(tt|ttm))?\.[^./]+$/i`, so `shop.tt.png` suggests `shop.svg`.
   */
  readonly sourceExtension?: RegExp | undefined;
  /** The name without a document on disk, in the first workspace folder: "wardley-map". */
  readonly defaultName: string;
  /** Whether the labels of the PNG fell back to the system font: the notification warns. */
  readonly fontFallback?: boolean | undefined;
  /** `process.platform`, for the label of the action that shows the file. */
  readonly platform: string;
  readonly messages?: FileCommandMessageOverrides | undefined;
}

const LAST_EXTENSION = /\.[^./]+$/;

function suggestedExportUri<Uri extends FileUriLike>(
  vscode: VsCodeFilesLike<Uri>,
  options: ExportToFileOptions<Uri>,
): Uri | undefined {
  const { sourceUri, kind } = options;
  if (sourceUri?.scheme === "file") {
    const base = sourceUri.path.replace(options.sourceExtension ?? LAST_EXTENSION, "");
    return sourceUri.with({ path: `${base}${kind.suffix}` });
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder
    ? vscode.Uri.joinPath(folder.uri, `${options.defaultName}${kind.suffix}`)
    : undefined;
}

function bytesOf(data: string, encoding: ExportKind["encoding"]): Uint8Array {
  if (encoding === "text") return new TextEncoder().encode(data);
  // `atob`, not `Buffer`: the entry imports nothing and runs in a web extension host as well.
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Writes an export of the webview to a file the user picks (guide §13.5): the save dialog suggests
 * the document's name with the kind's suffix beside the document, the file is written, and a
 * notification names it with the action that shows it ("Reveal in Finder"), as a warning when the
 * PNG's labels fell back to the system font. A file that cannot be written is an error
 * notification instead. Resolves to the written file once the notification is closed, or to
 * `undefined` when the dialog was dismissed or the write failed.
 */
export async function exportToFile<Uri extends FileUriLike>(
  vscode: VsCodeFilesLike<Uri>,
  options: ExportToFileOptions<Uri>,
): Promise<Uri | undefined> {
  const { kind } = options;
  const messages = fileCommandMessages(options.messages);
  const dialog: SaveDialogOptionsLike<Uri> = {
    title: kind.title,
    saveLabel: messages.exportSaveLabel,
    filters: dialogFilters(kind.filters),
  };
  const suggested = suggestedExportUri(vscode, options);
  if (suggested) dialog.defaultUri = suggested;
  const target = await vscode.window.showSaveDialog(dialog);
  if (!target) return undefined;

  const fileName = fileNameOf(target);
  try {
    await vscode.workspace.fs.writeFile(target, bytesOf(options.data, kind.encoding));
  } catch (error) {
    console.error(`Couldn't write ${fileName}`, error);
    void vscode.window.showErrorMessage(messages.couldNotExport(fileName));
    return undefined;
  }

  const reveal = messages.revealFile(options.platform);
  const answer = options.fontFallback
    ? await vscode.window.showWarningMessage(messages.exportedInSystemFont(fileName), reveal)
    : await vscode.window.showInformationMessage(messages.exported(fileName), reveal);
  if (answer === reveal) void vscode.commands.executeCommand("revealFileInOS", target);
  return target;
}

export interface NewDocumentOptions {
  /** `contributes.customEditors[].viewType`: the new file opens in the modeler. */
  readonly viewType: string;
  /** The new file's text: an empty document, or the example of "New … from Example". */
  readonly text: string;
  /** The save dialog's title: "New Wardley Map". */
  readonly title: string;
  /** The save dialog's button: "Create map". */
  readonly saveLabel: string;
  /** The save dialog's filters: `{ "Wardley Map": ["wmap", "owm"] }`. */
  readonly filters: { readonly [name: string]: readonly string[] };
  /** The suggested name in the first workspace folder: "wardley-map.wmap". */
  readonly defaultFileName: string;
  /**
   * The path to write for the one the dialog returned, so the modeler's editor claims the file:
   * Value Chain makes `chain.json` `chain.vc.json`. Default: the path the dialog returned. A file
   * already at another path is replaced only after a modal question.
   */
  readonly targetPath?: ((chosenPath: string) => string) | undefined;
  readonly messages?: FileCommandMessageOverrides | undefined;
}

async function fileExists<Uri extends FileUriLike>(
  vscode: VsCodeFilesLike<Uri>,
  uri: Uri,
): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * "New …" and "New … from Example" (guide §13.5) as a real file rather than an untitled document,
 * which a custom text editor handles most robustly. The save dialog suggests
 * `defaultFileName` in the first workspace folder, the text is written and the file opens with
 * `vscode.openWith` in `viewType`. A file that cannot be written is an error notification.
 * Resolves to the new file, or to `undefined` when the dialog was dismissed, a replace was declined
 * or the write failed.
 */
export async function createNewDocument<Uri extends FileUriLike>(
  vscode: VsCodeFilesLike<Uri>,
  options: NewDocumentOptions,
): Promise<Uri | undefined> {
  const messages = fileCommandMessages(options.messages);
  const dialog: SaveDialogOptionsLike<Uri> = {
    title: options.title,
    saveLabel: options.saveLabel,
    filters: dialogFilters(options.filters),
  };
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder) dialog.defaultUri = vscode.Uri.joinPath(folder.uri, options.defaultFileName);
  const chosen = await vscode.window.showSaveDialog(dialog);
  if (!chosen) return undefined;

  const path = options.targetPath?.(chosen.path) ?? chosen.path;
  const target = path === chosen.path ? chosen : chosen.with({ path });
  const fileName = fileNameOf(target);
  // The save dialog confirmed replacing only the file it returned, never the one targetPath names.
  if (target !== chosen && (await fileExists(vscode, target))) {
    const answer = await vscode.window.showWarningMessage(
      messages.alreadyExists(fileName),
      { modal: true },
      messages.replaceLabel,
    );
    if (answer !== messages.replaceLabel) return undefined;
  }
  try {
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(options.text));
  } catch (error) {
    console.error(`Couldn't write ${fileName}`, error);
    void vscode.window.showErrorMessage(messages.couldNotCreate(fileName));
    return undefined;
  }
  await vscode.commands.executeCommand("vscode.openWith", target, options.viewType);
  return target;
}

/** Registers `command` (`contributes.commands`) to run `createNewDocument` with `options`. */
export function registerNewDocumentCommand<Uri extends FileUriLike>(
  vscode: VsCodeFilesLike<Uri>,
  command: string,
  options: NewDocumentOptions,
): DisposableLike {
  return vscode.commands.registerCommand(command, () => createNewDocument(vscode, options));
}
