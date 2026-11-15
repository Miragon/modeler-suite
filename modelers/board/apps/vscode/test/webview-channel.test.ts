import {
  createFilesClient,
  createMemoryBackend,
  type BoardFiles,
  type HostMessage,
  type MemoryBackend,
} from "@miragon/board-files";
import { registerModelerEditor } from "@miragon/modeler-shell/vscode/extension";
import { createVsCodeHostStub } from "@miragon/modeler-shell/testing/vscode-stub";
import { describe, expect, test, vi } from "vitest";

import { BOARD_VIEW_TYPE, boardEditorOptions } from "../src/boardEditorOptions.js";
import { filesChannel } from "../src/webview/channel.js";
import { settled } from "./support/wire.js";

/**
 * The webview's end of the pipe to the extension: the files protocol on the one API a webview
 * may acquire, beside the board file's own sync. Alone first, then against the extension's end,
 * the editor's options on the shell's VS Code stub with a repository in memory.
 */

const TEA = "title Tea\n";
const PATHS: HostMessage = { type: "board.paths", paths: ["models/tea.owm"] };

describe("the webview's files channel", () => {
  test("posts through the API it is given, the message as it is", () => {
    const posted: unknown[] = [];
    const channel = filesChannel().over({ postMessage: (message) => void posted.push(message) });
    channel.post({ type: "board.hello", protocol: 2 });
    channel.post({ type: "board.text.close", path: "models/tea.owm" });
    expect(posted).toEqual([
      { type: "board.hello", protocol: 2 },
      { type: "board.text.close", path: "models/tea.owm" },
    ]);
  });

  test("hands a message of the files to every listener, and to none that unsubscribed", () => {
    const pipe = filesChannel();
    const channel = pipe.over({ postMessage: () => undefined });
    const first: HostMessage[] = [];
    const second: HostMessage[] = [];
    const offFirst = channel.onMessage((message) => void first.push(message));
    channel.onMessage((message) => void second.push(message));
    pipe.receive(PATHS);
    offFirst();
    pipe.receive({ type: "board.text.gone", path: "models/tea.owm" });
    expect(first).toEqual([PATHS]);
    expect(second).toEqual([PATHS, { type: "board.text.gone", path: "models/tea.owm" }]);
  });

  test("leaves every message that is not of the files alone: the shell's, a text, nothing at all", () => {
    const pipe = filesChannel();
    const heard: unknown[] = [];
    pipe.over({ postMessage: () => undefined }).onMessage((message) => void heard.push(message));
    for (const message of [
      { type: "init", text: "board.paths" },
      { type: "update", text: "" },
      { type: "modelerShell.appearance", appearance: { theme: "light" } },
      { type: "boards.paths", paths: [] },
      { type: 7 },
      { paths: [] },
      "board.paths",
      null,
      undefined,
      [PATHS],
    ]) {
      pipe.receive(message);
    }
    expect(heard).toEqual([]);
  });

  test("does not tell a listener that another one unsubscribed while both were told", () => {
    const pipe = filesChannel();
    const channel = pipe.over({ postMessage: () => undefined });
    const heard: string[] = [];
    let offSecond: () => void = () => undefined;
    channel.onMessage(() => {
      heard.push("first");
      offSecond();
    });
    offSecond = channel.onMessage(() => void heard.push("second"));
    pipe.receive(PATHS);
    expect(heard).toEqual(["first"]);
  });
});

interface Wired {
  readonly files: BoardFiles;
  readonly backend: MemoryBackend;
  /** everything the page posted, in order */
  readonly posted: Array<{ type: string }>;
  /**
   * The webview is loaded anew on the same panel, as VS Code does when a tab moves to another
   * window: the page before is gone with everything it held, and the new one has a files client
   * of its own on the same pipe.
   */
  reloaded(): BoardFiles;
}

/**
 * A page's files client on the webview's channel, and behind it the extension's end as it runs
 * in VS Code: the shell's `registerModelerEditor` with the board editor's options. Both ways a
 * message is copied and arrives in a later task, as between a webview and its extension host.
 */
async function wired(): Promise<Wired> {
  const stub = createVsCodeHostStub();
  const backend = createMemoryBackend({
    "models/tea.owm": TEA,
    "assets/logo.svg": { bytes: new TextEncoder().encode("<svg/>"), mime: "image/svg+xml" },
    "readme.md": "# Repo\n",
  });
  registerModelerEditor(
    stub.vscode,
    { extensionUri: stub.extensionUri },
    boardEditorOptions(() => backend),
  );
  /** the page that lives: what the extension posts reaches no page that was unloaded */
  let pipe = filesChannel();
  const panel = await stub.openCustomEditor(
    BOARD_VIEW_TYPE,
    stub.openTextDocument("/repo/a.board", ""),
    {
      // every message of the extension, the shell's own among them: the channel takes its own
      deliver: (message) => void setTimeout(() => pipe.receive(structuredClone(message)), 0),
    },
  );
  const posted: Array<{ type: string }> = [];
  const page = (): BoardFiles =>
    createFilesClient(
      pipe.over({
        postMessage(message) {
          posted.push(structuredClone(message) as { type: string });
          setTimeout(() => void panel.receive(structuredClone(message)), 0);
        },
      }),
    );
  return {
    files: page(),
    backend,
    posted,
    reloaded() {
      pipe = filesChannel();
      return page();
    },
  };
}

describe("a page's files over the webview's channel, against the extension's editor options", () => {
  test("says hello through the API and hears what a board reaches of the repository", async () => {
    const { files, posted } = await wired();
    expect(posted).toEqual([{ type: "board.hello", protocol: 2 }]);
    expect(files.paths()).toEqual([]);
    await vi.waitFor(() => expect(files.paths()).toEqual(["assets/logo.svg", "models/tea.owm"]));
  });

  test("opens a model, writes it into the place, and hears a change from outside", async () => {
    const { files, backend } = await wired();
    const session = await files.openText("models/tea.owm");
    expect(session.text()).toBe(TEA);
    session.write("title Mine\n", TEA);
    await files.settled();
    expect(backend.textOf("models/tea.owm")).toBe("title Mine\n");

    const replaced: string[] = [];
    session.onReplace((text) => void replaced.push(text));
    backend.outside("models/tea.owm", "title Outside\n");
    await vi.waitFor(() => expect(replaced).toEqual(["title Outside\n"]));
    expect(session.text()).toBe("title Outside\n");
  });

  test("reads a picture's bytes and stores a new one, both as messages", async () => {
    const { files, backend, posted } = await wired();
    const logo = await files.readBytes("assets/logo.svg");
    expect(logo?.type).toBe("image/svg+xml");
    expect(await logo?.text()).toBe("<svg/>");

    await files.createFile?.("assets/new.png", new Blob([new Uint8Array([1, 2, 3])]));
    expect(backend.list()).toContain("assets/new.png");
    expect(posted.map((message) => message.type)).toEqual([
      "board.hello",
      "board.bytes.read",
      "board.file.create",
    ]);
  });

  test("is refused what a board does not reach, with the server's own message", async () => {
    const { files } = await wired();
    await expect(files.openText("readme.md")).rejects.toThrow(
      "readme.md is no model a board shows here",
    );
    await settled();
  });

  test("starts anew for a webview that is loaded again on the same panel: the last write of the page before landed, and the new page counts its versions from 1", async () => {
    const { files, backend, posted, reloaded } = await wired();
    const before = await files.openText("models/tea.owm");
    // the page before lived long enough to hear a change from outside: its text is at version 2
    const heard: string[] = [];
    before.onReplace((text) => void heard.push(text));
    backend.outside("models/tea.owm", "title Outside\n");
    await vi.waitFor(() => expect(heard).toEqual(["title Outside\n"]));
    // it writes, and is gone before anybody answered
    before.write("title Mine\n", "title Outside\n");
    const again = reloaded();
    expect(posted).toEqual([
      { type: "board.hello", protocol: 2 },
      { type: "board.text.open", requestId: 1, path: "models/tea.owm" },
      { type: "board.text.edit", path: "models/tea.owm", text: "title Mine\n", version: 2 },
      { type: "board.hello", protocol: 2 },
    ]);
    // the new page is told the list again, and opens the text the page before left
    await vi.waitFor(() => expect(again.paths()).toEqual(["assets/logo.svg", "models/tea.owm"]));
    expect(backend.textOf("models/tea.owm")).toBe("title Mine\n");
    const session = await again.openText("models/tea.owm");
    expect(session.text()).toBe("title Mine\n");

    // Its text is a text opened anew: the first edit is made on version 1 again, and is taken.
    session.write("title Again\n", "title Mine\n");
    await again.settled();
    expect(posted.at(-2)).toEqual({
      type: "board.text.edit",
      path: "models/tea.owm",
      text: "title Again\n",
      version: 1,
    });
    expect(backend.textOf("models/tea.owm")).toBe("title Again\n");
    // and a change from outside is told once, to the page that lives
    const replaced: string[] = [];
    session.onReplace((text) => void replaced.push(text));
    backend.outside("models/tea.owm", "title Outside again\n");
    await vi.waitFor(() => expect(replaced).toEqual(["title Outside again\n"]));
    await settled();
    expect(replaced).toHaveLength(1);
    expect(heard).toHaveLength(1);
  });
});
