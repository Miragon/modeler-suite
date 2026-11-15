import { PICTURE_SUFFIXES } from "@miragon/board-files";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  createFileIndex,
  createIndexPool,
  FOLDER_LOOKS,
  LIST_REST_MS,
  type FileEvent,
  type FileIndex,
} from "../src/files/file-index.js";
import { createMemoryVsCode, MemoryUri, type MemoryVsCode } from "../src/files/memory-vscode.js";

const SUFFIXES = { models: [".owm", ".tt", ".ttm.json"], pictures: PICTURE_SUFFIXES };
const ROOT = MemoryUri.file("/repo");
const TEA = "title Tea\n";

const FILES = {
  "/repo/.git/HEAD": "",
  "/repo/.git/stash/old.owm": TEA,
  "/repo/.github/drafts/idea.owm": TEA,
  "/repo/models/tea.owm": TEA,
  "/repo/models/teams/sample.ttm.json": "{}",
  "/repo/models/notes.md": "# Notes\n",
  "/repo/assets/logo.svg": "<svg/>",
  "/repo/assets/deep/photo.png": "png",
  "/repo/assets/readme.txt": "no picture",
  "/repo/docs/figure.png": "png",
  "/repo/node_modules/pkg/example.owm": TEA,
  "/repo/packages/app/node_modules/pkg/example.tt": "",
  "/elsewhere/other.owm": TEA,
};
const LISTED = [
  "assets/deep/photo.png",
  "assets/logo.svg",
  "models/teams/sample.ttm.json",
  "models/tea.owm",
].sort();

interface Indexed {
  readonly memory: MemoryVsCode;
  readonly index: FileIndex;
  /** how often the list's listeners were told */
  told(): number;
  readonly events: Array<[path: string, event: FileEvent]>;
}

/** an index of /repo whose first search is done; the clock is the test's (fake timers) */
async function indexed(files: Record<string, string> = FILES): Promise<Indexed> {
  const memory = createMemoryVsCode(files, { workspaceFolders: ["/repo"] });
  const index = createFileIndex(memory.vscode, ROOT, SUFFIXES);
  let told = 0;
  const events: Indexed["events"] = [];
  index.onListChanged(() => (told += 1));
  index.onFile((path, event) => events.push([path, event]));
  await index.searched;
  await vi.advanceTimersByTimeAsync(LIST_REST_MS);
  told = 0;
  return { memory, index, told: () => told, events };
}

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("the file index of a repository root", () => {
  test("lists the models wherever they are and the pictures under assets, sorted, and nothing else", async () => {
    const { index, memory } = await indexed();
    expect(index.list()).toEqual(LISTED);
    // no model of an installed package, none in a dot folder, no picture outside assets, no
    // other file, nothing beside the root
    expect(memory.calls.findFiles).toEqual([
      { base: "/repo", pattern: "**/*.{owm,tt,ttm.json}", exclude: "**/node_modules/**" },
      {
        base: "/repo",
        pattern: "assets/**/*.{avif,gif,jpeg,jpg,png,svg,webp}",
        exclude: "**/node_modules/**",
      },
    ]);
  });

  test("is empty until the first search answered, and tells its listeners once when it did", async () => {
    const memory = createMemoryVsCode(FILES);
    const release = memory.holdSearches();
    const index = createFileIndex(memory.vscode, ROOT, SUFFIXES);
    let told = 0;
    index.onListChanged(() => (told += 1));
    await vi.advanceTimersByTimeAsync(10 * LIST_REST_MS);
    expect(index.list()).toEqual([]);
    expect(told).toBe(0);
    release();
    await index.searched;
    await vi.advanceTimersByTimeAsync(LIST_REST_MS);
    expect(index.list()).toEqual(LISTED);
    expect(told).toBe(1);
  });

  test("hands out the same array until the list changes", async () => {
    const { index, memory } = await indexed();
    const before = index.list();
    expect(index.list()).toBe(before);
    memory.disk.write("/repo/models/notes.md", "# Changed\n");
    memory.disk.write("/repo/models/tea.owm", "title Changed\n");
    expect(index.list()).toBe(before);
    memory.disk.write("/repo/models/new.owm", TEA);
    expect(index.list()).not.toBe(before);
    expect(Object.isFrozen(index.list())).toBe(true);
  });

  test("follows a file another program makes and one it deletes, and tells once for a burst, rested", async () => {
    const { index, memory, told } = await indexed();
    memory.disk.write("/repo/models/coffee.owm", TEA);
    await vi.advanceTimersByTimeAsync(LIST_REST_MS - 1);
    memory.disk.write("/repo/assets/new.png", "png");
    memory.disk.remove("/repo/models/tea.owm");
    await vi.advanceTimersByTimeAsync(LIST_REST_MS - 1);
    // the burst is not over: each change started the rest anew
    expect(told()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(told()).toBe(1);
    expect(index.list()).toEqual(
      [
        ...LISTED.filter((path) => path !== "models/tea.owm"),
        "assets/new.png",
        "models/coffee.owm",
      ].sort(),
    );
    await vi.advanceTimersByTimeAsync(10 * LIST_REST_MS);
    expect(told()).toBe(1);
  });

  test("lists no file a board does not show, though the watcher names it", async () => {
    const { index, memory, told } = await indexed();
    memory.disk.write("/repo/node_modules/other/x.owm", TEA);
    memory.disk.write("/repo/.vscode/x.owm", TEA);
    memory.disk.write("/repo/assets/.hidden.png", "png");
    memory.disk.write("/repo/docs/second.png", "png");
    // a picture outside assets that a person makes in VS Code, which names it to the index
    memory.explorer.create("/repo/docs/third.png", "png");
    index.created("docs/fourth.png");
    await vi.advanceTimersByTimeAsync(10 * LIST_REST_MS);
    expect(index.list()).toEqual(LISTED);
    expect(told()).toBe(0);
  });

  test("never lists a model whose suffix is written in other letters, which the search would not find, and still tells its changes", async () => {
    const { index, memory, told, events } = await indexed();
    memory.disk.write("/repo/models/SHOUT.OWM", TEA);
    memory.disk.write("/repo/assets/SCAN.PNG", "png");
    memory.disk.write("/repo/models/SHOUT.OWM", "title Changed\n");
    // a node that names the file shows it, so its text hears of the file
    expect(events).toEqual([
      ["models/SHOUT.OWM", "created"],
      ["assets/SCAN.PNG", "created"],
      ["models/SHOUT.OWM", "changed"],
    ]);
    expect(index.list()).toEqual(LISTED);
    // And a search, which finds neither, takes nothing off the list: no file is told as gone.
    memory.setWorkspaceFolders(["/repo"]);
    await vi.advanceTimersByTimeAsync(10 * LIST_REST_MS);
    expect(index.list()).toEqual(LISTED);
    expect(events).toHaveLength(3);
    expect(told()).toBe(0);
  });

  test("tells a file outside the list where the watcher names it: a text that is open there follows its file", async () => {
    const { memory, events } = await indexed();
    memory.disk.write("/repo/node_modules/pkg/example.owm", "title Changed\n");
    memory.disk.remove("/repo/node_modules/pkg/example.owm");
    memory.disk.write("/repo/node_modules/pkg/example.owm", TEA);
    expect(events).toEqual([
      ["node_modules/pkg/example.owm", "changed"],
      ["node_modules/pkg/example.owm", "deleted"],
      ["node_modules/pkg/example.owm", "created"],
    ]);
  });

  test("tells a changed file at once and by its path, and that is no change of the list", async () => {
    const { memory, told, events } = await indexed();
    memory.disk.write("/repo/models/tea.owm", "title Changed\n");
    memory.disk.write("/repo/assets/logo.svg", "<svg></svg>");
    expect(events).toEqual([
      ["models/tea.owm", "changed"],
      ["assets/logo.svg", "changed"],
    ]);
    await vi.advanceTimersByTimeAsync(10 * LIST_REST_MS);
    expect(told()).toBe(0);
  });

  test("follows a folder a person renames in VS Code: every file below it goes and comes under the new name", async () => {
    const { index, memory, told, events } = await indexed();
    const moved = [
      "assets/deep/photo.png",
      "assets/logo.svg",
      "maps/tea.owm",
      "maps/teams/sample.ttm.json",
    ].sort();
    memory.explorer.rename("/repo/models", "/repo/maps");
    expect(events).toEqual([
      ["models/tea.owm", "deleted"],
      ["models/teams/sample.ttm.json", "deleted"],
      ["maps/tea.owm", "created"],
      ["maps/teams/sample.ttm.json", "created"],
    ]);
    // at once and without a search: the event named both ends of what moved
    expect(index.list()).toEqual(moved);
    expect(memory.calls.findFiles).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(LIST_REST_MS);
    expect(told()).toBe(1);
    // The watcher's word of the new folder comes as well and is looked at like any new folder:
    // one search, which finds what the list has.
    await vi.advanceTimersByTimeAsync(10 * LIST_REST_MS);
    expect(memory.calls.findFiles).toHaveLength(4);
    expect(index.list()).toEqual(moved);
    expect(told()).toBe(1);
    expect(events).toHaveLength(4);
  });

  test("follows a folder a person deletes in VS Code, and a file a person renames into a model", async () => {
    const { index, memory, events } = await indexed();
    memory.explorer.delete("/repo/assets");
    expect(events).toEqual([
      ["assets/logo.svg", "deleted"],
      ["assets/deep/photo.png", "deleted"],
    ]);
    memory.explorer.rename("/repo/models/notes.md", "/repo/models/notes.owm");
    await vi.advanceTimersByTimeAsync(LIST_REST_MS);
    expect(index.list()).toEqual([
      "models/notes.owm",
      "models/tea.owm",
      "models/teams/sample.ttm.json",
    ]);
  });

  test("searches again for a folder a person moves into the repository in VS Code", async () => {
    const { index, memory } = await indexed({ ...FILES, "/elsewhere/maps/one.owm": TEA });
    memory.explorer.rename("/elsewhere/maps", "/repo/moved-in");
    await vi.advanceTimersByTimeAsync(LIST_REST_MS);
    expect(index.list()).toEqual([...LISTED, "moved-in/one.owm"].sort());
  });

  test("loses every file when a person deletes the root itself, or a folder above it", async () => {
    const { index, memory, events } = await indexed();
    memory.explorer.delete("/repo");
    expect(index.list()).toEqual([]);
    expect(events).toHaveLength(LISTED.length);
    expect(events.every(([, event]) => event === "deleted")).toBe(true);
  });

  test("takes the answer of the search it asked last: an older one that answers later is dropped", async () => {
    const { index, memory } = await indexed();
    const answers: Array<(found: MemoryUri[]) => void> = [];
    memory.vscode.workspace.findFiles = () => new Promise((resolve) => answers.push(resolve));
    memory.setWorkspaceFolders(["/repo"]);
    memory.setWorkspaceFolders(["/repo", "/elsewhere"]);
    // two searches of two answers each are asked; the second search answers first
    expect(answers).toHaveLength(4);
    answers[2]?.([MemoryUri.file("/repo/models/newest.owm")]);
    answers[3]?.([]);
    await vi.advanceTimersByTimeAsync(LIST_REST_MS);
    expect(index.list()).toEqual(["models/newest.owm"]);
    answers[0]?.([MemoryUri.file("/repo/models/older.owm")]);
    answers[1]?.([]);
    await vi.advanceTimersByTimeAsync(LIST_REST_MS);
    expect(index.list()).toEqual(["models/newest.owm"]);
  });

  test("searches again for a folder a person pastes in VS Code, whose files no event names", async () => {
    const { index, memory, told } = await indexed({
      ...FILES,
      "/elsewhere/maps/one.owm": TEA,
      "/elsewhere/maps/deep/two.tt": "",
    });
    memory.explorer.paste("/elsewhere/maps", "/repo/pasted");
    // the burst rests, the new entry is asked what it is, the search answers, the list rests
    await vi.advanceTimersByTimeAsync(2 * LIST_REST_MS);
    expect(index.list()).toEqual([...LISTED, "pasted/deep/two.tt", "pasted/one.owm"].sort());
    expect(told()).toBe(1);
    // VS Code's event and the watcher's word name the same folder: one question, one search
    expect(memory.calls.stat).toEqual(["/repo/pasted"]);
    expect(memory.calls.findFiles).toHaveLength(4);
  });

  test("searches again when the workspace folders change, and tells nobody when the files are the same", async () => {
    const { index, memory, told } = await indexed();
    memory.setWorkspaceFolders(["/repo", "/elsewhere"]);
    await vi.advanceTimersByTimeAsync(LIST_REST_MS);
    expect(memory.calls.findFiles).toHaveLength(4);
    expect(index.list()).toEqual(LISTED);
    expect(told()).toBe(0);
  });

  test("follows a folder another program moves: its files go at the folder's word, and a search finds them under the new name", async () => {
    const { index, memory, told, events } = await indexed();
    memory.disk.move("/repo/models", "/repo/maps");
    // The watcher names the two folders and none of the files: the old one empties the list
    // of everything below it at once.
    expect(events).toEqual([
      ["models/tea.owm", "deleted"],
      ["models/teams/sample.ttm.json", "deleted"],
    ]);
    expect(index.list()).toEqual(["assets/deep/photo.png", "assets/logo.svg"]);
    // the new one is asked what it is, and searched because it is a folder
    await vi.advanceTimersByTimeAsync(2 * LIST_REST_MS);
    expect(memory.calls.stat).toEqual(["/repo/maps"]);
    expect(index.list()).toEqual(
      [
        "assets/deep/photo.png",
        "assets/logo.svg",
        "maps/tea.owm",
        "maps/teams/sample.ttm.json",
      ].sort(),
    );
    expect(events.slice(2).sort()).toEqual([
      ["maps/tea.owm", "created"],
      ["maps/teams/sample.ttm.json", "created"],
    ]);
    expect(told()).toBe(2);
  });

  test("loses every file of a folder another program removes, at the one word VS Code has for it", async () => {
    const { index, memory, told, events } = await indexed();
    memory.disk.remove("/repo/models");
    expect(events).toEqual([
      ["models/tea.owm", "deleted"],
      ["models/teams/sample.ttm.json", "deleted"],
    ]);
    await vi.advanceTimersByTimeAsync(LIST_REST_MS);
    expect(index.list()).toEqual(["assets/deep/photo.png", "assets/logo.svg"]);
    expect(told()).toBe(1);
    // nothing was asked and nothing searched: a folder that went needs neither
    expect(memory.calls.stat).toEqual([]);
    expect(memory.calls.findFiles).toHaveLength(2);
  });

  test("lists a file whose first word is a change: VS Code missed the moment it was made", async () => {
    const { index, memory, told, events } = await indexed();
    // a folder that is made and filled at once: the file is there before VS Code looks into it
    memory.disk.unwatched(() => memory.disk.write("/repo/more/early.owm", ""));
    memory.disk.write("/repo/more/early.owm", TEA);
    expect(events).toEqual([["more/early.owm", "created"]]);
    expect(index.list()).toContain("more/early.owm");
    await vi.advanceTimersByTimeAsync(LIST_REST_MS);
    expect(told()).toBe(1);
    // a change of a file that is listed stays a change
    memory.disk.write("/repo/more/early.owm", "title Changed\n");
    expect(events.at(-1)).toEqual(["more/early.owm", "changed"]);
  });

  test("searches a folder that arrives with its files, of which the watcher names none", async () => {
    const { index, memory, told } = await indexed({
      ...FILES,
      "/elsewhere/maps/one.owm": TEA,
      "/elsewhere/maps/deep/two.tt": "",
    });
    memory.disk.move("/elsewhere/maps", "/repo/arrived");
    expect(index.list()).toEqual(LISTED);
    await vi.advanceTimersByTimeAsync(2 * LIST_REST_MS);
    expect(index.list()).toEqual([...LISTED, "arrived/deep/two.tt", "arrived/one.owm"].sort());
    expect(told()).toBe(1);
    expect(memory.calls.stat).toEqual(["/repo/arrived"]);
  });

  test("finds what was missed in a folder another program makes and fills", async () => {
    const { index, memory } = await indexed();
    memory.disk.folder("/repo/checkout");
    // written before VS Code looked into the new folder: no word of it at all
    memory.disk.unwatched(() => memory.disk.write("/repo/checkout/silent.owm", TEA));
    memory.disk.write("/repo/checkout/named.owm", TEA);
    expect(index.list()).toContain("checkout/named.owm");
    expect(index.list()).not.toContain("checkout/silent.owm");
    await vi.advanceTimersByTimeAsync(2 * LIST_REST_MS);
    expect(index.list()).toEqual([...LISTED, "checkout/named.owm", "checkout/silent.owm"].sort());
  });

  test("asks one question for a new file a board does not follow, and searches for none", async () => {
    const { index, memory, told } = await indexed();
    memory.disk.write("/repo/models/readme.md", "# Read me\n");
    memory.disk.write("/repo/docs/figure-2.png", "png");
    await vi.advanceTimersByTimeAsync(10 * LIST_REST_MS);
    expect(memory.calls.stat).toEqual(["/repo/models/readme.md", "/repo/docs/figure-2.png"]);
    expect(memory.calls.findFiles).toHaveLength(2);
    expect(index.list()).toEqual(LISTED);
    expect(told()).toBe(0);
  });

  test("asks nothing about a new entry in a dot folder or in node_modules, where a board lists nothing", async () => {
    const { memory } = await indexed();
    memory.disk.write("/repo/.git/index.lock", "");
    memory.disk.folder("/repo/.cache/build");
    memory.disk.write("/repo/node_modules/fresh/index.js", "");
    memory.disk.folder("/repo/packages/app/node_modules/pkg/dist");
    await vi.advanceTimersByTimeAsync(10 * LIST_REST_MS);
    expect(memory.calls.stat).toEqual([]);
    expect(memory.calls.findFiles).toHaveLength(2);
  });

  test("answers a burst of more new entries than it asks about with one search", async () => {
    const { index, memory } = await indexed();
    for (let file = 0; file <= FOLDER_LOOKS; file++) {
      memory.disk.write(`/repo/build/out-${file}.js`, "");
    }
    memory.disk.unwatched(() => memory.disk.write("/repo/build/found.owm", TEA));
    await vi.advanceTimersByTimeAsync(2 * LIST_REST_MS);
    // the folder and its files are more than FOLDER_LOOKS: no question, one search
    expect(memory.calls.stat).toEqual([]);
    expect(memory.calls.findFiles).toHaveLength(4);
    expect(index.list()).toContain("build/found.owm");
  });

  test("keeps what changed while a search ran, which the search's answer would undo", async () => {
    const { index, memory } = await indexed();
    const real = memory.vscode.workspace.findFiles;
    let answer: (found: MemoryUri[]) => void = () => {};
    memory.vscode.workspace.findFiles = (include, exclude) =>
      typeof include !== "string" && include.pattern.startsWith("assets/")
        ? real(include, exclude)
        : new Promise((resolve) => (answer = resolve));
    memory.setWorkspaceFolders(["/repo"]);
    memory.disk.write("/repo/models/during.owm", TEA);
    memory.disk.remove("/repo/models/tea.owm");
    // the answer of a search that was asked before either change, and knows neither
    answer(
      ["models/tea.owm", "models/teams/sample.ttm.json"].map((path) =>
        MemoryUri.file(`/repo/${path}`),
      ),
    );
    await vi.advanceTimersByTimeAsync(LIST_REST_MS);
    expect(index.list()).toEqual(
      [...LISTED.filter((path) => path !== "models/tea.owm"), "models/during.owm"].sort(),
    );
  });

  test("keeps its list when a search fails", async () => {
    const { index, memory, told } = await indexed();
    memory.vscode.workspace.findFiles = () => Promise.reject(new Error("search failed"));
    memory.setWorkspaceFolders(["/repo"]);
    await vi.advanceTimersByTimeAsync(10 * LIST_REST_MS);
    expect(index.list()).toEqual(LISTED);
    expect(told()).toBe(0);
  });

  test("lists a file its host made itself at once, and the watcher's later word of it changes nothing", async () => {
    const { index, memory, told, events } = await indexed();
    index.created("assets/pasted.png");
    expect(index.list()).toContain("assets/pasted.png");
    expect(events).toEqual([["assets/pasted.png", "created"]]);
    memory.disk.write("/repo/assets/pasted.png", "png");
    index.created("assets/pasted.png");
    await vi.advanceTimersByTimeAsync(LIST_REST_MS);
    expect(told()).toBe(1);
    expect(events).toEqual([["assets/pasted.png", "created"]]);
  });

  test("hears nothing and tells nobody once it is disposed", async () => {
    const { index, memory, told, events } = await indexed();
    expect(memory.listening()).toEqual({ documents: 0, files: 3, folders: 1, watchers: 1 });
    // a new folder whose look still rests when the index ends
    memory.disk.folder("/repo/late");
    index.dispose();
    expect(memory.listening()).toEqual({ documents: 0, files: 0, folders: 0, watchers: 0 });
    memory.disk.write("/repo/models/later.owm", TEA);
    memory.explorer.delete("/repo/models");
    memory.setWorkspaceFolders([]);
    await vi.advanceTimersByTimeAsync(10 * LIST_REST_MS);
    expect(told()).toBe(0);
    expect(events).toEqual([]);
    expect(memory.calls.findFiles).toHaveLength(2);
  });
});

describe("the indexes of an extension", () => {
  test("are one per root however many boards of it are open, and end with the last of them", async () => {
    const memory = createMemoryVsCode(FILES);
    const pool = createIndexPool(memory.vscode, SUFFIXES);
    const first = pool.acquire(ROOT);
    const second = pool.acquire(MemoryUri.file("/repo"));
    const other = pool.acquire(MemoryUri.file("/elsewhere"));
    expect(second.index).toBe(first.index);
    expect(other.index).not.toBe(first.index);
    await first.index.searched;
    // two searches per index, models and pictures
    expect(memory.calls.findFiles).toHaveLength(4);
    first.release();
    first.release();
    memory.disk.write("/repo/models/later.owm", TEA);
    expect(second.index.list()).toContain("models/later.owm");
    second.release();
    memory.disk.write("/repo/models/last.owm", TEA);
    expect(second.index.list()).not.toContain("models/last.owm");
    const again = pool.acquire(ROOT);
    expect(again.index).not.toBe(first.index);
    await again.index.searched;
    expect(again.index.list()).toContain("models/last.owm");
    pool.dispose();
    memory.disk.write("/elsewhere/more.owm", TEA);
    expect(other.index.list()).not.toContain("more.owm");
  });
});
