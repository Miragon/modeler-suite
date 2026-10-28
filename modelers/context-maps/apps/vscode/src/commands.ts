import * as vscode from "vscode";
import type { WebviewCommand } from "./protocol.js";

export const MAP_VIEW_TYPE = "contextMaps.editor";
export const PNG_VIEW_TYPE = "contextMaps.pngEditor";

export const WEBVIEW_COMMANDS: Readonly<Record<WebviewCommand, string>> = {
  fitView: "contextMaps.fitView",
  exportPng: "contextMaps.exportPng",
  exportSvg: "contextMaps.exportSvg",
  exportJson: "contextMaps.exportJson",
  exportCml: "contextMaps.exportCml",
};

export const NO_MAP_MESSAGE = "Open a Context Maps diagram in the diagram editor first.";

/** Text and diagram side by side (guide §13.5), from the editor title of either editor. */
export const OPEN_SOURCE_COMMAND = "contextMaps.openSource";
export const OPEN_DIAGRAM_COMMAND = "contextMaps.openDiagram";

/**
 * Editor title buttons pass the editor's resource; the Command Palette and a walkthrough link pass
 * nothing, so the caller falls back to the text diagram focused last (Open Source to the Side) or
 * the focused text editor (Open Diagram to the Side).
 */
function resourceArgument(argument: unknown): vscode.Uri | undefined {
  return argument instanceof vscode.Uri ? argument : undefined;
}

export function registerSideBySideCommands(
  activeMapUri: () => vscode.Uri | undefined,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(OPEN_SOURCE_COMMAND, (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? activeMapUri();
      if (!uri) return void vscode.window.showInformationMessage(NO_MAP_MESSAGE);
      return vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        "default",
        vscode.ViewColumn.Beside,
      );
    }),
    vscode.commands.registerCommand(OPEN_DIAGRAM_COMMAND, (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri) return undefined;
      return vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        MAP_VIEW_TYPE,
        vscode.ViewColumn.Beside,
      );
    }),
  ];
}

/**
 * The Command Palette commands run the same handlers as the webview menu (guide §13.5): the
 * command only forwards its name to the focused diagram. `runCommand` returns false when no
 * diagram editor is focused (a keybinding of the user's own can still invoke the command then).
 */
export function registerWebviewCommands(
  runCommand: (name: WebviewCommand) => boolean,
): vscode.Disposable[] {
  return (Object.keys(WEBVIEW_COMMANDS) as WebviewCommand[]).map((name) =>
    vscode.commands.registerCommand(WEBVIEW_COMMANDS[name], () => {
      if (!runCommand(name)) void vscode.window.showInformationMessage(NO_MAP_MESSAGE);
    }),
  );
}

interface TrackedPanel {
  readonly panel: vscode.WebviewPanel;
  readonly uri: vscode.Uri;
  /** A text document: it has a source to open beside the diagram. */
  readonly text: boolean;
}

/**
 * Tracks the diagram webviews of the text and the PNG editor: the focused one, so Command Palette
 * commands reach it, and the order they were focused in, so Open Source to the Side finds a diagram
 * after a walkthrough link took the focus.
 */
export class ActivePanels {
  private active: TrackedPanel | undefined;
  /** The open diagrams of both editors, the one focused last first. */
  private readonly byFocus: TrackedPanel[] = [];

  /** Follows `panel` until it is disposed. */
  track(
    panel: vscode.WebviewPanel,
    documentUri: vscode.Uri,
    { text }: { text: boolean },
  ): vscode.Disposable {
    const tracked: TrackedPanel = { panel, uri: documentUri, text };
    if (panel.active) {
      this.active = tracked;
      this.byFocus.unshift(tracked);
    } else {
      this.byFocus.push(tracked);
    }
    const viewState = panel.onDidChangeViewState(() => {
      if (panel.active) {
        this.active = tracked;
        this.bringToFront(tracked);
      } else if (this.active === tracked) {
        this.active = undefined;
      }
    });
    return new vscode.Disposable(() => {
      viewState.dispose();
      if (this.active === tracked) this.active = undefined;
      this.forget(tracked);
    });
  }

  private forget(tracked: TrackedPanel): void {
    const index = this.byFocus.indexOf(tracked);
    if (index !== -1) this.byFocus.splice(index, 1);
  }

  private bringToFront(tracked: TrackedPanel): void {
    this.forget(tracked);
    this.byFocus.unshift(tracked);
  }

  /**
   * The text document of the focused diagram, else of the text diagram focused last: a link in the
   * walkthrough takes the focus from the diagram it means. A focused PNG diagram has no text.
   */
  activeTextDocumentUri(): vscode.Uri | undefined {
    if (this.active) return this.active.text ? this.active.uri : undefined;
    return this.byFocus.find((tracked) => tracked.text)?.uri;
  }

  /**
   * Forwards a Command Palette command to the focused diagram, never to one focused earlier; false
   * when none is focused.
   */
  runCommand(name: WebviewCommand): boolean {
    if (!this.active) return false;
    void this.active.panel.webview.postMessage({ type: "command", name });
    return true;
  }
}
