import { describe, expect, test, vi } from "vitest";
import { webColumn, type ColumnActions } from "../src/column.js";

const PAGE = { komet: "/mark.svg", openKey: "Ctrl+O", saveKey: "Ctrl+S" };

const spy = () => vi.fn<() => void>();

function actions(): { [Action in keyof ColumnActions]: ReturnType<typeof spy> } {
  return {
    startBoard: spy(),
    newBoard: spy(),
    pickFile: spy(),
    showExample: spy(),
    resetExample: spy(),
    download: spy(),
  };
}

/** an action entry of a menu group as far as these tests read it */
interface Entry {
  kind: string;
  id: string;
  label: string;
  shortcut?: string | undefined;
  keepEnabledWhenReadOnly?: boolean | undefined;
  onSelect(): void;
}

describe("the shell's web column for a board", () => {
  test("has the File group's three entries, each on its action, and Open with its key", () => {
    const on = actions();
    const { file } = webColumn("board", false, PAGE, on);

    expect(Object.keys(file).sort()).toEqual(["newDiagram", "open", "showExample"]);
    expect(file.open?.shortcut).toBe("Ctrl+O");
    file.newDiagram?.onSelect();
    file.open?.onSelect();
    file.showExample?.onSelect();
    expect([on.newBoard, on.pickFile, on.showExample].map((spy) => spy.mock.calls.length)).toEqual([
      1, 1, 1,
    ]);
  });

  test("downloads the board from the Export group, under the key the page binds", () => {
    const on = actions();
    const entries = webColumn("board", false, PAGE, on).export as readonly Entry[];

    expect(entries.map(({ kind, id, label, shortcut }) => ({ kind, id, label, shortcut }))).toEqual(
      [{ kind: "action", id: "export-board", label: "Export as .board", shortcut: "Ctrl+S" }],
    );
    entries[0]?.onSelect();
    expect(on.download).toHaveBeenCalledTimes(1);
  });

  test("links the modeler's folder in the legal line", () => {
    expect(webColumn("board", false, PAGE, actions()).legal.links).toEqual([
      {
        label: "GitHub",
        href: "https://github.com/Miragon/modeler-suite/tree/main/modelers/board",
      },
    ]);
  });

  test("names the app on the start screen, with the page's mark and no third button", () => {
    const on = actions();
    const { emptyState } = webColumn("board", true, PAGE, on);

    expect(emptyState.title).toBe("Modeler Board");
    expect(emptyState.text).toBe("Start a new diagram, or explore the example.");
    expect(emptyState.komet).toBe("/mark.svg");
    expect(emptyState.dropHint).toBeUndefined();
    emptyState.onShowExample?.();
    expect(on.showExample).toHaveBeenCalledTimes(1);
    // the empty board behind the card is the new board: nothing is mounted for it
    emptyState.onNewDiagram();
    expect(on.startBoard).toHaveBeenCalledTimes(1);
    expect(on.newBoard).not.toHaveBeenCalled();
  });

  test("says whether the page starts on the start screen", () => {
    expect(webColumn("board", true, PAGE, actions()).startScreen).toBe(true);
    expect(webColumn("example", false, PAGE, actions()).startScreen).toBe(false);
  });
});

describe("what differs between the example and a board without a repository", () => {
  test("the example can be reset from the Model group, and keeps the editor's own hint", () => {
    const on = actions();
    const column = webColumn("example", false, PAGE, on);
    const entries = column.model as readonly Entry[];

    expect(entries.map(({ kind, id, label }) => ({ kind, id, label }))).toEqual([
      { kind: "action", id: "reset-example", label: "Reset the example" },
    ]);
    entries[0]?.onSelect();
    expect(on.resetExample).toHaveBeenCalledTimes(1);
    // the way out of a board that is locked stays open
    expect(entries[0]?.keepEnabledWhenReadOnly).toBe(true);
    expect(column.emptyHint).toBeUndefined();
  });

  test("a board has nothing to reset, and a hint that names no model", () => {
    const column = webColumn("board", false, PAGE, actions());

    expect(column.model).toEqual([]);
    expect(column.emptyHint).toBe("Add a note or a group from the toolbar to start.");
  });
});
