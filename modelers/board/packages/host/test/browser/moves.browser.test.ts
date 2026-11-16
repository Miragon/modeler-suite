/**
 * Files that move: on the real board over a memory backend, where a rename is a call on the
 * backend and the page hears of it a task later, and on the port's double, where a test plays
 * the board's part (the editor of the old path destroyed, the next one opened) step by step.
 */
import { fromBase64 } from "@miragon/board-files";
import type { EmbeddedEditor, EmbeddedEditorContext } from "@miragon/board-renderer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";

import {
  createEditorHandover,
  DROPPED_TEXT,
  followMoves,
  openEditor,
  type EditorEntry,
} from "../../src/index.js";
import {
  boardText,
  modelNode,
  mountHostBoard,
  type HostBoard,
  type HostBoardOptions,
} from "../support/board.js";
import {
  fakeFiles,
  fakeSession,
  settled,
  type FakeFiles,
  type FakeSession,
} from "../support/fake-files.js";
import {
  arm,
  centreOf,
  delivered,
  inLayer,
  itemOf,
  OUTSIDE_THE_BOARD,
  ready,
  SOON,
  stateOf,
} from "../support/on-board.js";
import {
  STAND_IN,
  standInEditors,
  type StandInEditors,
  type StandInModeler,
} from "../support/stand-in-modeler.js";
import { watchWindowErrors, type WindowErrors } from "../support/window-errors.js";

const PLAN_PATH = "plans/plan.items";
const OTHER_PATH = "plans/other.items";
const PLAN = "# the plan\na 0 0 Alpha\nb 200 100 Beta\n";
const OTHER = "c 0 0 Gamma\n";
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const picture = () => ({ bytes: fromBase64(PNG), mime: "image/png" });

const files = () => ({
  [PLAN_PATH]: PLAN,
  [OTHER_PATH]: OTHER,
  "plans/sketch.png": picture(),
  "assets/logo.png": picture(),
});

const imageNode = (id: string, file: string, x: number, y: number): string =>
  JSON.stringify({ file, height: 120, id, kind: "node", type: "image", width: 120, x, y, z: "a0" });

const NODES = {
  plan: modelNode("n_plan", PLAN_PATH, 0, 0),
  twin: modelNode("n_twin", PLAN_PATH, 560, 0),
  other: modelNode("n_other", OTHER_PATH, 0, 440),
  logo: imageNode("n_logo", "assets/logo.png", 1120, 0),
  logoTwin: imageNode("n_logo_twin", "assets/logo.png", 1120, 200),
  sketch: imageNode("n_sketch", "plans/sketch.png", 1120, 400),
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

/** the path a node of the board file names */
const fileOf = (mounted: HostBoard, id: string): string | undefined =>
  mounted.modeler.board.store.getSnapshot().nodes.find((node) => node.id === id)?.attrs.file;
/** whether the image node draws its picture: "false" once the bytes are there */
const missing = (mounted: HostBoard, id: string): string | null | undefined =>
  mounted.node(id).querySelector(".board-image")?.getAttribute("data-missing");
/** resolves once the host has a session on `path` for every node that shows it */
async function reading(mounted: HostBoard, path: string, readers = 1): Promise<void> {
  await expect
    .poll(() => mounted.sessions.filter((session) => session.path === path).length, SOON)
    .toBe(readers);
}
const sessionsOf = (mounted: HostBoard): Array<{ path: string; closes: number }> =>
  [...mounted.sessions].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

describe("a model whose file moves", () => {
  it("keeps its editor with its view and its history, and writes into the new path from then on", async () => {
    const mounted = await mount([NODES.plan, NODES.other]);
    await ready(mounted, "n_plan", "n_other");
    const editor = mounted.editorOf("n_plan");
    const { writes } = mounted.backend;
    editor.commands.move("a", 5, 5);
    await expect.poll(() => writes.length, SOON).toBe(1);
    editor.setViewState({ x: -30, y: 12, scale: 0.8 });
    const elementBefore = mounted.engine("n_plan");

    mounted.backend.move(PLAN_PATH, "archive/plan.items");

    await expect.poll(() => mounted.boardChanges(), SOON).toBe(1);
    await reading(mounted, "archive/plan.items");
    await delivered(mounted);
    // the board made a new element for the new path, and the same modeler stands in it
    const element = mounted.engine("n_plan");
    expect(element).not.toBe(elementBefore);
    expect(mounted.editorOf("n_plan")).toBe(editor);
    expect(mounted.editors.made).toHaveLength(2);
    expect(editor.record.destroyed).toBe(0);
    // no reload: the text was imported once, and the view is the person's
    expect(editor.record.imports).toEqual([PLAN]);
    expect(editor.getViewState()).toEqual({ x: -30, y: 12, scale: 0.8 });
    expect([element.dataset.embed, element.dataset.notation, stateOf(mounted, "n_plan")]).toEqual([
      "diagram-js",
      STAND_IN,
      "ready",
    ]);
    expect(fileOf(mounted, "n_plan")).toBe("archive/plan.items");
    expect(mounted.boardChanges()).toBe(1);
    expect(mounted.runtime.lines).toEqual([]);

    // the history is the editor's own: its undo takes back what was done under the old path
    editor.commands.undo();
    await expect.poll(() => writes.length, SOON).toBe(2);
    expect(writes[1]).toEqual({ path: "archive/plan.items", text: PLAN });
    expect(mounted.backend.textOf("archive/plan.items")).toBe(PLAN);
    expect(mounted.backend.textOf(PLAN_PATH)).toBeUndefined();
    expect(sessionsOf(mounted)).toEqual([
      { path: "archive/plan.items", closes: 0 },
      { path: OTHER_PATH, closes: 0 },
      { path: PLAN_PATH, closes: 1 },
    ]);
    // the node that shows another file heard nothing
    expect(mounted.editorOf("n_other").record.imports).toEqual([OTHER]);
  });

  it("never says that its file is gone on the way", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const said: Array<string | undefined> = [];
    const watch = new MutationObserver(() => {
      const engine = mounted.element.querySelector<HTMLElement>(".board-engine");
      if (engine) said.push(engine.dataset.embedState);
    });
    watch.observe(mounted.element, { subtree: true, attributes: true, childList: true });

    mounted.backend.move(PLAN_PATH, "archive/plan.items");
    await reading(mounted, "archive/plan.items");
    await delivered(mounted);
    watch.disconnect();

    expect(said.length).toBeGreaterThan(0);
    expect(new Set(said.filter((state) => state !== undefined))).toEqual(new Set(["ready"]));
  });

  it("is followed by every node that shows the file, each with one change of the board, and they stay two readers of one file", async () => {
    const mounted = await mount([NODES.plan, NODES.twin]);
    await ready(mounted, "n_plan", "n_twin");
    const [first, second] = [mounted.editorOf("n_plan"), mounted.editorOf("n_twin")];

    mounted.backend.move(PLAN_PATH, "plans/renamed.items");

    await expect.poll(() => mounted.boardChanges(), SOON).toBe(2);
    await reading(mounted, "plans/renamed.items", 2);
    await delivered(mounted);
    expect(mounted.boardChanges()).toBe(2);
    expect([fileOf(mounted, "n_plan"), fileOf(mounted, "n_twin")]).toEqual([
      "plans/renamed.items",
      "plans/renamed.items",
    ]);
    expect([mounted.editorOf("n_plan"), mounted.editorOf("n_twin")]).toEqual([first, second]);
    expect(mounted.editors.made).toHaveLength(2);

    // what one writes, the other shows, as before the move
    first.commands.move("a", 5, 5);
    await expect.poll(() => second.exportText(), SOON).toBe(first.exportText());
    await expect
      .poll(() => mounted.backend.textOf("plans/renamed.items"), SOON)
      .toBe("# the plan\na 5 5 Alpha\nb 200 100 Beta\n");
    expect(second.record.changes).toBe(0);
  });

  it("stays armed while it moves: the person goes on editing, and what they do next is the new path's", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const editor = mounted.editorOf("n_plan");
    await arm(mounted, "n_plan");
    await commands.realInput([{ type: "click", ...centreOf(itemOf(mounted, "n_plan", "b")) }]);
    await expect.poll(() => editor.elements?.selection()).toEqual(["b"]);

    mounted.backend.move(PLAN_PATH, "archive/plan.items");

    await reading(mounted, "archive/plan.items");
    await expect.poll(() => inLayer(mounted, "n_plan"), SOON).toBe(true);
    await mounted.settle();
    expect(mounted.runtime.armedId()).toBe("n_plan");
    expect(mounted.editorOf("n_plan")).toBe(editor);
    expect(mounted.engine("n_plan").dataset.armed).toBe("true");
    // what was selected still is, and the keys are the editor's again after the element changed
    expect(editor.elements?.selection()).toEqual(["b"]);
    await expect
      .poll(() => document.activeElement, SOON)
      .toBe(mounted.engine("n_plan").querySelector(".djs-container > svg"));

    await commands.realInput([{ type: "press", key: "Delete" }]);
    await expect.poll(() => mounted.backend.writes.length, SOON).toBe(1);
    expect(mounted.backend.writes[0]).toEqual({
      path: "archive/plan.items",
      text: "# the plan\na 0 0 Alpha\n",
    });
    expect(mounted.boardChanges()).toBe(1);
    expect(mounted.runtime.lines).toEqual([]);
  });

  it("ends on the last path, with its editor, where the file moves twice in a row", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const editor = mounted.editorOf("n_plan");

    mounted.backend.move(PLAN_PATH, "plans/second.items");
    mounted.backend.move("plans/second.items", "plans/third.items");

    await reading(mounted, "plans/third.items");
    await delivered(mounted);
    expect(fileOf(mounted, "n_plan")).toBe("plans/third.items");
    expect(mounted.boardChanges()).toBe(2);
    expect(mounted.editorOf("n_plan")).toBe(editor);
    expect(editor.record.destroyed).toBe(0);
    expect(stateOf(mounted, "n_plan")).toBe("ready");
    editor.commands.move("a", 5, 5);
    await expect.poll(() => mounted.backend.writes.length, SOON).toBe(1);
    expect(mounted.backend.writes[0]?.path).toBe("plans/third.items");
    // every session the host opened on the way is closed but the last
    expect(sessionsOf(mounted).filter((session) => session.closes === 0)).toEqual([
      { path: "plans/third.items", closes: 0 },
    ]);
  });

  it("is not on the board's history: an undo takes back the gesture before it and leaves the new path", async () => {
    const mounted = await mount([NODES.plan]);
    await ready(mounted, "n_plan");
    const { store } = mounted.modeler.board;
    store.gesture((tx) => tx.update("n_plan", { x: 40 }));

    mounted.backend.move(PLAN_PATH, "archive/plan.items");
    await reading(mounted, "archive/plan.items");
    mounted.modeler.board.undo();
    await delivered(mounted);

    const node = store.getSnapshot().nodes.find((one) => one.id === "n_plan");
    expect(node?.attrs.x).toBe(0);
    expect(node?.attrs.file).toBe("archive/plan.items");
    // and nothing else is left to undo
    mounted.modeler.board.undo();
    expect(fileOf(mounted, "n_plan")).toBe("archive/plan.items");
    mounted.modeler.board.redo();
    expect(store.getSnapshot().nodes.find((one) => one.id === "n_plan")?.attrs).toMatchObject({
      x: 40,
      file: "archive/plan.items",
    });
  });

  it("is not followed to a path a board does not reach: the node keeps its path and says that its file is gone", async () => {
    const mounted = await mount([NODES.plan, NODES.other]);
    await ready(mounted, "n_plan", "n_other");

    // no model by the host's rule, and a dot folder
    mounted.backend.move(PLAN_PATH, "plans/plan.txt");
    mounted.backend.move(OTHER_PATH, ".trash/other.items");

    await expect.poll(() => stateOf(mounted, "n_plan"), SOON).toBe("gone");
    await expect.poll(() => stateOf(mounted, "n_other"), SOON).toBe("gone");
    await delivered(mounted);
    expect(mounted.boardChanges()).toBe(0);
    expect([fileOf(mounted, "n_plan"), fileOf(mounted, "n_other")]).toEqual([
      PLAN_PATH,
      OTHER_PATH,
    ]);
    // the file that comes back to its path is shown again, by the editor that waited
    mounted.backend.move("plans/plan.txt", PLAN_PATH);
    await ready(mounted, "n_plan");
    expect(mounted.editors.made).toHaveLength(2);
  });
});

describe("a picture that moves", () => {
  it("is followed by every image node that shows it, each with one change of the board, through the helper an app calls", async () => {
    const mounted = await mount([NODES.logo, NODES.logoTwin, NODES.sketch]);
    await expect.poll(() => missing(mounted, "n_logo"), SOON).toBe("false");

    mounted.backend.move("assets/logo.png", "assets/brand/mark.png");

    await expect.poll(() => mounted.boardChanges(), SOON).toBe(2);
    expect([fileOf(mounted, "n_logo"), fileOf(mounted, "n_logo_twin")]).toEqual([
      "assets/brand/mark.png",
      "assets/brand/mark.png",
    ]);
    // drawn under the new path
    await expect.poll(() => missing(mounted, "n_logo"), SOON).toBe("false");
    await expect.poll(() => missing(mounted, "n_logo_twin"), SOON).toBe("false");
    await delivered(mounted);
    expect(mounted.boardChanges()).toBe(2);
    expect(fileOf(mounted, "n_sketch")).toBe("plans/sketch.png");
  });

  it("is not followed where the app does not call the helper: the node keeps a path that is empty", async () => {
    const mounted = await mount([NODES.logo], { followMoves: false });
    await expect.poll(() => missing(mounted, "n_logo"), SOON).toBe("false");

    mounted.backend.move("assets/logo.png", "assets/brand/mark.png");

    await expect.poll(() => missing(mounted, "n_logo"), SOON).toBe("true");
    await delivered(mounted);
    expect(mounted.boardChanges()).toBe(0);
    expect(fileOf(mounted, "n_logo")).toBe("assets/logo.png");
  });

  it("is not on the board's history either", async () => {
    const mounted = await mount([NODES.logo]);
    await expect.poll(() => missing(mounted, "n_logo"), SOON).toBe("false");
    const { store } = mounted.modeler.board;
    store.gesture((tx) => tx.update("n_logo", { x: 900 }));

    mounted.backend.move("assets/logo.png", "assets/mark.png");
    await expect.poll(() => fileOf(mounted, "n_logo"), SOON).toBe("assets/mark.png");
    mounted.modeler.board.undo();

    const node = store.getSnapshot().nodes.find((one) => one.id === "n_logo");
    expect(node?.attrs).toMatchObject({ x: 1120, file: "assets/mark.png" });
  });

  it("is not followed to a path a board does not reach: the node keeps its path and draws the missing file", async () => {
    const mounted = await mount([NODES.logo]);
    await expect.poll(() => missing(mounted, "n_logo"), SOON).toBe("false");

    mounted.backend.move("assets/logo.png", "assets/logo.txt");

    await expect.poll(() => missing(mounted, "n_logo"), SOON).toBe("true");
    await delivered(mounted);
    expect(mounted.boardChanges()).toBe(0);
    expect(fileOf(mounted, "n_logo")).toBe("assets/logo.png");
  });

  it("is followed once where two helpers stand on one board, and no longer once the app called what the helper returned", async () => {
    const mounted = await mount([NODES.logo]);
    await expect.poll(() => missing(mounted, "n_logo"), SOON).toBe("false");
    const stop = followMoves(mounted.modeler, mounted.files);

    mounted.backend.move("assets/logo.png", "assets/first.png");
    await expect.poll(() => fileOf(mounted, "n_logo"), SOON).toBe("assets/first.png");
    await delivered(mounted);
    // the second helper found the path written
    expect(mounted.boardChanges()).toBe(1);

    stop();
    stop();
    mounted.backend.move("assets/first.png", "assets/second.png");
    await expect.poll(() => fileOf(mounted, "n_logo"), SOON).toBe("assets/second.png");
    await delivered(mounted);
    // the one the test support made is still there, and it alone
    expect(mounted.boardChanges()).toBe(2);
  });
});

describe("a folder that moves", () => {
  it("takes every node of a file below it along, models and pictures, each with one change of the board", async () => {
    const mounted = await mount([NODES.plan, NODES.twin, NODES.other, NODES.sketch, NODES.logo]);
    await ready(mounted, "n_plan", "n_twin", "n_other");
    await expect.poll(() => missing(mounted, "n_sketch"), SOON).toBe("false");
    const editors = ["n_plan", "n_twin", "n_other"].map((id) => mounted.editorOf(id));

    mounted.backend.move("plans", "archive/2026");

    await expect.poll(() => mounted.boardChanges(), SOON).toBe(4);
    await reading(mounted, "archive/2026/plan.items", 2);
    await reading(mounted, "archive/2026/other.items");
    await expect.poll(() => missing(mounted, "n_sketch"), SOON).toBe("false");
    await delivered(mounted);
    expect(
      ["n_plan", "n_twin", "n_other", "n_sketch", "n_logo"].map((id) => fileOf(mounted, id)),
    ).toEqual([
      "archive/2026/plan.items",
      "archive/2026/plan.items",
      "archive/2026/other.items",
      "archive/2026/sketch.png",
      "assets/logo.png",
    ]);
    expect(mounted.boardChanges()).toBe(4);
    expect(["n_plan", "n_twin", "n_other"].map((id) => mounted.editorOf(id))).toEqual(editors);
    expect(editors.map((editor) => editor.record.destroyed)).toEqual([0, 0, 0]);
    expect(["n_plan", "n_twin", "n_other"].map((id) => stateOf(mounted, id))).toEqual([
      "ready",
      "ready",
      "ready",
    ]);
    expect(mounted.host.models?.list()).toEqual([
      "archive/2026/other.items",
      "archive/2026/plan.items",
    ]);
    expect(mounted.runtime.lines).toEqual([]);
  });
});

interface Stage {
  readonly port: FakeFiles;
  readonly editors: StandInEditors;
  /** the element and the context a board would make for the node at `path` */
  at(path: string, nodeId?: string): { element: HTMLElement; context: EmbeddedEditorContext };
  /** every path a context was asked to send its node to */
  readonly relocated: string[];
  /** a session the port hands out for `path` */
  session(path: string, text?: string): FakeSession;
}

/** the port's double and the stand-in, with elements as a board makes them for a node */
function stage(): Stage {
  const port = fakeFiles([]);
  const editors = standInEditors();
  const relocated: string[] = [];
  return {
    port,
    editors,
    relocated,
    at(path, nodeId = "n_0") {
      const element = document.createElement("div");
      element.className = "board-engine";
      element.dataset.armed = "false";
      element.style.cssText = "position:absolute;left:40px;top:40px;width:480px;height:320px";
      document.body.append(element);
      made.push(element);
      return {
        element,
        context: {
          nodeId,
          path,
          element,
          armed: () => false,
          onArmedChange: () => () => undefined,
          relocate: (to) => void relocated.push(to),
        },
      };
    },
    session(path, text = PLAN) {
      const session = fakeSession(path, text);
      port.sessions.set(path, session);
      return session;
    },
  };
}

const stateIn = (element: HTMLElement): string | undefined => element.dataset.embedState;
const modelerIn = (element: HTMLElement, editors: StandInEditors): StandInModeler | undefined =>
  editors.made.find(
    (modeler) => modeler.record.destroyed === 0 && element.contains(modeler.container() ?? null),
  );

describe("the editor of a moved file, step by step on the port's double", () => {
  const MOVED = "archive/plan.items";

  it("asks the board to send its node after the file, once per move that names its path", async () => {
    const { port, editors, relocated, at, session } = stage();
    session(PLAN_PATH);
    const old = at(PLAN_PATH);
    loose.push(openEditor(old.context, { entry: editors.entry, files: port }));
    await expect.poll(() => stateIn(old.element)).toBe("ready");

    port.tellMoved([{ from: OTHER_PATH, to: "plans/x.items" }]);
    port.tellMoved([
      { from: "plans/sketch.png", to: "plans/drawing.png" },
      { from: PLAN_PATH, to: MOVED },
    ]);

    expect(relocated).toEqual([MOVED]);
  });

  it("is made anew at the new path where the host hands its editors no hand-over", async () => {
    const { port, editors, at, session } = stage();
    const first = session(PLAN_PATH);
    session(MOVED);
    const old = at(PLAN_PATH);
    const before = openEditor(old.context, { entry: editors.entry, files: port });
    await expect.poll(() => stateIn(old.element)).toBe("ready");

    port.tellMoved([{ from: PLAN_PATH, to: MOVED }]);
    // the board's part: the editor of the old path goes, the next one comes
    before.destroy();
    const next = at(MOVED);
    loose.push(openEditor(next.context, { entry: editors.entry, files: port }));
    await expect.poll(() => stateIn(next.element)).toBe("ready");

    expect(editors.made).toHaveLength(2);
    expect(editors.made[0]?.record.destroyed).toBe(1);
    expect(first.closed).toBe(1);
  });

  it("hands its modeler to the editor the board opens next, which takes it as it is", async () => {
    const { port, editors, at, session } = stage();
    const handover = createEditorHandover();
    const first = session(PLAN_PATH);
    const second = session(MOVED);
    const old = at(PLAN_PATH);
    const before = openEditor(old.context, { entry: editors.entry, files: port, handover });
    await expect.poll(() => stateIn(old.element)).toBe("ready");
    const modeler = editors.made[0] as StandInModeler;
    modeler.commands.move("a", 5, 5);
    expect(first.writes).toHaveLength(1);
    const written = first.writes[0] as string;
    second.replace(written);

    port.tellMoved([{ from: PLAN_PATH, to: MOVED }]);
    before.destroy();
    const next = at(MOVED);
    const after = openEditor(next.context, { entry: editors.entry, files: port, handover });
    loose.push(after);

    // at once, before the session of the new path is there: the element shows the model
    expect(modelerIn(next.element, editors)).toBe(modeler);
    expect(stateIn(next.element)).toBe("ready");
    expect(next.element.dataset.embed).toBe("diagram-js");
    expect(next.element.dataset.notation).toBe(STAND_IN);
    // and the old element is as the board made it
    expect(old.element.children).toHaveLength(0);
    expect(Object.keys(old.element.dataset)).toEqual(["armed"]);
    expect(first.closed).toBe(1);
    await expect(after.ready).resolves.toBeUndefined();
    await settled();

    expect(editors.made).toHaveLength(1);
    expect(modeler.record.destroyed).toBe(0);
    expect(modeler.record.imports).toEqual([PLAN]);
    // bound to the session of the new path, and to that one alone
    modeler.commands.undo();
    expect(second.writes).toEqual([PLAN]);
    expect(first.writes).toEqual([written]);
    expect(first.listening()).toBe(0);
    first.setAvailable(false);
    expect(stateIn(next.element)).toBe("ready");
    second.setAvailable(false);
    expect(stateIn(next.element)).toBe("gone");

    after.destroy();
    loose.length = 0;
    expect(modeler.record.destroyed).toBe(1);
    expect(second.closed).toBe(1);
    expect(next.element.children).toHaveLength(0);
  });

  it("writes a change the person made before the session of the new path was there into that session, and none into the old one", async () => {
    const { port, editors, at, session } = stage();
    const handover = createEditorHandover();
    const first = session(PLAN_PATH);
    const second = session(MOVED);
    const old = at(PLAN_PATH);
    const before = openEditor(old.context, { entry: editors.entry, files: port, handover });
    await expect.poll(() => stateIn(old.element)).toBe("ready");
    const modeler = editors.made[0] as StandInModeler;

    port.tellMoved([{ from: PLAN_PATH, to: MOVED }]);
    before.destroy();
    const next = at(MOVED);
    loose.push(openEditor(next.context, { entry: editors.entry, files: port, handover }));
    // the port has not answered yet: the model has no file under either path
    modeler.commands.move("a", 5, 5);
    expect([first.writes, second.writes]).toEqual([[], []]);
    await settled();

    expect(second.writes).toEqual(["# the plan\na 5 5 Alpha\nb 200 100 Beta\n"]);
    expect(first.writes).toEqual([]);
    expect(modeler.record.imports).toEqual([PLAN]);
    expect(next.element.querySelector<HTMLElement>(".board-host-notice")?.hidden).toBe(true);
  });

  it("says in the new element that a change was dropped which the old path never took: the file moved under the write", async () => {
    const { port, editors, at, session } = stage();
    const handover = createEditorHandover();
    const first = session(PLAN_PATH);
    // the file under its new path has the text of before the change
    const second = session(MOVED);
    const old = at(PLAN_PATH);
    const before = openEditor(old.context, { entry: editors.entry, files: port, handover });
    await expect.poll(() => stateIn(old.element)).toBe("ready");
    const modeler = editors.made[0] as StandInModeler;
    modeler.commands.move("a", 5, 5);
    expect(first.writes).toHaveLength(1);

    port.tellMoved([{ from: PLAN_PATH, to: MOVED }]);
    before.destroy();
    const next = at(MOVED);
    loose.push(openEditor(next.context, { entry: editors.entry, files: port, handover }));
    await settled();

    // the canvas shows the file again, and the node says in words that the change went
    expect(modeler.record.imports).toEqual([PLAN, PLAN]);
    const line = next.element.querySelector<HTMLElement>(".board-host-notice");
    expect(line?.hidden).toBe(false);
    expect(line?.dataset.reason).toBe("crossed");
    expect(line?.textContent).toBe(DROPPED_TEXT.crossed);
    expect(second.writes).toEqual([]);
    expect(stateIn(next.element)).toBe("ready");
  });

  it("carries what the node said of its file to the new element", async () => {
    const { port, editors, at, session } = stage();
    const handover = createEditorHandover();
    const first = session(PLAN_PATH);
    session(MOVED, "this is no item\n");
    const old = at(PLAN_PATH);
    const before = openEditor(old.context, { entry: editors.entry, files: port, handover });
    await expect.poll(() => stateIn(old.element)).toBe("ready");
    first.replace("this is no item\n");
    await expect.poll(() => stateIn(old.element)).toBe("invalid");

    port.tellMoved([{ from: PLAN_PATH, to: MOVED }]);
    before.destroy();
    const next = at(MOVED);
    loose.push(openEditor(next.context, { entry: editors.entry, files: port, handover }));

    expect(stateIn(next.element)).toBe("invalid");
    const badge = next.element.querySelector<HTMLElement>(".board-host-state");
    expect(badge?.title).toBe('line 1: expected "<id> <x> <y> <name>"');
    await settled();
    expect(stateIn(next.element)).toBe("invalid");
  });

  it("ends a modeler that no editor took by the end of the board's commit", async () => {
    const { port, editors, at, session } = stage();
    const handover = createEditorHandover();
    session(PLAN_PATH);
    const old = at(PLAN_PATH);
    const before = openEditor(old.context, { entry: editors.entry, files: port, handover });
    await expect.poll(() => stateIn(old.element)).toBe("ready");

    port.tellMoved([{ from: PLAN_PATH, to: MOVED }]);
    // the node went with the move: the board destroys its editor and opens none
    before.destroy();
    expect(editors.made[0]?.record.destroyed).toBe(0);
    await settled();

    expect(editors.made[0]?.record.destroyed).toBe(1);
    expect(document.querySelectorAll(".board-host-editor")).toHaveLength(0);
    // and nobody can take it later
    const next = at(MOVED);
    loose.push(openEditor(next.context, { entry: editors.entry, files: port, handover }));
    await expect.poll(() => stateIn(next.element)).toBe("failed");
  });

  it("ends its modeler at once where it is destroyed for another reason than a move", async () => {
    const { port, editors, at, session } = stage();
    const handover = createEditorHandover();
    session(PLAN_PATH);
    const old = at(PLAN_PATH);
    const before = openEditor(old.context, { entry: editors.entry, files: port, handover });
    await expect.poll(() => stateIn(old.element)).toBe("ready");

    before.destroy();

    expect(editors.made[0]?.record.destroyed).toBe(1);
  });

  it.each<[string, string, string, (entry: EditorEntry) => EditorEntry]>([
    ["another node", "n_1", MOVED, (entry) => entry],
    ["another path", "n_0", "archive/other.items", (entry) => entry],
    ["another notation", "n_0", MOVED, (entry) => ({ ...entry, notation: "another" })],
  ])("is not taken by an editor of %s", async (_what, nodeId, path, entryOf) => {
    const { port, editors, at, session } = stage();
    const handover = createEditorHandover();
    session(PLAN_PATH);
    const old = at(PLAN_PATH);
    const before = openEditor(old.context, { entry: editors.entry, files: port, handover });
    await expect.poll(() => stateIn(old.element)).toBe("ready");

    port.tellMoved([{ from: PLAN_PATH, to: MOVED }]);
    before.destroy();
    const next = at(path, nodeId);
    loose.push(openEditor(next.context, { entry: entryOf(editors.entry), files: port, handover }));

    expect(modelerIn(next.element, editors)).toBeUndefined();
    expect(stateIn(next.element)).toBe("loading");
    await settled();
    expect(editors.made[0]?.record.destroyed).toBe(1);
  });

  it("leaves the node as one whose file could not be opened where the new path cannot be, and asks again when the list has it", async () => {
    const { port, editors, at, session } = stage();
    const handover = createEditorHandover();
    session(PLAN_PATH);
    const old = at(PLAN_PATH);
    const before = openEditor(old.context, { entry: editors.entry, files: port, handover });
    await expect.poll(() => stateIn(old.element)).toBe("ready");

    port.tellMoved([{ from: PLAN_PATH, to: MOVED }]);
    before.destroy();
    const next = at(MOVED);
    const after = openEditor(next.context, { entry: editors.entry, files: port, handover });
    loose.push(after);
    // the port has no text under the new path
    await expect.poll(() => stateIn(next.element)).toBe("failed");

    expect(next.element.querySelector(".board-host-state")?.textContent).toBe(
      "This file could not be opened. the fake opens no text",
    );
    // a canvas without a file would take edits that go nowhere
    expect(editors.made[0]?.record.destroyed).toBe(1);
    expect(next.element.querySelector(".board-host-editor")).toBeNull();
    await expect(after.ready).resolves.toBeUndefined();

    session(MOVED);
    port.setPaths([MOVED]);
    await expect.poll(() => stateIn(next.element)).toBe("ready");
    expect(editors.made).toHaveLength(2);
    expect(modelerIn(next.element, editors)).toBe(editors.made[1]);
  });

  it("closes a session of the new path that arrives after the node went", async () => {
    const { port, editors, at, session } = stage();
    const handover = createEditorHandover();
    session(PLAN_PATH);
    const second = session(MOVED);
    const old = at(PLAN_PATH);
    const before = openEditor(old.context, { entry: editors.entry, files: port, handover });
    await expect.poll(() => stateIn(old.element)).toBe("ready");

    port.tellMoved([{ from: PLAN_PATH, to: MOVED }]);
    before.destroy();
    const after = openEditor(at(MOVED).context, { entry: editors.entry, files: port, handover });
    after.destroy();
    await settled();

    expect(second.closed).toBe(1);
    expect(second.listening()).toBe(0);
    expect(editors.made[0]?.record.destroyed).toBe(1);
  });
});
