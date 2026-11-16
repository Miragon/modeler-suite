import { NEW_FILE_LIMIT_BYTES } from "@miragon/board-files";
import { describe, expect, test } from "vitest";

import { BYTES_LIMIT_BYTES, createPicture, mimeOf, readPicture } from "../src/files/bytes.js";
import { createMemoryVsCode, MemoryUri, type MemoryVsCode } from "../src/files/memory-vscode.js";

const ROOT = MemoryUri.file("/repo");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function repository(): MemoryVsCode {
  const memory = createMemoryVsCode({ "/repo/.git/HEAD": "", "/outside/secret.png": "secret" });
  memory.disk.write("/repo/assets/logo.png", PNG);
  return memory;
}

describe("the bytes of a picture", () => {
  test("are the file's, with the type its name stands for", async () => {
    const memory = repository();
    const read = await readPicture(memory.vscode, ROOT, "assets/logo.png");
    expect(read).toEqual({ bytes: PNG, mime: "image/png" });
  });

  test("are none for a file that is not there, and for a folder of that name", async () => {
    const memory = repository();
    memory.disk.folder("/repo/assets/folder.png");
    expect(await readPicture(memory.vscode, ROOT, "assets/none.png")).toBeUndefined();
    expect(await readPicture(memory.vscode, ROOT, "assets/folder.png")).toBeUndefined();
    expect(memory.calls.readFile).toEqual([]);
  });

  test("are not read for a link, which may lead out of the repository", async () => {
    const memory = repository();
    memory.disk.link("/repo/assets/link.png", "/outside/secret.png");
    await expect(readPicture(memory.vscode, ROOT, "assets/link.png")).rejects.toThrow(
      "assets/link.png is a link, and a board reads no link",
    );
    expect(memory.calls.readFile).toEqual([]);
  });

  test("are not read for a file above the limit, which is the board's own for a picture", async () => {
    const memory = repository();
    memory.disk.write("/repo/assets/huge.png", new Uint8Array(BYTES_LIMIT_BYTES + 1));
    memory.disk.write("/repo/assets/large.png", new Uint8Array(BYTES_LIMIT_BYTES));
    await expect(readPicture(memory.vscode, ROOT, "assets/huge.png")).rejects.toThrow(
      "assets/huge.png is larger than 10 MiB",
    );
    expect(memory.calls.readFile).toEqual([]);
    const large = await readPicture(memory.vscode, ROOT, "assets/large.png");
    expect(large?.bytes).toHaveLength(BYTES_LIMIT_BYTES);
    expect(BYTES_LIMIT_BYTES).toBe(NEW_FILE_LIMIT_BYTES);
  });

  test("are not read for a file behind a linked folder: every folder on the way is asked, and nothing about the file", async () => {
    // stat names a file itself and never the way to it: behind the link this one is a plain file
    const memory = repository();
    memory.disk.link("/repo/linked", "/outside");
    await expect(readPicture(memory.vscode, ROOT, "linked/secret.png")).rejects.toThrow(
      "linked/secret.png is behind a link, and a board reads no link",
    );
    expect(memory.calls.stat).toEqual(["/repo/linked"]);
    expect(memory.calls.readFile).toEqual([]);
  });

  test("are read behind folders that are none, and are none where a folder is not there", async () => {
    const memory = repository();
    memory.disk.write("/repo/docs/figures/a.png", PNG);
    const read = await readPicture(memory.vscode, ROOT, "docs/figures/a.png");
    expect(read).toEqual({ bytes: PNG, mime: "image/png" });
    expect(await readPicture(memory.vscode, ROOT, "none/figures/a.png")).toBeUndefined();
  });

  test.each([
    ["assets/a.png", "image/png"],
    ["assets/a.PNG", "image/png"],
    ["assets/a.jpg", "image/jpeg"],
    ["assets/a.jpeg", "image/jpeg"],
    ["assets/a.gif", "image/gif"],
    ["assets/a.webp", "image/webp"],
    ["assets/a.avif", "image/avif"],
    ["assets/a.svg", "image/svg+xml"],
    ["assets/a.txt", ""],
  ])("the type of %s is %s", (path, mime) => {
    expect(mimeOf(path)).toBe(mime);
  });
});

describe("a new picture", () => {
  test("is written under assets, which is made when it is not there", async () => {
    const memory = createMemoryVsCode({ "/repo/.git/HEAD": "" });
    await createPicture(memory.vscode, ROOT, "assets/new.png", PNG);
    expect(memory.calls.createDirectory).toEqual(["/repo/assets"]);
    expect(memory.calls.writeFile).toEqual(["/repo/assets/new.png"]);
    expect([
      ...(await memory.vscode.workspace.fs.readFile(MemoryUri.file("/repo/assets/new.png"))),
    ]).toEqual([...PNG]);
  });

  test("leaves a folder that is there as it is", async () => {
    const memory = repository();
    await createPicture(memory.vscode, ROOT, "assets/new.png", PNG);
    expect(memory.calls.createDirectory).toEqual([]);
  });

  test("looks before it writes and never replaces a file", async () => {
    const memory = repository();
    await expect(
      createPicture(memory.vscode, ROOT, "assets/logo.png", new Uint8Array([1])),
    ).rejects.toThrow("assets/logo.png exists already");
    expect(memory.calls.stat).toContain("/repo/assets/logo.png");
    expect(memory.calls.writeFile).toEqual([]);
    expect([
      ...(await memory.vscode.workspace.fs.readFile(MemoryUri.file("/repo/assets/logo.png"))),
    ]).toEqual([...PNG]);
  });

  test("replaces no folder and no link of its name either", async () => {
    const memory = repository();
    memory.disk.folder("/repo/assets/folder.png");
    memory.disk.link("/repo/assets/link.png", "/outside/secret.png");
    await expect(createPicture(memory.vscode, ROOT, "assets/folder.png", PNG)).rejects.toThrow(
      "exists already",
    );
    await expect(createPicture(memory.vscode, ROOT, "assets/link.png", PNG)).rejects.toThrow(
      "exists already",
    );
    expect(memory.calls.writeFile).toEqual([]);
    expect(memory.disk.text("/outside/secret.png")).toBe("secret");
  });

  test("is not written through an assets that is a link: nothing lands outside the repository", async () => {
    const memory = createMemoryVsCode({ "/repo/.git/HEAD": "", "/outside/keep.txt": "" });
    memory.disk.link("/repo/assets", "/outside");
    await expect(createPicture(memory.vscode, ROOT, "assets/new.png", PNG)).rejects.toThrow(
      "assets is a link, and a board stores nothing through a link",
    );
    expect(memory.calls.writeFile).toEqual([]);
    expect(memory.disk.has("/outside/new.png")).toBe(false);
  });

  test("is not written where assets is a file", async () => {
    const memory = createMemoryVsCode({ "/repo/.git/HEAD": "", "/repo/assets": "a file" });
    await expect(createPicture(memory.vscode, ROOT, "assets/new.png", PNG)).rejects.toThrow(
      "assets is a file, so a new picture has no folder",
    );
    expect(memory.calls.writeFile).toEqual([]);
    expect(memory.calls.createDirectory).toEqual([]);
  });
});
