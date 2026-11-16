import type { TextDocumentLike } from "@miragon/modeler-shell/vscode/extension";
import { describe, expect, test } from "vitest";

import {
  AFTER_DELAY_SAVE,
  createMemoryVsCode,
  MemoryUri,
  type MemoryDocument,
  type MemoryVsCode,
} from "../src/files/memory-vscode.js";
import type { SavableDocumentLike, WillSaveEventLike } from "../src/files/vscode-like.js";
import { saveModelsWithBoard } from "../src/saveModels.js";

/**
 * "Save the models with the board" against the fake VS Code: which save of a board saves its
 * models, and which does not. What a board's page wrote is the backend's to say; here it is a
 * list the test names.
 */

const BOARD = "/repo/a.board";
const TEA = "/repo/models/tea.owm";
const TEAM = "/repo/models/team.tt";
const FOCUS_OUT_SAVE = 3;

const FILES = { [BOARD]: "", [TEA]: "title Tea\n", [TEAM]: "team\n" };

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface Saving {
  readonly memory: MemoryVsCode;
  /** the setting, which a test turns off and on */
  setting: { on: boolean };
  /** every save VS Code started and finished, in order */
  readonly saves: string[];
  readonly saving: Set<string>;
  dispose(): void;
}

/** an open board whose page wrote the two models: both are unsaved */
async function saving(written: readonly string[] = [TEA, TEAM]): Promise<Saving> {
  const memory = createMemoryVsCode(FILES, { workspaceFolders: ["/repo"] });
  const { workspace } = memory.vscode;
  for (const path of [BOARD, TEA, TEAM]) await workspace.openTextDocument(MemoryUri.file(path));
  for (const path of written) memory.type(path, `${memory.document(path)?.getText()}edited\n`);
  const saves: string[] = [];
  workspace.onWillSaveTextDocument(({ document, reason }) =>
    saves.push(`will ${document.uri.path} ${reason}`),
  );
  workspace.onDidSaveTextDocument((document) => saves.push(`did ${document.uri.path}`));
  const setting = { on: true };
  const shared = new Set<string>();
  const saver = saveModelsWithBoard(memory.vscode, {
    board: MemoryUri.file(BOARD),
    enabled: () => setting.on,
    unsaved: () =>
      written.flatMap((path) => {
        const document = memory.document(path);
        return document?.isDirty ? [document] : [];
      }),
    saving: shared,
  });
  return { memory, setting, saves, saving: shared, dispose: () => saver.dispose() };
}

const onDisk = (memory: MemoryVsCode, path: string): string | undefined => memory.disk.text(path);

describe("saving the models with their board", () => {
  test("saves every model the board made dirty once a person saved the board, after the board's own save", async () => {
    const { memory, saves } = await saving();
    memory.type(BOARD, '{"id":"n1"}\n');
    expect(memory.save(BOARD)).toBe(true);
    // nothing inside the board's will-save: the models are asked for once the board is saved
    expect(saves).toEqual([`will ${BOARD} 1`, `did ${BOARD}`]);
    await settled();
    expect(saves).toEqual([
      `will ${BOARD} 1`,
      `did ${BOARD}`,
      `will ${TEA} 1`,
      `did ${TEA}`,
      `will ${TEAM} 1`,
      `did ${TEAM}`,
    ]);
    expect(onDisk(memory, TEA)).toBe("title Tea\nedited\n");
    expect(onDisk(memory, TEAM)).toBe("team\nedited\n");
    expect(memory.document(TEA)).toMatchObject({ isDirty: false });
  });

  test("also where the board itself has nothing to save: VS Code saves a clean board a person asks it to", async () => {
    const { memory } = await saving();
    expect(memory.document(BOARD)).toMatchObject({ isDirty: false });
    memory.save(BOARD);
    await settled();
    expect(onDisk(memory, TEA)).toBe("title Tea\nedited\n");
  });

  test("saves nothing for auto save and nothing for a save on a lost focus: only a person's own save counts", async () => {
    const { memory, saves } = await saving();
    memory.type(BOARD, '{"id":"n1"}\n');
    memory.save(BOARD, AFTER_DELAY_SAVE);
    memory.type(BOARD, '{"id":"n2"}\n');
    memory.save(BOARD, FOCUS_OUT_SAVE);
    await settled();
    expect(saves).toEqual([
      `will ${BOARD} ${AFTER_DELAY_SAVE}`,
      `did ${BOARD}`,
      `will ${BOARD} ${FOCUS_OUT_SAVE}`,
      `did ${BOARD}`,
    ]);
    expect(memory.document(TEA)).toMatchObject({ isDirty: true });
    expect(onDisk(memory, TEA)).toBe("title Tea\n");
  });

  test("saves nothing while the setting is off, and asks the setting at every save", async () => {
    const { memory, setting } = await saving();
    setting.on = false;
    memory.save(BOARD);
    await settled();
    expect(memory.document(TEA)).toMatchObject({ isDirty: true });
    setting.on = true;
    memory.save(BOARD);
    await settled();
    expect(memory.document(TEA)).toMatchObject({ isDirty: false });
  });

  test("saves nothing when a person saves another file: the moment is the board's save alone", async () => {
    const { memory, saves } = await saving();
    memory.save(TEA);
    await settled();
    expect(saves).toEqual([`will ${TEA} 1`, `did ${TEA}`]);
    expect(memory.document(TEAM)).toMatchObject({ isDirty: true });
  });

  test("leaves a model unsaved whose file is newer on disk, where VS Code says why, and saves the others", async () => {
    const { memory } = await saving();
    memory.disk.write(TEA, "title Tea from Git\n");
    memory.save(BOARD);
    await settled();
    expect(memory.document(TEA)).toMatchObject({ isDirty: true });
    expect(memory.document(TEA)?.getText()).toBe("title Tea\nedited\n");
    expect(onDisk(memory, TEA)).toBe("title Tea from Git\n");
    expect(memory.notices).toEqual(["Failed to save 'tea.owm': The content of the file is newer."]);
    expect(memory.document(TEAM)).toMatchObject({ isDirty: false });
  });

  test("goes on with the others where one save throws", async () => {
    const memory = createMemoryVsCode(FILES, { workspaceFolders: ["/repo"] });
    await memory.vscode.workspace.openTextDocument(MemoryUri.file(BOARD));
    const team = await memory.vscode.workspace.openTextDocument(MemoryUri.file(TEAM));
    memory.type(TEAM, "team\nedited\n");
    const broken: SavableDocumentLike = {
      ...(team as MemoryDocument),
      uri: MemoryUri.file(TEA),
      save: () => Promise.reject(new Error("the extension host is busy")),
    };
    const shared = new Set<string>();
    saveModelsWithBoard(memory.vscode, {
      board: MemoryUri.file(BOARD),
      enabled: () => true,
      unsaved: () => [broken, team as MemoryDocument],
      saving: shared,
    });
    memory.save(BOARD);
    await settled();
    expect(memory.document(TEAM)).toMatchObject({ isDirty: false });
    expect(shared.size).toBe(0);
  });

  test("leaves a model unsaved whose file is not there, where the host says so, and saves the others", async () => {
    const memory = createMemoryVsCode(FILES, { workspaceFolders: ["/repo"] });
    const { workspace } = memory.vscode;
    for (const path of [BOARD, TEA, TEAM]) await workspace.openTextDocument(MemoryUri.file(path));
    for (const path of [TEA, TEAM]) memory.type(path, "edited\n");
    const asked: string[] = [];
    saveModelsWithBoard(memory.vscode, {
      board: MemoryUri.file(BOARD),
      enabled: () => true,
      unsaved: () => [memory.document(TEA), memory.document(TEAM)].flatMap((one) => one ?? []),
      saving: new Set<string>(),
      fileThere(document) {
        asked.push(String(document.uri.path));
        return Promise.resolve(document.uri.path !== TEA);
      },
    });
    memory.save(BOARD);
    await settled();
    expect(asked).toEqual([TEA, TEAM]);
    expect(memory.document(TEA)).toMatchObject({ isDirty: true });
    expect(onDisk(memory, TEA)).toBe("title Tea\n");
    expect(memory.document(TEAM)).toMatchObject({ isDirty: false });
  });

  test("leaves a model to the save that is on its way: one that is being saved is not saved a second time", async () => {
    const { memory, saves, saving: shared } = await saving();
    shared.add(MemoryUri.file(TEA).toString());
    memory.save(BOARD);
    await settled();
    expect(saves).toEqual([`will ${BOARD} 1`, `did ${BOARD}`, `will ${TEAM} 1`, `did ${TEAM}`]);
    // and the name stays with whoever put it there
    expect([...shared]).toEqual([MemoryUri.file(TEA).toString()]);
  });

  test("forgets a save a person asked for that never went through: the auto save after it saves no model", async () => {
    const { memory, saves } = await saving();
    memory.type(BOARD, '{"id":"n1"}\n');
    memory.disk.write(BOARD, '{"id":"from Git"}\n');
    // the board's file is newer on disk: VS Code asks its listeners and then saves nothing
    expect(memory.save(BOARD)).toBe(false);
    memory.revert(BOARD);
    memory.type(BOARD, '{"id":"n2"}\n');
    expect(memory.save(BOARD, AFTER_DELAY_SAVE)).toBe(true);
    await settled();
    expect(saves).toEqual([`will ${BOARD} 1`, `will ${BOARD} ${AFTER_DELAY_SAVE}`, `did ${BOARD}`]);
    expect(memory.document(TEA)).toMatchObject({ isDirty: true });
  });

  test("hears nothing once it is disposed", async () => {
    const { memory, dispose } = await saving();
    expect(memory.listening().documents).toBe(4);
    dispose();
    expect(memory.listening().documents).toBe(2);
    memory.save(BOARD);
    await settled();
    expect(memory.document(TEA)).toMatchObject({ isDirty: true });
  });
});

describe("a did-save that no will-save came before", () => {
  test("saves no model: VS Code may leave a slow will-save listener out, and then nobody said who asked", async () => {
    const memory = createMemoryVsCode(FILES, { workspaceFolders: ["/repo"] });
    const board = await memory.vscode.workspace.openTextDocument(MemoryUri.file(BOARD));
    // VS Code's two events by hand, so that one can come without the other
    let willSave = (_event: WillSaveEventLike): unknown => undefined;
    let didSave = (_document: TextDocumentLike): unknown => undefined;
    let asked = 0;
    saveModelsWithBoard(
      {
        workspace: {
          onWillSaveTextDocument(listener) {
            willSave = listener;
            return { dispose: () => undefined };
          },
          onDidSaveTextDocument(listener) {
            didSave = listener;
            return { dispose: () => undefined };
          },
        },
      },
      {
        board: MemoryUri.file(BOARD),
        enabled: () => true,
        unsaved: () => {
          asked += 1;
          return [];
        },
        saving: new Set(),
      },
    );
    willSave({ document: board, reason: 1 });
    didSave(board);
    expect(asked).toBe(1);
    // the next save is told only when it is done
    didSave(board);
    expect(asked).toBe(1);
  });

  test("reads who asked from the board's own will-save, and waits for the board's own did-save, while VS Code saves other files at the same time", async () => {
    const memory = createMemoryVsCode(FILES, { workspaceFolders: ["/repo"] });
    const board = await memory.vscode.workspace.openTextDocument(MemoryUri.file(BOARD));
    const model = await memory.vscode.workspace.openTextDocument(MemoryUri.file(TEA));
    let willSave = (_event: WillSaveEventLike): unknown => undefined;
    let didSave = (_document: TextDocumentLike): unknown => undefined;
    let asked = 0;
    saveModelsWithBoard(
      {
        workspace: {
          onWillSaveTextDocument(listener) {
            willSave = listener;
            return { dispose: () => undefined };
          },
          onDidSaveTextDocument(listener) {
            didSave = listener;
            return { dispose: () => undefined };
          },
        },
      },
      {
        board: MemoryUri.file(BOARD),
        enabled: () => true,
        unsaved: () => {
          asked += 1;
          return [];
        },
        saving: new Set(),
      },
    );
    // auto save of the board, and a person's save of a model in between
    willSave({ document: board, reason: AFTER_DELAY_SAVE });
    willSave({ document: model, reason: 1 });
    didSave(board);
    expect(asked).toBe(0);
    // a person's save of the board: the model's did-save in between is not the moment
    willSave({ document: board, reason: 1 });
    didSave(model);
    expect(asked).toBe(0);
    didSave(board);
    expect(asked).toBe(1);
  });
});

describe("a save the extension itself makes", () => {
  /**
   * Two open boards. The first one's page wrote `second.board`, a file somebody also has open
   * in a board editor of its own, whose page wrote the model.
   */
  async function twoBoards() {
    const second = "/repo/second.board";
    const memory = createMemoryVsCode({ ...FILES, [second]: "" }, { workspaceFolders: ["/repo"] });
    for (const path of [BOARD, second, TEA]) {
      await memory.vscode.workspace.openTextDocument(MemoryUri.file(path));
    }
    memory.type(second, '{"id":"n1"}\n');
    memory.type(TEA, "title Tea\nedited\n");
    const shared = new Set<string>();
    const dirty = (path: string): MemoryDocument[] => {
      const document = memory.document(path);
      return document?.isDirty ? [document] : [];
    };
    for (const [board, wrote] of [
      [BOARD, second],
      [second, TEA],
    ] as const) {
      saveModelsWithBoard(memory.vscode, {
        board: MemoryUri.file(board),
        enabled: () => true,
        unsaved: () => dirty(wrote),
        saving: shared,
      });
    }
    return { memory, second, shared };
  }

  test("is no person's: it saves the one document and no second round, though VS Code calls it Manual", async () => {
    const { memory, second, shared } = await twoBoards();
    memory.save(BOARD);
    await settled();
    expect(memory.document(second)).toMatchObject({ isDirty: false });
    expect(memory.document(TEA)).toMatchObject({ isDirty: true });
    expect(shared.size).toBe(0);
  });

  test("is told apart from the person's save of the same file afterwards, which saves that board's models", async () => {
    const { memory, second } = await twoBoards();
    memory.save(BOARD);
    await settled();
    memory.save(second);
    await settled();
    expect(memory.document(TEA)).toMatchObject({ isDirty: false });
  });
});
