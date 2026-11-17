import type { EmbeddableModeler } from "@miragon/board-host";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import "../../src/base.js";
import { SUITE_EDITORS } from "../../src/registry.js";
import {
  gridOf,
  LOAD_MS,
  mountAlone,
  mountBoard,
  settle,
  shownChrome,
  shownView,
  type MountedBoard,
  type ShownView,
} from "./support/board.js";
import { EXAMPLES, exampleOf } from "./support/examples.js";
import { watchPageErrors } from "./support/page-errors.js";

/**
 * The battery the board's guide deferred: the suite's seven modelers in a board's model nodes,
 * each mounted by its real renderer through the registry, on a repository in memory, driven by a
 * real mouse and a real keyboard. A synthetic event ignores `inert` and the focus, so only real
 * input says whether a preview takes input and whether an armed editor gets it.
 */

const NOTATIONS = SUITE_EDITORS.map((entry) => entry.notation);
const FILES = Object.fromEntries(EXAMPLES.map((example) => [example.path, example.text]));
const NODES = gridOf(EXAMPLES.map((example) => example.path));
const WAIT = { timeout: 8_000, interval: 25 };
/** A flow of real input with several waits in it: longer than every wait of it together. */
const FLOW_TIMEOUT = 60_000;

const nodeOf = (notation: string) => {
  const node = NODES.find((one) => one.path === exampleOf(notation).path);
  if (!node) throw new Error(`no node for ${notation}`);
  return node;
};

// One watch for the whole file, so that what a mount or a destroy in a hook says is seen too.
const errors = watchPageErrors();
afterEach(async () => {
  // no test leaves the pointer over the next test's node
  await commands.realInput([{ type: "move", x: 1, y: 1 }]);
  expect(errors.list()).toEqual([]);
});
afterAll(() => {
  const seen = errors.list();
  errors.stop();
  expect(seen).toEqual([]);
});

/** The view each notation has alone in a box of a node's layout size, measured once. */
const aloneViews = new Map<string, ShownView>();
async function aloneView(notation: string, size: { width: number; height: number }) {
  const key = `${notation} ${size.width}x${size.height}`;
  let view = aloneViews.get(key);
  if (!view) {
    const alone = await mountAlone(notation, exampleOf(notation).text, size);
    view = shownView(alone.modeler, alone.element);
    alone.destroy();
    aloneViews.set(key, view);
  }
  return view;
}

function previews(mounted: () => MountedBoard, zoom: () => number): void {
  it("mounts all seven: every engine is ready, and the board is not at 100 %", () => {
    const { element, board } = mounted();
    const engines = [...element.querySelectorAll<HTMLElement>(".board-engine")];
    expect(engines.map((engine) => engine.dataset.notation).sort()).toEqual([...NOTATIONS].sort());
    expect(engines.map((engine) => engine.dataset.embedState)).toEqual(
      NOTATIONS.map(() => "ready"),
    );
    expect(engines.map((engine) => engine.dataset.armed)).toEqual(NOTATIONS.map(() => "false"));
    expect((board.getViewState() as { zoom: number }).zoom).toBeCloseTo(zoom(), 6);
    expect(zoom()).not.toBe(1);
    // Each editor was made, and so first fitted, while the board stood at this zoom.
    const openedAt = NODES.map((node) => mounted().openedAt(node.id));
    for (const boardZoom of openedAt) expect(boardZoom).toBeCloseTo(zoom(), 6);
  });

  it.each(NOTATIONS)("%s: the preview's view is the one it has alone", async (notation) => {
    const node = nodeOf(notation);
    const engine = mounted().engine(node.id);
    const size = { width: engine.clientWidth, height: engine.clientHeight };
    expect(size).toEqual({ width: node.width, height: node.height - 32 });
    // The board scales the preview: its box on screen is not its layout box.
    await expect
      .poll(() => engine.getBoundingClientRect().width / engine.offsetWidth, WAIT)
      .toBeCloseTo(zoom(), 3);

    const alone = await aloneView(notation, size);
    expect(alone.drawn).toMatch(/^matrix\(/);
    expect(shownView(mounted().modeler(node.id), engine)).toEqual(alone);
  });

  it.each(NOTATIONS)("%s: a preview shows none of the editor's chrome", (notation) => {
    expect(shownChrome(mounted().engine(nodeOf(notation).id))).toEqual([]);
  });

  it("bpmn: the preview keeps the bpmn.io watermark in sight, as bpmn-js's licence asks", () => {
    const engine = mounted().engine(nodeOf("bpmn").id);
    const watermark = engine.querySelector<HTMLElement>(".bjs-powered-by");
    expect(watermark?.checkVisibility()).toBe(true);
    const box = watermark!.getBoundingClientRect();
    const node = engine.getBoundingClientRect();
    expect(box.width).toBeGreaterThan(0);
    expect(box.left >= node.left && box.right <= node.right).toBe(true);
    expect(box.top >= node.top && box.bottom <= node.bottom).toBe(true);
  });
}

describe("seven model nodes, opened while the board is at its fitted zoom", () => {
  let mounted: MountedBoard;
  let fitted = 0;
  beforeAll(async () => {
    mounted = await mountBoard({ nodes: NODES, files: FILES });
    fitted = (mounted.board.getViewState() as { zoom: number }).zoom;
  }, LOAD_MS);
  afterAll(() => mounted.destroy());

  previews(
    () => mounted,
    () => fitted,
  );
});

const leftOf = (element: HTMLElement): number => element.getBoundingClientRect().left;

interface Shape {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/** The shapes of an armed editor whose middle a pointer reaches: clear of the editor's own chrome. */
function reachableShapes(engine: HTMLElement): Shape[] {
  const box = engine.getBoundingClientRect();
  const svg = engine.querySelector(".djs-container > svg");
  return [...engine.querySelectorAll<SVGGElement>(".djs-element.djs-shape")].flatMap((shape) => {
    const id = shape.getAttribute("data-element-id");
    const hit = (shape.querySelector(".djs-hit") ?? shape).getBoundingClientRect();
    const x = hit.left + hit.width / 2;
    const y = hit.top + hit.height / 2;
    const inside =
      x > box.left + 90 && x < box.right - 20 && y > box.top + 90 && y < box.bottom - 20;
    if (id === null || hit.width < 8 || hit.height < 8 || !inside) return [];
    const top = document.elementFromPoint(x, y);
    return top && svg?.contains(top) && shape.contains(top) ? [{ id, x, y }] : [];
  });
}

/** A point of the board that lies on its pane: beside every node, the toolbar and the armed editor. */
function panePoint(board: HTMLElement): { x: number; y: number } {
  const box = board.getBoundingClientRect();
  for (let y = box.bottom - 24; y > box.top; y -= 40) {
    for (let x = box.right - 24; x > box.left; x -= 40) {
      if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
    }
  }
  throw new Error("no point of the board shows its pane");
}

/** Ends an editing a failed test left behind, so that the tests after it start from previews. */
function endEditing(board: HTMLElement): void {
  const done = board.querySelector<HTMLButtonElement>("[data-board-done]");
  if (done && done.dataset.boardDone !== "") done.click();
}

describe("seven model nodes, opened while the board is at a zoom of 0.5", () => {
  const START = { x: 40, y: 120, zoom: 0.5 };
  let mounted: MountedBoard;
  beforeAll(async () => {
    mounted = await mountBoard({ nodes: NODES, files: FILES, view: START });
  }, LOAD_MS);
  afterAll(() => mounted.destroy());
  // Done leaves the board at 100 %, where the editing took it: every test starts from 0.5 again.
  beforeEach(() => mounted.board.setViewState(START));
  afterEach(() => endEditing(mounted.element));

  previews(
    () => mounted,
    () => 0.5,
  );

  const doneControl = (): HTMLElement => {
    const done = mounted.element.querySelector<HTMLElement>("[data-board-done]");
    if (!done) throw new Error("the board has no Done control");
    return done;
  };
  const inLayer = (engine: HTMLElement): boolean =>
    engine.parentElement?.classList.contains("board-overlay-layer") === true;
  const openPads = (engine: HTMLElement): number =>
    engine.querySelectorAll(".djs-context-pad.open").length;

  async function clickShape(engine: HTMLElement, modeler: EmbeddableModeler) {
    const selection = (): readonly string[] => modeler.elements?.selection() ?? [];
    // BPMN selects the next element after a delete, and a click on a selected element takes it
    // out of the selection again: the click goes to one that is not selected. A shape that only
    // labels another element (BPMN's external labels) selects that element.
    const selected = selection();
    const listed = new Set(modeler.elements?.list().map((element) => element.id));
    const shape = reachableShapes(engine).find(
      (one) => listed.has(one.id) && !selected.includes(one.id),
    );
    if (!shape) throw new Error("no shape of the editor is clear of its chrome");
    await commands.realInput([{ type: "click", x: shape.x, y: shape.y }]);
    await expect.poll(selection, WAIT).toEqual([shape.id]);
    await expect.poll(() => openPads(engine), WAIT).toBe(1);
    return shape;
  }

  it.each(NOTATIONS)(
    "%s: a real double-click arms it, one real edit writes its file once, Done releases it",
    async (notation) => {
      const { board, backend } = mounted;
      const node = nodeOf(notation);
      const { path, text } = exampleOf(notation);
      const engine = mounted.engine(node.id);
      const modeler = mounted.modeler(node.id);
      const selection = (): readonly string[] => modeler.elements?.selection() ?? [];

      // The node as a preview at 0.5, inside the window.
      board.setViewState({ x: 120 - node.x * 0.5, y: 200 - node.y * 0.5, zoom: 0.5 });
      await expect.poll(() => leftOf(engine), WAIT).toBeCloseTo(120, -1);
      const preview = engine.getBoundingClientRect();
      expect(preview.width / engine.offsetWidth).toBeCloseTo(0.5, 3);
      const view = shownView(modeler, engine);
      const writesBefore = backend.writes.length;
      const changesBefore = mounted.boardChanges();

      // A preview takes no input: a real click on one of its shapes selects nothing in it.
      const drawn = engine
        .querySelector(".djs-element.djs-shape .djs-hit")
        ?.getBoundingClientRect();
      if (!drawn) throw new Error("the preview draws no shape");
      await commands.realInput([
        { type: "click", x: drawn.left + drawn.width / 2, y: drawn.top + drawn.height / 2 },
      ]);
      await settle();
      expect(selection()).toEqual([]);
      expect(engine.dataset.armed).toBe("false");

      await commands.realInput([
        {
          type: "dblclick",
          x: preview.left + preview.width / 2,
          y: preview.top + preview.height * 0.85,
        },
      ]);
      await expect.poll(() => inLayer(engine), WAIT).toBe(true);
      await expect.poll(() => doneControl().dataset.boardDone, WAIT).toBe(node.id);
      expect((board.getViewState() as { zoom: number }).zoom).toBe(1);
      expect(engine.dataset.armed).toBe("true");
      const armed = engine.getBoundingClientRect();
      expect([armed.width, armed.height]).toEqual([engine.offsetWidth, engine.offsetHeight]);
      await expect
        .poll(() => document.activeElement, WAIT)
        .toBe(engine.querySelector(".djs-container > svg"));
      expect(shownChrome(engine)).toContain("djs-palette");
      // Armed at the layout size it was fitted at: the view is the preview's.
      expect(shownView(modeler, engine)).toEqual(view);
      // The double-click that armed the node selected and changed nothing in the model.
      expect(selection()).toEqual([]);
      expect(backend.writes).toHaveLength(writesBefore);

      // One edit by hand: a click on a shape, then Delete.
      const removed = await clickShape(engine, modeler);
      expect(backend.writes).toHaveLength(writesBefore);
      await commands.realInput([{ type: "press", key: "Delete" }]);
      await expect.poll(() => backend.writes.length, WAIT).toBe(writesBefore + 1);
      await settle();
      expect(backend.writes).toHaveLength(writesBefore + 1);
      expect(backend.writes.at(-1)?.path).toBe(path);
      expect(backend.writes.at(-1)?.text).toBe(backend.textOf(path));
      expect(backend.textOf(path)).not.toBe(text);
      expect(modeler.elements?.list().map((element) => element.id)).not.toContain(removed.id);
      // The model's file changed. The board's did not, and the board says so.
      expect(board.exportText()).toBe(mounted.text);
      expect(mounted.boardChanges()).toBe(changesBefore);

      // Something for Done to release: a selection with its open pad.
      await clickShape(engine, modeler);
      const done = doneControl().getBoundingClientRect();
      await commands.realInput([
        { type: "click", x: done.left + done.width / 2, y: done.top + done.height / 2 },
      ]);
      await expect.poll(() => inLayer(engine), WAIT).toBe(false);
      await expect.poll(() => doneControl().dataset.boardDone, WAIT).toBe("");
      await settle();
      expect(engine.dataset.armed).toBe("false");
      expect(selection()).toEqual([]);
      expect(openPads(engine)).toBe(0);
      expect(shownChrome(engine)).toEqual([]);
      expect(backend.writes).toHaveLength(writesBefore + 1);
      expect(board.exportText()).toBe(mounted.text);
      expect(mounted.boardChanges()).toBe(changesBefore);
    },
    FLOW_TIMEOUT,
  );

  it.each(NOTATIONS)(
    "%s: a real turn of the wheel on the board ends the editing as Done does",
    async (notation) => {
      const { board, backend } = mounted;
      const node = nodeOf(notation);
      const engine = mounted.engine(node.id);
      const modeler = mounted.modeler(node.id);
      const selection = (): readonly string[] => modeler.elements?.selection() ?? [];
      const zoom = (): number => (board.getViewState() as { zoom: number }).zoom;

      board.setViewState({ x: 120 - node.x * 0.5, y: 200 - node.y * 0.5, zoom: 0.5 });
      await expect.poll(() => leftOf(engine), WAIT).toBeCloseTo(120, -1);
      const preview = engine.getBoundingClientRect();
      const writesBefore = backend.writes.length;
      const changesBefore = mounted.boardChanges();
      await commands.realInput([
        {
          type: "dblclick",
          x: preview.left + preview.width / 2,
          y: preview.top + preview.height * 0.85,
        },
      ]);
      await expect.poll(() => inLayer(engine), WAIT).toBe(true);
      await expect.poll(() => doneControl().dataset.boardDone, WAIT).toBe(node.id);
      expect(zoom()).toBe(1);
      // Something for the zoom to release: a selection with its open pad.
      await clickShape(engine, modeler);

      await commands.realInput([
        { type: "move", ...panePoint(mounted.element) },
        { type: "wheel", dy: 240 },
      ]);
      await expect.poll(() => inLayer(engine), WAIT).toBe(false);
      await expect.poll(() => doneControl().dataset.boardDone, WAIT).toBe("");
      // the board did zoom: the editing ended for it, not in its place
      await expect.poll(zoom, WAIT).not.toBe(1);
      await settle();
      expect(engine.dataset.armed).toBe("false");
      expect(selection()).toEqual([]);
      expect(openPads(engine)).toBe(0);
      expect(shownChrome(engine)).toEqual([]);
      expect(engine.contains(document.activeElement)).toBe(false);
      // a selection and its release are no edit: no file and no board changed
      expect(backend.writes).toHaveLength(writesBefore);
      expect(board.exportText()).toBe(mounted.text);
      expect(mounted.boardChanges()).toBe(changesBefore);
    },
    FLOW_TIMEOUT,
  );
});

describe("once each", () => {
  const COMMENT = "// what the shop buys in";
  const tea = exampleOf("wardley").text.trimEnd().split("\n");
  const commented = [...tea.slice(0, 6), COMMENT, ...tea.slice(6)].join("\n") + "\n";
  const teams = exampleOf("team-topologies").text;
  const ONCE: Readonly<Record<string, string>> = {
    "maps/tea.wmap": commented,
    "teams/shop.tt": teams,
    "teams/platform.ttm.json": teams,
    "teams/again.tt": teams,
    "contexts/planner.cm.json": exampleOf("context-maps").text,
    "chains/porter.vc": exampleOf("value-chain").text,
  };
  // the last node shows the first node's file again
  const TWIN_PATH = "maps/tea.wmap";
  const nodes = gridOf([...Object.keys(ONCE), TWIN_PATH]);
  const twin = nodes.at(-1)!;
  let mounted: MountedBoard;
  beforeAll(async () => {
    mounted = await mountBoard({ nodes, files: ONCE, view: { x: 40, y: 120, zoom: 0.5 } });
  }, LOAD_MS);
  afterAll(() => mounted.destroy());
  afterEach(() => endEditing(mounted.element));

  const notationAt = (path: string): string | undefined => {
    const node = nodes.find((one) => one.path === path);
    return node ? mounted.engine(node.id).dataset.notation : undefined;
  };

  it("three nodes of one notation load its module once", () => {
    const shown = Object.keys(ONCE).filter((path) => notationAt(path) === "team-topologies");
    expect(shown).toEqual(["teams/shop.tt", "teams/platform.ttm.json", "teams/again.tt"]);
    expect(mounted.loads("team-topologies")).toBe(1);
    expect(mounted.loads("wardley")).toBe(1);
    // A notation no node shows is not loaded at all.
    expect(mounted.loads("c4")).toBe(0);
  });

  it("a notation's second suffix opens the same editor", () => {
    expect(notationAt("maps/tea.wmap")).toBe("wardley");
    expect(notationAt("teams/platform.ttm.json")).toBe("team-topologies");
    expect(notationAt("contexts/planner.cm.json")).toBe("context-maps");
    expect(notationAt("chains/porter.vc")).toBe("value-chain");
  });

  it(
    "Wardley Maps: a comment line and the order of the lines survive one moved component, and a second node on the file follows",
    async () => {
      const { backend } = mounted;
      const path = TWIN_PATH;
      const node = nodes[0]!;
      const other = mounted.modeler(twin.id);
      expect(other).not.toBe(mounted.modeler(node.id));
      const otherBefore = other.exportText();
      const engine = mounted.engine(node.id);
      const modeler = mounted.modeler(node.id);
      mounted.board.setViewState({ x: 120 - node.x * 0.5, y: 200 - node.y * 0.5, zoom: 0.5 });
      await expect.poll(() => leftOf(engine), WAIT).toBeCloseTo(120, -1);
      const preview = engine.getBoundingClientRect();
      await commands.realInput([
        {
          type: "dblclick",
          x: preview.left + preview.width / 2,
          y: preview.top + preview.height * 0.85,
        },
      ]);
      await expect
        .poll(() => document.activeElement, WAIT)
        .toBe(engine.querySelector(".djs-container > svg"));

      const shape = reachableShapes(engine)[0];
      if (!shape) throw new Error("no component is clear of the palette");
      await commands.realInput([
        { type: "move", x: shape.x, y: shape.y },
        { type: "down" },
        { type: "move", x: shape.x + 12, y: shape.y + 8, steps: 4 },
        { type: "move", x: shape.x + 30, y: shape.y + 22, steps: 6 },
        { type: "up" },
      ]);
      await expect.poll(() => backend.writes.length, WAIT).toBe(1);
      await settle();
      expect(backend.writes).toHaveLength(1);

      const before = commented.split("\n");
      const written = (backend.textOf(path) ?? "").split("\n");
      const changed = written.flatMap((line, index) => (line === before[index] ? [] : [index]));
      expect(written).toHaveLength(before.length);
      expect(changed).toHaveLength(1);
      expect(written[changed[0]!]).toMatch(/^(component|anchor) .+ \[\d/);
      expect(written[6]).toBe(COMMENT);
      // The modeler's own export is another text: it takes the comment out of its place.
      expect(modeler.exportText().split("\n")[6]).not.toBe(COMMENT);
      // The second node on the file draws the moved component and wrote nothing for it.
      await expect.poll(() => other.exportText(), WAIT).toBe(modeler.exportText());
      expect(other.exportText()).not.toBe(otherBefore);
      await settle();
      expect(backend.writes).toHaveLength(1);
      expect(mounted.engine(twin.id).dataset.embedState).toBe("ready");

      const done = mounted.element.querySelector<HTMLElement>("[data-board-done]");
      const box = done?.getBoundingClientRect();
      if (!box) throw new Error("the board has no Done control");
      await commands.realInput([
        { type: "click", x: box.left + box.width / 2, y: box.top + box.height / 2 },
      ]);
      await expect.poll(() => engine.dataset.armed, WAIT).toBe("false");
      await settle();
      expect(backend.writes).toHaveLength(1);
    },
    FLOW_TIMEOUT,
  );

  it(
    "Value Chain: a change from outside while it is armed is drawn, with the view and the arming kept and nothing written back",
    async () => {
      const { backend } = mounted;
      const path = "chains/porter.vc";
      const node = nodes.find((one) => one.path === path)!;
      const engine = mounted.engine(node.id);
      const modeler = mounted.modeler(node.id);
      mounted.board.setViewState({ x: 120 - node.x * 0.5, y: 200 - node.y * 0.5, zoom: 0.5 });
      await expect.poll(() => leftOf(engine), WAIT).toBeCloseTo(120, -1);
      const preview = engine.getBoundingClientRect();
      await commands.realInput([
        {
          type: "dblclick",
          x: preview.left + preview.width / 2,
          y: preview.top + preview.height * 0.85,
        },
      ]);
      await expect
        .poll(() => document.activeElement, WAIT)
        .toBe(engine.querySelector(".djs-container > svg"));
      const view = shownView(modeler, engine);
      const writes = backend.writes.length;
      const changes = mounted.boardChanges();
      expect(modeler.exportText()).not.toContain("Operations of the shop");

      const outside = (backend.textOf(path) ?? "").replace(
        '"name": "Operations"',
        '"name": "Operations of the shop"',
      );
      expect(outside).not.toBe(backend.textOf(path));
      backend.outside(path, outside);

      await expect.poll(() => modeler.exportText(), WAIT).toContain("Operations of the shop");
      await expect.poll(() => engine.textContent, WAIT).toContain("Operations of the shop");
      await settle();
      expect(engine.dataset.embedState).toBe("ready");
      expect(engine.dataset.armed).toBe("true");
      expect(engine.parentElement?.classList).toContain("board-overlay-layer");
      // The view the contract answers is the one from before. The picture is drawn anew with
      // the import, and its scale comes out rounded: 0.76 where the first fit drew 0.759596.
      const after = shownView(modeler, engine);
      expect(after.state).toEqual(view.state);
      const numbers = (matrix: string | null): number[] =>
        (matrix?.match(/-?[\d.]+/g) ?? []).map(Number);
      expect(numbers(after.drawn)).toHaveLength(6);
      numbers(after.drawn).forEach((value, index) => {
        expect(value).toBeCloseTo(numbers(view.drawn)[index] ?? Number.NaN, 2);
      });
      // the file is the outside's text, byte for byte: the editor wrote nothing back
      expect(backend.writes).toHaveLength(writes);
      expect(backend.textOf(path)).toBe(outside);
      expect(mounted.boardChanges()).toBe(changes);
    },
    FLOW_TIMEOUT,
  );
});

interface C4Views {
  catalog(): {
    list(): readonly { key: string }[];
    parentOf(key: string): { key: string } | undefined;
  };
  open(key: string, options: { cause: "navigation" }): boolean;
}

/** The breadcrumb bar as a person sees it: its width, and how far each name and level was cut. */
function crumbsOf(engine: HTMLElement): unknown {
  const bar = engine.querySelector<HTMLElement>("nav.c4-breadcrumbs");
  if (!bar || bar.hidden) return undefined;
  const round = (value: number): number => Math.round(value * 100) / 100;
  return {
    width: round(bar.getBoundingClientRect().width),
    covered: bar.hasAttribute("data-covered"),
    parts: [...bar.querySelectorAll<HTMLElement>("li span, li button")].map((part) => ({
      text: part.textContent,
      width: round(part.getBoundingClientRect().width),
      cut: part.style.maxWidth,
    })),
  };
}

/** Opens the view that lies deepest below the landscape, the one with the longest path. */
function openDeepestView(modeler: unknown): void {
  const { views } = modeler as { views: C4Views };
  const catalog = views.catalog();
  const depth = (key: string): number => {
    const parent = catalog.parentOf(key);
    return parent ? 1 + depth(parent.key) : 0;
  };
  const deepest = [...catalog.list()].sort((a, b) => depth(b.key) - depth(a.key))[0];
  if (!deepest || depth(deepest.key) < 2) throw new Error("the example has no view to drill into");
  expect(views.open(deepest.key, { cause: "navigation" })).toBe(true);
}

describe("seven model nodes whose folder is renamed", () => {
  const START = { x: 40, y: 120, zoom: 0.5 };
  const moved = (path: string): string => path.replace(/^models\//, "renamed/");
  interface Before {
    readonly element: HTMLElement;
    readonly modeler: ReturnType<MountedBoard["modeler"]>;
    readonly view: ShownView;
    readonly text: string;
  }
  const before = new Map<string, Before>();
  let mounted: MountedBoard;
  beforeAll(async () => {
    mounted = await mountBoard({ nodes: NODES, files: FILES, view: START });
    for (const node of NODES) {
      const element = mounted.engine(node.id);
      const modeler = mounted.modeler(node.id);
      before.set(node.id, {
        element,
        modeler,
        view: shownView(modeler, element),
        text: modeler.exportText(),
      });
    }
    // one move per file of the folder, told in one call
    mounted.backend.move("models", "renamed");
    await vi.waitFor(() => {
      if (mounted.boardChanges() < NODES.length) throw new Error("a node did not follow yet");
    }, WAIT);
    // behind every text the editors asked for under the new paths
    await mounted.files.settled();
    await settle();
  }, LOAD_MS);
  afterAll(() => mounted.destroy());
  beforeEach(() => mounted.board.setViewState(START));
  afterEach(() => endEditing(mounted.element));

  it("changed the board once per node, and loaded no notation's module again", () => {
    expect(mounted.boardChanges()).toBe(NODES.length);
    const text = mounted.board.exportText();
    for (const node of NODES) expect(text).toContain(`"file":"${moved(node.path)}"`);
    expect(text).not.toContain('"file":"models/');
    expect(NOTATIONS.map((notation) => mounted.loads(notation))).toEqual(NOTATIONS.map(() => 1));
    expect(mounted.backend.writes).toEqual([]);
  });

  it.each(NOTATIONS)(
    "%s: the modeler it had stands in the element the board made for the new path, with its view and its text",
    (notation) => {
      const node = nodeOf(notation);
      const was = before.get(node.id)!;
      const engine = mounted.engine(node.id);

      expect(engine).not.toBe(was.element);
      expect(was.element.isConnected).toBe(false);
      expect(mounted.modeler(node.id)).toBe(was.modeler);
      expect([engine.dataset.embedState, engine.dataset.notation, engine.dataset.armed]).toEqual([
        "ready",
        notation,
        "false",
      ]);
      expect(shownView(was.modeler, engine)).toEqual(was.view);
      expect(was.modeler.exportText()).toBe(was.text);
      // a preview as before: the sheet's rule reaches the new element
      expect(shownChrome(engine)).toEqual([]);
    },
  );

  it(
    "Wardley Maps: a real drag writes the file under its new path, and the editor stays armed and takes the next drag when the file is renamed under it",
    async () => {
      const { backend } = mounted;
      const node = nodeOf("wardley");
      const path = moved(node.path);
      const modeler = mounted.modeler(node.id);
      mounted.board.setViewState({ x: 120 - node.x * 0.5, y: 200 - node.y * 0.5, zoom: 0.5 });
      await expect.poll(() => leftOf(mounted.engine(node.id)), WAIT).toBeCloseTo(120, -1);
      const preview = mounted.engine(node.id).getBoundingClientRect();
      await commands.realInput([
        {
          type: "dblclick",
          x: preview.left + preview.width / 2,
          y: preview.top + preview.height * 0.85,
        },
      ]);
      const canvasOf = (): Element | null =>
        mounted.engine(node.id).querySelector(".djs-container > svg");
      await expect.poll(() => document.activeElement, WAIT).toBe(canvasOf());

      const drag = async (): Promise<void> => {
        const shape = reachableShapes(mounted.engine(node.id))[0];
        if (!shape) throw new Error("no component is clear of the palette");
        await commands.realInput([
          { type: "move", x: shape.x, y: shape.y },
          { type: "down" },
          { type: "move", x: shape.x + 12, y: shape.y + 8, steps: 4 },
          { type: "move", x: shape.x + 30, y: shape.y + 22, steps: 6 },
          { type: "up" },
        ]);
      };
      await drag();
      await expect.poll(() => backend.writes.length, WAIT).toBe(1);
      expect(backend.writes[0]?.path).toBe(path);
      expect(backend.textOf(node.path)).toBeUndefined();

      // renamed while a person edits it
      const changes = mounted.boardChanges();
      const armedElement = mounted.engine(node.id);
      backend.move(path, "renamed/green-tea.owm");
      await expect.poll(() => mounted.boardChanges(), WAIT).toBe(changes + 1);
      await mounted.files.settled();
      await expect.poll(() => armedElement.isConnected, WAIT).toBe(false);
      const engine = mounted.engine(node.id);
      expect(engine.parentElement?.classList.contains("board-overlay-layer")).toBe(true);
      expect(engine.dataset.armed).toBe("true");
      expect(mounted.modeler(node.id)).toBe(modeler);
      // the keys are the editor's again in the element the board made
      await expect.poll(() => document.activeElement, WAIT).toBe(canvasOf());

      await drag();
      await expect.poll(() => backend.writes.length, WAIT).toBe(2);
      expect(backend.writes[1]?.path).toBe("renamed/green-tea.owm");
      expect(backend.textOf("renamed/green-tea.owm")).toBe(backend.writes[1]?.text);
      await settle();
      expect(backend.writes).toHaveLength(2);
    },
    FLOW_TIMEOUT,
  );
});

describe("C4 in a narrow node", () => {
  const { path, text } = exampleOf("c4");
  const node = { id: "narrow", path, x: 0, y: 0, width: 420, height: 540 };
  let mounted: MountedBoard;
  beforeAll(async () => {
    mounted = await mountBoard({
      nodes: [node],
      files: { [path]: text },
      view: { x: 120, y: 200, zoom: 0.5 },
    });
  }, LOAD_MS);
  afterAll(() => mounted.destroy());

  it(
    "has the breadcrumb bar it has alone, once it is armed after a preview at 0.5",
    async () => {
      const engine = mounted.engine(node.id);
      const size = { width: engine.clientWidth, height: engine.clientHeight };
      expect(size.width).toBe(420);

      const alone = await mountAlone("c4", text, size);
      openDeepestView(alone.modeler);
      await expect.poll(() => crumbsOf(alone.element), WAIT).toBeDefined();
      await settle();
      const expected = crumbsOf(alone.element);
      alone.destroy();

      // Drawn while the board scales the node: the bar measured a box half as wide as it is.
      openDeepestView(mounted.modeler(node.id));
      await expect.poll(() => crumbsOf(engine), WAIT).toBeDefined();
      await settle();
      expect(crumbsOf(engine)).not.toEqual(expected);

      const preview = engine.getBoundingClientRect();
      await commands.realInput([
        {
          type: "dblclick",
          x: preview.left + preview.width / 2,
          y: preview.top + preview.height * 0.85,
        },
      ]);
      await expect
        .poll(() => document.activeElement, WAIT)
        .toBe(engine.querySelector(".djs-container > svg"));
      await expect.poll(() => crumbsOf(engine), WAIT).toEqual(expected);
    },
    FLOW_TIMEOUT,
  );
});
