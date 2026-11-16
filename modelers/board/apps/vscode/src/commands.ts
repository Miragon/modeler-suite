import * as vscode from "vscode";
import {
  registerNewDocumentCommand,
  type ModelerEditorRegistration,
  type NewDocumentOptions,
  type VsCodeFilesLike,
} from "@miragon/modeler-shell/vscode/extension";

import { BOARD_VIEW_TYPE } from "./boardEditorOptions.js";
import { EXAMPLE } from "./example-files.js";
import { keptMessage, writeExample } from "./example.js";

export const NEW_BOARD_COMMAND = "board.newBoard";
export const NEW_BOARD_FROM_EXAMPLE_COMMAND = "board.newBoardFromExample";
/** Text and board side by side (guide §13.5), from the editor title of the board. */
export const OPEN_SOURCE_COMMAND = "board.openSource";

export const NO_BOARD_MESSAGE = "Open a board in the board editor first.";

const NEW_BOARD = {
  viewType: BOARD_VIEW_TYPE,
  title: "New Board",
  saveLabel: "Create board",
  filters: { Board: ["board"] },
  defaultFileName: "untitled.board",
  // the board's editor claims *.board alone
  targetPath: (chosenPath: string) =>
    /\.board$/i.test(chosenPath) ? chosenPath : `${chosenPath}.board`,
  // an empty file is a new board: the board writes its header with the first change
  text: "",
} satisfies NewDocumentOptions;

/**
 * The shell's "New … from Example" with one thing of the board's own: the example is a folder
 * of files, not one text. The shell's command still asks where the board goes, asks before it
 * replaces, says when it could not write and opens the board; its one write, of the file the
 * person picked, is the example written around that file, whatever text the shell hands it.
 */
function writingTheExample(): VsCodeFilesLike<vscode.Uri> {
  return {
    window: vscode.window,
    commands: vscode.commands,
    Uri: vscode.Uri,
    workspace: {
      get workspaceFolders() {
        return vscode.workspace.workspaceFolders;
      },
      fs: {
        stat: (uri) => vscode.workspace.fs.stat(uri),
        async writeFile(board) {
          const { kept } = await writeExample(vscode, EXAMPLE, board);
          const message = keptMessage(kept);
          if (message !== undefined) void vscode.window.showInformationMessage(message);
        },
      },
    },
  };
}

/**
 * An editor title button passes the editor's resource; the Command Palette and a walkthrough
 * link pass nothing, and the command then means the board that had the focus last.
 */
function resourceArgument(argument: unknown): vscode.Uri | undefined {
  return argument instanceof vscode.Uri ? argument : undefined;
}

/**
 * Shows a board's tab that VS Code restored after a reload and returns its document. VS Code
 * resolves a restored tab only once it is shown, so until then the editor knows no panel of it.
 * A tab in the active group comes first (a walkthrough is restored in front of it), then the
 * tab each group shows, then any other.
 */
export async function revealRestoredTab(viewType: string): Promise<vscode.Uri | undefined> {
  const { activeTabGroup, all } = vscode.window.tabGroups;
  const tabs = [
    ...activeTabGroup.tabs,
    ...all.flatMap((group) => (group.activeTab ? [group.activeTab] : [])),
    ...all.flatMap((group) => group.tabs),
  ];
  for (const tab of tabs) {
    const input = tab.input;
    if (input instanceof vscode.TabInputCustom && input.viewType === viewType) {
      await vscode.commands.executeCommand(
        "vscode.openWith",
        input.uri,
        viewType,
        tab.group.viewColumn,
      );
      return input.uri;
    }
  }
  return undefined;
}

/**
 * New Board, New Board from Example and Open Source to the Side. `editors` is the board's
 * registration: it knows which board had the focus last.
 */
export function registerBoardCommands(
  editors: Pick<ModelerEditorRegistration<vscode.TextDocument>, "revealActiveDocument">,
): vscode.Disposable[] {
  return [
    registerNewDocumentCommand(vscode, NEW_BOARD_COMMAND, NEW_BOARD),
    registerNewDocumentCommand(writingTheExample(), NEW_BOARD_FROM_EXAMPLE_COMMAND, {
      ...NEW_BOARD,
      title: "New Board from Example",
      defaultFileName: "example.board",
    }),
    vscode.commands.registerCommand(OPEN_SOURCE_COMMAND, async (argument?: unknown) => {
      const uri =
        resourceArgument(argument) ??
        editors.revealActiveDocument() ??
        (await revealRestoredTab(BOARD_VIEW_TYPE));
      if (!uri) return void vscode.window.showInformationMessage(NO_BOARD_MESSAGE);
      return vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        "default",
        vscode.ViewColumn.Beside,
      );
    }),
  ];
}
