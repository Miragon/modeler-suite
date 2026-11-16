/**
 * A file no editor of the board shows: the card the host package puts into its node, on the real
 * board over a memory backend that shows files or shows none, and alone on the port's double.
 * What a person does is real input; a preview is `inert`, which only real input respects.
 */
import { fromBase64, type MemoryBackend } from "@miragon/board-files";
import type { EmbeddedEditor, EmbeddedEditorContext } from "@miragon/board-renderer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";

import {
  CARD_NOTE,
  NO_SHOW_TEXT,
  NOT_SHOWN_TEXT,
  OPEN_LABEL,
  openCard,
  SHOWN_TEXT,
  UNREACHED_TEXT,
} from "../../src/index.js";
import {
  boardText,
  modelNode,
  mountHostBoard,
  type HostBoard,
  type HostBoardOptions,
} from "../support/board.js";
import { fakeFiles, settled } from "../support/fake-files.js";
import {
  arm,
  centreOf,
  contrast,
  delivered,
  inLayer,
  OUTSIDE_THE_BOARD,
  ready,
  SOON,
  stateOf,
} from "../support/on-board.js";
import { watchWindowErrors, type WindowErrors } from "../support/window-errors.js";

const BPMN_PATH = "process/order.bpmn";
const PLAN_PATH = "plans/plan.items";
const PLAN = "a 0 0 Alpha\n";
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const files = () => ({
  [BPMN_PATH]: "<definitions/>\n",
  [PLAN_PATH]: PLAN,
  LICENSE: "MIT\n",
  "boards/other.board": "",
  "assets/logo.png": { bytes: fromBase64(PNG), mime: "image/png" },
});

const NODES = {
  bpmn: modelNode("n_bpmn", BPMN_PATH, 0, 0),
  licence: modelNode("n_licence", "LICENSE", 560, 0),
  board: modelNode("n_board", "boards/other.board", 0, 440),
  plan: modelNode("n_plan", PLAN_PATH, 560, 440),
  picture: modelNode("n_picture", "assets/logo.png", 0, 0),
  outside: modelNode("n_outside", "../outside/secret.txt", 0, 0),
  hidden: modelNode("n_hidden", ".github/workflows/ci.yml", 560, 0),
};

let board: HostBoard | undefined;
let windowErrors: WindowErrors;
const loose: Array<{ destroy(): void }> = [];
const made: HTMLElement[] = [];

beforeAll(() => {
  windowErrors = watchWindowErrors();
});
beforeEach(() => {
  document.documentElement.style.setProperty("--cd-motion-base", "0ms");
});
afterEach(async () => {
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
  board = await mountHostBoard(files(), boardText(...nodes), options);
  return board;
}

interface Showing {
  /** every path the host was asked to show, in order */
  readonly shown: string[];
  /** what the host answers: a text is its refusal, a promise its time */
  answer: (path: string) => string | undefined | Promise<string | undefined>;
  readonly serve: (
    memory: MemoryBackend,
  ) => MemoryBackend & { showFile(path: string): Promise<void> };
}

/** a backend that shows files, as a host with editors of its own does */
function showing(): Showing {
  const host: Showing = {
    shown: [],
    answer: () => undefined,
    serve: (memory) => ({
      ...memory,
      async showFile(path) {
        host.shown.push(path);
        const refusal = await host.answer(path);
        if (refusal !== undefined) throw new Error(refusal);
      },
    }),
  };
  return host;
}

const part = (mounted: HostBoard, id: string, name: string): HTMLElement => {
  const found = mounted.engine(id).querySelector<HTMLElement>(`.board-host-card__${name}`);
  if (!found) throw new Error(`the card of ${id} has no ${name}`);
  return found;
};
const buttonOf = (mounted: HostBoard, id: string): HTMLButtonElement =>
  part(mounted, id, "open") as HTMLButtonElement;
const saidBy = (mounted: HostBoard, id: string): string =>
  part(mounted, id, "said").textContent ?? "";
async function card(mounted: HostBoard, ...ids: string[]): Promise<void> {
  for (const id of ids) await expect.poll(() => stateOf(mounted, id), SOON).toBe("card");
}
/** the card of a node once the host said that it shows files */
async function offered(mounted: HostBoard, id: string): Promise<HTMLButtonElement> {
  await card(mounted, id);
  await expect.poll(() => buttonOf(mounted, id).hidden, SOON).toBe(false);
  return buttonOf(mounted, id);
}

/** a point of the board where nothing stands: no node, no toolbar */
function emptyPlace(mounted: HostBoard): { x: number; y: number } {
  const box = mounted.element.getBoundingClientRect();
  for (let y = box.bottom - 24; y > box.top; y -= 40) {
    for (let x = box.right - 24; x > box.left; x -= 40) {
      if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
    }
  }
  throw new Error("the board has no empty place in sight");
}

describe("a file no editor of the board shows", () => {
  it("is named on a card, in place of the look of a failed file, and nothing of it is read", async () => {
    const mounted = await mount([NODES.bpmn, NODES.licence, NODES.board, NODES.plan]);
    await card(mounted, "n_bpmn", "n_licence", "n_board");
    await ready(mounted, "n_plan");

    const engine = mounted.engine("n_bpmn");
    expect(engine.dataset.embed).toBe("card");
    expect(engine.classList.contains("board-engine--failed")).toBe(false);
    expect(part(mounted, "n_bpmn", "name").textContent).toBe("order.bpmn");
    expect(part(mounted, "n_bpmn", "folder").textContent).toBe("in process");
    expect(part(mounted, "n_bpmn", "note").textContent).toBe(CARD_NOTE);
    // a file at the root has no folder to name, and a board is a file like any other here
    expect(getComputedStyle(part(mounted, "n_licence", "folder")).display).toBe("none");
    expect(part(mounted, "n_licence", "folder").textContent).toBe("");
    expect(part(mounted, "n_licence", "name").textContent).toBe("LICENSE");
    // what a try to show the file comes to is said in a live region that is there from the start
    expect(part(mounted, "n_bpmn", "said").getAttribute("role")).toBe("status");
    expect(part(mounted, "n_board", "name").textContent).toBe("other.board");

    // the board has an editor for each of them and logged nothing
    for (const id of ["n_bpmn", "n_licence", "n_board"]) {
      await expect.poll(() => mounted.runtime.mounted(id), SOON).toBe(true);
    }
    expect(mounted.runtime.lines).toEqual([]);
    // the page asked for the model's text and for no other
    expect(mounted.opens).toEqual([PLAN_PATH]);
  });

  it("has no button where the host shows no file, and says so in words", async () => {
    const mounted = await mount([NODES.bpmn]);
    await card(mounted, "n_bpmn");

    await expect.poll(() => saidBy(mounted, "n_bpmn"), SOON).toBe(NO_SHOW_TEXT);
    const button = buttonOf(mounted, "n_bpmn");
    expect(button.hidden).toBe(true);
    expect(getComputedStyle(button).display).toBe("none");
  });

  it("offers the way to the file where the host shows files: a real click on the button of a preview asks the host", async () => {
    const host = showing();
    const mounted = await mount([NODES.bpmn, NODES.plan], { serve: host.serve });
    const button = await offered(mounted, "n_bpmn");
    expect(button.textContent).toBe(OPEN_LABEL);
    expect(saidBy(mounted, "n_bpmn")).toBe("");
    // a preview: the board scales it and keeps it inert
    expect(mounted.runtime.armedId()).toBeNull();
    expect(button.closest("[inert]")).not.toBeNull();

    await commands.realInput([{ type: "click", ...centreOf(button) }]);

    await expect.poll(() => host.shown, SOON).toEqual([BPMN_PATH]);
    await expect.poll(() => saidBy(mounted, "n_bpmn"), SOON).toBe(SHOWN_TEXT);
    await delivered(mounted);
    // shown by the host: the node is not armed, the board did not change, the page read nothing
    expect(mounted.runtime.armedId()).toBeNull();
    expect(mounted.boardChanges()).toBe(0);
    expect(mounted.opens).toEqual([PLAN_PATH]);
    expect(mounted.backend.writes).toEqual([]);
  });

  it("asks nothing for a real click beside the button, and nothing for a drag that starts on it", async () => {
    const host = showing();
    const mounted = await mount([NODES.bpmn, NODES.plan], { serve: host.serve });
    const button = await offered(mounted, "n_bpmn");

    await commands.realInput([{ type: "click", ...centreOf(part(mounted, "n_bpmn", "name")) }]);
    await delivered(mounted);
    expect(host.shown).toEqual([]);

    const from = centreOf(button);
    await commands.realInput([
      { type: "move", ...from },
      { type: "down" },
      { type: "move", x: from.x + 60, y: from.y + 40, steps: 6 },
      { type: "up" },
    ]);
    // the drag moved the node, which is one change of the board
    await expect.poll(() => mounted.boardChanges(), SOON).toBe(1);
    await delivered(mounted);
    expect(host.shown).toEqual([]);

    // and the button still works where it stands now
    await commands.realInput([{ type: "click", ...centreOf(buttonOf(mounted, "n_bpmn")) }]);
    await expect.poll(() => host.shown, SOON).toEqual([BPMN_PATH]);
  });

  it("asks nothing for a click on a node that lies over the button", async () => {
    const host = showing();
    // the plan's node covers the card, and is above it in the paint order
    const over = JSON.stringify({ ...JSON.parse(NODES.plan), x: 0, y: 0, z: "a5" });
    const mounted = await mount([NODES.bpmn, over], { serve: host.serve });
    const button = await offered(mounted, "n_bpmn");
    await ready(mounted, "n_plan");

    await commands.realInput([{ type: "click", ...centreOf(button) }]);
    await delivered(mounted);

    expect(host.shown).toEqual([]);
  });

  it("is armed by a real double-click like every model node, and takes that for the wish to open the file", async () => {
    const host = showing();
    const mounted = await mount([NODES.bpmn, NODES.plan], { serve: host.serve });
    await offered(mounted, "n_bpmn");
    const before = mounted.modeler.exportText();

    // beside the button: the double-click is the board's, and the card hears that it was armed
    await arm(mounted, "n_bpmn");

    await expect.poll(() => host.shown, SOON).toEqual([BPMN_PATH]);
    await expect.poll(() => saidBy(mounted, "n_bpmn"), SOON).toBe(SHOWN_TEXT);
    // armed, the card is in the layer at 100 %: its button takes the keys and real clicks
    const button = buttonOf(mounted, "n_bpmn");
    expect(inLayer(mounted, "n_bpmn")).toBe(true);
    expect(document.activeElement).toBe(button);
    await commands.realInput([{ type: "press", key: "Enter" }]);
    await expect.poll(() => host.shown, SOON).toEqual([BPMN_PATH, BPMN_PATH]);
    await commands.realInput([{ type: "click", ...centreOf(button) }]);
    await expect.poll(() => host.shown, SOON).toHaveLength(3);

    const done = mounted.element.querySelector("[data-board-done]") as Element;
    await commands.realInput([{ type: "click", ...centreOf(done) }]);
    await expect.poll(() => mounted.runtime.armedId(), SOON).toBeNull();
    await expect.poll(() => inLayer(mounted, "n_bpmn"), SOON).toBe(false);
    await delivered(mounted);

    // an armed card has nothing to edit: no write, no change of the board, no focus left in it
    expect(mounted.engine("n_bpmn").contains(document.activeElement)).toBe(false);
    expect(mounted.backend.writes).toEqual([]);
    expect(mounted.modeler.exportText()).toBe(before);
    expect(mounted.boardChanges()).toBe(0);
    expect(host.shown).toHaveLength(3);
    expect(mounted.runtime.lines).toEqual([]);
  });

  it("is armed by the header's Edit as well, which opens the file", async () => {
    const host = showing();
    const mounted = await mount([NODES.bpmn], { serve: host.serve });
    await offered(mounted, "n_bpmn");

    const edit = mounted.node("n_bpmn").querySelector(".board-node__arm") as Element;
    await commands.realInput([{ type: "click", ...centreOf(edit) }]);

    await expect.poll(() => mounted.runtime.armedId(), SOON).toBe("n_bpmn");
    await expect.poll(() => host.shown, SOON).toEqual([BPMN_PATH]);
  });

  it("asks the host once for a double-click on the button while the first click's answer is on its way", async () => {
    const host = showing();
    let answer!: () => void;
    host.answer = () => new Promise((resolve) => (answer = () => resolve(undefined)));
    const mounted = await mount([NODES.bpmn], { serve: host.serve });
    const button = await offered(mounted, "n_bpmn");

    await commands.realInput([{ type: "dblclick", ...centreOf(button) }]);
    await expect.poll(() => mounted.runtime.armedId(), SOON).toBe("n_bpmn");
    await delivered(mounted);

    // the first click asked; the second and the arming found that question still open
    expect(mounted.shows).toEqual([BPMN_PATH]);
    expect(saidBy(mounted, "n_bpmn")).toBe("");
    answer();
    await expect.poll(() => saidBy(mounted, "n_bpmn"), SOON).toBe(SHOWN_TEXT);
    expect(host.shown).toEqual([BPMN_PATH]);
  });

  it("asks the host once for a double-click on the button where the host answers at once: the arming it brings asks nothing more", async () => {
    const host = showing();
    const mounted = await mount([NODES.bpmn, NODES.plan], { serve: host.serve });
    const button = await offered(mounted, "n_bpmn");

    await commands.realInput([{ type: "dblclick", ...centreOf(button) }]);
    await expect.poll(() => mounted.runtime.armedId(), SOON).toBe("n_bpmn");
    await expect.poll(() => saidBy(mounted, "n_bpmn"), SOON).toBe(SHOWN_TEXT);
    await delivered(mounted);
    expect(mounted.shows).toEqual([BPMN_PATH]);

    // the next arming is one of its own: Done, then the header's Edit
    const done = (): Element => mounted.element.querySelector("[data-board-done]") as Element;
    await commands.realInput([{ type: "click", ...centreOf(done()) }]);
    await expect.poll(() => mounted.runtime.armedId(), SOON).toBeNull();
    const edit = mounted.node("n_bpmn").querySelector(".board-node__arm") as Element;
    await commands.realInput([{ type: "click", ...centreOf(edit) }]);
    await expect.poll(() => mounted.shows, SOON).toEqual([BPMN_PATH, BPMN_PATH]);

    // and so is a double-click beside the button, whatever the clicks before it asked
    await commands.realInput([{ type: "click", ...centreOf(done()) }]);
    await expect.poll(() => mounted.runtime.armedId(), SOON).toBeNull();
    await expect.poll(() => inLayer(mounted, "n_bpmn"), SOON).toBe(false);
    await mounted.settle();
    await commands.realInput([{ type: "click", ...centreOf(buttonOf(mounted, "n_bpmn")) }]);
    await expect.poll(() => mounted.shows, SOON).toHaveLength(3);
    await arm(mounted, "n_bpmn");
    await expect.poll(() => mounted.shows, SOON).toHaveLength(4);
  });

  it("is harmless when it is armed where the host shows no file: it says so and keeps the keys from the page", async () => {
    const mounted = await mount([NODES.bpmn, NODES.plan]);
    await card(mounted, "n_bpmn");
    await expect.poll(() => saidBy(mounted, "n_bpmn"), SOON).toBe(NO_SHOW_TEXT);

    await arm(mounted, "n_bpmn");

    const engine = mounted.engine("n_bpmn");
    expect(document.activeElement).toBe(engine.querySelector(".board-host-card"));
    expect(saidBy(mounted, "n_bpmn")).toBe(NO_SHOW_TEXT);
    await commands.realInput([
      { type: "press", key: "Enter" },
      { type: "press", key: "Delete" },
    ]);
    await delivered(mounted);
    expect(mounted.modeler.exportText()).toContain(BPMN_PATH);
    expect(mounted.boardChanges()).toBe(0);

    // a click on the board beside it ends it, as it ends the editing of a model
    await commands.realInput([{ type: "click", ...emptyPlace(mounted) }]);
    await expect.poll(() => mounted.runtime.armedId(), SOON).toBeNull();
    expect(mounted.runtime.lines).toEqual([]);
  });

  it("says what the host says where the file could not be shown, and asks again on the next click", async () => {
    const host = showing();
    host.answer = (path) => `${path} does not exist`;
    const mounted = await mount([NODES.bpmn], { serve: host.serve });
    const button = await offered(mounted, "n_bpmn");

    await commands.realInput([{ type: "click", ...centreOf(button) }]);
    await expect
      .poll(() => saidBy(mounted, "n_bpmn"), SOON)
      .toBe(`${NOT_SHOWN_TEXT} ${BPMN_PATH} does not exist`);
    expect(button.hidden).toBe(false);

    let answer!: () => void;
    host.answer = () => new Promise((resolve) => (answer = () => resolve(undefined)));
    await commands.realInput([{ type: "click", ...centreOf(button) }]);
    // the words of the last try go with the next one, before its answer is there
    await expect.poll(() => saidBy(mounted, "n_bpmn"), SOON).toBe("");
    await expect.poll(() => host.shown, SOON).toEqual([BPMN_PATH, BPMN_PATH]);
    answer();
    await expect.poll(() => saidBy(mounted, "n_bpmn"), SOON).toBe(SHOWN_TEXT);
  });

  it("has no way to a path the files port refuses whoever asks, and asks the host nothing", async () => {
    const host = showing();
    const mounted = await mount([NODES.outside, NODES.hidden, NODES.bpmn], { serve: host.serve });
    await offered(mounted, "n_bpmn");
    await card(mounted, "n_outside", "n_hidden");

    for (const id of ["n_outside", "n_hidden"]) {
      expect(buttonOf(mounted, id).hidden).toBe(true);
      expect(saidBy(mounted, id)).toBe(UNREACHED_TEXT);
    }
    expect(part(mounted, "n_hidden", "name").textContent).toBe("ci.yml");
    await arm(mounted, "n_outside");
    await delivered(mounted);
    expect(host.shown).toEqual([]);
  });

  it("follows its file where the files port tells the move, as one change of the board", async () => {
    // a picture in a model node: the registry has no editor for it, and the host's rule reaches it
    const mounted = await mount([NODES.picture]);
    await card(mounted, "n_picture");
    expect(part(mounted, "n_picture", "name").textContent).toBe("logo.png");

    mounted.backend.move("assets/logo.png", "assets/brand/mark.png");

    await expect.poll(() => mounted.boardChanges(), SOON).toBe(1);
    await expect.poll(() => part(mounted, "n_picture", "name").textContent, SOON).toBe("mark.png");
    expect(part(mounted, "n_picture", "folder").textContent).toBe("in assets/brand");
    expect(mounted.modeler.exportText()).toContain('"file":"assets/brand/mark.png"');
    await delivered(mounted);
    expect(mounted.boardChanges()).toBe(1);
  });

  it("is not told a move of a file the host's rule does not reach: the node keeps the path it had", async () => {
    const host = showing();
    host.answer = (path) => (path === BPMN_PATH ? `${path} does not exist` : undefined);
    const mounted = await mount([NODES.bpmn], { serve: host.serve });
    const button = await offered(mounted, "n_bpmn");

    mounted.backend.move(BPMN_PATH, "process/renamed.bpmn");
    await delivered(mounted);

    expect(mounted.boardChanges()).toBe(0);
    expect(part(mounted, "n_bpmn", "name").textContent).toBe("order.bpmn");
    // the host then says what became of the path
    await commands.realInput([{ type: "click", ...centreOf(button) }]);
    await expect
      .poll(() => saidBy(mounted, "n_bpmn"), SOON)
      .toBe(`${NOT_SHOWN_TEXT} ${BPMN_PATH} does not exist`);
  });

  it("takes the place of a model whose file was renamed to one no editor shows, and ends that model's editor", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const editor = mounted.editorOf("n_plan");

    // still a file a board reaches, as a picture by its name
    mounted.backend.move(PLAN_PATH, "plans/plan.png");

    await card(mounted, "n_plan");
    expect(part(mounted, "n_plan", "name").textContent).toBe("plan.png");
    await expect.poll(() => editor.record.destroyed, SOON).toBe(1);
    expect(mounted.engine("n_plan").querySelector(".board-host-editor")).toBeNull();
    expect(mounted.sessions).toEqual([{ path: PLAN_PATH, closes: 1 }]);
  });

  it("goes with its node and leaves no listener behind", async () => {
    const host = showing();
    const mounted = await mount([NODES.bpmn, NODES.plan], { serve: host.serve });
    const button = await offered(mounted, "n_bpmn");
    const where = centreOf(button);

    await mounted.modeler.importText(boardText(NODES.plan));
    await expect.poll(() => document.querySelectorAll(".board-host-card").length, SOON).toBe(0);
    await commands.realInput([{ type: "click", ...where }]);
    await delivered(mounted);

    expect(host.shown).toEqual([]);
  });

  it("is readable under the sheet, on the page's roles, and fills the node", async () => {
    const host = showing();
    const mounted = await mount([NODES.bpmn], { serve: host.serve });
    const button = await offered(mounted, "n_bpmn");
    const engine = mounted.engine("n_bpmn");
    const face = engine.querySelector<HTMLElement>(".board-host-card") as HTMLElement;
    const ground = getComputedStyle(face).backgroundColor;

    expect([face.offsetWidth, face.offsetHeight]).toEqual([
      engine.offsetWidth,
      engine.offsetHeight,
    ]);
    for (const name of ["name", "folder", "note"]) {
      const colour = getComputedStyle(part(mounted, "n_bpmn", name)).color;
      expect(contrast(colour, ground), `the ${name} of the card`).toBeGreaterThanOrEqual(4.5);
    }
    const style = getComputedStyle(button);
    expect(contrast(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(style.cursor).toBe("pointer");
    // nothing is said yet, so the line takes no room
    expect(getComputedStyle(part(mounted, "n_bpmn", "said")).display).toBe("none");
  });
});

interface Standing {
  /** what takes a click on the preview: the parent of what the test keeps inert */
  readonly holder: HTMLElement;
  readonly element: HTMLElement;
  readonly context: EmbeddedEditorContext;
  /** every path the card asked the board to send its node to */
  readonly relocated: string[];
  setArmed(armed: boolean): void;
}

/**
 * The element a board makes for an editor, in a preview the test keeps inert or in the open.
 * `nested`: the preview stands in two inert elements, one in the other.
 */
function standing(path: string, armed = false, nested = false): Standing {
  const holder = document.createElement("div");
  holder.style.cssText = "position:absolute;left:40px;top:40px;width:420px;height:300px";
  const body = document.createElement("div");
  body.style.cssText = "position:absolute;inset:0";
  body.inert = !armed;
  const element = document.createElement("div");
  element.className = "board-engine";
  element.style.cssText = "position:absolute;inset:0";
  if (nested) {
    const inner = document.createElement("div");
    inner.style.cssText = "position:absolute;inset:0";
    inner.inert = true;
    inner.append(element);
    body.append(inner);
  } else {
    body.append(element);
  }
  holder.append(body);
  document.body.append(holder);
  made.push(holder);
  const listeners = new Set<(armed: boolean) => void>();
  const relocated: string[] = [];
  let isArmed = armed;
  return {
    holder,
    element,
    relocated,
    context: {
      nodeId: "n_0",
      path,
      element,
      armed: () => isArmed,
      onArmedChange(listener) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
      relocate: (to) => void relocated.push(to),
    },
    setArmed(next) {
      isArmed = next;
      body.inert = !next;
      for (const listener of [...listeners]) listener(next);
    },
  };
}

function cardOn(target: Standing, port: ReturnType<typeof fakeFiles>): EmbeddedEditor {
  const editor = openCard(target.context, { files: port });
  loose.push(editor);
  return editor;
}

const openOf = (target: Standing): HTMLButtonElement =>
  target.element.querySelector(".board-host-card__open") as HTMLButtonElement;
const saidOn = (target: Standing): string =>
  target.element.querySelector(".board-host-card__said")?.textContent ?? "";

describe("the card on the port's double", () => {
  it("offers nothing and says nothing before the host said whether it shows files", async () => {
    const port = fakeFiles([]);
    port.shows = undefined;
    const target = standing(BPMN_PATH);
    cardOn(target, port);
    expect(openOf(target).hidden).toBe(true);
    expect(saidOn(target)).toBe("");
    target.setArmed(true);
    expect(port.shown).toEqual([]);
    target.setArmed(false);

    // the host's word comes with its answer to the hello, before the first list
    port.shows = true;
    port.setPaths([BPMN_PATH]);
    expect(openOf(target).hidden).toBe(false);
    expect(saidOn(target)).toBe("");

    port.shows = false;
    port.setPaths([]);
    expect(openOf(target).hidden).toBe(true);
    expect(saidOn(target)).toBe(NO_SHOW_TEXT);
  });

  it("offers the way on a port that can show a file and has no word of whether its host does", async () => {
    const port = fakeFiles([]);
    const silent = { ...port, showsFiles: undefined };
    const target = standing(BPMN_PATH);
    loose.push(openCard(target.context, { files: silent }));

    expect(openOf(target).hidden).toBe(false);
    target.setArmed(true);
    await settled();
    expect(port.shown).toEqual([BPMN_PATH]);
  });

  it("offers nothing on a port that could never show a file", () => {
    const port = fakeFiles([], { showing: false });
    const target = standing(BPMN_PATH);
    cardOn(target, port);

    expect(openOf(target).hidden).toBe(true);
    expect(saidOn(target)).toBe(NO_SHOW_TEXT);
  });

  it("asks when it is armed, and not when it is disarmed or was armed from its first moment", async () => {
    const port = fakeFiles([]);
    const first = standing(BPMN_PATH, true);
    const editor = cardOn(first, port);
    // a node that was armed before its file moved keeps its arming: nobody asked for the file
    editor.focus?.();
    editor.focus?.();
    await settled();
    expect(port.shown).toEqual([]);
    expect(document.activeElement).toBe(openOf(first));

    first.setArmed(false);
    await settled();
    expect(port.shown).toEqual([]);
    first.setArmed(true);
    await settled();
    expect(port.shown).toEqual([BPMN_PATH]);
  });

  it("takes a real click on its button in a preview through what holds the preview, and when armed on the button itself", async () => {
    const port = fakeFiles([]);
    const target = standing(BPMN_PATH);
    cardOn(target, port);
    const at = centreOf(openOf(target));
    expect(document.elementFromPoint(at.x, at.y)).not.toBe(openOf(target));

    await commands.realInput([{ type: "click", ...at }]);
    await expect.poll(() => port.shown).toEqual([BPMN_PATH]);
    await expect.poll(() => saidOn(target)).toBe(SHOWN_TEXT);

    // armed, the element is no preview: the click is the button's own, and is counted once
    target.setArmed(true);
    await expect.poll(() => port.shown).toHaveLength(2);
    await expect.poll(() => saidOn(target)).toBe(SHOWN_TEXT);
    await commands.realInput([{ type: "click", ...at }]);
    await expect.poll(() => port.shown).toHaveLength(3);
    await settled();
    expect(port.shown).toHaveLength(3);
  });

  it("asks once for a double-click on its button whenever the host answers: the second click and the arming it brings ask nothing more", async () => {
    const port = fakeFiles([]);
    const target = standing(BPMN_PATH);
    cardOn(target, port);
    const at = centreOf(openOf(target));
    // The events of a double-click as the page gets them, on what takes them over a preview.
    // Dispatched one by one, so that the host has answered each before the next comes.
    const fire = (type: string, detail: number): void =>
      void target.holder.dispatchEvent(
        new MouseEvent(type, { bubbles: true, clientX: at.x, clientY: at.y, detail }),
      );

    fire("click", 1);
    await settled();
    expect(port.shown).toEqual([BPMN_PATH]);
    fire("click", 2);
    fire("dblclick", 2);
    await settled();
    target.setArmed(true);
    await settled();
    expect(port.shown).toEqual([BPMN_PATH]);

    // the arming after that is one of its own
    target.setArmed(false);
    target.setArmed(true);
    await settled();
    expect(port.shown).toEqual([BPMN_PATH, BPMN_PATH]);

    // and a double-click whose first click was beside the button arms a card that asks
    target.setArmed(false);
    const beside = (type: string, detail: number): void =>
      void target.holder.dispatchEvent(
        new MouseEvent(type, { bubbles: true, clientX: at.x, clientY: at.y - 80, detail }),
      );
    beside("click", 1);
    beside("click", 2);
    beside("dblclick", 2);
    target.setArmed(true);
    await settled();
    expect(port.shown).toHaveLength(3);
  });

  it("asks once while its question is open, however often its button is pressed", async () => {
    const port = fakeFiles([]);
    let answer!: () => void;
    const slow = {
      ...port,
      showFile(path: string): Promise<void> {
        port.shown.push(path);
        return new Promise((resolve) => (answer = resolve));
      },
    };
    const target = standing(BPMN_PATH, true);
    loose.push(openCard(target.context, { files: slow }));

    openOf(target).click();
    openOf(target).click();
    target.setArmed(false);
    target.setArmed(true);
    await settled();
    expect(port.shown).toEqual([BPMN_PATH]);

    answer();
    await settled();
    openOf(target).click();
    expect(port.shown).toEqual([BPMN_PATH, BPMN_PATH]);
  });

  it("reads a click on what holds the outermost of the inert elements it stands in", async () => {
    const port = fakeFiles([]);
    const target = standing(BPMN_PATH, false, true);
    cardOn(target, port);

    await commands.realInput([{ type: "click", ...centreOf(openOf(target)) }]);

    await expect.poll(() => port.shown).toEqual([BPMN_PATH]);
  });

  it("takes no press that travelled onto its button for a click on it", async () => {
    const port = fakeFiles([]);
    const target = standing(BPMN_PATH);
    cardOn(target, port);
    const at = centreOf(openOf(target));

    // pressed beside the button and released on it: one element takes both, so a click follows
    const clicks: number[] = [];
    const count = (event: MouseEvent): void => void clicks.push(event.detail);
    document.addEventListener("click", count, true);
    await commands.realInput([
      { type: "move", x: at.x - 90, y: at.y - 60 },
      { type: "down" },
      { type: "move", x: at.x, y: at.y, steps: 4 },
      { type: "up" },
    ]);
    await settled();
    document.removeEventListener("click", count, true);

    expect(clicks).toEqual([1]);
    expect(port.shown).toEqual([]);
  });

  it("takes every listener off the document when it ends", () => {
    const added: string[] = [];
    const removed: string[] = [];
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    const key = (type: string, listener: unknown, options: unknown): string =>
      `${type} ${String(options)} ${String(listener)}`;
    document.addEventListener = ((type: string, listener: EventListener, options?: boolean) => {
      added.push(key(type, listener, options));
      add(type, listener, options);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((type: string, listener: EventListener, options?: boolean) => {
      removed.push(key(type, listener, options));
      remove(type, listener, options);
    }) as typeof document.removeEventListener;
    try {
      const target = standing(BPMN_PATH);
      const editor = openCard(target.context, { files: fakeFiles([]) });
      expect(added.map((entry) => entry.split(" ")[0]).sort()).toEqual([
        "click",
        "dblclick",
        "pointerdown",
      ]);
      editor.destroy();
      expect(removed.sort()).toEqual(added.sort());
    } finally {
      document.addEventListener = add;
      document.removeEventListener = remove;
    }
  });

  it("leaves a click to whatever lies over its preview", async () => {
    const port = fakeFiles([]);
    const target = standing(BPMN_PATH);
    cardOn(target, port);
    const at = centreOf(openOf(target));
    const cover = document.createElement("div");
    cover.style.cssText = `position:fixed;left:${at.x - 30}px;top:${at.y - 30}px;width:60px;height:60px`;
    document.body.append(cover);
    made.push(cover);

    await commands.realInput([{ type: "click", ...at }]);
    await settled();

    expect(port.shown).toEqual([]);
  });

  it("sends its node after a file that moved, and no longer once it ended", () => {
    const port = fakeFiles([]);
    const target = standing(BPMN_PATH);
    const editor = cardOn(target, port);

    port.tellMoved([{ from: "process/other.bpmn", to: "x.bpmn" }]);
    port.tellMoved([{ from: BPMN_PATH, to: "archive/order.bpmn" }]);
    expect(target.relocated).toEqual(["archive/order.bpmn"]);

    editor.destroy();
    loose.length = 0;
    port.tellMoved([{ from: BPMN_PATH, to: "again/order.bpmn" }]);
    expect(target.relocated).toEqual(["archive/order.bpmn"]);
    expect(port.listening()).toBe(0);
    expect(target.element.children).toHaveLength(0);
    expect(target.element.dataset.embed).toBeUndefined();
    expect(target.element.dataset.embedState).toBeUndefined();
  });

  it("drops the focus inside it on release, and no focus outside it", () => {
    const port = fakeFiles([]);
    const target = standing(BPMN_PATH, true);
    const editor = cardOn(target, port);
    const outside = document.createElement("input");
    document.body.append(outside);
    made.push(outside);

    outside.focus();
    editor.release();
    expect(document.activeElement).toBe(outside);

    editor.focus?.();
    expect(document.activeElement).toBe(openOf(target));
    editor.release();
    expect(target.element.contains(document.activeElement)).toBe(false);
  });

  it("has a ready that is settled: there is nothing to load", async () => {
    const target = standing(BPMN_PATH);
    await expect(cardOn(target, fakeFiles([])).ready).resolves.toBeUndefined();
  });
});
