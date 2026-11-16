/**
 * The words for a change that is not in the file: on the real board over a memory backend, where
 * the change crosses one from outside or the place refuses it, and on the port's double, where a
 * test holds the clock.
 */
import { WriteRefusal, type FilesBackend, type MemoryBackend } from "@miragon/board-files";
import type { EmbeddedEditor, EmbeddedEditorContext } from "@miragon/board-renderer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";

import { DROPPED_NOTICE_MS, DROPPED_TEXT, openEditor } from "../../src/index.js";
import {
  boardText,
  modelNode,
  mountHostBoard,
  type HostBoard,
  type HostBoardOptions,
} from "../support/board.js";
import { fakeFiles, fakeSession, settled } from "../support/fake-files.js";
import {
  arm,
  centreOf,
  contrast,
  delivered,
  itemOf,
  OUTSIDE_THE_BOARD,
  ready,
  SOON,
  stateOf,
} from "../support/on-board.js";
import { standInEditors, type StandInModeler } from "../support/stand-in-modeler.js";
import { watchWindowErrors, type WindowErrors } from "../support/window-errors.js";

const PLAN_PATH = "plans/plan.items";
const PLAN = "# the plan\na 0 0 Alpha\nb 200 100 Beta\n";
const OUTSIDE = PLAN.replace("Beta", "Outside");

const NODES = {
  plan: modelNode("n_plan", PLAN_PATH, 0, 0),
  twin: modelNode("n_twin", PLAN_PATH, 560, 0),
};

let board: HostBoard | undefined;
let windowErrors: WindowErrors;
const loose: EmbeddedEditor[] = [];
const made: HTMLElement[] = [];

beforeAll(() => {
  windowErrors = watchWindowErrors();
});
beforeEach(() => {
  document.documentElement.style.setProperty("--cd-motion-base", "0ms");
});
afterEach(async () => {
  vi.useRealTimers();
  await commands.realInput([{ type: "move", ...OUTSIDE_THE_BOARD }]);
  await board?.destroy();
  board = undefined;
  for (const editor of loose.splice(0)) editor.destroy();
  for (const element of made.splice(0)) element.remove();
  document.documentElement.style.removeProperty("--cd-motion-base");
  await settled();
  expect(windowErrors.errors).toEqual([]);
});
afterAll(() => {
  windowErrors.stop();
});

async function mount(nodes: string[], options: HostBoardOptions = {}): Promise<HostBoard> {
  board = await mountHostBoard({ [PLAN_PATH]: PLAN }, boardText(...nodes), options);
  return board;
}

/** a place that answers every write of a model as `write` says; undefined is its own answer */
const answering =
  (write: (text: string) => Promise<boolean> | undefined) =>
  (memory: MemoryBackend): FilesBackend => ({
    ...memory,
    async openText(path) {
      const text = await memory.openText(path);
      return {
        ...text,
        write: (next, base) => write(next) ?? text.write(next, base),
      };
    },
  });

const lineOf = (mounted: HostBoard, id: string): HTMLElement => {
  const lines = mounted.engine(id).querySelectorAll<HTMLElement>(":scope > .board-host-notice");
  if (lines.length !== 1) throw new Error(`the node ${id} has ${lines.length} notice lines`);
  return lines[0] as HTMLElement;
};
/** what the node says of a dropped change; undefined while it says nothing */
const saidBy = (mounted: HostBoard, id: string): string | undefined => {
  const line = lineOf(mounted, id);
  return line.hidden ? undefined : (line.textContent ?? "");
};

describe("a change that is not in the file", () => {
  it("that crossed a change from outside is dropped whole, and its node says so in words, once", async () => {
    const mounted = await mount([NODES.plan, NODES.twin]);
    await ready(mounted, "n_plan", "n_twin");
    const editor = mounted.editorOf("n_plan");
    const line = lineOf(mounted, "n_plan");
    // a live region that is there before it speaks
    expect(line.getAttribute("role")).toBe("status");
    expect([saidBy(mounted, "n_plan"), saidBy(mounted, "n_twin")]).toEqual([undefined, undefined]);

    // in one task: the outside's change is on its way to the page when the canvas changes
    mounted.backend.outside(PLAN_PATH, OUTSIDE);
    editor.commands.move("a", 5, 5);

    await expect.poll(() => saidBy(mounted, "n_plan"), SOON).toBe(DROPPED_TEXT.crossed);
    expect(line.dataset.reason).toBe("crossed");
    await mounted.files.settled();
    await delivered(mounted);
    // still dropped whole: the file is the outside's, and so is the canvas
    expect(mounted.backend.textOf(PLAN_PATH)).toBe(OUTSIDE);
    expect(mounted.backend.writes).toEqual([]);
    expect(editor.exportText()).toBe("a 0 0 Alpha\nb 200 100 Outside\n");
    expect(stateOf(mounted, "n_plan")).toBe("ready");
    // the node whose change it was says it, and no other node of the file
    expect(saidBy(mounted, "n_plan")).toBe(DROPPED_TEXT.crossed);
    expect(saidBy(mounted, "n_twin")).toBeUndefined();

    // the words go with the next change the person makes, which is the file's
    editor.commands.move("a", 5, 5);
    expect(saidBy(mounted, "n_plan")).toBeUndefined();
    expect(line.dataset.reason).toBeUndefined();
    await expect.poll(() => mounted.backend.writes.length, SOON).toBe(1);
    await delivered(mounted);
    expect(saidBy(mounted, "n_plan")).toBeUndefined();
  });

  it("that a person dropped after a change from outside came under their held drag is said too", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const editor = mounted.editorOf("n_plan");
    await arm(mounted, "n_plan");
    const from = centreOf(itemOf(mounted, "n_plan", "a"));
    await commands.realInput([
      { type: "move", ...from },
      { type: "down" },
      { type: "move", x: from.x + 40, y: from.y + 30, steps: 4 },
    ]);
    await expect.poll(() => editor.interaction?.active()).toBe(true);
    mounted.backend.outside(PLAN_PATH, OUTSIDE);
    await delivered(mounted);
    expect(saidBy(mounted, "n_plan")).toBeUndefined();

    await commands.realInput([{ type: "up" }]);

    await expect.poll(() => saidBy(mounted, "n_plan"), SOON).toBe(DROPPED_TEXT.crossed);
    await expect.poll(() => editor.exportText(), SOON).toBe("a 0 0 Alpha\nb 200 100 Outside\n");
    expect(mounted.backend.writes).toEqual([]);
  });

  it("that would make the model larger than the place takes is dropped, and the node says that it was too large", async () => {
    const limit = PLAN.length + 20;
    const mounted = await mount([NODES.plan], {
      serve: answering((text) =>
        text.length > limit ? Promise.reject(new WriteRefusal("too-large")) : undefined,
      ),
    });
    await ready(mounted, "n_plan");
    const editor = mounted.editorOf("n_plan");

    editor.commands.add("An item with a name that is far too long for this place");

    await expect.poll(() => saidBy(mounted, "n_plan"), SOON).toBe(DROPPED_TEXT["too-large"]);
    expect(lineOf(mounted, "n_plan").dataset.reason).toBe("too-large");
    // the place kept its text, and the canvas shows it again
    await expect.poll(() => editor.exportText(), SOON).toBe("a 0 0 Alpha\nb 200 100 Beta\n");
    expect(mounted.backend.textOf(PLAN_PATH)).toBe(PLAN);
    expect(mounted.backend.writes).toEqual([]);

    // a change that fits is taken, and the words are gone
    editor.commands.move("a", 5, 5);
    await expect.poll(() => mounted.backend.writes.length, SOON).toBe(1);
    await delivered(mounted);
    expect(saidBy(mounted, "n_plan")).toBeUndefined();
  });

  it("that the place did not take without a reason is said as a file that could not be written", async () => {
    const mounted = await mount([NODES.plan], {
      serve: answering(() => Promise.reject(new Error("the disk is full"))),
    });
    await ready(mounted, "n_plan");

    mounted.editorOf("n_plan").commands.move("a", 5, 5);

    await expect.poll(() => saidBy(mounted, "n_plan"), SOON).toBe(DROPPED_TEXT.refused);
    expect(mounted.backend.textOf(PLAN_PATH)).toBe(PLAN);
  });

  it("is said in the element the board made for the new path of a file that moved", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const editor = mounted.editorOf("n_plan");
    const before = mounted.engine("n_plan");
    mounted.backend.move(PLAN_PATH, "archive/plan.items");
    await expect
      .poll(() => mounted.sessions.some((session) => session.path === "archive/plan.items"), SOON)
      .toBe(true);
    await delivered(mounted);
    expect(mounted.engine("n_plan")).not.toBe(before);

    mounted.backend.outside("archive/plan.items", OUTSIDE);
    editor.commands.move("a", 5, 5);

    await expect.poll(() => saidBy(mounted, "n_plan"), SOON).toBe(DROPPED_TEXT.crossed);
    expect(before.querySelector(".board-host-notice")).toBeNull();
  });

  it("is said over the bottom edge of the editor, readable on the page's roles, and takes no pointer from it", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const editor = mounted.editorOf("n_plan");
    await arm(mounted, "n_plan");
    mounted.backend.outside(PLAN_PATH, OUTSIDE);
    editor.commands.move("a", 5, 5);
    await expect.poll(() => saidBy(mounted, "n_plan"), SOON).toBe(DROPPED_TEXT.crossed);

    const engine = mounted.engine("n_plan");
    const line = lineOf(mounted, "n_plan");
    const style = getComputedStyle(line);
    expect(contrast(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(line.offsetTop + line.offsetHeight).toBe(engine.offsetHeight);
    expect(line.offsetHeight).toBeLessThan(engine.offsetHeight / 3);
    expect(line.offsetWidth).toBe(engine.offsetWidth);
    // the editor below it is in reach: what a pointer meets there is the editor's
    const at = centreOf(line);
    const met = document.elementFromPoint(at.x, at.y);
    expect(met).not.toBe(line);
    expect(engine.querySelector(".board-host-editor")?.contains(met)).toBe(true);
  });
});

describe("the words, with the clock in the test's hand", () => {
  interface Bench {
    readonly element: HTMLElement;
    readonly editor: EmbeddedEditor;
    readonly modeler: StandInModeler;
    readonly session: ReturnType<typeof fakeSession>;
    /** undefined while the node says nothing */
    said(): string | undefined;
  }

  /** an editor on the port's double, ready, and from then on with a clock the test moves */
  async function bench(): Promise<Bench> {
    const port = fakeFiles([PLAN_PATH]);
    const session = fakeSession(PLAN_PATH, PLAN);
    port.sessions.set(PLAN_PATH, session);
    const editors = standInEditors();
    const element = document.createElement("div");
    element.className = "board-engine";
    element.dataset.armed = "false";
    element.style.cssText = "position:absolute;left:40px;top:40px;width:480px;height:320px";
    document.body.append(element);
    made.push(element);
    const context: EmbeddedEditorContext = {
      nodeId: "n_0",
      path: PLAN_PATH,
      element,
      armed: () => false,
      onArmedChange: () => () => undefined,
      relocate: () => undefined,
    };
    const editor = openEditor(context, { entry: editors.entry, files: port });
    loose.push(editor);
    await editor.ready;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const line = element.querySelector<HTMLElement>(":scope > .board-host-notice") as HTMLElement;
    return {
      element,
      editor,
      modeler: editors.made[0] as StandInModeler,
      session,
      said: () => (line.hidden ? undefined : (line.textContent ?? "")),
    };
  }

  it("go by themselves after a while, and not before", async () => {
    const { session, said, element } = await bench();
    expect(DROPPED_NOTICE_MS).toBe(15_000);

    session.drop("crossed");
    expect(said()).toBe(DROPPED_TEXT.crossed);
    vi.advanceTimersByTime(DROPPED_NOTICE_MS - 1);
    expect(said()).toBe(DROPPED_TEXT.crossed);

    vi.advanceTimersByTime(1);
    expect(said()).toBeUndefined();
    const line = element.querySelector<HTMLElement>(".board-host-notice");
    expect(line?.textContent).toBe("");
    expect(line?.dataset.reason).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("are said once at a time: a second drop takes the place of the first and its time starts anew", async () => {
    const { session, said, element } = await bench();

    session.drop("crossed");
    vi.advanceTimersByTime(10_000);
    session.drop("too-large");

    expect(said()).toBe(DROPPED_TEXT["too-large"]);
    expect(element.querySelectorAll(".board-host-notice")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(10_000);
    expect(said()).toBe(DROPPED_TEXT["too-large"]);
    vi.advanceTimersByTime(5_000);
    expect(said()).toBeUndefined();
  });

  it("go when the person changes the model again, and stay for a change that writes nothing", async () => {
    const { session, modeler, said } = await bench();
    session.drop("refused");

    // a change of something the text does not hold
    modeler.commands.touch();
    expect(said()).toBe(DROPPED_TEXT.refused);

    modeler.commands.move("a", 5, 5);
    expect(said()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    expect(session.writes).toHaveLength(1);
  });

  it("go with the node, and leave no clock running", async () => {
    const { session, editor, element } = await bench();
    session.drop("crossed");
    expect(vi.getTimerCount()).toBe(1);

    editor.destroy();
    loose.length = 0;

    expect(vi.getTimerCount()).toBe(0);
    expect(element.querySelector(".board-host-notice")).toBeNull();
    // a word that comes late finds nobody
    session.drop("crossed");
    expect(element.children).toHaveLength(0);
  });

  it("have a sentence for each reason, which says what was lost and what to do", () => {
    const sentences = Object.values(DROPPED_TEXT);
    expect(Object.keys(DROPPED_TEXT).sort()).toEqual(["crossed", "refused", "too-large"]);
    expect(new Set(sentences).size).toBe(3);
    for (const sentence of sentences) {
      expect(sentence.startsWith("Your last change was dropped: ")).toBe(true);
      expect(sentence).toMatch(/\. (Make it again|Remove something)/);
    }
  });
});
