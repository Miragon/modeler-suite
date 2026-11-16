import { connectBackend } from "@miragon/board-files";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NO_MODEL, NO_MODELS_TO_ADD, NO_PICTURE, noRepository } from "../src/no-repository.js";
import { REACH } from "../src/reach.js";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

describe("the files of a board without a repository", () => {
  const ports: Array<{ dispose(): void }> = [];
  const port = (): ReturnType<typeof connectBackend> => {
    const files = connectBackend(noRepository(), REACH);
    ports.push(files);
    return files;
  };
  afterEach(() => {
    for (const files of ports.splice(0)) files.dispose();
  });

  test("lists nothing, and never tells of a change", () => {
    const backend = noRepository();
    const told = vi.fn();
    const stops = [
      backend.onListChanged(told),
      backend.onBytesChanged(told),
      backend.onMoved(told),
    ];

    expect(backend.list()).toEqual([]);
    expect(backend.list()).toBe(backend.list());
    for (const stop of stops) expect(() => stop()).not.toThrow();
    expect(told).not.toHaveBeenCalled();
  });

  test("a board's page is told why a model is not there, in the page's own words", async () => {
    const files = port();
    await files.settled();

    expect(files.paths()).toEqual([]);
    await expect(files.openText("models/tea.owm")).rejects.toThrow(NO_MODEL);
    // a file of any notation the page reaches, wherever the board says it sits
    await expect(files.openText("deep/down/sample.cm")).rejects.toThrow(NO_MODEL);
  });

  test("a picture is not there, without an error", async () => {
    const files = port();

    await expect(files.readBytes("assets/logo.svg")).resolves.toBeUndefined();
  });

  test("a new picture is refused with what the board puts behind its name", async () => {
    const files = port();
    const picture = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

    const refusal = await files.createFile?.("assets/plan.png", picture).then(
      () => "stored",
      (error: unknown) => messageOf(error),
    );

    expect(refusal).toBe(NO_PICTURE);
    // the board's notice reads "<name> was not added: <reason>"
    expect(`plan.png was not added: ${refusal}`).toBe(
      "plan.png was not added: this board has no repository to keep a picture in. Show the example to try pictures on a board.",
    );
  });

  test("the sentences are whole sentences where they stand alone", () => {
    for (const sentence of [NO_MODEL, NO_MODELS_TO_ADD]) {
      expect(sentence).toMatch(/^[A-Z].*\.$/);
    }
    expect(NO_PICTURE).toMatch(/^[a-z].*\.$/);
  });
});
