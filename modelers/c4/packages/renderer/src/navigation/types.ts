import type { C4ModelingMethods, C4Views } from "../services.js";

/** What a dialog of guide §8 takes to open: the shell's `ShellDialogOptions`, structurally. */
export interface DialogOptions {
  readonly container: HTMLElement;
  readonly title: string;
  readonly className?: string;
  render(body: HTMLElement): void;
  onClose?(): void;
  focusFallback?(): void;
}

/** An open dialog: the shell's `ShellDialog`, structurally. */
export interface OpenedDialog {
  isOpen(): boolean;
  close(): void;
}

/** The shell's `openShellDialog`, structurally: the renderer never imports the shell. */
export type OpenDialog = (options: DialogOptions) => OpenedDialog;

/**
 * Where the modeler's dialogs open: `{ container: shell.root, openDialog: openShellDialog }` with a
 * mounted shell, the modeler's own element in an embedding host without one.
 */
export interface DialogChrome {
  readonly container: HTMLElement;
  readonly openDialog: OpenDialog;
}

/**
 * What the dialogs read and edit. A `CollaborativeDiagram` fits; inside the diagram the dialog
 * service builds one from its services.
 */
export interface C4DialogModeler {
  readonly views: Pick<C4Views, "active" | "catalog" | "open" | "parent">;
  readonly c4: C4ModelingMethods;
  readonly diagram: { get<T>(name: string): T };
}

export interface DialogTarget extends DialogChrome {
  readonly modeler: C4DialogModeler;
}
