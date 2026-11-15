import { createMemoryBackend } from "@miragon/board-files";
import { describe, expect, test } from "vitest";
import { keeping } from "../src/keeping.js";
import { createAppStorage, memoryStore, type ExampleRepository } from "../src/storage.js";

const EXAMPLE: ExampleRepository = {
  board: "the example board\n",
  files: { "models/tea.owm": "title Tea Shop\n" },
};

const PICTURE = new Uint8Array([137, 80, 78, 71]);

function setUp() {
  const store = memoryStore();
  const memory = createMemoryBackend({ ...EXAMPLE.files });
  const answers: boolean[] = [];
  const backend = keeping(memory, createAppStorage(store, EXAMPLE), (taken) => {
    answers.push(taken);
  });
  /** what the next start on the same store would begin with */
  const nextStart = () => createAppStorage(store, EXAMPLE).files();
  return { memory, backend, answers, nextStart };
}

describe("the repository in memory, kept in the browser", () => {
  test("a write the repository took is kept, and the repository's log stays empty", async () => {
    const { memory, backend, answers, nextStart } = setUp();
    const text = await backend.openText("models/tea.owm");

    expect(await text.write("title Tea Shop\ncomponent Cup [0.5, 0.5]\n")).toBe(true);
    expect(await text.write("title Coffee Shop\n")).toBe(true);

    expect(memory.textOf("models/tea.owm")).toBe("title Coffee Shop\n");
    expect(nextStart()["models/tea.owm"]).toBe("title Coffee Shop\n");
    expect(answers).toEqual([true, true]);
    expect(memory.writes).toEqual([]);
  });

  test("a write the repository refused is not kept", async () => {
    const { memory, backend, answers, nextStart } = setUp();
    const text = await backend.openText("models/tea.owm");
    memory.remove("models/tea.owm");

    expect(await text.write("title Coffee Shop\n")).toBe(false);

    expect(answers).toEqual([]);
    expect(nextStart()["models/tea.owm"]).toBe("title Tea Shop\n");
  });

  test("a new file is kept with its bytes, and one the repository refused is not", async () => {
    const { backend, answers, nextStart } = setUp();

    await backend.createFile("assets/cup.png", PICTURE, "image/png");
    await expect(backend.createFile("assets/cup.png", PICTURE, "image/png")).rejects.toThrow(
      "assets/cup.png exists already",
    );

    expect(answers).toEqual([true]);
    expect(nextStart()["assets/cup.png"]).toEqual({ bytes: PICTURE, mime: "image/png" });
  });

  test("a change from outside reaches the reader, and the page is told of no save", async () => {
    const { memory, backend, answers } = setUp();
    const text = await backend.openText("models/tea.owm");
    const heard: string[] = [];
    text.onChange((next) => heard.push(next));

    memory.outside("models/tea.owm", "title From Outside\n");

    expect(heard).toEqual(["title From Outside\n"]);
    expect(text.text()).toBe("title From Outside\n");
    expect(answers).toEqual([]);
  });
});
