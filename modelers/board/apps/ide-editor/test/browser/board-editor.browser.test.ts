/**
 * The board under the suite's shell, as `mountBoardEditor` mounts it: the shell's real
 * `mountShell` in the IDE column through a host of the test's own, a document the test drives,
 * and real mouse and keyboard input. A synthetic event ignores `inert`, hit testing and the
 * focus, which is what the lock, the two chromes and the keys are about.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import "@miragon/modeler-shell/shell.css";
import "@miragon/board-renderer/assets/board.css";
import "board-suite-editors/base";
import "../../src/app.css";
import { INVALID_TEXT, type EditorEntry, type EmbeddableModeler } from "@miragon/board-host";
import { addNode, createCollaborativeModeler } from "@miragon/board-renderer";
import { encodeBoard } from "@miragon/board-schema-model";
import { SUITE_EDITORS } from "board-suite-editors";
import { watchPageErrors } from "../../../editors/test/browser/support/page-errors.js";
import { mountBoardEditor, type BoardEditor } from "../../src/board-editor.js";
import { BOARD_MIN_ZOOM, fittedView, viewOf, type BoardView } from "../../src/zoom-target.js";
import { testFiles, type TestFiles } from "./support/files.js";
import { testHost, testWebHost, type TestHost, type TestHostOptions } from "./support/ide-host.js";

const WAIT = { timeout: 10_000, interval: 25 };
/** The first load of a renderer of the suite from its sources, on a busy machine. */
const LOAD_MS = 90_000;
/** A flow of real input with several waits in it. */
const FLOW_MS = 60_000;

const TEA_PATH = "models/tea.owm";
const TEA = [
  "title Tea Shop",
  "component Cup of Tea [0.79, 0.61]",
  "component Cup [0.73, 0.78]",
  "component Tea [0.63, 0.81]",
  "component Hot Water [0.52, 0.8]",
  "component Kettle [0.43, 0.35]",
  "Cup of Tea -> Cup",
  "Cup of Tea -> Tea",
  "Cup of Tea -> Hot Water",
  "Hot Water -> Kettle",
  "",
].join("\n");

const note = (text: string, x: number, z: string) => ({
  kind: "node",
  type: "text",
  text,
  x,
  y: 0,
  width: 320,
  height: 180,
  z,
});
/** Two notes 1720 px apart from edge to edge: wider than the shell leaves free, so a fit is below 100 %. */
const NOTES = encodeBoard({
  meta: { title: "Under the shell", version: 1 },
  elements: { n_near: note("A note.", 0, "a"), n_far: note("Further right.", 1400, "b") },
});
/** The same board with a third note: a valid text that is another one. */
const THREE_NOTES = encodeBoard({
  meta: { title: "Under the shell", version: 1 },
  elements: {
    n_near: note("A note.", 0, "a"),
    n_far: note("Further right.", 1400, "b"),
    n_third: note("A third one.", 700, "c"),
  },
});
const NOTES_BOUNDS = { x: 0, y: 0, width: 1720, height: 180 };
/** A model of 800 x 540 with a note beside it: it fits at 100 %. */
const WITH_MODEL = encodeBoard({
  meta: { title: "A model under the shell", version: 1 },
  elements: {
    n_model: {
      kind: "node",
      type: "model",
      file: TEA_PATH,
      x: 0,
      y: 0,
      width: 800,
      height: 540,
      z: "a",
    },
    n_note: note("A note beside the model.", 880, "b"),
  },
});

/** One real editor of the suite, handed to the board as a parameter, as an app does. */
function editorOf(notation: string): EditorEntry {
  const entry = SUITE_EDITORS.find((one) => one.notation === notation);
  if (!entry) throw new Error(`the suite's registry has no editor for '${notation}'`);
  return entry;
}
const WARDLEY = editorOf("wardley");

interface Mounted {
  readonly editor: BoardEditor;
  readonly host: TestHost;
  readonly root: HTMLElement;
  readonly files: TestFiles | undefined;
  /** the modelers the board's model nodes made, in order */
  readonly modelers: EmbeddableModeler[];
}

interface MountOptions extends TestHostOptions {
  /** the document's first text; absent: the test opens the document itself */
  text?: string | undefined;
  /** the repository; absent: a board without files */
  files?: Readonly<Record<string, string>> | undefined;
  /** the root is `display: none` when the editor is mounted */
  hidden?: boolean | undefined;
  /** default true, as in VS Code: an armed editor's undo keys never reach the host */
  containHistoryKeys?: boolean | undefined;
  /** the host binds the file keys itself, as a web app does */
  fileKeys?: boolean | undefined;
}

let mounted: Mounted | undefined;

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));
/** Two frames: a commit of React and the listeners behind it, never a wait for an answer. */
async function settle(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

/** The registry's entry, wrapped only to hand the test the modelers it made. */
function recording(entry: EditorEntry, made: EmbeddableModeler[]): EditorEntry {
  return {
    ...entry,
    async load() {
      const module = await entry.load();
      return {
        ...module,
        create(options) {
          const modeler = module.create(options);
          made.push(modeler);
          return modeler;
        },
      };
    },
  };
}

function nodeIds(editor: BoardEditor): string[] {
  return editor.modeler.board.store.getSnapshot().nodes.map((node) => node.id);
}

/** Resolves once the canvas shows every node of the document, with its toolbar. */
async function drawn(editor: BoardEditor, root: HTMLElement): Promise<void> {
  await vi.waitFor(() => {
    if (!root.querySelector(".board-toolbar")) throw new Error("the board has no toolbar yet");
    const loading = root.querySelector(".board-slot:not(.board-slot--error)");
    if (loading) throw new Error(`a part of the board is still loading: ${loading.textContent}`);
    const wrappers = new Set(
      [...root.querySelectorAll(".react-flow__node")].map((node) => node.getAttribute("data-id")),
    );
    const absent = nodeIds(editor).find((id) => !wrappers.has(id));
    if (absent) throw new Error(`the canvas does not show the node ${absent}`);
  }, WAIT);
}

async function mount(options: MountOptions = {}): Promise<Mounted> {
  const root = document.createElement("div");
  root.id = "app";
  if (options.hidden) root.style.display = "none";
  document.body.append(root);
  const host = testHost(options);
  const modelers: EmbeddableModeler[] = [];
  const editors = [recording(WARDLEY, modelers)];
  const files = options.files ? testFiles(options.files, editors) : undefined;
  const editor = await mountBoardEditor(host.host, {
    root,
    files: files?.files,
    editors,
    containHistoryKeys: options.containHistoryKeys !== false,
    fileKeys: options.fileKeys,
  });
  mounted = { editor, host, root, files, modelers };
  if (options.text !== undefined) {
    await host.document.open(options.text);
    await editor.ready;
    if (!options.hidden) await drawn(editor, root);
    // The first view is set in the animation frame after the first text: a test that acts in
    // the task the mount ends in would act on the view from before it.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  return mounted;
}

/** The whole teardown in the order an app keeps: the editor, then the files, then the page's root. */
async function unmount(): Promise<void> {
  const last = mounted;
  mounted = undefined;
  if (!last) return;
  await last.editor.destroy();
  last.files?.files.dispose();
  last.root.remove();
}

function one<Found extends Element = HTMLElement>(root: ParentNode, selector: string): Found {
  const found = root.querySelector<Found>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
}

interface Point {
  x: number;
  y: number;
}
const centreOf = (element: Element): Point => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};
const realClick = (at: Point): Promise<void> => commands.realInput([{ type: "click", ...at }]);
const press = (key: string): Promise<void> => commands.realInput([{ type: "press", key }]);

/** How many px² two elements share on screen. */
function overlap(a: Element, b: Element): number {
  const [first, second] = [a.getBoundingClientRect(), b.getBoundingClientRect()];
  const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/** A point of the board that shows its bare pane: beside every node and under no chrome. */
function panePoint(root: HTMLElement): Point {
  const box = root.getBoundingClientRect();
  for (let y = box.bottom - 120; y > box.top + 80; y -= 40) {
    for (let x = box.left + 120; x < box.right - 240; x += 40) {
      if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
    }
  }
  throw new Error("no point of the board shows its pane");
}

interface SeenKey {
  key: string;
  control: boolean;
  prevented: boolean;
}

/**
 * The keys as the window gets them: on their way down, which every key takes, and on their way
 * back up, where the host of a webview listens and where a key that was stopped never arrives.
 */
function keysAtWindow(): { down: SeenKey[]; up: SeenKey[]; stop(): void } {
  const down: SeenKey[] = [];
  const up: SeenKey[] = [];
  const into =
    (list: SeenKey[]) =>
    (event: KeyboardEvent): void => {
      if (event.key === "Control") return;
      list.push({ key: event.key, control: event.ctrlKey, prevented: event.defaultPrevented });
    };
  const [onDown, onUp] = [into(down), into(up)];
  window.addEventListener("keydown", onDown, true);
  window.addEventListener("keydown", onUp);
  return {
    down,
    up,
    stop() {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keydown", onUp);
    },
  };
}

const viewNow = (editor: BoardEditor): BoardView => viewOf(editor.modeler);
const readout = (root: HTMLElement): string | null => one(root, '[data-zoom="actual"]').textContent;
const asPercent = (zoom: number): string => `${Math.round(zoom * 100)}%`;
const toolbarButton = (root: HTMLElement, label: string): HTMLButtonElement => {
  const button = [...root.querySelectorAll<HTMLButtonElement>(".board-toolbar button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`the toolbar has no ${label} button`);
  return button;
};
const statusBox = (root: HTMLElement): HTMLElement => one(root, '[data-chrome="status"]');
const doneId = (root: HTMLElement): string | undefined =>
  one(root, "[data-board-done]").dataset.boardDone;

/** The view the shell's rule gives the two notes in the test's window. */
function fittedNotes(editor: BoardEditor): BoardView {
  const slot = editor.shell.canvas;
  const fitted = fittedView(
    NOTES_BOUNDS,
    { width: slot.clientWidth, height: slot.clientHeight },
    editor.shell.fitInsets(),
  );
  if (!fitted) throw new Error("the slot has no size");
  return fitted;
}

async function expectView(editor: BoardEditor, expected: BoardView): Promise<void> {
  await expect.poll(() => viewNow(editor).zoom, WAIT).toBeCloseTo(expected.zoom, 9);
  expect(viewNow(editor).x).toBeCloseTo(expected.x, 6);
  expect(viewNow(editor).y).toBeCloseTo(expected.y, 6);
}

// One watch for the whole file, so that what a mount or a teardown says is seen too.
const errors = watchPageErrors();
const htmlClassAtStart = document.documentElement.className;

beforeAll(async () => {
  // The renderer's code once, so that no test's own limit has to cover its first load.
  await WARDLEY.load();
}, LOAD_MS);

afterEach(async () => {
  await unmount();
  // no test leaves the pointer over the next test's chrome
  await commands.realInput([{ type: "move", x: 1, y: 1 }]);
  expect(errors.list()).toEqual([]);
});

afterAll(() => {
  const seen = errors.list();
  errors.stop();
  expect(seen).toEqual([]);
});

describe("the two chromes as one picture", () => {
  /** The board's own chrome without a shell, in a box of the window's size. */
  async function chromeAlone(): Promise<{ done: DOMRect; toolbar: DOMRect }> {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh";
    document.body.append(box);
    const alone = createCollaborativeModeler();
    try {
      alone.attachTo(box);
      await alone.importText(NOTES);
      await vi.waitFor(() => one(box, "[data-board-done]"), WAIT);
      return {
        done: one(box, "[data-board-done]").getBoundingClientRect(),
        toolbar: one(box, ".board-toolbar").getBoundingClientRect(),
      };
    } finally {
      alone.destroy();
      await vi.waitFor(() => {
        if (box.childElementCount > 0) throw new Error("the board alone is still mounted");
      }, WAIT);
      box.remove();
    }
  }

  it("keeps the toolbar clear of the menu trigger, with the Done control at its size", async () => {
    const alone = await chromeAlone();
    const { root } = await mount({ text: NOTES });
    const trigger = one(root, '[data-chrome="menu"]');
    const toolbar = one(root, ".board-toolbar");
    const done = one(root, "[data-board-done]").getBoundingClientRect();

    expect(overlap(trigger, toolbar)).toBe(0);
    const box = toolbar.getBoundingClientRect();
    // where the shell's top row is free: its edge, the trigger, its edge again
    expect(box.left).toBe(trigger.getBoundingClientRect().right + 12);
    expect(box.left).toBe(64);
    expect([done.width, done.height]).toEqual([alone.done.width, alone.done.height]);
    // the control leads the toolbar, as it does alone
    expect(done.left - box.left).toBe(alone.done.left - alone.toolbar.left);
    expect([box.top, box.bottom]).toEqual([alone.toolbar.top, alone.toolbar.bottom]);
    // and the trigger is the one that takes a click where it stands
    const at = centreOf(trigger);
    expect(trigger.contains(document.elementFromPoint(at.x, at.y))).toBe(true);
  });

  it("shows exactly one zoom control, the shell's", async () => {
    const { root } = await mount({ text: NOTES });
    const groups = [...root.querySelectorAll<HTMLElement>('[role="group"][aria-label="Zoom"]')];
    expect(groups.map((group) => group.dataset.chrome ?? group.className).sort()).toEqual([
      "board-toolbar__group",
      "zoom",
    ]);
    const visible = groups.filter((group) => group.checkVisibility());
    expect(visible.map((group) => group.dataset.chrome)).toEqual(["zoom"]);
    // the board's own readout is not rendered at all: it takes no room in the toolbar
    expect(one(root, "[data-board-zoom]").getClientRects()).toHaveLength(0);
    // the rest of the toolbar is there
    expect(toolbarButton(root, "Group").checkVisibility()).toBe(true);
    expect(one(root, "select.board-toolbar__models").checkVisibility()).toBe(true);
  });

  it("keeps React Flow's attribution in sight and clear of the zoom panel", async () => {
    const { root } = await mount({ text: NOTES });
    const attribution = one(root, ".react-flow__attribution");
    const panel = one(root, '[data-chrome="zoom"]');
    expect(attribution.checkVisibility({ visibilityProperty: true, opacityProperty: true })).toBe(
      true,
    );
    expect(overlap(attribution, panel)).toBe(0);
    expect(overlap(attribution, one(root, ".board-toolbar"))).toBe(0);
    const [box, page] = [attribution.getBoundingClientRect(), root.getBoundingClientRect()];
    expect(box.width).toBeGreaterThan(0);
    expect(box.right).toBeLessThanOrEqual(page.right);
    expect(box.bottom).toBeLessThanOrEqual(page.bottom);
    // it is the link that takes a click where it stands
    const at = centreOf(attribution);
    expect(attribution.contains(document.elementFromPoint(at.x, at.y))).toBe(true);
  });

  it("opens the board's shortcuts from the shell's menu", async () => {
    const { root } = await mount({ text: NOTES });
    await realClick(centreOf(one(root, '[data-chrome="menu"]')));
    await vi.waitFor(() => one(root, '[data-menu-id="keyboard-shortcuts"]'), WAIT);
    await realClick(centreOf(one(root, '[data-menu-id="keyboard-shortcuts"]')));
    const dialog = await vi.waitFor(() => one(root, "dialog[open]"), WAIT);
    const rows = [...dialog.querySelectorAll("tr")].map((row) => row.textContent);
    // the shell's own keys, then the board's
    expect(rows).toContain("Zoom inCtrl+Plus");
    expect(rows).toContain("Fit to viewShift+1");
    expect(rows).toContain("Delete the selectionDelBackspace");
    expect(rows).toContain("Edit a note or a modelDouble-click");
    // an IDE binds the file keys itself: the dialog of its board lists none
    expect(rows.filter((row) => row?.includes("Ctrl+O") || row?.includes("Ctrl+S"))).toEqual([]);
    await press("Escape");
    await expect.poll(() => root.querySelector("dialog[open]"), WAIT).toBeNull();
  });

  it("lists the file keys in a group of their own where the host binds them, as a web app does", async () => {
    const { root } = await mount({ text: NOTES, fileKeys: true });
    await realClick(centreOf(one(root, '[data-chrome="menu"]')));
    await vi.waitFor(() => one(root, '[data-menu-id="keyboard-shortcuts"]'), WAIT);
    await realClick(centreOf(one(root, '[data-menu-id="keyboard-shortcuts"]')));
    const dialog = await vi.waitFor(() => one(root, "dialog[open]"), WAIT);
    const groups = [...dialog.querySelectorAll(".cd-shell-shortcuts-group")].map((group) => ({
      title: one(group, "h3").textContent,
      rows: [...group.querySelectorAll("tr")].map((row) => row.textContent),
    }));

    // the shell's own View group leads every dialog; the file keys stand before the board's
    expect(groups.map((group) => group.title)).toEqual(["View", "File", "Edit"]);
    expect(groups[1]?.rows).toEqual(["Open…Ctrl+O", "Export as .boardCtrl+S"]);
    expect(groups[2]?.rows).toContain("Delete the selectionDelBackspace");
    await press("Escape");
    await expect.poll(() => root.querySelector("dialog[open]"), WAIT).toBeNull();
  });
});

describe("under a web app's host", () => {
  /** The editor on the three members a web app brings, in a root of the size the test gives it. */
  async function mountWeb(
    options: { startScreen?: boolean | undefined; box?: string | undefined } = {},
  ): Promise<{ editor: BoardEditor; root: HTMLElement; open(text: string): Promise<void> }> {
    const root = document.createElement("div");
    root.id = "app";
    if (options.box !== undefined) root.style.cssText = options.box;
    document.body.append(root);
    const web = testWebHost({ startScreen: options.startScreen });
    const editor = await mountBoardEditor(web.host, {
      root,
      editors: [],
      containHistoryKeys: false,
    });
    // unmount() ends it with every other test's editor
    mounted = { editor, host: testHost(), root, files: undefined, modelers: [] };
    return {
      editor,
      root,
      async open(text) {
        await web.document.open(text);
        await editor.ready;
        await drawn(editor, root);
      },
    };
  }

  it("mounts the board in the shell's web column, the toolbar clear of the menu as in an IDE", async () => {
    const { root, editor, open } = await mountWeb();
    await open(NOTES);

    expect(root.dataset.cdShellHost).toBe("web");
    expect(one(root, '[data-chrome="legal"]').checkVisibility()).toBe(true);
    const [trigger, toolbar] = [one(root, '[data-chrome="menu"]'), one(root, ".board-toolbar")];
    expect(overlap(trigger, toolbar)).toBe(0);
    expect(toolbar.getBoundingClientRect().left).toBe(64);
    expect(getComputedStyle(toolbar).visibility).toBe("visible");
    // the canvas keeps its own history, since a page has no other
    await realClick(centreOf(toolbarButton(root, "Group")));
    await expect.poll(() => nodeIds(editor).length, WAIT).toBe(3);
    await realClick(panePoint(root));
    await press("Control+z");
    await expect.poll(() => nodeIds(editor).length, WAIT).toBe(2);
  });

  it("hides the toolbar behind the start screen, its room kept, and keeps the slot inert there", async () => {
    const { root, editor, open } = await mountWeb({ startScreen: true });
    const slot = editor.shell.canvas;
    expect(slot.inert).toBe(true);

    // the first text is accepted behind the card: the slot stays the shell's to open
    await open(NOTES);
    expect(editor.shell.isEmptyStateShown()).toBe(true);
    expect(slot.inert).toBe(true);
    const toolbar = one(root, ".board-toolbar");
    const shown = toolbar.getBoundingClientRect();
    expect(getComputedStyle(toolbar).visibility).toBe("hidden");
    expect(getComputedStyle(one(root, '[data-chrome="menu"]')).visibility).toBe("hidden");
    // React Flow's attribution is no work chrome: it stays
    expect(getComputedStyle(one(root, ".react-flow__attribution")).visibility).toBe("visible");
    // The word a part of the board shows while it loads would stand in the glass card. A part
    // loads for a moment only, so the board's own element for it is put there by hand.
    const loading = document.createElement("div");
    loading.className = "board-slot";
    loading.textContent = "Toolbar";
    one(root, ".board-root").append(loading);
    expect(getComputedStyle(loading).visibility).toBe("hidden");

    editor.shell.setEmptyState(false);

    expect(slot.inert).toBe(false);
    expect(getComputedStyle(toolbar).visibility).toBe("visible");
    expect(getComputedStyle(loading).visibility).toBe("visible");
    loading.remove();
    const after = toolbar.getBoundingClientRect();
    expect([after.left, after.top, after.width, after.height]).toEqual([
      shown.left,
      shown.top,
      shown.width,
      shown.height,
    ]);
  });

  it("keeps the attribution above the zoom panel where a narrow page raises it over the legal line", async () => {
    const { root, open } = await mountWeb({
      box: "position:fixed;left:0;top:0;width:480px;height:640px",
    });
    await open(NOTES);
    await expect.poll(() => root.dataset.zoomRow, WAIT).toBe("raised");
    const attribution = one(root, ".react-flow__attribution");
    const panel = one(root, '[data-chrome="zoom"]');
    const legal = one(root, '[data-chrome="legal"]');

    expect(overlap(attribution, panel)).toBe(0);
    expect(overlap(attribution, legal)).toBe(0);
    expect(overlap(panel, legal)).toBe(0);
    const [box, zoom, page] = [
      attribution.getBoundingClientRect(),
      panel.getBoundingClientRect(),
      root.getBoundingClientRect(),
    ];
    // above the raised panel by the shell's gap, at the shell's margin from the edge
    expect(zoom.top - box.bottom).toBe(8);
    expect(page.right - box.right).toBe(12);
    const at = centreOf(attribution);
    expect(attribution.contains(document.elementFromPoint(at.x, at.y))).toBe(true);
  });

  it("stands the attribution above a zoom panel that is not raised, as in an IDE", async () => {
    const { root, open } = await mountWeb();
    await open(NOTES);
    expect(root.dataset.zoomRow).toBeUndefined();
    const [box, zoom] = [
      one(root, ".react-flow__attribution").getBoundingClientRect(),
      one(root, '[data-chrome="zoom"]').getBoundingClientRect(),
    ];

    expect(zoom.top - box.bottom).toBe(8);
  });
});

describe("the first view", () => {
  it("is the shell's fit: the insets are the only margin", async () => {
    const { editor, root } = await mount({ text: NOTES });
    await expectView(editor, fittedNotes(editor));
    // 1232 px are free between the side insets of 24 px, and the notes fill them
    expect(viewNow(editor).zoom).toBeCloseTo(1232 / 1720, 9);
    const near = one(root, '.react-flow__node[data-id="n_near"]').getBoundingClientRect();
    const far = one(root, '.react-flow__node[data-id="n_far"]').getBoundingClientRect();
    expect(near.left).toBeCloseTo(24, 3);
    expect(far.right).toBeCloseTo(1280 - 24, 3);
    await expect.poll(() => readout(root), WAIT).toBe("72%");
  });

  it("is capped at 100 % for a board that would fit larger", async () => {
    const small = encodeBoard({
      meta: { title: "Small", version: 1 },
      elements: { n_only: note("One note.", 0, "a") },
    });
    const { editor, root } = await mount({ text: small });
    await expect.poll(() => viewNow(editor).zoom, WAIT).toBe(1);
    const only = one(root, '.react-flow__node[data-id="n_only"]').getBoundingClientRect();
    // in the middle of what the insets leave free: 24 to 1256 px across, 88 to 736 px down
    expect(only.left + only.width / 2).toBeCloseTo(640, 3);
    expect(only.top + only.height / 2).toBeCloseTo(412, 3);
  });

  it("is made once the root is shown, for an editor mounted into a hidden root", async () => {
    const { editor, root, host } = await mount({ text: NOTES, hidden: true });
    expect(editor.shell.canvas.clientWidth).toBe(0);
    await settle();
    expect(viewNow(editor)).toEqual({ x: 0, y: 0, zoom: 1 });

    root.style.display = "";
    await drawn(editor, root);
    await expectView(editor, fittedNotes(editor));
    await expect.poll(() => readout(root), WAIT).toBe("72%");
    expect(host.document.edits).toEqual([]);
  });

  it("is never made again: an update leaves the view the person has", async () => {
    const { editor, root, host } = await mount({ text: NOTES });
    await expectView(editor, fittedNotes(editor));
    await realClick(centreOf(one(root, '[data-zoom="in"]')));
    await expect.poll(() => readout(root), WAIT).toBe("100%");
    const theirs = viewNow(editor);

    await host.document.change(THREE_NOTES);
    await drawn(editor, root);
    await settle();
    expect(nodeIds(editor).sort()).toEqual(["n_far", "n_near", "n_third"]);
    expect(viewNow(editor)).toEqual(theirs);
  });
});

describe("the shell's zoom on the board", () => {
  it("follows a real wheel on the pane with its readout", async () => {
    const { editor, root, host } = await mount({ text: NOTES });
    await expect.poll(() => readout(root), WAIT).toBe("72%");
    const before = viewNow(editor).zoom;

    await commands.realInput([
      { type: "move", ...panePoint(root) },
      { type: "wheel", dy: -300 },
    ]);
    await expect.poll(() => viewNow(editor).zoom, WAIT).toBeGreaterThan(before);
    await expect.poll(() => readout(root), WAIT).toBe(asPercent(viewNow(editor).zoom));
    expect(readout(root)).not.toBe("72%");
    expect(host.document.edits).toEqual([]);
  });

  it("moves the board by the panel's four buttons, and hands the focus to the pane", async () => {
    const { editor, root, host } = await mount({ text: NOTES });
    const fitted = fittedNotes(editor);
    await expectView(editor, fitted);
    const click = (zoom: string): Promise<void> =>
      realClick(centreOf(one(root, `[data-zoom="${zoom}"]`)));
    const middle = (): number => (640 - viewNow(editor).x) / viewNow(editor).zoom;
    const middleAtFit = middle();

    await click("actual");
    await expect.poll(() => viewNow(editor).zoom, WAIT).toBe(1);
    await expect.poll(() => readout(root), WAIT).toBe("100%");
    // around the middle of the box: what was there is there
    expect(middle()).toBeCloseTo(middleAtFit, 6);
    expect(document.activeElement).toBe(one(root, ".react-flow__pane"));

    await click("out");
    await expect.poll(() => readout(root), WAIT).toBe("74%");
    await click("in");
    await expect.poll(() => readout(root), WAIT).toBe("100%");
    await click("in");
    await expect.poll(() => readout(root), WAIT).toBe("135%");
    expect(middle()).toBeCloseTo(middleAtFit, 6);

    await click("fit");
    await expectView(editor, fitted);
    await expect.poll(() => readout(root), WAIT).toBe("72%");
    expect(host.document.edits).toEqual([]);
  });

  it(
    "moves the board by Control+Equal, Control+Minus, Control+Digit0 and Shift+Digit1",
    async () => {
      const { editor, root, host } = await mount({ text: NOTES });
      const fitted = fittedNotes(editor);
      await expectView(editor, fitted);
      await realClick(panePoint(root));
      await expect.poll(() => document.activeElement, WAIT).toBe(one(root, ".react-flow__pane"));

      await press("Control+Digit0");
      await expect.poll(() => readout(root), WAIT).toBe("100%");
      expect(viewNow(editor).zoom).toBe(1);
      await press("Control+Equal");
      await expect.poll(() => readout(root), WAIT).toBe("135%");
      await press("Control+Minus");
      await expect.poll(() => readout(root), WAIT).toBe("100%");
      await press("Control+Minus");
      await expect.poll(() => readout(root), WAIT).toBe("74%");
      await press("Shift+Digit1");
      await expectView(editor, fitted);
      await expect.poll(() => readout(root), WAIT).toBe("72%");
      expect(host.document.edits).toEqual([]);
    },
    FLOW_MS,
  );

  it("offers the host its fit as the command fitView", async () => {
    const { editor, root, host } = await mount({ text: NOTES });
    const fitted = fittedNotes(editor);
    await realClick(centreOf(one(root, '[data-zoom="in"]')));
    await expect.poll(() => readout(root), WAIT).toBe("100%");
    host.document.commands().fitView?.();
    await expectView(editor, fitted);
  });

  it("holds its zoom where the board holds it", async () => {
    const { editor } = await mount({ text: NOTES });
    editor.modeler.setViewState({ x: 0, y: 0, zoom: 0.01 });
    expect(viewNow(editor).zoom).toBe(BOARD_MIN_ZOOM);
  });
});

describe("the document", () => {
  it("gets one edit of one added line for a click on Group", async () => {
    const { root, host } = await mount({ text: NOTES });
    await realClick(centreOf(toolbarButton(root, "Group")));
    await expect.poll(() => host.document.edits.length, WAIT).toBe(1);
    await settle();
    expect(host.document.edits).toHaveLength(1);
    const [edit] = host.document.edits;
    const lines = (text: string | undefined): string[] => (text ?? "").split("\n");
    expect(lines(edit)).toHaveLength(lines(NOTES).length + 1);
    // every line of the document is still there: the edit is the new one
    expect(lines(NOTES).filter((line) => !lines(edit).includes(line))).toEqual([]);
  });

  it(
    "keeps Control+Z for the host: it reaches the window unprevented and the board undoes nothing",
    async () => {
      const { editor, root, host } = await mount({ text: NOTES });
      await realClick(centreOf(toolbarButton(root, "Group")));
      await expect.poll(() => nodeIds(editor).length, WAIT).toBe(3);
      await expect.poll(() => host.document.edits.length, WAIT).toBe(1);

      const keys = keysAtWindow();
      try {
        await press("Control+z");
        await expect
          .poll(() => keys.up, WAIT)
          .toEqual([{ key: "z", control: true, prevented: false }]);
        // also with the focus on the pane, where a board that owns its history takes the key
        await realClick(panePoint(root));
        await expect.poll(() => document.activeElement, WAIT).toBe(one(root, ".react-flow__pane"));
        await press("Control+z");
        await expect.poll(() => keys.up.length, WAIT).toBe(2);
        expect(keys.up[1]).toEqual({ key: "z", control: true, prevented: false });
      } finally {
        keys.stop();
      }
      await settle();
      expect(nodeIds(editor)).toHaveLength(3);
      expect(host.document.edits).toHaveLength(1);
    },
    FLOW_MS,
  );

  it("lets a host without a history of its own undo on the board", async () => {
    const { editor, root, host } = await mount({ text: NOTES, canvasOwnsHistory: true });
    await realClick(centreOf(toolbarButton(root, "Group")));
    await expect.poll(() => nodeIds(editor).length, WAIT).toBe(3);
    await realClick(panePoint(root));
    await expect.poll(() => document.activeElement, WAIT).toBe(one(root, ".react-flow__pane"));
    await press("Control+z");
    await expect.poll(() => nodeIds(editor).length, WAIT).toBe(2);
    await expect.poll(() => host.document.edits.at(-1), WAIT).toBe(NOTES);
  });

  it("does not import a text the board shows already", async () => {
    const { editor, host } = await mount({ text: NOTES });
    const imports = vi.spyOn(editor.modeler, "importText");
    await host.document.change(NOTES);
    expect(imports).not.toHaveBeenCalled();
    await host.document.change(THREE_NOTES);
    expect(imports).toHaveBeenCalledTimes(1);
    expect(nodeIds(editor)).toHaveLength(3);
  });

  it("shows the empty-file hint on an empty board, until something is on it", async () => {
    const { editor, root, host } = await mount({ text: "" });
    const hint = one(root, ".cd-shell-hint");
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toBe("Add a note, a group or a model from the toolbar to start.");
    expect(viewNow(editor)).toEqual({ x: 0, y: 0, zoom: 1 });
    // an empty file stays as it is until the person changes the board
    expect(host.document.edits).toEqual([]);

    await realClick(centreOf(toolbarButton(root, "Group")));
    await expect.poll(() => hint.hidden, WAIT).toBe(true);
    await expect.poll(() => host.document.edits.length, WAIT).toBe(1);

    await host.document.change("");
    await expect.poll(() => hint.hidden, WAIT).toBe(false);
  });
});

describe("a text the board refuses", () => {
  const BROKEN = `${NOTES}{"id":"n_broken" "kind"}\n`;
  const BROKEN_LINE = NOTES.split("\n").length;

  it(
    "locks the board and names the line, and the next valid text unlocks it",
    async () => {
      const { editor, root, host } = await mount({ text: NOTES });
      const slot = editor.shell.canvas;
      const status = statusBox(root);
      const group = centreOf(toolbarButton(root, "Group"));
      expect([slot.inert, status.hidden, editor.shell.isReadOnly()]).toEqual([false, true, false]);

      await host.document.change(BROKEN);
      // locked at once
      expect([slot.inert, editor.shell.isReadOnly()]).toEqual([true, true]);
      // the board keeps the last valid version
      expect(nodeIds(editor).sort()).toEqual(["n_far", "n_near"]);
      // the status box and the shell's mark follow after the shell's delay
      await expect.poll(() => status.hidden, WAIT).toBe(false);
      expect(status.textContent).toBe(
        "This file isn't a valid board right now. The board shows the last valid version and " +
          `is read-only until you fix the text. Line ${BROKEN_LINE} is no JSON.`,
      );
      expect(status.getAttribute("role")).toBe("alert");
      await expect.poll(() => root.hasAttribute("data-readonly"), WAIT).toBe(true);

      // a real click where the Group button stands reaches nothing of the board
      await realClick(group);
      await settle();
      expect(nodeIds(editor)).toHaveLength(2);
      // and a change the board makes all the same is not written over the text being repaired
      addNode(
        editor.modeler.board.store,
        { type: "text", width: 280, height: 160, text: "Unseen." },
        { x: 0, y: 400 },
      );
      expect(nodeIds(editor)).toHaveLength(3);
      await settle();
      expect(host.document.edits).toEqual([]);
      // the shell's zoom still works on a locked board
      await realClick(centreOf(one(root, '[data-zoom="in"]')));
      await expect.poll(() => readout(root), WAIT).toBe("100%");

      await host.document.change(THREE_NOTES);
      expect([slot.inert, status.hidden, editor.shell.isReadOnly()]).toEqual([false, true, false]);
      expect(root.hasAttribute("data-readonly")).toBe(false);
      await drawn(editor, root);
      expect(nodeIds(editor).sort()).toEqual(["n_far", "n_near", "n_third"]);

      await realClick(centreOf(toolbarButton(root, "Group")));
      await expect.poll(() => host.document.edits.length, WAIT).toBe(1);
      expect(nodeIds(editor)).toHaveLength(4);
    },
    FLOW_MS,
  );

  it("locks from the start for a first text that is refused, and fits the first one it accepts", async () => {
    const { editor, root, host } = await mount();
    await host.document.open("no board at all\n");
    await editor.ready;
    expect(editor.shell.canvas.inert).toBe(true);
    await expect.poll(() => statusBox(root).hidden, WAIT).toBe(false);
    expect(statusBox(root).textContent).toContain("Line 1 is no JSON.");
    // no hint on a board whose file is not empty but unreadable
    expect(one(root, ".cd-shell-hint").hidden).toBe(true);

    await host.document.change(NOTES);
    expect(editor.shell.canvas.inert).toBe(false);
    await drawn(editor, root);
    await expectView(editor, fittedNotes(editor));
    expect(host.document.edits).toEqual([]);
  });

  it("keeps a document the host opened read only locked, whatever its text", async () => {
    const { editor, root, host } = await mount({ text: NOTES, readOnly: true });
    expect([editor.shell.canvas.inert, editor.shell.isReadOnly()]).toEqual([true, true]);
    expect(statusBox(root).hidden).toBe(true);
    await host.document.change(THREE_NOTES);
    expect([editor.shell.canvas.inert, editor.shell.isReadOnly()]).toEqual([true, true]);
    expect(nodeIds(editor)).toHaveLength(3);
  });
});

describe("a model of the repository under the shell", () => {
  interface Shape {
    readonly id: string;
    readonly x: number;
    readonly y: number;
  }

  /** The shapes of an armed editor whose middle a pointer reaches: under no chrome of anybody. */
  function reachableShapes(engine: HTMLElement): Shape[] {
    const svg = engine.querySelector(".djs-container > svg");
    return [...engine.querySelectorAll<SVGGElement>(".djs-element.djs-shape")].flatMap((shape) => {
      const id = shape.getAttribute("data-element-id");
      const hit = (shape.querySelector(".djs-hit") ?? shape).getBoundingClientRect();
      const x = hit.left + hit.width / 2;
      const y = hit.top + hit.height / 2;
      if (id === null || hit.width < 8 || hit.height < 8) return [];
      const top = document.elementFromPoint(x, y);
      return top && svg?.contains(top) && shape.contains(top) ? [{ id, x, y }] : [];
    });
  }

  async function mountWithModel(
    options: MountOptions = {},
  ): Promise<Mounted & { engine: HTMLElement }> {
    const all = await mount({ ...options, text: WITH_MODEL, files: { [TEA_PATH]: TEA } });
    const engine = await vi.waitFor(
      () => {
        const found = all.root.querySelector<HTMLElement>(".board-engine");
        if (found?.dataset.embedState !== "ready") {
          throw new Error(`the model is not ready: ${found?.dataset.embedState ?? "no editor"}`);
        }
        return found;
      },
      { timeout: LOAD_MS, interval: 25 },
    );
    return { ...all, engine };
  }

  async function arm(root: HTMLElement, engine: HTMLElement): Promise<void> {
    const preview = engine.getBoundingClientRect();
    await commands.realInput([
      {
        type: "dblclick",
        x: preview.left + preview.width / 2,
        y: preview.top + preview.height * 0.85,
      },
    ]);
    await expect.poll(() => doneId(root), WAIT).toBe("n_model");
    await expect
      .poll(() => engine.parentElement?.classList.contains("board-overlay-layer"), WAIT)
      .toBe(true);
  }

  it(
    "is armed by a real double-click, takes a real click, and Done releases it with nothing selected",
    async () => {
      const { editor, root, host, files, modelers, engine } = await mountWithModel();
      expect(modelers).toHaveLength(1);
      const selection = (): readonly string[] => modelers[0]?.elements?.selection() ?? [];
      expect(engine.dataset.notation).toBe("wardley");
      expect(engine.dataset.armed).toBe("false");

      await arm(root, engine);
      expect(viewNow(editor).zoom).toBe(1);
      expect(engine.dataset.armed).toBe("true");
      await expect
        .poll(() => document.activeElement, WAIT)
        .toBe(engine.querySelector(".djs-container > svg"));
      expect(selection()).toEqual([]);

      // A popup the armed editor fixes to the window stands where it asks: the shell's root
      // fills the page from its corner, so nothing above the slot moves or cuts it.
      const popup = document.createElement("div");
      popup.style.cssText =
        "position:fixed;left:300px;top:200px;width:40px;height:20px;z-index:2147483647";
      engine.append(popup);
      try {
        const box = popup.getBoundingClientRect();
        expect([box.left, box.top]).toEqual([300, 200]);
        // As built: the shell's islands lie over the whole slot, so over such a popup too,
        // whatever z-index it has.
        const panel = one(root, '[data-chrome="zoom"]');
        const at = centreOf(panel);
        popup.style.left = `${at.x - 20}px`;
        popup.style.top = `${at.y - 10}px`;
        expect(panel.contains(document.elementFromPoint(at.x, at.y))).toBe(true);
      } finally {
        popup.remove();
      }

      const [shape] = reachableShapes(engine);
      if (!shape) throw new Error("no shape of the armed editor is clear of the chrome");
      await realClick(shape);
      await expect.poll(selection, WAIT).toEqual([shape.id]);

      // the undo key of the armed editor stays with it: the host's document would undo the board
      const keys = keysAtWindow();
      try {
        await press("Control+z");
        await expect.poll(() => keys.down.map((seen) => seen.key), WAIT).toEqual(["z"]);
        await settle();
        expect(keys.up).toEqual([]);
      } finally {
        keys.stop();
      }

      await realClick(centreOf(one(root, "[data-board-done]")));
      await expect.poll(() => doneId(root), WAIT).toBe("");
      await expect
        .poll(() => engine.parentElement?.classList.contains("board-overlay-layer"), WAIT)
        .toBe(false);
      await settle();
      expect(selection()).toEqual([]);
      expect(engine.querySelectorAll(".djs-element.selected")).toHaveLength(0);
      expect(engine.dataset.armed).toBe("false");
      // neither the board's document nor the model's file was written
      expect(host.document.edits).toEqual([]);
      expect(files?.backend.writes).toEqual([]);
      expect(editor.modeler.exportText()).toBe(WITH_MODEL);
    },
    FLOW_MS,
  );

  it(
    "lets the armed editor's undo key go on to the window for a host that asks for no containment",
    async () => {
      const { root, engine } = await mountWithModel({ containHistoryKeys: false });
      await arm(root, engine);
      await expect
        .poll(() => document.activeElement, WAIT)
        .toBe(engine.querySelector(".djs-container > svg"));
      const keys = keysAtWindow();
      try {
        await press("Control+z");
        await expect.poll(() => keys.up.map((seen) => seen.key), WAIT).toEqual(["z"]);
      } finally {
        keys.stop();
      }
    },
    FLOW_MS,
  );

  it(
    "ends an editing by a step of the shell's zoom, as a zoom of the board does",
    async () => {
      const { editor, root, host, engine } = await mountWithModel();
      await arm(root, engine);
      await realClick(centreOf(one(root, '[data-zoom="out"]')));
      await expect.poll(() => doneId(root), WAIT).toBe("");
      await expect.poll(() => readout(root), WAIT).toBe("74%");
      expect(viewNow(editor).zoom).toBeCloseTo(0.7411, 3);
      expect(engine.dataset.armed).toBe("false");
      expect(host.document.edits).toEqual([]);
    },
    FLOW_MS,
  );

  it(
    "goes in the board's order: the editors first, then the host of the files, then the files",
    async () => {
      const { root, files, host, engine } = await mountWithModel();
      await arm(root, engine);
      if (!files) throw new Error("the test has no files");
      expect(files.log).toEqual([]);

      await unmount();
      expect(files.log).toEqual([`text.close ${TEA_PATH}`, "bytes.off", "dispose"]);
      expect(host.document.disconnected()).toBe(true);
      expect(document.querySelector(".board-engine")).toBeNull();
    },
    FLOW_MS,
  );
});

describe("a model its editor refuses", () => {
  const VALUE_CHAIN = editorOf("value-chain");
  const CHAIN_PATH = "models/porter.vc.json";
  const WITH_CHAIN = encodeBoard({
    meta: { title: "A refused model", version: 1 },
    elements: {
      n_chain: {
        kind: "node",
        type: "model",
        file: CHAIN_PATH,
        x: 0,
        y: 0,
        width: 800,
        height: 540,
        z: "a",
      },
    },
  });

  /** The line in the node of a value chain that is no JSON, under a host that says `invalidText`. */
  async function refusedLine(invalidText: string | undefined): Promise<string | null> {
    const root = document.createElement("div");
    root.id = "app";
    document.body.append(root);
    const host = testHost();
    const files = testFiles({ [CHAIN_PATH]: "{ this is no value chain" }, [VALUE_CHAIN]);
    const editor = await mountBoardEditor(host.host, {
      root,
      files: files.files,
      editors: [VALUE_CHAIN],
      containHistoryKeys: true,
      invalidText,
    });
    mounted = { editor, host, root, files, modelers: [] };
    await host.document.open(WITH_CHAIN);
    const line = await vi.waitFor(
      () => one(root, '.board-engine[data-embed-state="invalid"] > .board-host-state'),
      { timeout: LOAD_MS, interval: 50 },
    );
    return line.textContent;
  }

  it(
    "says the host package's line where the host gives none: the file has an editor of its own",
    async () => {
      expect(await refusedLine(undefined)).toBe(INVALID_TEXT);
      expect(INVALID_TEXT).toContain("Open it in its own editor");
    },
    LOAD_MS + FLOW_MS,
  );

  it(
    "says the host's own line where it gives one: a page without an editor for the file",
    async () => {
      const line = "This file cannot be shown as it is. Reset the page.";

      expect(await refusedLine(line)).toBe(line);
    },
    LOAD_MS + FLOW_MS,
  );
});

describe("the mount", () => {
  const plain = { editors: [], containHistoryKeys: true };

  it("takes the element with the id app where it is given no root", async () => {
    const root = document.createElement("div");
    root.id = "app";
    document.body.append(root);
    const host = testHost();
    const editor = await mountBoardEditor(host.host, plain);
    try {
      expect(editor.shell.root).toBe(root);
      // the handle's document is the host's: it says when a text that came is on the canvas
      const opened = host.document.open(NOTES);
      expect(nodeIds(editor)).toEqual([]);
      await editor.document.imported();
      expect(nodeIds(editor).sort()).toEqual(["n_far", "n_near"]);
      await opened;
    } finally {
      await editor.destroy();
      root.remove();
    }
  });

  it("is refused in a page without a root, before anything is mounted", async () => {
    expect(document.getElementById("app")).toBeNull();
    await expect(mountBoardEditor(testHost().host, plain)).rejects.toThrow(
      "board-ide-editor: the editor HTML has no #app root",
    );
    await expect(mountBoardEditor(testHost().host, { ...plain, root: null })).rejects.toThrow(
      "no #app root",
    );
    expect(document.documentElement.className).toBe(htmlClassAtStart);
  });

  it("takes down what it mounted when the host cannot connect the document", async () => {
    const root = document.createElement("div");
    root.id = "app";
    document.body.append(root);
    try {
      const host = testHost({ connectFails: "no document here" });
      await expect(mountBoardEditor(host.host, { ...plain, root })).rejects.toThrow(
        "no document here",
      );
      expect(root.childElementCount).toBe(0);
      expect([...root.attributes].map((attribute) => attribute.name)).toEqual(["id"]);
      expect(document.documentElement.className).toBe(htmlClassAtStart);
    } finally {
      root.remove();
    }
  });
});

describe("the teardown", () => {
  it("leaves no class on html and no child in the root", async () => {
    const { editor, root, host } = await mount({ text: NOTES });
    expect(document.documentElement.classList.contains("cd-shell-document")).toBe(true);
    expect(root.classList.contains("cd-shell")).toBe(true);
    expect(root.childElementCount).toBeGreaterThan(0);

    const ended = editor.destroy();
    // a second call is the same teardown
    expect(editor.destroy()).toBe(ended);
    await ended;
    expect(document.documentElement.className).toBe(htmlClassAtStart);
    expect(root.childElementCount).toBe(0);
    expect([...root.attributes].map((attribute) => attribute.name)).toEqual(["id"]);
    expect(host.document.disconnected()).toBe(true);
  });

  it("looks at the view once per frame while it is mounted, and asks for no frame afterwards", async () => {
    const { editor } = await mount({ text: NOTES });
    // the frames of this test are asked for past the spy, so that it counts everybody else's
    const ownFrame = window.requestAnimationFrame.bind(window);
    const frames = async (count: number): Promise<void> => {
      for (let index = 0; index < count; index++) {
        await new Promise<void>((resolve) => ownFrame(() => resolve()));
      }
    };
    const looks = vi.spyOn(editor.modeler, "getViewState");
    const requests = vi.spyOn(window, "requestAnimationFrame");
    try {
      await frames(20);
      // one look per frame, give or take the frames the count began and ended in and one
      // reading of the zoom panel; two looks per frame would be 40
      expect(looks.mock.calls.length).toBeGreaterThanOrEqual(18);
      expect(looks.mock.calls.length).toBeLessThanOrEqual(24);

      await editor.destroy();
      looks.mockClear();
      requests.mockClear();
      await frames(10);
      expect(looks).not.toHaveBeenCalled();
      expect(requests).not.toHaveBeenCalled();
    } finally {
      looks.mockRestore();
      requests.mockRestore();
    }
  });
});
