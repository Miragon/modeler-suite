/**
 * The parts of the `vscode` namespace the extension helpers use, typed structurally: the shell
 * never imports `vscode`; the extension passes its own `import * as vscode from "vscode"`.
 */

export interface DisposableLike {
  dispose(): unknown;
}

export interface ColorThemeLike {
  /** `vscode.ColorThemeKind`: 1 Light, 2 Dark, 3 HighContrast, 4 HighContrastLight. */
  readonly kind: number;
}

export interface VsCodeLike {
  readonly window: {
    readonly activeColorTheme: ColorThemeLike;
    onDidChangeActiveColorTheme(listener: (theme: ColorThemeLike) => unknown): DisposableLike;
  };
  readonly workspace: {
    getConfiguration(section?: string): { get<T>(key: string): T | undefined };
    onDidChangeConfiguration(
      listener: (event: { affectsConfiguration(section: string): boolean }) => unknown,
    ): DisposableLike;
  };
}

/** `vscode.WebviewPanel` as far as the theme bridge needs it. */
export interface WebviewPanelLike {
  readonly webview: { postMessage(message: unknown): unknown };
  readonly visible: boolean;
  onDidChangeViewState(
    listener: (event: { readonly webviewPanel: { readonly visible: boolean } }) => unknown,
  ): DisposableLike;
  onDidDispose(listener: () => unknown): DisposableLike;
}

// ---- The document plumbing (0.8) ----

export interface UriLike {
  readonly scheme: string;
  readonly path: string;
  toString(): string;
}

export interface PositionLike {
  readonly line: number;
  readonly character: number;
}

export interface RangeLike {
  readonly start: PositionLike;
  readonly end: PositionLike;
}

/** `vscode.TextDocument` as far as the document plumbing reads it. */
export interface TextDocumentLike {
  readonly uri: UriLike;
  /** Lines without their line breaks, as `lineAt(i).text` reports them. */
  readonly lineCount: number;
  lineAt(line: number): { readonly text: string };
  getText(): string;
}

export interface TextDocumentChangeEventLike {
  readonly document: TextDocumentLike;
  /** Empty when only the dirty state changed, as on a save. */
  readonly contentChanges: readonly unknown[];
}

export interface WorkspaceEditLike {
  replace(uri: UriLike, range: RangeLike, newText: string): void;
}

/** `vscode.Webview` as far as the document plumbing uses it. */
export interface WebviewLike {
  options: {
    readonly enableScripts?: boolean | undefined;
    readonly localResourceRoots?: readonly UriLike[] | undefined;
  };
  html: string;
  readonly cspSource: string;
  asWebviewUri(localResource: UriLike): UriLike;
  postMessage(message: unknown): PromiseLike<boolean>;
  onDidReceiveMessage(listener: (message: unknown) => unknown): DisposableLike;
}

/** `vscode.WebviewPanel` of a custom editor, as far as the document plumbing uses it. */
export interface EditorWebviewPanelLike extends WebviewPanelLike {
  readonly webview: WebviewLike;
  /** Whether the panel holds the focus. */
  readonly active: boolean;
  /** Shows the panel in `viewColumn` (default: its own group) and, unless `preserveFocus`, focuses it. */
  reveal(viewColumn?: number, preserveFocus?: boolean): void;
}

/** `vscode.CustomTextEditorProvider` as the document plumbing implements it. */
export interface CustomTextEditorProviderLike {
  resolveCustomTextEditor(
    document: TextDocumentLike,
    webviewPanel: EditorWebviewPanelLike,
    token: unknown,
  ): void | PromiseLike<void>;
}

export interface CustomEditorRegistrationOptions {
  readonly webviewOptions?: { readonly retainContextWhenHidden?: boolean | undefined } | undefined;
  readonly supportsMultipleEditorsPerDocument?: boolean | undefined;
}

/**
 * The parts of the `vscode` namespace `registerModelerEditor` uses: `VsCodeLike` for the theme
 * bridge plus the custom editor, the document's edits and change events, the notifications, the
 * Problems view command and the three classes it constructs.
 */
export interface VsCodeEditorLike extends VsCodeLike {
  readonly window: VsCodeLike["window"] & {
    registerCustomEditorProvider(
      viewType: string,
      provider: CustomTextEditorProviderLike,
      options?: CustomEditorRegistrationOptions,
    ): DisposableLike;
    showInformationMessage(message: string): PromiseLike<unknown>;
    showErrorMessage(message: string): PromiseLike<unknown>;
  };
  readonly workspace: VsCodeLike["workspace"] & {
    onDidChangeTextDocument(
      listener: (event: TextDocumentChangeEventLike) => unknown,
    ): DisposableLike;
    applyEdit(edit: WorkspaceEditLike): PromiseLike<boolean>;
  };
  readonly commands: {
    executeCommand(command: string, ...rest: unknown[]): PromiseLike<unknown>;
  };
  readonly Uri: { joinPath(base: UriLike, ...pathSegments: string[]): UriLike };
  readonly Range: new (
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number,
  ) => RangeLike;
  readonly WorkspaceEdit: new () => WorkspaceEditLike;
}

// ---- The file commands (0.9) ----

/** `vscode.Uri` as far as the file commands use it: `with` names another file of the same folder. */
export interface FileUriLike extends UriLike {
  with(change: { path: string }): this;
}

/** `vscode.SaveDialogOptions` as the file commands fill it. */
export interface SaveDialogOptionsLike<Uri extends FileUriLike = FileUriLike> {
  title?: string;
  saveLabel?: string;
  filters?: { [name: string]: string[] };
  defaultUri?: Uri;
}

/**
 * The parts of the `vscode` namespace `exportToFile` and the "New …" commands use: the save dialog,
 * the workspace's file system and first folder, the notifications with an action and the commands.
 * `Uri` is the extension's own `vscode.Uri`, which the helpers hand back.
 */
export interface VsCodeFilesLike<Uri extends FileUriLike = FileUriLike> {
  readonly window: {
    showSaveDialog(options: SaveDialogOptionsLike<Uri>): PromiseLike<Uri | undefined>;
    showInformationMessage(message: string, ...items: string[]): PromiseLike<string | undefined>;
    showWarningMessage(message: string, ...items: string[]): PromiseLike<string | undefined>;
    showErrorMessage(message: string, ...items: string[]): PromiseLike<string | undefined>;
  };
  readonly workspace: {
    readonly workspaceFolders: readonly { readonly uri: Uri }[] | undefined;
    readonly fs: { writeFile(uri: Uri, content: Uint8Array): PromiseLike<void> };
  };
  readonly commands: {
    executeCommand(command: string, ...rest: unknown[]): PromiseLike<unknown>;
    registerCommand(command: string, callback: () => unknown): DisposableLike;
  };
  readonly Uri: { joinPath(base: Uri, ...pathSegments: string[]): Uri };
}
