/** The memory backend alone, as a server or a test would drive it. */
import { describe, expect, test } from "vitest";
import { createMemoryBackend, type BackendText } from "../src/index.js";

const TEA = "title Tea\n";
const PNG = { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" };

const backendOf = () =>
  createMemoryBackend({ "models/tea.owm": TEA, "b.tt": "{}", "assets/logo.png": PNG });

/** what one open text heard, in order */
function ears(text: BackendText): string[] {
  const heard: string[] = [];
  text.onChange((changed) => heard.push(`change ${changed}`));
  text.onGone(() => heard.push("gone"));
  return heard;
}

describe("the list", () => {
  test("is sorted, frozen and the same array until a file comes or goes", () => {
    const backend = backendOf();
    const first = backend.list();
    expect(first).toEqual(["assets/logo.png", "b.tt", "models/tea.owm"]);
    expect(Object.isFrozen(first)).toBe(true);
    backend.outside("models/tea.owm", "title Changed\n");
    expect(backend.list()).toBe(first);
    backend.outside("a.owm", TEA);
    expect(backend.list()).toEqual(["a.owm", "assets/logo.png", "b.tt", "models/tea.owm"]);
    expect(backend.list()).toBe(backend.list());
  });

  test("tells its listeners of a new file, a removed one, a moved one and a created one", async () => {
    const backend = backendOf();
    let told = 0;
    const off = backend.onListChanged(() => void (told += 1));
    backend.outside("a.owm", TEA);
    backend.remove("a.owm");
    backend.move("b.tt", "c.tt");
    await backend.createFile("assets/new.png", new Uint8Array([4]), "image/png");
    expect(told).toBe(4);
    // nothing for what changes no path
    backend.outside("models/tea.owm", "title Changed\n");
    backend.remove("not/there.owm");
    backend.move("not/there.owm", "x.owm");
    backend.move("c.tt", "c.tt");
    expect(told).toBe(4);
    off();
    backend.outside("z.owm", TEA);
    expect(told).toBe(4);
  });

  test("does not write into the record it was made from", () => {
    const given = { "models/tea.owm": TEA };
    const backend = createMemoryBackend(given);
    backend.outside("models/tea.owm", "title Changed\n");
    backend.outside("a.owm", TEA);
    expect(given).toEqual({ "models/tea.owm": TEA });
  });
});

describe("a text", () => {
  test("opens a text file, and refuses a file that is not there or holds bytes", async () => {
    const backend = backendOf();
    const text = await backend.openText("models/tea.owm");
    expect(text.text()).toBe(TEA);
    expect(text.readOnly).toBe(false);
    await expect(backend.openText("missing.owm")).rejects.toThrow(
      "missing.owm is no text file of this repository",
    );
    await expect(backend.openText("assets/logo.png")).rejects.toThrow(
      "assets/logo.png is no text file of this repository",
    );
  });

  test("a write is stored, logged and told to the other open texts of the path, not to the writer", async () => {
    const backend = backendOf();
    const one = await backend.openText("models/tea.owm");
    const two = await backend.openText("models/tea.owm");
    const elsewhere = await backend.openText("b.tt");
    const heardByOne = ears(one);
    const heardByTwo = ears(two);
    const heardElsewhere = ears(elsewhere);
    expect(await one.write("title Coffee\n", TEA)).toBe(true);
    expect(backend.textOf("models/tea.owm")).toBe("title Coffee\n");
    expect([one.text(), two.text()]).toEqual(["title Coffee\n", "title Coffee\n"]);
    expect(backend.writes).toEqual([{ path: "models/tea.owm", text: "title Coffee\n" }]);
    expect(heardByOne).toEqual([]);
    expect(heardByTwo).toEqual(["change title Coffee\n"]);
    expect(heardElsewhere).toEqual([]);
  });

  test("a change from outside is told to every open text and is no write", async () => {
    const backend = backendOf();
    const one = await backend.openText("models/tea.owm");
    const two = await backend.openText("models/tea.owm");
    const heardByOne = ears(one);
    const heardByTwo = ears(two);
    backend.outside("models/tea.owm", "title Outside\n");
    expect(heardByOne).toEqual(["change title Outside\n"]);
    expect(heardByTwo).toEqual(["change title Outside\n"]);
    expect(one.text()).toBe("title Outside\n");
    expect(backend.writes).toEqual([]);
  });

  test("a removed file is gone for its open texts, refuses a write, and is back from outside", async () => {
    const backend = backendOf();
    const text = await backend.openText("models/tea.owm");
    const heard = ears(text);
    backend.remove("models/tea.owm");
    expect(heard).toEqual(["gone"]);
    expect(backend.textOf("models/tea.owm")).toBeUndefined();
    // a file that is not there has no text
    expect(text.text()).toBe("");
    expect(await text.write("title Into the void\n", TEA)).toBe(false);
    // not on the text an open text of a missing file answers either
    expect(await text.write("title Into the void\n", text.text())).toBe(false);
    expect(backend.textOf("models/tea.owm")).toBeUndefined();
    expect(backend.writes).toEqual([]);
    backend.outside("models/tea.owm", "title Back\n");
    expect(heard).toEqual(["gone", "change title Back\n"]);
    expect(await text.write("title Written again\n", "title Back\n")).toBe(true);
    expect(backend.textOf("models/tea.owm")).toBe("title Written again\n");
  });

  test("refuses a write made on another text than the file has, and takes it once it is made on that", async () => {
    const backend = backendOf();
    const text = await backend.openText("models/tea.owm");
    const heard = ears(text);
    backend.outside("models/tea.owm", "title Outside\n");
    expect(await text.write("title Mine\n", TEA)).toBe(false);
    expect(backend.textOf("models/tea.owm")).toBe("title Outside\n");
    expect(backend.writes).toEqual([]);
    expect(await text.write("title Mine\n", "title Outside\n")).toBe(true);
    expect(backend.textOf("models/tea.owm")).toBe("title Mine\n");
    // the refusal told nobody anything: the outside's change was told when it came
    expect(heard).toEqual(["change title Outside\n"]);
  });

  test("a closed text and a listener taken off hear nothing more", async () => {
    const backend = backendOf();
    const one = await backend.openText("models/tea.owm");
    const two = await backend.openText("models/tea.owm");
    const heardByOne = ears(one);
    const heardByTwo: string[] = [];
    const offChange = two.onChange((changed) => heardByTwo.push(changed));
    const offGone = two.onGone(() => heardByTwo.push("gone"));
    one.close();
    offChange();
    offGone();
    backend.outside("models/tea.owm", "title Outside\n");
    backend.remove("models/tea.owm");
    expect(heardByOne).toEqual([]);
    expect(heardByTwo).toEqual([]);
  });

  test("the log of writes can be emptied by whoever keeps the backend for long", async () => {
    const backend = backendOf();
    const text = await backend.openText("models/tea.owm");
    await text.write("one", TEA);
    await text.write("two", "one");
    expect(backend.writes.map((write) => write.text)).toEqual(["one", "two"]);
    backend.writes.length = 0;
    await text.write("three", "two");
    expect(backend.writes).toEqual([{ path: "models/tea.owm", text: "three" }]);
  });
});

describe("a move", () => {
  test("takes the file to its new path and tells the list, then the move, then the readers of the old path", async () => {
    const backend = backendOf();
    const text = await backend.openText("models/tea.owm");
    const heard: string[] = [];
    backend.onListChanged(() => heard.push(`list ${backend.list().join(" ")}`));
    backend.onMoved((moves) =>
      heard.push(...moves.map((move) => `moved ${move.from} > ${move.to}`)),
    );
    text.onGone(() => heard.push("gone"));
    backend.move("models/tea.owm", "drinks/tea.owm");
    expect(heard).toEqual([
      "list assets/logo.png b.tt drinks/tea.owm",
      "moved models/tea.owm > drinks/tea.owm",
      "gone",
    ]);
    expect(backend.textOf("drinks/tea.owm")).toBe(TEA);
    expect(backend.textOf("models/tea.owm")).toBeUndefined();
    expect((await backend.openText("drinks/tea.owm")).text()).toBe(TEA);
  });

  test("moves bytes as well as texts, and says that the bytes of both paths are new", async () => {
    const backend = backendOf();
    const heard: string[] = [];
    backend.onMoved((moves) => heard.push(...moves.map((move) => `moved ${move.to}`)));
    backend.onBytesChanged((paths) => heard.push(`bytes ${paths.join(" ")}`));
    backend.move("assets/logo.png", "assets/mark.png");
    expect(await backend.readBytes("assets/mark.png")).toEqual(PNG);
    expect(await backend.readBytes("assets/logo.png")).toBeUndefined();
    // the move first: whoever follows it asks for the new path, not for the one that is empty
    expect(heard).toEqual(["moved assets/mark.png", "bytes assets/logo.png assets/mark.png"]);
    // a text that moves has no bytes to tell
    backend.move("b.tt", "c.tt");
    expect(heard.slice(2)).toEqual(["moved c.tt"]);
  });

  test("moves a folder as one call with a move per file below it, and no file beside it", async () => {
    const backend = createMemoryBackend({
      "models/tea.owm": TEA,
      "models/deep/down.tt": "{}",
      "models/logo.png": PNG,
      "models-old/tea.owm": "title Old\n",
      "modelsfile.owm": TEA,
    });
    const text = await backend.openText("models/deep/down.tt");
    const heard: string[] = [];
    backend.onListChanged(() => heard.push("list"));
    backend.onMoved((moves) =>
      heard.push(`moved ${moves.map((move) => `${move.from} > ${move.to}`).join(", ")}`),
    );
    text.onGone(() => heard.push("gone"));
    backend.onBytesChanged((paths) => heard.push(`bytes ${paths.join(" ")}`));

    backend.move("models", "archive/2026");

    expect(heard).toEqual([
      "list",
      "moved models/deep/down.tt > archive/2026/deep/down.tt, models/logo.png > archive/2026/logo.png, models/tea.owm > archive/2026/tea.owm",
      "gone",
      "bytes models/logo.png archive/2026/logo.png",
    ]);
    expect(backend.list()).toEqual([
      "archive/2026/deep/down.tt",
      "archive/2026/logo.png",
      "archive/2026/tea.owm",
      "models-old/tea.owm",
      "modelsfile.owm",
    ]);
    expect(backend.textOf("archive/2026/tea.owm")).toBe(TEA);
  });

  test("moves a file and not a folder where the path is both a file and the start of others", () => {
    const backend = createMemoryBackend({ plan: TEA, "plan/old.owm": TEA });
    const moves: string[] = [];
    backend.onMoved((moved) => moves.push(...moved.map((move) => `${move.from} > ${move.to}`)));
    backend.move("plan", "plan.owm");
    expect(moves).toEqual(["plan > plan.owm"]);
    expect(backend.list()).toEqual(["plan.owm", "plan/old.owm"]);
  });

  test("a text that arrives at a path is told to the texts open there", async () => {
    const backend = backendOf();
    const text = await backend.openText("models/tea.owm");
    const heard = ears(text);
    backend.move("models/tea.owm", "drinks/tea.owm");
    backend.move("drinks/tea.owm", "models/tea.owm");
    expect(heard).toEqual(["gone", `change ${TEA}`]);
    // and one that replaces the file a path held
    backend.outside("other.owm", "title Other\n");
    backend.move("other.owm", "models/tea.owm");
    expect(heard).toEqual(["gone", `change ${TEA}`, "change title Other\n"]);
    expect(backend.list()).toEqual(["assets/logo.png", "b.tt", "models/tea.owm"]);
  });

  test("does nothing for a file that is not there and for a move onto itself", () => {
    const backend = backendOf();
    let moved = 0;
    backend.onMoved(() => void (moved += 1));
    backend.move("missing.owm", "x.owm");
    backend.move("b.tt", "b.tt");
    backend.move("models", "models");
    backend.move("empty/folder", "x");
    expect(moved).toBe(0);
    expect(backend.list()).toEqual(["assets/logo.png", "b.tt", "models/tea.owm"]);
  });
});

describe("what it cannot do", () => {
  test("shows no file: it has no editor to show one in, and so no such member", () => {
    expect("showFile" in backendOf()).toBe(false);
  });
});

describe("bytes and new files", () => {
  test("reads bytes with their type, and none for a text or a file that is not there", async () => {
    const backend = backendOf();
    expect(await backend.readBytes("assets/logo.png")).toEqual(PNG);
    expect(await backend.readBytes("models/tea.owm")).toBeUndefined();
    expect(await backend.readBytes("missing.png")).toBeUndefined();
    expect(backend.textOf("assets/logo.png")).toBeUndefined();
    expect(backend.textOf("missing.owm")).toBeUndefined();
  });

  test("creates a file, lists it and tells its bytes", async () => {
    const backend = backendOf();
    const heard: string[] = [];
    backend.onListChanged(() => heard.push("list"));
    const off = backend.onBytesChanged((paths) => heard.push(`bytes ${paths.join(" ")}`));
    await backend.createFile("assets/new.png", new Uint8Array([9, 8]), "image/png");
    expect(heard).toEqual(["list", "bytes assets/new.png"]);
    expect(backend.list()).toContain("assets/new.png");
    expect(await backend.readBytes("assets/new.png")).toEqual({
      bytes: new Uint8Array([9, 8]),
      mime: "image/png",
    });
    off();
    await backend.createFile("assets/more.png", new Uint8Array([7]), "image/png");
    expect(heard).toEqual(["list", "bytes assets/new.png", "list"]);
  });

  test("refuses to create a file where one is, bytes or text, and keeps what was there", async () => {
    const backend = backendOf();
    await expect(
      backend.createFile("assets/logo.png", new Uint8Array([9]), "image/png"),
    ).rejects.toThrow("assets/logo.png exists already");
    await expect(
      backend.createFile("models/tea.owm", new Uint8Array([9]), "image/png"),
    ).rejects.toThrow("models/tea.owm exists already");
    expect(await backend.readBytes("assets/logo.png")).toEqual(PNG);
    expect(backend.textOf("models/tea.owm")).toBe(TEA);
  });
});
