/**
 * What the page puts into the shell's web column for a document: the File group, the legal
 * line, the start screen, and its own entries of the Model and the Export group. No drop zone:
 * the board takes a dropped picture itself.
 */
import { BOARD_EXPORT_LABEL } from "board-ide-editor";
import { RESET_LABEL, type Session } from "./session.js";
import type { WebColumn } from "./web-host.js";

export const APP_NAME = "Board Modeler";
const REPOSITORY_URL = "https://github.com/Miragon/modeler-suite/tree/main/modelers/board";
// The suite's one sentence, with the word of the button beside it.
const START = "Start a new diagram, or explore the example.";
// The editor's own hint names a model, which a board without a repository cannot add.
const BOARD_HINT = "Add a note or a group from the toolbar to start.";

/** What a person asks of the page through the column. */
export interface ColumnActions {
  /** the start screen's "New diagram": the empty board behind the card is the new board */
  startBoard(): void;
  newBoard(): void;
  pickFile(): void;
  showExample(): void;
  resetExample(): void;
  download(): void;
}

/** What the column shows of the page itself. */
export interface ColumnPage {
  /** the Miragon mark of the start screen: the URL of the file in the page's public folder */
  readonly komet: string;
  /** the chips of the two keys the page binds: Cmd/Ctrl+O and Cmd/Ctrl+S */
  readonly openKey: string;
  readonly saveKey: string;
}

export function webColumn(
  kind: Session["kind"],
  startScreen: boolean,
  page: ColumnPage,
  on: ColumnActions,
): WebColumn {
  return {
    file: {
      newDiagram: { onSelect: on.newBoard },
      open: { onSelect: on.pickFile, shortcut: page.openKey },
      showExample: { onSelect: on.showExample },
    },
    legal: { links: [{ label: "GitHub", href: REPOSITORY_URL }] },
    emptyState: {
      title: APP_NAME,
      text: START,
      komet: page.komet,
      onNewDiagram: on.startBoard,
      onShowExample: on.showExample,
    },
    model:
      kind === "example"
        ? [
            {
              kind: "action",
              id: "reset-example",
              label: RESET_LABEL,
              // The way out of a board that takes no input must not be locked with it.
              keepEnabledWhenReadOnly: true,
              onSelect: on.resetExample,
            },
          ]
        : [],
    export: [
      {
        kind: "action",
        id: "export-board",
        label: BOARD_EXPORT_LABEL,
        shortcut: page.saveKey,
        onSelect: on.download,
      },
    ],
    emptyHint: kind === "board" ? BOARD_HINT : undefined,
    startScreen,
  };
}
