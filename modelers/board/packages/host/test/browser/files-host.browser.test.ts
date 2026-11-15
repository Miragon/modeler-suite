/**
 * The host from files on the real board: `createCollaborativeModeler` of the renderer, on
 * `createFilesHost` over `connectBackend(createMemoryBackend(...))`, with the stand-in modeler as
 * the one registered editor. What a person does is real input (`commands.realInput`); what the
 * outside does is a call on the backend.
 */
import { fromBase64, PICTURE_SUFFIXES, suffixRule } from "@miragon/board-files";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";

import { EDITOR_INSETS, fitBox, type Insets } from "../../src/index.js";
import {
  boardText,
  modelNode,
  mountHostBoard,
  type HostBoard,
  type HostBoardOptions,
} from "../support/board.js";
import { watchWindowErrors, type WindowErrors } from "../support/window-errors.js";

const PLAN_PATH = "plans/plan.items";
const OTHER_PATH = "plans/other.items";
const PLAN = "# the plan\na 0 0 Alpha\nb 200 100 Beta\n";
const OTHER = "c 0 0 Gamma\n";
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const files = () => ({
  [PLAN_PATH]: PLAN,
  [OTHER_PATH]: OTHER,
  "notes/readme.md": "# no model\n",
  "assets/logo.png": { bytes: fromBase64(PNG), mime: "image/png" },
});

const NODES = {
  plan: modelNode("n_plan", PLAN_PATH, 0, 0),
  twin: modelNode("n_twin", PLAN_PATH, 560, 0),
  other: modelNode("n_other", OTHER_PATH, 0, 440),
  readme: modelNode("n_readme", "notes/readme.md", 560, 440),
  outside: modelNode("n_outside", "../outside/secret.items", 1120, 0),
  hidden: modelNode("n_hidden", ".drafts/plan.items", 0, 0),
  late: modelNode("n_late", "plans/late.items", 0, 0),
  image: JSON.stringify({
    file: "assets/logo.png",
    height: 120,
    id: "n_image",
    kind: "node",
    type: "image",
    width: 120,
    x: 1120,
    y: 440,
    z: "a0",
  }),
};

/** an editor answers and the board moves within a few frames, and slower on a busy machine */
const SOON = { timeout: 8000 };
const OUTSIDE_THE_BOARD = { x: 1250, y: 770 };

let board: HostBoard | undefined;
let windowErrors: WindowErrors;

beforeAll(() => {
  windowErrors = watchWindowErrors();
});
beforeEach(() => {
  // the board's move to an armed node is one viewport write: a test acts right after the arming
  document.documentElement.style.setProperty("--cd-motion-base", "0ms");
});
afterEach(async () => {
  await commands.realInput([{ type: "move", ...OUTSIDE_THE_BOARD }]);
  await board?.destroy();
  board = undefined;
  document.documentElement.style.removeProperty("--cd-motion-base");
  expect(windowErrors.errors).toEqual([]);
});
afterAll(() => {
  windowErrors.stop();
});

async function mount(nodes: string[], options: HostBoardOptions = {}): Promise<HostBoard> {
  board = await mountHostBoard(files(), boardText(...nodes), options);
  return board;
}

const stateOf = (mounted: HostBoard, id: string): string | undefined =>
  mounted.engine(id).dataset.embedState;
const badgeOf = (mounted: HostBoard, id: string): HTMLElement => {
  const badge = mounted.engine(id).querySelector<HTMLElement>(":scope > .board-host-state");
  if (!badge) throw new Error(`the node ${id} has no state badge`);
  return badge;
};
async function ready(mounted: HostBoard, ...ids: string[]): Promise<void> {
  for (const id of ids) await expect.poll(() => stateOf(mounted, id), SOON).toBe("ready");
}

const centreOf = (element: Element): { x: number; y: number } => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};
const itemOf = (mounted: HostBoard, id: string, item: string): Element => {
  const hit = mounted.engine(id).querySelector(`.djs-shape[data-element-id="${item}"] .djs-hit`);
  if (!hit) throw new Error(`the editor of ${id} draws no item ${item}`);
  return hit;
};
const paletteOf = (mounted: HostBoard, id: string): HTMLElement => {
  const palette = mounted.engine(id).querySelector<HTMLElement>(".djs-container > .djs-palette");
  if (!palette) throw new Error(`the editor of ${id} has no palette`);
  return palette;
};
const zoomOf = (mounted: HostBoard): number =>
  (mounted.modeler.getViewState() as { zoom: number }).zoom;
const inLayer = (mounted: HostBoard, id: string): boolean =>
  mounted.engine(id).parentElement?.classList.contains("board-overlay-layer") === true;

/** a real double-click below the model's content, as a person arms a model */
async function arm(mounted: HostBoard, id: string): Promise<void> {
  const body = mounted.engine(id).getBoundingClientRect();
  await commands.realInput([
    { type: "dblclick", x: body.left + body.width / 2, y: body.top + body.height * 0.92 },
  ]);
  await expect.poll(() => mounted.runtime.armedId(), SOON).toBe(id);
  await expect.poll(() => inLayer(mounted, id), SOON).toBe(true);
  await mounted.settle();
}

/**
 * Lets everything the backend said so far arrive at the page: the port's messages keep their
 * order, so the answer to a question asked now comes after them. For a test that expects
 * nothing to happen, which cannot poll for it.
 */
async function delivered(mounted: HostBoard): Promise<void> {
  await mounted.files.readBytes("assets/logo.png");
  await mounted.settle();
}

/** the contrast of two colours as `getComputedStyle` writes them */
function contrast(foreground: string, background: string): number {
  const luminance = (colour: string): number => {
    const channels = (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const [red = 0, green = 0, blue = 0] = channels.map((value) => {
      const part = value / 255;
      return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe("a model node before its editor is there", () => {
  it("says that it loads, and shows the model once the code and the text arrived", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const mounted = await mount([NODES.plan], { gate });
    await delivered(mounted);

    expect(stateOf(mounted, "n_plan")).toBe("loading");
    const badge = badgeOf(mounted, "n_plan");
    expect(badge.textContent).toBe("Loading…");
    expect(getComputedStyle(badge).display).toBe("grid");
    expect(mounted.engine("n_plan").classList.contains("board-engine--failed")).toBe(false);
    expect(mounted.editors.made).toHaveLength(0);

    open();
    await ready(mounted, "n_plan");
    expect(badge.textContent).toBe("");
    expect(getComputedStyle(badge).display).toBe("none");
    await expect.poll(() => mounted.runtime.mounted("n_plan"), SOON).toBe(true);
    expect(mounted.editorOf("n_plan").exportText()).toBe("a 0 0 Alpha\nb 200 100 Beta\n");
    expect(mounted.runtime.lines).toEqual([]);
  });

  it("gives an editor that arrives in an armed node the keys", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const mounted = await mount([NODES.plan], { gate });
    await arm(mounted, "n_plan");
    expect(stateOf(mounted, "n_plan")).toBe("loading");

    open();
    await ready(mounted, "n_plan");

    const svg = mounted.engine("n_plan").querySelector(".djs-container > svg");
    await expect.poll(() => document.activeElement, SOON).toBe(svg);
  });

  it("loads a notation's code once for every node that shows it", async () => {
    const mounted = await mount([NODES.plan, NODES.twin, NODES.other]);
    await ready(mounted, "n_plan", "n_twin", "n_other");

    expect(mounted.editors.loads()).toBe(1);
    expect(mounted.editors.made).toHaveLength(3);
    expect(mounted.sessions.map((session) => session.path).sort()).toEqual([
      OTHER_PATH,
      PLAN_PATH,
      PLAN_PATH,
    ]);
  });
});

describe("the first fit of an editor in a node", () => {
  it("is made in the node body's layout px, with the room its registry entry asks for", async () => {
    const column: Insets = { top: 24, right: 24, bottom: 24, left: 160 };
    const mounted = await mount([NODES.plan, NODES.other], { insets: column });
    await ready(mounted, "n_plan");
    const engine = mounted.engine("n_plan");
    // the board fitted two nodes into its box: the preview is scaled, its layout size is not
    expect(zoomOf(mounted)).not.toBe(1);
    expect(engine.getBoundingClientRect().width).not.toBe(engine.clientWidth);

    const bounds = { x: 0, y: 0, width: 300, height: 160 };
    const size = { width: engine.clientWidth, height: engine.clientHeight };
    const expected = fitBox(bounds, size, column);
    expect(expected).toBeDefined();
    expect(mounted.editorOf("n_plan").record.viewboxes).toEqual([expected]);
    expect(expected).not.toEqual(fitBox(bounds, size, EDITOR_INSETS));
  });
});

describe("what the board shows of the host's files", () => {
  it("names the models in the headers and in the picker, by the registry's kind", async () => {
    const mounted = await mount([NODES.plan, NODES.other]);
    await ready(mounted, "n_plan", "n_other");

    const header = mounted.node("n_plan").querySelector(".board-node__header");
    expect(header?.querySelector(".board-node__title")?.textContent).toBe("plan");
    expect(header?.querySelector(".board-node__notation")?.textContent).toBe("Stand-in");
    const options = (): string[] =>
      [...mounted.element.querySelectorAll(".board-toolbar__models option")]
        .slice(1)
        .map((option) => option.textContent ?? "");
    // the files without an editor and the picture are not offered
    await expect.poll(options, SOON).toEqual(["other (Stand-in)", "plan (Stand-in)"]);
  });

  it("leaves a file without an editor to the board, and says why a path cannot be opened", async () => {
    const mounted = await mount([NODES.readme, NODES.outside]);

    await expect
      .poll(() => mounted.engine("n_readme").classList.contains("board-engine--failed"), SOON)
      .toBe(true);
    expect(mounted.engine("n_readme").textContent).toBe("notes/readme.md cannot be shown here");
    expect(stateOf(mounted, "n_readme")).toBeUndefined();

    await expect.poll(() => stateOf(mounted, "n_outside"), SOON).toBe("failed");
    expect(badgeOf(mounted, "n_outside").textContent).toBe(
      "This file could not be opened. this path is outside the repository",
    );
    // the board has no failed look for an editor that is there: the facade says it in the element
    expect(mounted.engine("n_outside").classList.contains("board-engine--failed")).toBe(false);
    await expect.poll(() => mounted.runtime.mounted("n_outside"), SOON).toBe(false);
    expect(mounted.sessions).toEqual([]);
  });

  it("says that a board reaches no dot folder, and that a file is no model of this host", async () => {
    // the page's registry shows .items, and the host's rule knows another kind of model only
    const mounted = await mount([NODES.hidden, NODES.other], {
      rule: suffixRule({ models: [".plan"], pictures: PICTURE_SUFFIXES }),
    });

    await expect.poll(() => stateOf(mounted, "n_hidden"), SOON).toBe("failed");
    expect(badgeOf(mounted, "n_hidden").textContent).toBe(
      "This file could not be opened. a board reaches no dot file and no file in a dot folder",
    );
    await expect.poll(() => stateOf(mounted, "n_other"), SOON).toBe("failed");
    expect(badgeOf(mounted, "n_other").textContent).toBe(
      "This file could not be opened. plans/other.items is no model a board shows here",
    );
    // and the picker offers neither: the page was not told that the host has such files
    expect(mounted.files.paths()).toEqual(["assets/logo.png"]);
    expect(mounted.sessions).toEqual([]);
  });

  it("draws a picture of the repository", async () => {
    const mounted = await mount([NODES.image]);
    const figure = (): Element | null => mounted.node("n_image").querySelector(".board-image");

    await expect.poll(() => figure()?.getAttribute("data-missing"), SOON).toBe("false");
    expect(figure()?.querySelector("img.board-image__picture")).not.toBeNull();
    const read = mounted.host.images?.read("assets/logo.png");
    expect(read?.type).toBe("image/png");
    expect(mounted.host.images?.read("assets/logo.png")).toBe(read);
  });
});

describe("a model that is edited in place", () => {
  it("takes no input as a preview, and is armed by a real double-click", async () => {
    // with the board's own motion: the board moves to the node before it arms it
    document.documentElement.style.removeProperty("--cd-motion-base");
    const mounted = await mount([NODES.plan, NODES.other]);
    await ready(mounted, "n_plan", "n_other");
    const editor = mounted.editorOf("n_plan");
    expect(zoomOf(mounted)).not.toBe(1);
    expect(getComputedStyle(paletteOf(mounted, "n_plan")).display).toBe("none");

    await commands.realInput([{ type: "click", ...centreOf(itemOf(mounted, "n_plan", "a")) }]);
    await mounted.settle();
    expect(editor.elements?.selection()).toEqual([]);
    expect(mounted.runtime.armedId()).toBeNull();

    await arm(mounted, "n_plan");

    expect(zoomOf(mounted)).toBe(1);
    const engine = mounted.engine("n_plan");
    expect(engine.dataset.armed).toBe("true");
    expect(document.activeElement).toBe(engine.querySelector(".djs-container > svg"));
    expect(getComputedStyle(paletteOf(mounted, "n_plan")).display).toBe("block");
    expect(editor.record.relayouts).toBeGreaterThan(0);
    // the other model stays a preview without its chrome
    expect(getComputedStyle(paletteOf(mounted, "n_other")).display).toBe("none");
    expect(mounted.backend.writes).toEqual([]);
    expect(mounted.runtime.lines).toEqual([]);
  });

  it("writes its file once per gesture, with the notation's rules, and never the board file", async () => {
    const mounted = await mount([NODES.plan, NODES.twin]);
    await ready(mounted, "n_plan", "n_twin");
    const twin = mounted.editorOf("n_twin");
    const boardBefore = mounted.modeler.exportText();
    const { writes } = mounted.backend;
    await arm(mounted, "n_plan");

    // a click selects and writes nothing
    await commands.realInput([{ type: "click", ...centreOf(itemOf(mounted, "n_plan", "b")) }]);
    await expect.poll(() => mounted.editorOf("n_plan").elements?.selection()).toEqual(["b"]);
    expect(writes).toEqual([]);

    await commands.realInput([{ type: "press", key: "Delete" }]);
    await expect.poll(() => writes.length, SOON).toBe(1);
    // the comment of the file is kept, which the modeler's own export drops
    expect(writes[0]).toEqual({ path: PLAN_PATH, text: "# the plan\na 0 0 Alpha\n" });

    // a drag is many pointer moves and one write, at its drop
    const from = centreOf(itemOf(mounted, "n_plan", "a"));
    await commands.realInput([
      { type: "move", ...from },
      { type: "down" },
      { type: "move", x: from.x + 40, y: from.y + 30, steps: 6 },
      { type: "up" },
    ]);
    await expect.poll(() => writes.length, SOON).toBe(2);
    expect(writes[1]?.text).toBe("# the plan\na 40 30 Alpha\n");

    await commands.realInput([
      {
        type: "click",
        ...centreOf(paletteOf(mounted, "n_plan").querySelector("button") as Element),
      },
    ]);
    await expect.poll(() => writes.length, SOON).toBe(3);
    await delivered(mounted);
    expect(writes).toHaveLength(3);
    expect(mounted.backend.textOf(PLAN_PATH)).toBe(writes[2]?.text);

    // the second node on the path shows each text, as an import and never as a change of its own
    await expect.poll(() => twin.exportText(), SOON).toBe(mounted.editorOf("n_plan").exportText());
    expect(twin.record.imports).toHaveLength(4);
    expect(twin.record.changes).toBe(0);

    expect(mounted.modeler.exportText()).toBe(boardBefore);
    expect(mounted.boardChanges()).toBe(0);
    expect(mounted.runtime.lines).toEqual([]);
  });

  it("keeps its undo key from the window, and undoes with it", async () => {
    const mounted = await mount([NODES.plan], { containHistoryKeys: true });
    await ready(mounted, "n_plan");
    const { writes } = mounted.backend;
    const atWindow: string[] = [];
    const listener = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey) atWindow.push(event.key);
    };
    window.addEventListener("keydown", listener);
    try {
      await arm(mounted, "n_plan");
      await commands.realInput([{ type: "click", ...centreOf(itemOf(mounted, "n_plan", "b")) }]);
      await commands.realInput([{ type: "press", key: "Delete" }]);
      await expect.poll(() => writes.length, SOON).toBe(1);

      await commands.realInput([{ type: "press", key: "Control+z" }]);
      await expect.poll(() => writes.length, SOON).toBe(2);
      expect(writes[1]?.text).toBe(PLAN);
      // the modifier alone reaches the window; the undo key does not
      expect(atWindow).toEqual(["Control"]);
      expect(mounted.modeler.exportText()).toContain(PLAN_PATH);
      expect(mounted.boardChanges()).toBe(0);
    } finally {
      window.removeEventListener("keydown", listener);
    }
  });

  it("is released by Done: nothing selected, no pad, no chrome, no write", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const editor = mounted.editorOf("n_plan");
    await arm(mounted, "n_plan");
    await commands.realInput([{ type: "click", ...centreOf(itemOf(mounted, "n_plan", "a")) }]);
    await expect.poll(() => editor.elements?.selection()).toEqual(["a"]);
    expect(mounted.engine("n_plan").querySelector(".stand-in-pad")).not.toBeNull();

    const done = mounted.element.querySelector("[data-board-done]") as Element;
    await commands.realInput([{ type: "click", ...centreOf(done) }]);
    await expect.poll(() => mounted.runtime.armedId(), SOON).toBeNull();
    await expect.poll(() => inLayer(mounted, "n_plan"), SOON).toBe(false);

    const engine = mounted.engine("n_plan");
    expect(editor.elements?.selection()).toEqual([]);
    expect(engine.querySelector(".stand-in-pad")).toBeNull();
    expect(engine.contains(document.activeElement)).toBe(false);
    expect(getComputedStyle(paletteOf(mounted, "n_plan")).display).toBe("none");
    expect(engine.dataset.armed).toBe("false");
    await delivered(mounted);
    expect(mounted.backend.writes).toEqual([]);
    expect(mounted.runtime.lines).toEqual([]);
  });

  it("is released by a real turn of the wheel on the board, before the board zooms", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const editor = mounted.editorOf("n_plan");
    await arm(mounted, "n_plan");
    await commands.realInput([{ type: "click", ...centreOf(itemOf(mounted, "n_plan", "a")) }]);
    await expect.poll(() => editor.elements?.selection()).toEqual(["a"]);

    // a point of the board beside the armed editor
    const box = mounted.element.getBoundingClientRect();
    const beside = { x: box.right - 24, y: box.bottom - 24 };
    expect(document.elementFromPoint(beside.x, beside.y)?.classList).toContain("react-flow__pane");
    await commands.realInput([
      { type: "move", ...beside },
      { type: "wheel", dy: 240 },
    ]);
    await expect.poll(() => mounted.runtime.armedId(), SOON).toBeNull();
    await expect.poll(() => zoomOf(mounted), SOON).not.toBe(1);

    expect(editor.elements?.selection()).toEqual([]);
    expect(mounted.engine("n_plan").querySelector(".stand-in-pad")).toBeNull();
    expect(getComputedStyle(paletteOf(mounted, "n_plan")).display).toBe("none");
    expect(mounted.runtime.counters.arm.lateDisarms).toBe(0);
    await delivered(mounted);
    expect(mounted.backend.writes).toEqual([]);
  });

  it("keeps a drag the person holds through a zoom the board refuses, as one write", async () => {
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

    // the board refuses a zoom under a held press
    mounted.modeler.setViewState({ x: 0, y: 0, zoom: 0.5 });
    await delivered(mounted);
    expect(mounted.runtime.armedId()).toBe("n_plan");

    await commands.realInput([{ type: "up" }]);
    await expect.poll(() => mounted.backend.writes.length, SOON).toBe(1);
    await delivered(mounted);

    expect(mounted.backend.writes).toEqual([
      { path: PLAN_PATH, text: "# the plan\na 40 30 Alpha\nb 200 100 Beta\n" },
    ]);
    expect(editor.record.imports).toEqual([PLAN]);
    expect(editor.exportText()).toBe("a 40 30 Alpha\nb 200 100 Beta\n");
  });

  it("does not write a drop over a change from outside that came while the drag was held", async () => {
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

    // the outside's text waits for the end of the drag
    const outside = PLAN.replace("Beta", "Outside");
    mounted.backend.outside(PLAN_PATH, outside);
    await delivered(mounted);
    expect(editor.record.imports).toEqual([PLAN]);

    await commands.realInput([{ type: "up" }]);
    await expect.poll(() => editor.record.imports, SOON).toEqual([PLAN, outside]);
    await mounted.files.settled();
    await delivered(mounted);

    // The drop was made on the text before the outside's change: the file keeps that change,
    // and the canvas shows the file. The person sees the item back where it was.
    expect(mounted.backend.writes).toEqual([]);
    expect(mounted.backend.textOf(PLAN_PATH)).toBe(outside);
    expect(editor.exportText()).toBe("a 0 0 Alpha\nb 200 100 Outside\n");
    expect(stateOf(mounted, "n_plan")).toBe("ready");
    expect(mounted.runtime.armedId()).toBe("n_plan");

    // the next drag is made on the file's text and is written
    const again = centreOf(itemOf(mounted, "n_plan", "a"));
    await commands.realInput([
      { type: "move", ...again },
      { type: "down" },
      { type: "move", x: again.x + 40, y: again.y + 30, steps: 4 },
      { type: "up" },
    ]);
    await expect.poll(() => mounted.backend.writes.length, SOON).toBe(1);
    expect(mounted.backend.textOf(PLAN_PATH)).toBe(
      "# the plan\na 40 30 Alpha\nb 200 100 Outside\n",
    );
  });

  it("an edit that crosses a change from outside on the channel is not the file's, and the canvas shows the file", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const editor = mounted.editorOf("n_plan");
    const outside = PLAN.replace("Beta", "Outside");

    // in one task: the outside's change is on its way to the page when the canvas changes
    mounted.backend.outside(PLAN_PATH, outside);
    editor.commands.move("a", 5, 5);
    await mounted.files.settled();
    await expect.poll(() => editor.exportText(), SOON).toBe("a 0 0 Alpha\nb 200 100 Outside\n");
    await delivered(mounted);

    expect(mounted.backend.textOf(PLAN_PATH)).toBe(outside);
    expect(mounted.backend.writes).toEqual([]);
    expect(editor.record.imports).toEqual([PLAN, outside]);
    expect(stateOf(mounted, "n_plan")).toBe("ready");
  });
});

describe("a change of a file from outside", () => {
  it("is imported with the view kept and nothing written back", async () => {
    const mounted = await mount([NODES.plan, NODES.twin]);
    await ready(mounted, "n_plan", "n_twin");
    const editor = mounted.editorOf("n_plan");
    const twin = mounted.editorOf("n_twin");
    editor.setViewState({ x: -30, y: 12, scale: 0.8 });
    const boardBefore = mounted.modeler.exportText();

    mounted.backend.outside(PLAN_PATH, PLAN.replace("Beta", "Better"));
    await expect.poll(() => editor.exportText(), SOON).toContain("Better");
    await expect.poll(() => twin.exportText(), SOON).toContain("Better");
    await delivered(mounted);

    expect(editor.getViewState()).toEqual({ x: -30, y: 12, scale: 0.8 });
    expect(mounted.backend.writes).toEqual([]);
    expect([editor.record.changes, twin.record.changes]).toEqual([0, 0]);
    expect(stateOf(mounted, "n_plan")).toBe("ready");
    expect(mounted.modeler.exportText()).toBe(boardBefore);
    expect(mounted.boardChanges()).toBe(0);
  });

  it("that the notation's rules call the same is not imported", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const editor = mounted.editorOf("n_plan");
    expect(editor.record.imports).toEqual([PLAN]);

    // another comment, the same items: the canvas shows this text already
    const reformatted = "# reviewed\na 0 0 Alpha\nb 200 100 Beta\n";
    mounted.backend.outside(PLAN_PATH, reformatted);
    await delivered(mounted);
    expect(editor.record.imports).toEqual([PLAN]);
    expect(mounted.backend.writes).toEqual([]);

    // and it is the text the next change is written into
    editor.commands.move("a", 5, 5);
    await expect.poll(() => mounted.backend.writes.length, SOON).toBe(1);
    expect(mounted.backend.textOf(PLAN_PATH)).toBe("# reviewed\na 5 5 Alpha\nb 200 100 Beta\n");
  });

  it("that is invalid leaves the last canvas and writes nothing until a valid text arrives", async () => {
    const mounted = await mount([NODES.other]);
    await ready(mounted, "n_other");
    const editor = mounted.editorOf("n_other");

    mounted.backend.outside(OTHER_PATH, "this is no item\n");
    await expect.poll(() => stateOf(mounted, "n_other"), SOON).toBe("invalid");
    const badge = badgeOf(mounted, "n_other");
    expect(badge.textContent).toBe(
      "This file cannot be shown as it is. Open it in its own editor to repair it.",
    );
    expect(badge.title).toBe('line 1: expected "<id> <x> <y> <name>"');
    expect(editor.exportText()).toBe(OTHER);
    // the last canvas stays in sight: the line lies over its top and no more
    expect(badge.offsetHeight).toBeLessThan(mounted.engine("n_other").offsetHeight / 3);
    expect(mounted.engine("n_other").querySelector(".djs-shape")).not.toBeNull();

    // a change on that canvas is not written over the text somebody repairs
    editor.commands.move("c", 10, 10);
    await delivered(mounted);
    expect(mounted.backend.writes).toEqual([]);
    expect(mounted.backend.textOf(OTHER_PATH)).toBe("this is no item\n");

    mounted.backend.outside(OTHER_PATH, "c 0 0 Gamma\nd 0 100 Delta\n");
    await expect.poll(() => stateOf(mounted, "n_other"), SOON).toBe("ready");
    expect(editor.exportText()).toBe("c 0 0 Gamma\nd 0 100 Delta\n");
    expect(badge.title).toBe("");
    expect(mounted.backend.writes).toEqual([]);

    editor.commands.move("c", 10, 10);
    await expect.poll(() => mounted.backend.writes.length, SOON).toBe(1);
  });

  it("that is invalid says what the host says a person can do about it, where the host has a line of its own", async () => {
    const line = "This file cannot be shown as it is. Reset the example to get it back.";
    const mounted = await mount([NODES.other], { invalidText: line });
    await ready(mounted, "n_other");

    mounted.backend.outside(OTHER_PATH, "this is no item\n");
    await expect.poll(() => stateOf(mounted, "n_other"), SOON).toBe("invalid");
    const badge = badgeOf(mounted, "n_other");
    expect(badge.textContent).toBe(line);
    // the modeler's reason stays where whoever repairs the file finds it
    expect(badge.title).toBe('line 1: expected "<id> <x> <y> <name>"');
  });

  it("that is invalid or removes the file takes the armed editor's input until the file is back", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const editor = mounted.editorOf("n_plan");
    await arm(mounted, "n_plan");
    const item = centreOf(itemOf(mounted, "n_plan", "a"));
    const palette = centreOf(paletteOf(mounted, "n_plan"));
    // What is painted on top at a point. Hit testing skips an inert subtree, so the editor is
    // taken out of `inert` for the question: the answer is then the paint order alone.
    const topmost = (point: { x: number; y: number }): Element | null => {
      const root = mounted.engine("n_plan").querySelector<HTMLElement>(".board-host-editor");
      if (!root) throw new Error("the node has no editor");
      const inert = root.inert;
      root.inert = false;
      try {
        return document.elementFromPoint(point.x, point.y);
      } finally {
        root.inert = inert;
      }
    };

    mounted.backend.outside(PLAN_PATH, "this is no item\n");
    await expect.poll(() => stateOf(mounted, "n_plan"), SOON).toBe("invalid");
    // the line lies over the editor's chrome, whatever z-index that has
    expect(topmost(palette)).toBe(badgeOf(mounted, "n_plan"));
    await commands.realInput([
      { type: "click", ...item },
      { type: "press", key: "Delete" },
    ]);
    await delivered(mounted);
    expect(editor.elements?.selection()).toEqual([]);
    expect(editor.exportText()).toBe("a 0 0 Alpha\nb 200 100 Beta\n");

    mounted.backend.remove(PLAN_PATH);
    await expect.poll(() => stateOf(mounted, "n_plan"), SOON).toBe("gone");
    expect(topmost(item)).toBe(badgeOf(mounted, "n_plan"));
    expect(topmost(palette)).toBe(badgeOf(mounted, "n_plan"));

    mounted.backend.outside(PLAN_PATH, PLAN);
    await ready(mounted, "n_plan");
    await commands.realInput([{ type: "click", ...item }]);
    await expect.poll(() => editor.elements?.selection()).toEqual(["a"]);
    await commands.realInput([{ type: "press", key: "Delete" }]);
    await expect.poll(() => mounted.backend.writes.length, SOON).toBe(1);
    expect(mounted.backend.textOf(PLAN_PATH)).toBe("# the plan\nb 200 100 Beta\n");
  });

  it("that removes the file shows it gone, and shows it again when it is back", async () => {
    const mounted = await mount([NODES.other]);
    await ready(mounted, "n_other");
    const editor = mounted.editorOf("n_other");

    mounted.backend.remove(OTHER_PATH);
    await expect.poll(() => stateOf(mounted, "n_other"), SOON).toBe("gone");
    expect(badgeOf(mounted, "n_other").textContent).toBe(
      "This file is gone. The board keeps its place.",
    );
    await expect.poll(() => mounted.host.models?.list(), SOON).toEqual([PLAN_PATH]);
    // the board keeps the node: the file may come back
    expect(mounted.modeler.exportText()).toContain(OTHER_PATH);

    mounted.backend.outside(OTHER_PATH, "c 0 0 Gamma\ne 300 0 Epsilon\n");
    await expect.poll(() => stateOf(mounted, "n_other"), SOON).toBe("ready");
    await expect.poll(() => editor.exportText(), SOON).toBe("c 0 0 Gamma\ne 300 0 Epsilon\n");
    await expect.poll(() => mounted.host.models?.list(), SOON).toEqual([OTHER_PATH, PLAN_PATH]);
    expect(mounted.backend.writes).toEqual([]);
    expect(mounted.boardChanges()).toBe(0);
  });

  it("that moves the file is exactly one change of the board and a new editor", async () => {
    const mounted = await mount([NODES.plan, NODES.other]);
    await ready(mounted, "n_plan", "n_other");
    const before = mounted.editorOf("n_other");

    mounted.backend.move(OTHER_PATH, "plans/renamed.items");
    await expect.poll(() => mounted.boardChanges(), SOON).toBe(1);
    await expect
      .poll(() => mounted.editors.made.length === 3 && stateOf(mounted, "n_other"), SOON)
      .toBe("ready");
    await delivered(mounted);

    expect(mounted.boardChanges()).toBe(1);
    const text = mounted.modeler.exportText();
    expect(text).toContain('"file":"plans/renamed.items"');
    expect(text).not.toContain(OTHER_PATH);
    const after = mounted.editorOf("n_other");
    expect(after).not.toBe(before);
    expect(before.record.destroyed).toBe(1);
    expect(after.exportText()).toBe(OTHER);
    const byPath = [...mounted.sessions].sort((a, b) => (a.path < b.path ? -1 : 1));
    expect(byPath).toEqual([
      { path: OTHER_PATH, closes: 1 },
      { path: PLAN_PATH, closes: 0 },
      { path: "plans/renamed.items", closes: 0 },
    ]);
    expect(mounted.host.models?.list()).toEqual([PLAN_PATH, "plans/renamed.items"]);
    // the node that shows another file heard nothing
    expect(mounted.editorOf("n_plan").record.imports).toEqual([PLAN]);
    expect(mounted.backend.writes).toEqual([]);
  });
});

describe("a model whose file is not there when its node mounts", () => {
  it("says so, and is shown and written once the file came", async () => {
    const mounted = await mount([NODES.late, NODES.other]);
    await ready(mounted, "n_other");
    await expect.poll(() => stateOf(mounted, "n_late"), SOON).toBe("failed");
    expect(badgeOf(mounted, "n_late").textContent).toBe(
      "This file could not be opened. plans/late.items is no text file of this repository",
    );
    const asked = (): number => mounted.opens.filter((path) => path === "plans/late.items").length;
    expect(asked()).toBe(1);

    // a checkout, or a file somebody made beside the board
    mounted.backend.outside("plans/late.items", PLAN);
    await ready(mounted, "n_late");
    const editor = mounted.editorOf("n_late");
    expect(editor.exportText()).toBe("a 0 0 Alpha\nb 200 100 Beta\n");
    expect(mounted.engine("n_late").querySelectorAll(".djs-shape")).toHaveLength(2);
    expect(badgeOf(mounted, "n_late").hidden).toBe(true);
    expect(asked()).toBe(2);
    expect(mounted.sessions.map((session) => session.path)).toEqual([
      OTHER_PATH,
      "plans/late.items",
    ]);

    // it is bound as any other: a change on its canvas is its file's
    editor.commands.move("a", 5, 5);
    await expect.poll(() => mounted.backend.writes.length, SOON).toBe(1);
    expect(mounted.backend.textOf("plans/late.items")).toBe(
      "# the plan\na 5 5 Alpha\nb 200 100 Beta\n",
    );
    // the node's first ready stays as it settled: the board's own word of the editor is its first
    expect(mounted.runtime.mounted("n_late")).toBe(false);
  });

  it("is not asked for again by a change of the list that does not have its path", async () => {
    const mounted = await mount([NODES.late, NODES.outside]);
    await expect.poll(() => stateOf(mounted, "n_late"), SOON).toBe("failed");
    await expect.poll(() => stateOf(mounted, "n_outside"), SOON).toBe("failed");
    const asked = [...mounted.opens];

    mounted.backend.outside("plans/another.items", OTHER);
    await expect.poll(() => mounted.files.paths(), SOON).toContain("plans/another.items");
    await delivered(mounted);

    expect(mounted.opens).toEqual(asked);
    expect(stateOf(mounted, "n_late")).toBe("failed");
    // a path the host refuses is on no list, so it is never asked for again
    expect(badgeOf(mounted, "n_outside").textContent).toBe(
      "This file could not be opened. this path is outside the repository",
    );
  });

  it("leaves nothing behind when its node goes before the file came", async () => {
    const mounted = await mount([NODES.late]);
    await expect.poll(() => stateOf(mounted, "n_late"), SOON).toBe("failed");

    await mounted.modeler.importText(boardText());
    await expect.poll(() => mounted.element.querySelector(".board-engine"), SOON).toBeNull();
    mounted.backend.outside("plans/late.items", PLAN);
    await expect.poll(() => mounted.files.paths(), SOON).toContain("plans/late.items");
    await delivered(mounted);

    expect(mounted.opens).toEqual(["plans/late.items"]);
    expect(mounted.sessions).toEqual([]);
  });
});

describe("a new picture", () => {
  it("is stored under assets and is at hand at once", async () => {
    const mounted = await mount([NODES.image]);
    const images = mounted.host.images;
    const picture = new Blob([fromBase64(PNG)], { type: "image/png" });

    await images?.store?.("assets/new.png", picture);

    expect(images?.read("assets/new.png")).toBe(picture);
    expect(images?.taken?.("assets/new.png")).toBe(true);
    expect(mounted.backend.list()).toContain("assets/new.png");
    await expect.poll(() => images?.taken?.("assets/free.png")).toBe(false);
  });

  it("is refused for a path in use, a path outside the repository, one outside assets and a name no new file may have", async () => {
    const mounted = await mount([NODES.image]);
    const images = mounted.host.images;
    const picture = new Blob([fromBase64(PNG)], { type: "image/png" });
    const before = [...mounted.backend.list()];

    await expect(images?.store?.("assets/logo.png", picture)).rejects.toThrow(
      "assets/logo.png exists already",
    );
    await expect(images?.store?.("../x.png", picture)).rejects.toThrow(
      "this path is outside the repository",
    );
    await expect(images?.store?.("plans/new.png", picture)).rejects.toThrow(
      "a new file goes into assets/",
    );
    // what the board makes of a picture a person called aux.png: a device to Windows
    await expect(images?.store?.("assets/aux.png", picture)).rejects.toThrow(
      "a new file cannot have this name",
    );

    expect(mounted.backend.list()).toEqual(before);
    expect(images?.read("plans/new.png")).toBeUndefined();
    expect(images?.taken?.("plans/new.png")).toBe(false);
  });
});

describe("the end", () => {
  it("of the board closes each session once and leaves no element", async () => {
    const mounted = await mount([NODES.plan, NODES.twin, NODES.other, NODES.readme, NODES.outside]);
    await ready(mounted, "n_plan", "n_twin", "n_other");
    const { sessions, editors } = mounted;
    await arm(mounted, "n_plan");

    await mounted.destroy();
    board = undefined;

    expect(sessions).toHaveLength(3);
    expect(sessions.map((session) => session.closes)).toEqual([1, 1, 1]);
    expect(editors.made.map((modeler) => modeler.record.destroyed)).toEqual([1, 1, 1]);
    expect(
      document.querySelectorAll(
        ".board-engine, .board-host-editor, .board-host-state, .djs-container",
      ),
    ).toHaveLength(0);
  });

  it("of a node whose editor still loads closes the session that arrives later", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const mounted = await mount([NODES.plan], { gate });
    await delivered(mounted);
    expect(stateOf(mounted, "n_plan")).toBe("loading");
    const { sessions, editors } = mounted;

    // the board without the node: its editor is destroyed before the code arrived
    await mounted.modeler.importText(boardText());
    await expect.poll(() => mounted.element.querySelector(".board-engine"), SOON).toBeNull();
    open();
    await expect.poll(() => sessions.map((session) => session.closes), SOON).toEqual([1]);

    expect(editors.made).toHaveLength(0);
    expect(document.querySelectorAll(".board-host-editor, .board-host-state")).toHaveLength(0);
  });

  it("of a node whose file is still asked for closes the session that arrives later", async () => {
    let open!: () => void;
    const sessionGate = new Promise<void>((resolve) => (open = resolve));
    const mounted = await mount([NODES.plan], { sessionGate });
    await delivered(mounted);
    expect(stateOf(mounted, "n_plan")).toBe("loading");
    const { sessions, editors } = mounted;
    expect(sessions).toEqual([]);

    await mounted.modeler.importText(boardText());
    await expect.poll(() => mounted.element.querySelector(".board-engine"), SOON).toBeNull();
    open();
    await expect.poll(() => sessions, SOON).toEqual([{ path: PLAN_PATH, closes: 1 }]);

    expect(editors.made).toHaveLength(0);
  });
});

describe("an editor that cannot be made", () => {
  it("says so in the node, and its session ends with the node", async () => {
    const mounted = await mount([NODES.plan], { madeNotation: "another" });

    await expect.poll(() => stateOf(mounted, "n_plan"), SOON).toBe("failed");
    expect(badgeOf(mounted, "n_plan").textContent).toBe(
      "This file could not be opened. expected a 'stand-in' modeler, got 'another'",
    );
    expect(mounted.engine("n_plan").querySelector(".board-host-editor")).toBeNull();
    const { sessions } = mounted;
    expect(sessions).toEqual([{ path: PLAN_PATH, closes: 0 }]);

    await mounted.destroy();
    board = undefined;
    expect(sessions).toEqual([{ path: PLAN_PATH, closes: 1 }]);
  });

  it("is tried again by the next node after its code failed to load", async () => {
    const mounted = await mount([NODES.plan], { failingLoads: 1 });
    await expect.poll(() => stateOf(mounted, "n_plan"), SOON).toBe("failed");
    expect(badgeOf(mounted, "n_plan").textContent).toBe(
      "This file could not be opened. the code did not load",
    );

    await mounted.modeler.importText(boardText(NODES.plan, NODES.other));
    await ready(mounted, "n_other");

    expect(mounted.editors.loads()).toBe(2);
    // the board asks an editor once per node and path: the first node stays as it failed
    expect(stateOf(mounted, "n_plan")).toBe("failed");

    // the session of the node whose code never came ends with the node, like every other
    const { sessions } = mounted;
    await mounted.destroy();
    board = undefined;
    expect(sessions.map((session) => session.path).sort()).toEqual([OTHER_PATH, PLAN_PATH]);
    expect(sessions.map((session) => session.closes)).toEqual([1, 1]);
  });
});

describe("what a node says, under the sheet", () => {
  it("is readable in every state, on the page's roles", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const mounted = await mount([NODES.plan, NODES.other, NODES.outside], { gate });
    await expect.poll(() => stateOf(mounted, "n_outside"), SOON).toBe("failed");
    const seen: Record<string, { ratio: number; covers: boolean }> = {};
    const look = (id: string): void => {
      const badge = badgeOf(mounted, id);
      const style = getComputedStyle(badge);
      seen[stateOf(mounted, id) ?? ""] = {
        ratio: contrast(style.color, style.backgroundColor),
        covers: badge.offsetHeight === mounted.engine(id).offsetHeight,
      };
    };
    look("n_plan");
    look("n_outside");
    open();
    await ready(mounted, "n_plan", "n_other");
    mounted.backend.outside(OTHER_PATH, "broken\n");
    mounted.backend.remove(PLAN_PATH);
    await expect.poll(() => stateOf(mounted, "n_other"), SOON).toBe("invalid");
    await expect.poll(() => stateOf(mounted, "n_plan"), SOON).toBe("gone");
    look("n_other");
    look("n_plan");

    expect(Object.keys(seen).sort()).toEqual(["failed", "gone", "invalid", "loading"]);
    for (const [state, { ratio }] of Object.entries(seen)) {
      expect(ratio, `the text of the state ${state}`).toBeGreaterThanOrEqual(4.5);
    }
    // only an invalid file keeps its last canvas in sight
    expect(seen.loading?.covers).toBe(true);
    expect(seen.failed?.covers).toBe(true);
    expect(seen.gone?.covers).toBe(true);
    expect(seen.invalid?.covers).toBe(false);
  });
});
