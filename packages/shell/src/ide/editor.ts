import {
  INVALID_STATUS_DELAY_MS,
  type Insets,
  type Point,
  type Theme,
  type ViewportState,
} from "../core/index.js";
import {
  connectDiagramJs,
  shellModule,
  type CollaborativeModelerLike,
  type DiagramJsConnection,
  type InjectorLike,
  type ModuleDeclarationLike,
  type Viewport,
} from "../diagram-js/index.js";
import type { MenuGroups, ShellHandle, ShellOptions } from "../dom/index.js";

export interface DocumentImportContext {
  /** The first text this editor shows. */
  first: boolean;
  /** The text the canvas showed last, "" before the first import. */
  reconciledText: string;
}

/** What both IDE hosts take of `ShellOptions`: the host decides `host`, keys, mode and problems. */
export type IdeShellOptions = Omit<
  ShellOptions,
  | "host"
  | "keyScope"
  | "themes"
  | "problems"
  | "primary"
  | "legal"
  | "file"
  | "appearance"
  | "emptyState"
  | "dropZone"
> & { themes: readonly Theme[] };

/** One export as the host saves it. */
export interface IdeExportFile {
  /** The modeler's export format, such as `png`, `png-transparent`, `svg` or `json`. */
  format: string;
  suggestedName: string;
  mimeType: string;
  /** Text, or the bytes of a picture. */
  data: string | Blob;
  /** The labels came out in the system font because Geist could not be embedded. */
  fontFallback?: boolean | undefined;
}

export interface IdeDocumentOptions {
  importText(text: string, context: DocumentImportContext): Promise<boolean>;
  exportText(reconciledText: string): string;
  canWrite(): boolean;
  /** VS Code's Command Palette and editor title commands, by name. */
  commands: Readonly<Record<string, () => unknown>>;
  /** The empty-file hint's example, for a host that inserts it in the editor (Orca). */
  withExampleInserted?: ((text: string) => string) | undefined;
}

export interface IdeDocument {
  readonly pushEdit: () => void;
  /** Resolves once the first text was imported or refused. */
  readonly ready: Promise<void>;
  readonly imported: () => Promise<void>;
  /** Whether the host opened the document read-only. */
  readonly readOnly: boolean;
  /** The empty-file hint's "Insert example". */
  readonly insertExample: () => void;
  readonly disconnect: () => void;
}

/** What the host keeps of an editor between sessions. */
export interface IdeEditorState {
  /** The view of the last session of this document; VS Code only. */
  readonly view?: ViewportState | undefined;
  readonly legendOpen?: boolean | undefined;
  writeLegendOpen(open: boolean): void;
  /** One of the modeler's own keys, such as a view option. */
  read(key: string): unknown;
  write(key: string, value: unknown): void;
  /** Keeps the view up to date where the host can keep it; returns the stop function. */
  persistView(viewport: Viewport): () => void;
}

/**
 * The IDE around an editor: `vsCodeEditorHost()` of `./vscode/webview`, `orcaEditorHost()` of
 * `./orca/webview`.
 */
export interface IdeEditorHost {
  readonly kind: "vscode" | "orca";
  /** Whether the canvas binds Cmd/Ctrl+Z: VS Code's document keeps the history, Orca keeps none. */
  readonly canvasOwnsHistory: boolean;
  readonly state: IdeEditorState;
  mountShell(root: HTMLElement, options: IdeShellOptions): ShellHandle;
  connectDocument(shell: ShellHandle, options: IdeDocumentOptions): Promise<IdeDocument>;
  /** Saves an export the user asked for: VS Code's save dialog, or Orca's. */
  saveExport(file: IdeExportFile): Promise<void>;
  /** A notification for an action the user took (guide §13.5). */
  notify(severity: "info" | "error", message: string): void;
}

/** The renderer's contract instance with its diagram-js modeler, as `createCollaborativeModeler` returns it. */
export type IdeCollaborativeModeler = CollaborativeModelerLike & {
  readonly diagram: InjectorLike & { readonly container: HTMLElement };
  importText(text: string): Promise<unknown>;
  exportText(): string;
  onContentChanged(listener: () => void): unknown;
};

export interface IdeModelerOptions {
  additionalModules: ModuleDeclarationLike[];
  /** `false` where the IDE's document owns the history. */
  undoRedoKeys: boolean;
  /** The shell's free area, for `freeArea: { insets }`. */
  fitInsets(): Insets;
  /** The free area's centre once the canvas is connected, for `freeArea: { center }`. */
  freeRectCenter(): Point | undefined;
}

export interface IdeExportResult {
  data: string | Blob;
  fontFallback?: boolean | undefined;
}

export interface IdeExportDefinition<M extends IdeCollaborativeModeler> {
  suggestedName: string;
  mimeType: string;
  /** The notification when `produce` throws. */
  failure: string;
  /** Hides the selection outlines while it runs (the picture shows the diagram, not the selection). */
  picture?: boolean | undefined;
  produce(modeler: M): Promise<IdeExportResult> | IdeExportResult;
}

export interface IdeEditorContext<M extends IdeCollaborativeModeler> {
  readonly host: IdeEditorHost;
  readonly shell: ShellHandle;
  readonly modeler: M;
  readonly connection: DiagramJsConnection;
  /** The menu entry of an export of `IdeEditorDefinition.exports`. */
  exportAction(format: string): { onSelect(): void };
  /** Builds the menu again from `IdeEditorDefinition.menu`. */
  refreshMenu(): void;
}

/** Everything a modeler's IDE editor is, apart from the host: one per modeler, shared by its VS Code and Orca entries. */
export interface IdeEditorDefinition<M extends IdeCollaborativeModeler> {
  /** The canvas's label and the subject of the invalid-file status, such as "Event Storming board". */
  name: string;
  themes: readonly Theme[];
  createModeler(options: IdeModelerOptions): M;
  /** Locks the canvas while the file is invalid or read-only; `delayMs` delays its marks. */
  setCanvasReadOnly(modeler: M, readOnly: boolean, options?: { delayMs?: number }): void;
  isEmpty(modeler: M): boolean;
  /** The menu; reads `context.shell` and `context.connection` only in its actions, which run after the mount. */
  menu(context: IdeEditorContext<M>): MenuGroups;
  /**
   * Whether `text` describes the document the canvas shows (`exported`, or `reconciledText`, the
   * text it showed last), so no import is needed.
   */
  sameText(text: string, exported: string, reconciledText: string): boolean;
  /** The document as the canvas shows it; default `modeler.exportText()`. */
  exportText?: ((modeler: M, reconciledText: string) => string) | undefined;
  exports: Readonly<Record<string, IdeExportDefinition<M>>>;
  /** The empty-file hint's example inserted into `text`, for a host that inserts it itself. */
  withExampleInserted?: ((text: string) => string) | undefined;
  /** Shell options of the modeler's own: a legend, an inspector. */
  shellOptions?: ((modeler: M, host: IdeEditorHost) => Partial<IdeShellOptions>) | undefined;
  /**
   * After an import the canvas accepted, its view set: what the modeler keeps of the imported
   * document, or a fit of its own (`wasEmpty`: the canvas held no element before the import).
   */
  imported?:
    | ((context: IdeEditorContext<M>, import_: { first: boolean; wasEmpty: boolean }) => void)
    | undefined;
  /** Whatever the modeler adds once the shell is up; returns its teardown. */
  afterMount?: ((context: IdeEditorContext<M>) => (() => void) | void) | undefined;
}

export interface IdeEditorHandle<M extends IdeCollaborativeModeler> {
  readonly shell: ShellHandle;
  readonly modeler: M;
  readonly connection: DiagramJsConnection;
  /** Resolves once the first text was imported or refused. */
  readonly ready: Promise<void>;
  readonly document: Promise<IdeDocument>;
}

interface DiagramElement {
  id: string;
}
interface SelectionLike {
  get(): DiagramElement[];
  select(elements: DiagramElement[] | null): void;
}
interface ElementRegistryLike {
  get(id: string): DiagramElement | undefined;
}
interface EventBusLike {
  on(event: string, listener: () => void): void;
}

function optionalService<T>(diagram: InjectorLike, name: string): T | undefined {
  try {
    return diagram.get<T>(name);
  } catch {
    return undefined;
  }
}

function commandName(format: string): string {
  return `export${format
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")}`;
}

/**
 * Mounts a modeler's IDE editor into `#app` (or `root`): the diagram, the shell through the host,
 * the diagram-js connection, the document sync and the exports. Imports keep the view and the
 * selection, the first one takes the view the host kept; an invalid text locks canvas and shell and
 * shows the status after `INVALID_STATUS_DELAY_MS`.
 */
export function mountIdeEditor<M extends IdeCollaborativeModeler>(
  host: IdeEditorHost,
  definition: IdeEditorDefinition<M>,
  root: HTMLElement | null = document.getElementById("app"),
): IdeEditorHandle<M> {
  if (!root) throw new Error("@miragon/modeler-shell: the editor HTML has no #app root");

  const modeler = definition.createModeler({
    additionalModules: [shellModule],
    undoRedoKeys: host.canvasOwnsHistory,
    fitInsets: () => shell.fitInsets(),
    freeRectCenter: () => connection?.viewport.freeRectCenter(),
  });
  const { diagram } = modeler;
  diagram.get("canvas");
  const selection = optionalService<SelectionLike>(diagram, "selection");
  const registry = diagram.get<ElementRegistryLike>("elementRegistry");

  const selectedIds = (): string[] => selection?.get().map((element) => element.id) ?? [];
  const reselect = (ids: readonly string[]): void => {
    const elements = ids
      .map((id) => registry.get(id))
      .filter((element): element is DiagramElement => element !== undefined);
    if (elements.length) selection?.select(elements);
  };
  async function withoutSelection<T>(task: () => Promise<T>): Promise<T> {
    const ids = selectedIds();
    selection?.select(null);
    try {
      return await task();
    } finally {
      reselect(ids);
    }
  }

  async function runExport(format: string): Promise<void> {
    const exported = definition.exports[format];
    if (!exported) throw new Error(`@miragon/modeler-shell: no export "${format}"`);
    try {
      const produce = async (): Promise<IdeExportResult> => exported.produce(modeler);
      const result = exported.picture ? await withoutSelection(produce) : await produce();
      await host.saveExport({
        format,
        suggestedName: exported.suggestedName,
        mimeType: exported.mimeType,
        data: result.data,
        fontFallback: result.fontFallback,
      });
    } catch (error) {
      console.error(`[${format}-export]`, error);
      host.notify("error", exported.failure);
    }
  }

  let documentConnection: IdeDocument | undefined;
  let connection: DiagramJsConnection;
  const context: IdeEditorContext<M> = {
    host,
    get shell() {
      return shell;
    },
    modeler,
    get connection() {
      return connection;
    },
    exportAction: (format) => ({ onSelect: () => void runExport(format) }),
    refreshMenu: () => shell.menu.setGroups(definition.menu(context)),
  };

  const shell = host.mountShell(root, {
    themes: definition.themes,
    canvas: diagram.container,
    messages: { canvas: definition.name },
    emptyHint: { onInsertExample: () => documentConnection?.insertExample() },
    ...definition.shellOptions?.(modeler, host),
    menu: definition.menu(context),
  });
  connection = connectDiagramJs(shell, diagram, {
    modeler,
    isEmpty: () => definition.isEmpty(modeler),
    canvasOwnsHistory: host.canvasOwnsHistory,
  });
  const { viewport } = connection;
  const stopPersistingView = host.state.persistView(viewport);

  function lock(readOnly: boolean, delayMs?: number): void {
    const options = delayMs === undefined ? undefined : { delayMs };
    definition.setCanvasReadOnly(modeler, readOnly, options);
    shell.setReadOnly(readOnly, options);
  }
  function showValid(): void {
    lock(documentConnection?.readOnly === true);
    shell.setStatus(null);
    shell.setEmptyHint(definition.isEmpty(modeler));
  }
  function showInvalid(): void {
    lock(true, INVALID_STATUS_DELAY_MS);
    shell.setEmptyHint(false);
    shell.setStatus(
      { severity: "danger", text: shell.messages.invalidFile(definition.name) },
      { delayMs: INVALID_STATUS_DELAY_MS },
    );
  }

  async function importText(
    text: string,
    { first, reconciledText }: DocumentImportContext,
  ): Promise<boolean> {
    if (!first && definition.sameText(text, modeler.exportText(), reconciledText)) {
      showValid();
      return true;
    }
    const keep = first ? undefined : viewport.getViewbox();
    const selected = first ? [] : selectedIds();
    const wasEmpty = definition.isEmpty(modeler);
    try {
      await modeler.importText(text);
      showValid();
      if (keep) viewport.restore(keep);
      else if (first && host.state.view) viewport.setState(host.state.view);
      reselect(selected);
      viewport.afterImport();
      definition.imported?.(context, { first, wasEmpty });
      context.refreshMenu();
      return true;
    } catch {
      showInvalid();
      return false;
    }
  }

  diagram.get<EventBusLike>("eventBus").on("commandStack.changed", () => context.refreshMenu());
  const stopExtras = definition.afterMount?.(context);
  diagram.get<EventBusLike>("eventBus").on("diagram.destroy", () => {
    stopExtras?.();
    stopPersistingView();
    documentConnection?.disconnect();
  });

  const commands: Record<string, () => unknown> = { fitView: () => viewport.fit() };
  for (const format of Object.keys(definition.exports)) {
    commands[commandName(format)] = () => runExport(format);
  }

  const documentReady = host.connectDocument(shell, {
    importText,
    exportText: (reconciledText) =>
      definition.exportText ? definition.exportText(modeler, reconciledText) : modeler.exportText(),
    canWrite: () => !shell.isReadOnly(),
    commands,
    withExampleInserted: definition.withExampleInserted,
  });
  const ready = documentReady.then(async (connected) => {
    documentConnection = connected;
    modeler.onContentChanged(connected.pushEdit);
    await connected.ready;
    if (connected.readOnly) lock(true);
  });

  return { shell, modeler, connection, ready, document: documentReady };
}
