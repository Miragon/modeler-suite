/**
 * The image port as a host fills it (src/host/types.ts BoardImages, src/gestures/images.ts,
 * src/canvas/board-gestures.tsx): what `store` may answer, who says whether a path is in use, a
 * board that goes while an image is on its way, and a file aimed at the armed editor.
 *
 * The file replaces src/canvas/board-gestures.js with a wrapper around the part as it is. Two
 * tests set it aside: the Image button is the toolbar's, and what it does with a picked image
 * must not depend on a part that has not loaded yet or that ended.
 *
 * No test here listens for window errors (the guide says why). Vitest counts an unhandled
 * rejection of this page by itself and fails the run for it: that is the check that a `store`
 * which throws or rejects leaves none behind.
 */
import { attachedHost } from "@miragon/modeler-api/conformance";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";

import type * as BoardGesturesModule from "../../src/canvas/board-gestures.js";
import { notices } from "../../src/gestures/notices.js";
import type { BoardHost, BoardImages } from "../../src/host/types.js";
import {
  boardText,
  type CollaborativeBoard,
  createBoardDoc,
  createCollaborativeModeler,
} from "../../src/index.js";
import { BOARD_A, BOARD_B, BOARD_EMPTY, IMAGE_PATH } from "../support/board-texts.js";
import { type MountedBoard, mountBoard } from "../support/mount-board.js";
import { doubleClick } from "../support/pointer.js";
import { createTestHost, type TestHost } from "../support/test-host.js";

type GesturesPart = "loaded" | "absent" | "throws";

/**
 * The lazily loaded gestures part of the boards of this file: as it is ("loaded"), not on the
 * page, as before its module arrived ("absent"), or ended by an error of its own ("throws").
 */
const gesturesPart = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const part = {
    is: "loaded" as GesturesPart,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: GesturesPart): void {
      part.is = next;
      for (const listener of [...listeners]) listener();
    },
  };
  return part;
});

vi.mock("../../src/canvas/board-gestures.js", async (importOriginal) => {
  const original = await importOriginal<typeof BoardGesturesModule>();
  const { createElement, useSyncExternalStore } = await import("react");
  return {
    ...original,
    BoardGestures: () => {
      const part = useSyncExternalStore(gesturesPart.subscribe, () => gesturesPart.is);
      if (part === "throws") throw new Error("the gestures part threw");
      return part === "absent" ? null : createElement(original.BoardGestures);
    },
  };
});

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  gesturesPart.set("loaded");
  // the notices are one list per page: the next test's toolbar would show what this one left
  for (const notice of notices.getSnapshot()) notices.dismiss(notice.id);
});

/** a part that is loaded lazily comes from the dev server on its first use in this file */
const LOADED = { timeout: 5000 };

const SKETCH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><path d="M4 44 24 16l12 16 8-10 16 22z"/></svg>';
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function mount(...args: Parameters<typeof mountBoard>): Promise<MountedBoard> {
  const board = await mountBoard(...args);
  cleanups.push(board.destroy);
  return board;
}

/** a board on a document the host shares, attached and mounted, with no import */
async function mountLive(
  doc: Y.Doc,
  host: BoardHost,
): Promise<{ modeler: CollaborativeBoard; element: HTMLElement }> {
  const element = attachedHost();
  const modeler = createCollaborativeModeler({ host, liveDocument: doc });
  cleanups.push(() => {
    modeler.destroy();
    element.parentElement?.remove();
  });
  modeler.attachTo(element);
  await modeler.board.mounted;
  return { modeler, element };
}

function within<T extends Element>(root: Element, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`the board has no ${selector}`);
  return found;
}

/** the board's paste and drop listeners are on, with the lazily loaded gestures */
const gesturesAreOn = (root: Element): Promise<void> =>
  expect
    .poll(() => within<HTMLElement>(root, ".react-flow").dataset.boardView, LOADED)
    .toBeTruthy();

function sketches(...names: string[]): DataTransfer {
  const transfer = new DataTransfer();
  for (const name of names) transfer.items.add(new File([SKETCH], name, { type: "image/svg+xml" }));
  return transfer;
}

function paste(target: Element, ...names: string[]): ClipboardEvent {
  const event = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: sketches(...names),
  });
  target.dispatchEvent(event);
  return event;
}

function drag(type: "dragover" | "drop", target: Element, transfer: DataTransfer): DragEvent {
  const box = target.getBoundingClientRect();
  const event = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    dataTransfer: transfer,
    clientX: box.x + 20,
    clientY: box.y + 20,
  });
  target.dispatchEvent(event);
  return event;
}

function pick(root: Element, ...names: string[]): void {
  const input = within<HTMLInputElement>(root, ".board-toolbar input[type='file']");
  input.files = sketches(...names).files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** the files of the board's image nodes */
const imageFiles = (modeler: CollaborativeBoard): Array<string | undefined> =>
  modeler.board.store
    .getSnapshot()
    .nodes.filter((node) => node.attrs.type === "image")
    .map((node) => node.attrs.file);

const shownNotices = (root: Element): Array<[string | undefined, string | null]> =>
  [...root.querySelectorAll<HTMLElement>(".board-notice")].map((notice) => [
    notice.dataset.kind,
    notice.querySelector("span")?.textContent ?? null,
  ]);

/**
 * As long as the board needs to read a picture's size, and 300 ms more: an import that was on
 * its way when its board went has stored and written by then, if anything lets it.
 */
async function afterTheDecode(): Promise<void> {
  const url = URL.createObjectURL(new Blob([SKETCH], { type: "image/svg+xml" }));
  const image = new Image();
  image.src = url;
  await image.decode();
  URL.revokeObjectURL(url);
  await sleep(300);
}

describe("a host's store()", () => {
  it("that returns at once: the node is written in the task of the store, as it was measured", async () => {
    const host = createTestHost({ canStore: true });
    const board = await mount(BOARD_EMPTY, { host });
    await gesturesAreOn(board.element);
    // the test host reports its change from inside store(): a microtask queued there runs before
    // anything the import awaited after the store
    let rightAfterTheStore: Array<string | undefined> | undefined;
    const stop = host.images?.onChange(() => {
      queueMicrotask(() => (rightAfterTheStore ??= imageFiles(board.modeler)));
    });

    expect(paste(board.pane(), "pasted.svg").defaultPrevented).toBe(true);

    await expect.poll(() => host.storeCalls, LOADED).toEqual(["assets/pasted.svg"]);
    await expect.poll(() => rightAfterTheStore, LOADED).toEqual(["assets/pasted.svg"]);
    stop?.();
    await expect
      .poll(() => shownNotices(board.element), LOADED)
      .toEqual([["added", "assets/pasted.svg is a file of the repository now (130 B)."]]);
  });

  it("that returns a promise: the node and the notice come when it resolves, not before", async () => {
    const host = createTestHost({ canStore: true, storing: "manual" });
    const board = await mount(BOARD_EMPTY, { host });
    await gesturesAreOn(board.element);
    let changes = 0;
    board.modeler.onContentChanged(() => void changes++);

    paste(board.pane(), "later.svg");
    await expect.poll(() => host.storeCalls, LOADED).toEqual(["assets/later.svg"]);
    await afterTheDecode();
    expect(imageFiles(board.modeler)).toEqual([]);
    expect(shownNotices(board.element)).toEqual([]);
    expect(board.modeler.exportText()).toBe(BOARD_EMPTY);
    expect(changes).toBe(0);

    host.settleStore("assets/later.svg");
    await expect.poll(() => imageFiles(board.modeler), LOADED).toEqual(["assets/later.svg"]);
    await expect
      .poll(() => shownNotices(board.element), LOADED)
      .toEqual([["added", "assets/later.svg is a file of the repository now (130 B)."]]);
    // the bytes were there before the node: it never showed the missing-file figure
    await expect
      .poll(() => board.element.querySelector(".board-image")?.getAttribute("data-missing"), LOADED)
      .toBe("false");
    expect(changes).toBe(1);
  });

  it("the files of one paste are stored one after the other, and a refused one does not stop the next", async () => {
    const host = createTestHost({ canStore: true, storing: "manual" });
    const board = await mount(BOARD_EMPTY, { host });
    await gesturesAreOn(board.element);

    paste(board.pane(), "first.svg", "second.svg");
    await expect.poll(() => host.storeCalls, LOADED).toEqual(["assets/first.svg"]);
    await afterTheDecode();
    expect(host.storeCalls).toEqual(["assets/first.svg"]);

    host.settleStore("assets/first.svg", new Error("the repository is full"));
    await expect
      .poll(() => host.storeCalls, LOADED)
      .toEqual(["assets/first.svg", "assets/second.svg"]);
    expect(shownNotices(board.element)).toEqual([
      ["refused", "first.svg was not added: the repository is full"],
    ]);
    host.settleStore("assets/second.svg");
    await expect.poll(() => imageFiles(board.modeler), LOADED).toEqual(["assets/second.svg"]);
    expect(host.stored.map((entry) => entry.path)).toEqual(["assets/second.svg"]);
  });

  it.each(["reject", "throw"] as const)(
    "that refuses (%s): a refused notice with the error's message, and no node",
    async (storing) => {
      const host = createTestHost({ canStore: true, storing });
      const board = await mount(BOARD_EMPTY, { host });
      await gesturesAreOn(board.element);
      let changes = 0;
      board.modeler.onContentChanged(() => void changes++);

      paste(board.pane(), "plan.svg");

      await expect
        .poll(() => shownNotices(board.element), LOADED)
        .toEqual([
          ["refused", "plan.svg was not added: assets/plan.svg was refused by the test host"],
        ]);
      // an unhandled rejection would be reported to the page while this test still runs
      await afterTheDecode();
      expect(host.storeCalls).toEqual(["assets/plan.svg"]);
      expect(imageFiles(board.modeler)).toEqual([]);
      expect(board.modeler.exportText()).toBe(BOARD_EMPTY);
      expect(changes).toBe(0);
      expect(shownNotices(board.element).map(([kind]) => kind)).toEqual(["refused"]);
    },
  );

  it("a picked image that the host refuses selects nothing and leaves the toolbar as it was", async () => {
    const host = createTestHost({ canStore: true, storing: "reject" });
    const board = await mount(BOARD_EMPTY, { host });

    pick(board.element, "plan.svg");

    await expect
      .poll(() => shownNotices(board.element), LOADED)
      .toEqual([
        ["refused", "plan.svg was not added: assets/plan.svg was refused by the test host"],
      ]);
    await afterTheDecode();
    expect(imageFiles(board.modeler)).toEqual([]);
    expect(board.modeler.elements.selection()).toEqual([]);
    expect(within(board.element, ".board-toolbar button[title='Add a text note']")).toBeTruthy();
  });
});

describe("whether a path is in use", () => {
  it("is the host's taken() where it has one: read() is not asked, and a file the host has not loaded is not replaced", async () => {
    // assets/plan.svg is a file of the repository that no node shows, so the host holds no bytes
    const host = createTestHost({ canStore: true, images: {}, taken: ["assets/plan.svg"] });
    const board = await mount(BOARD_EMPTY, { host });
    await gesturesAreOn(board.element);

    paste(board.pane(), "plan.svg");

    await expect.poll(() => host.storeCalls, LOADED).toEqual(["assets/plan-2.svg"]);
    await expect.poll(() => imageFiles(board.modeler), LOADED).toEqual(["assets/plan-2.svg"]);
    expect(host.asked.filter((question) => question.via === "taken")).toEqual([
      { via: "taken", path: "assets/plan.svg" },
      { via: "taken", path: "assets/plan-2.svg" },
    ]);
    // read() is the image node's alone, for the path the node shows
    expect(
      host.asked.filter(
        (question) => question.via === "read" && question.path !== "assets/plan-2.svg",
      ),
    ).toEqual([]);
  });

  it("is read() where the host has no taken()", async () => {
    const taken = new Blob([SKETCH], { type: "image/svg+xml" });
    const host = createTestHost({ canStore: true, images: { "assets/plan.svg": taken } });
    const board = await mount(BOARD_EMPTY, { host });
    await gesturesAreOn(board.element);

    paste(board.pane(), "plan.svg");

    await expect.poll(() => host.storeCalls, LOADED).toEqual(["assets/plan-2.svg"]);
    expect(host.asked.slice(0, 2)).toEqual([
      { via: "read", path: "assets/plan.svg" },
      { via: "read", path: "assets/plan-2.svg" },
    ]);
  });

  it("a taken() that throws is a refused notice, and nothing is stored", async () => {
    const base = createTestHost({ canStore: true });
    const images: BoardImages = {
      ...(base.images as BoardImages),
      taken() {
        throw new Error("the file index is not loaded");
      },
    };
    const board = await mount(BOARD_EMPTY, { host: { images } });
    await gesturesAreOn(board.element);

    paste(board.pane(), "plan.svg");

    await expect
      .poll(() => shownNotices(board.element), LOADED)
      .toEqual([["refused", "plan.svg was not added: the file index is not loaded"]]);
    await afterTheDecode();
    expect(base.storeCalls).toEqual([]);
    expect(imageFiles(board.modeler)).toEqual([]);
  });
});

describe("a board that goes while an image is on its way", () => {
  interface Late {
    host: TestHost;
    doc: Y.Doc;
    modeler: CollaborativeBoard;
    element: HTMLElement;
    /** the updates a sync provider would have sent to every peer */
    updates: number[];
  }

  async function liveBoard(
    seed: Parameters<typeof createTestHost>[0],
    part: GesturesPart = "loaded",
  ): Promise<Late> {
    gesturesPart.set(part);
    const doc = createBoardDoc(BOARD_A);
    const host = createTestHost(seed);
    const { modeler, element } = await mountLive(doc, host);
    if (part === "loaded") await gesturesAreOn(element);
    await expect
      .poll(() => element.querySelector(".board-toolbar input[type='file']"), LOADED)
      .toBeTruthy();
    const updates: number[] = [];
    doc.on("update", (update: Uint8Array) => void updates.push(update.length));
    return { host, doc, modeler, element, updates };
  }

  it("an image pasted right before destroy() is not stored and not written into a live document", async () => {
    const { host, doc, modeler, element, updates } = await liveBoard({ canStore: true });

    expect(paste(within(element, ".react-flow__pane"), "late.svg").defaultPrevented).toBe(true);
    modeler.destroy();
    expect(boardText(doc)).toBe(BOARD_A);

    await afterTheDecode();
    expect(element.querySelector(".board-module")).toBeNull();
    expect(host.storeCalls).toEqual([]);
    expect(boardText(doc)).toBe(BOARD_A);
    expect(updates).toEqual([]);
    expect(notices.getSnapshot()).toEqual([]);
  });

  it("an image picked right before destroy() is not stored and not written either", async () => {
    const { host, doc, modeler, element, updates } = await liveBoard({ canStore: true });

    pick(element, "late.svg");
    modeler.destroy();

    await afterTheDecode();
    expect(host.storeCalls).toEqual([]);
    expect(boardText(doc)).toBe(BOARD_A);
    expect(updates).toEqual([]);
    expect(notices.getSnapshot()).toEqual([]);
  });

  it.each([
    ["resolves", undefined, ["assets/late.svg"]],
    ["rejects", new Error("the upload was cut off"), []],
  ])(
    "a store that %s after destroy() writes no node and tells nobody: the board is gone",
    async (_outcome, error, stored) => {
      const { host, doc, modeler, element, updates } = await liveBoard({
        canStore: true,
        storing: "manual",
      });

      paste(within(element, ".react-flow__pane"), "late.svg");
      await expect.poll(() => host.storeCalls, LOADED).toEqual(["assets/late.svg"]);
      modeler.destroy();
      await sleep(0);
      host.settleStore("assets/late.svg", error);

      await afterTheDecode();
      // what the host stored is the repository's; the board only writes no node for it
      expect(host.stored.map((entry) => entry.path)).toEqual(stored);
      expect(boardText(doc)).toBe(BOARD_A);
      expect(updates).toEqual([]);
      expect(notices.getSnapshot()).toEqual([]);
    },
  );

  it("an image picked before the gestures part has loaded, right before destroy(), is not stored and not written", async () => {
    const { host, doc, modeler, element, updates } = await liveBoard({ canStore: true }, "absent");
    expect(within<HTMLElement>(element, ".react-flow").dataset.boardView).toBeUndefined();

    pick(element, "late.svg");
    modeler.destroy();

    await afterTheDecode();
    expect(host.storeCalls).toEqual([]);
    expect(boardText(doc)).toBe(BOARD_A);
    expect(updates).toEqual([]);
    expect(notices.getSnapshot()).toEqual([]);
  });

  it("a board that stays takes the image as before (the control of the five above)", async () => {
    const { host, doc, element, updates } = await liveBoard({ canStore: true });

    paste(within(element, ".react-flow__pane"), "kept.svg");

    await expect.poll(() => host.storeCalls, LOADED).toEqual(["assets/kept.svg"]);
    await expect.poll(() => boardText(doc).includes(`"file":"assets/kept.svg"`), LOADED).toBe(true);
    expect(updates).toHaveLength(1);
  });

  it("a board whose gestures part ended still takes a picked image: only destroy() says that a board is gone", async () => {
    const { host, doc, element, updates } = await liveBoard({ canStore: true });
    // React reports the error it hands to the slot's boundary
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cleanups.push(() => reported.mockRestore());
    gesturesPart.set("throws");
    // the part's listeners are off again, and the toolbar stands
    await expect
      .poll(() => within<HTMLElement>(element, ".react-flow").dataset.boardView, LOADED)
      .toBeUndefined();

    pick(element, "kept.svg");

    await expect.poll(() => host.storeCalls, LOADED).toEqual(["assets/kept.svg"]);
    await expect.poll(() => boardText(doc).includes(`"file":"assets/kept.svg"`), LOADED).toBe(true);
    expect(updates).toHaveLength(1);
  });
});

describe("a file aimed at the armed editor", () => {
  it("is the editor's: a drop there is not taken, as a paste there is not, and the page is still kept", async () => {
    const host = createTestHost({ canStore: true });
    const board = await mount(BOARD_B, { host });
    await gesturesAreOn(board.element);
    await expect.poll(() => board.runtime.mounted("n_order"), LOADED).toBe(true);
    doubleClick(board.node("n_order"));
    await expect.poll(() => board.runtime.armedId(), LOADED).toBe("n_order");
    await expect.poll(() => host.events.at(-1)?.event, LOADED).toBe("focus");
    const inside = within<HTMLElement>(
      board.element,
      ".board-overlay-layer > .board-engine [data-test-editor='n_order']",
    );
    let editorSawTheDrop = 0;
    inside.addEventListener("drop", () => void editorSawTheDrop++);

    const transfer = sketches("dropped.svg");
    // a DataTransfer made by a script keeps no drop effect: what is written to it is recorded
    const effects: string[] = [];
    Object.defineProperty(transfer, "dropEffect", {
      configurable: true,
      get: () => effects.at(-1) ?? "none",
      set: (effect: string) => void effects.push(effect),
    });
    const over = drag("dragover", inside, transfer);
    // the browser would leave the page for a dropped file that nobody cancels
    expect(over.defaultPrevented).toBe(true);
    // the drop effect is the editor's to choose
    expect(effects).toEqual([]);
    await board.settle();
    expect(board.element.querySelector(".board-drop-hint")).toBeNull();

    const drop = drag("drop", inside, transfer);
    expect(drop.defaultPrevented).toBe(true);
    expect(editorSawTheDrop).toBe(1);
    expect(paste(inside, "pasted.svg").defaultPrevented).toBe(false);

    await afterTheDecode();
    expect(host.storeCalls).toEqual([]);
    expect(imageFiles(board.modeler)).toEqual([IMAGE_PATH]);
    expect(shownNotices(board.element)).toEqual([]);
    expect(board.modeler.exportText()).toBe(BOARD_B);
    expect(board.runtime.armedId()).toBe("n_order");

    // the control: the same file over and on the board's own ground, beside the armed editor
    const pane = board.pane();
    expect(drag("dragover", pane, transfer).defaultPrevented).toBe(true);
    expect(effects).toEqual(["copy"]);
    await expect.poll(() => board.element.querySelector(".board-drop-hint"), LOADED).not.toBeNull();
    // moved on over the armed editor, the hint goes at once and not when the drag rests
    drag("dragover", inside, transfer);
    await board.settle();
    expect(board.element.querySelector(".board-drop-hint")).toBeNull();
    expect(effects).toEqual(["copy"]);

    expect(drag("drop", pane, transfer).defaultPrevented).toBe(true);
    await expect.poll(() => host.storeCalls, LOADED).toEqual(["assets/dropped.svg"]);
    await expect
      .poll(() => imageFiles(board.modeler), LOADED)
      .toEqual([IMAGE_PATH, "assets/dropped.svg"]);
  });
});
