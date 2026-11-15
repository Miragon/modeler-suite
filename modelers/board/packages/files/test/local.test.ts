/**
 * `connectBackend`: the port for a host whose files are in the page, end to end over a real
 * message channel. Its messages cross as tasks, so these tests wait for what they expect.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { connectBackend, type BoardFiles } from "../src/index.js";
import { createCountingBackend, type CountingBackend } from "./support/wire.js";

const TEA = "title Tea\n";
const PATH = "models/tea.owm";

let connected: BoardFiles[] = [];
afterEach(() => {
  for (const files of connected) files.dispose();
  connected = [];
});

function connect(): { backend: CountingBackend; files: BoardFiles } {
  const backend = createCountingBackend({
    [PATH]: TEA,
    "assets/logo.png": { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" },
  });
  const files = connectBackend(backend);
  connected.push(files);
  return { backend, files };
}

/**
 * Behind everything that was posted before it, in both directions: a request and its answer.
 * What would have come back by now has come back.
 */
const roundTrip = (files: BoardFiles): Promise<unknown> => files.readBytes("assets/logo.png");

describe("connectBackend", () => {
  test("has no list until the hello was answered, then the backend's, and follows it", async () => {
    const { backend, files } = connect();
    expect(files.paths()).toEqual([]);
    let told = 0;
    files.onPaths(() => void (told += 1));
    await vi.waitFor(() => expect(files.paths()).toEqual(["assets/logo.png", PATH]));
    expect(told).toBe(1);
    // a copy that crossed the channel, not the backend's own array
    expect(files.paths()).not.toBe(backend.list());
    backend.outside("models/new.owm", TEA);
    await vi.waitFor(() => expect(files.paths()).toContain("models/new.owm"));
    expect(told).toBe(2);
  });

  test("a write lands in the backend once and never comes back to its writer", async () => {
    const { backend, files } = connect();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const heardByOne: string[] = [];
    const heardByTwo: string[] = [];
    one.onReplace((text) => heardByOne.push(text));
    two.onReplace((text) => heardByTwo.push(text));
    one.write("title Coffee\n");
    expect(heardByTwo).toEqual(["title Coffee\n"]);
    await roundTrip(files);
    expect(backend.writes).toEqual([{ path: PATH, text: "title Coffee\n" }]);
    expect(heardByOne).toEqual([]);
    expect(heardByTwo).toEqual(["title Coffee\n"]);
    expect(backend.calls.openText).toEqual([PATH]);
  });

  test("a change from outside reaches the session, and a removed file is gone and back", async () => {
    const { backend, files } = connect();
    const session = await files.openText(PATH);
    const heard: string[] = [];
    session.onReplace((text) => heard.push(`replace ${text}`));
    session.onAvailable((available) => heard.push(available ? "back" : "gone"));
    backend.outside(PATH, "title Outside\n");
    await vi.waitFor(() => expect(heard).toEqual(["replace title Outside\n"]));
    backend.remove(PATH);
    await vi.waitFor(() => expect(heard).toEqual(["replace title Outside\n", "gone"]));
    backend.outside(PATH, "title Back\n");
    await vi.waitFor(() =>
      expect(heard).toEqual(["replace title Outside\n", "gone", "back", "replace title Back\n"]),
    );
    expect(backend.writes).toEqual([]);
  });

  test("tells a move", async () => {
    const { backend, files } = connect();
    await roundTrip(files);
    const heard: string[] = [];
    files.onMoved((moves) => heard.push(...moves.map((move) => `${move.from} > ${move.to}`)));
    backend.move(PATH, "drinks/tea.owm");
    await vi.waitFor(() => expect(heard).toEqual(["models/tea.owm > drinks/tea.owm"]));
    expect(files.paths()).toEqual(["assets/logo.png", "drinks/tea.owm"]);
  });

  test("reads bytes as a blob and stores a new file", async () => {
    const { backend, files } = connect();
    const blob = await files.readBytes("assets/logo.png");
    expect(blob?.type).toBe("image/png");
    expect([...new Uint8Array((await blob?.arrayBuffer()) ?? new ArrayBuffer(0))]).toEqual([
      1, 2, 3,
    ]);
    const changed: string[] = [];
    files.onBytesChanged((paths) => changed.push(...paths));
    await files.createFile?.(
      "assets/new.png",
      new Blob([new Uint8Array([9, 8])], { type: "image/png" }),
    );
    expect(changed).toEqual(["assets/new.png"]);
    expect(await backend.readBytes("assets/new.png")).toEqual({
      bytes: new Uint8Array([9, 8]),
      mime: "image/png",
    });
  });

  test("checks every path, though the files are in the page", async () => {
    const { backend, files } = connect();
    const picture = new Blob([new Uint8Array([9])], { type: "image/png" });
    await expect(files.openText("../secret.owm")).rejects.toThrow(
      "this path is outside the repository",
    );
    await expect(files.readBytes("/etc/passwd")).rejects.toThrow(
      "this path is outside the repository",
    );
    await expect(files.createFile?.("../x.png", picture)).rejects.toThrow(
      "this path is outside the repository",
    );
    await expect(files.createFile?.(PATH, picture)).rejects.toThrow("a new file goes into assets/");
    await expect(files.createFile?.("assets/logo.png", picture)).rejects.toThrow(
      "assets/logo.png exists already",
    );
    expect(backend.calls).toEqual({
      openText: [],
      readBytes: [],
      createFile: ["assets/logo.png"],
    });
  });

  test("dispose ends the server too: nothing stays open at the backend, and what waits is rejected", async () => {
    const { backend, files } = connect();
    const session = await files.openText(PATH);
    expect(backend.openTexts()).toBe(1);
    expect(backend.subscriptions()).toBe(3);
    const heard: string[] = [];
    session.onReplace((text) => heard.push(text));
    const waiting = files.readBytes("assets/logo.png");
    // posted and not yet taken by the server: it goes with the channel
    session.write("title In the task of the dispose\n");
    files.dispose();
    await expect(waiting).rejects.toThrow("the files were closed");
    expect(backend.openTexts()).toBe(0);
    expect(backend.subscriptions()).toBe(0);
    session.write("title Late\n");
    session.close();
    backend.outside(PATH, "title Outside\n");
    await expect(files.openText(PATH)).rejects.toThrow("the files were closed");
    // a second connection of the same backend is behind whatever the first could still send
    const again = connectBackend(backend);
    connected.push(again);
    await roundTrip(again);
    expect(heard).toEqual([]);
    expect(backend.writes).toEqual([]);
    files.dispose();
  });

  test("dispose closes the channel: no port of it keeps a Node process alive", async () => {
    const openPorts = (): number =>
      process.getActiveResourcesInfo().filter((name) => name === "MessagePort").length;
    const { files } = connect();
    // a request and its answer later, the ports an earlier test closed are gone as well
    await roundTrip(files);
    const open = openPorts();
    expect(open).toBeGreaterThanOrEqual(2);
    files.dispose();
    await vi.waitFor(() => expect(openPorts()).toBe(open - 2));
  });

  test("two connections of one backend are two pages: each hears the other's write from outside", async () => {
    const { backend, files } = connect();
    const other = connectBackend(backend);
    connected.push(other);
    const mine = await files.openText(PATH);
    const theirs = await other.openText(PATH);
    const heardByMine: string[] = [];
    const heardByTheirs: string[] = [];
    mine.onReplace((text) => heardByMine.push(text));
    theirs.onReplace((text) => heardByTheirs.push(text));
    mine.write("title Mine\n");
    await vi.waitFor(() => expect(heardByTheirs).toEqual(["title Mine\n"]));
    await roundTrip(files);
    expect(heardByMine).toEqual([]);
    expect(backend.writes).toHaveLength(1);
  });
});
