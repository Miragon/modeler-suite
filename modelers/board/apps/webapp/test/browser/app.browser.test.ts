/**
 * The web app as `main.ts` starts it, on a storage of the test's own: the example repository on
 * the board with the seven modelers of the suite in its model nodes, an edit by real mouse and
 * keyboard, and what the browser keeps of it over a restart. A reload and the reset link are a
 * navigation, which a test page cannot make: the Playwright spec of the e2e workspace has them.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
  type MockInstance,
} from "vitest";
import { commands } from "vitest/browser";
import { encodeBoard, parseBoardText } from "@miragon/board-schema-model";
import { startApp, type App } from "../../src/app.js";
import { EXAMPLE } from "../../src/example.js";
import { createAppStorage, memoryStore, type KeyValueStore } from "../../src/storage.js";

// The first start of a run loads the seven renderers from their sources.
const READY_MS = 90_000;
const STEP_MS = 15_000;
const POLL = { timeout: STEP_MS, interval: 25 };

const TEA = "models/tea.owm";
const WARDLEY_NODE = "n_wardley_map";
const NOTE_TEXT = "Kept over a restart";
const SKETCH = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30"/></svg>`;

let root: HTMLElement;
let app: App | undefined;
// Chromium's line for a ResizeObserver that could not deliver in one frame. It carries no error
// object and Vitest counts nothing for it; the renderer's test README says to leave out exactly
// this message where a test listens.
const RESIZE_OBSERVER = "ResizeObserver loop completed with undelivered notifications.";
const pageErrors: string[] = [];
const onError = (event: ErrorEvent): void => {
  if (event.message !== RESIZE_OBSERVER) pageErrors.push(event.message);
};
const onRejection = (event: PromiseRejectionEvent): void =>
  void pageErrors.push(`unhandled rejection: ${String(event.reason)}`);

function one<Found extends Element>(selector: string, within: ParentNode = root): Found {
  const found = within.querySelector<Found>(selector);
  if (!found) throw new Error(`the page has nothing that matches ${selector}`);
  return found;
}
const all = <Found extends Element>(selector: string): Found[] => [
  ...root.querySelectorAll<Found>(selector),
];
const centreOf = (box: DOMRect): { x: number; y: number } => ({
  x: box.left + box.width / 2,
  y: box.top + box.height / 2,
});
const realClick = (target: Element): Promise<void> =>
  commands.realInput([{ type: "click", ...centreOf(target.getBoundingClientRect()) }]);

/** the box of an element once two looks in a row find it in the same place */
async function boxAtRest(find: () => Element): Promise<DOMRect> {
  let last = "";
  let box = find().getBoundingClientRect();
  await expect
    .poll(() => {
      box = find().getBoundingClientRect();
      const now = [box.left, box.top, box.width, box.height].join();
      const rests = now === last;
      last = now;
      return rests;
    }, POLL)
    .toBe(true);
  return box;
}

const engineStates = (): Array<string | undefined> =>
  all<HTMLElement>(".board-engine").map((engine) => engine.dataset.embedState);
const armedNode = (): string | null | undefined =>
  root.querySelector("[data-board-done]")?.getAttribute("data-board-done");
const note = (): string | null => one(".board-page__kept").textContent;
const warning = (): string | undefined => one<HTMLElement>(".board-page__note").dataset.warning;
const keptIn = (store: KeyValueStore): ReturnType<typeof createAppStorage> =>
  createAppStorage(store, EXAMPLE);

/** the app on a page as index.html has it: #app in the body, the sheet of the page loaded */
async function start(store: KeyValueStore, search = ""): Promise<App> {
  root = document.createElement("div");
  root.id = "app";
  document.body.append(root);
  app = startApp(root, { storage: store, search });
  await app.ready;
  await expect
    .poll(engineStates, { timeout: READY_MS, interval: 50 })
    .toEqual(Array.from({ length: 7 }, () => "ready"));
  return app;
}

function stop(): void {
  app?.destroy();
  app = undefined;
  root.remove();
}

/** a model armed by a real double-click on its preview, and its editor's element in the layer */
async function arm(nodeId: string): Promise<HTMLElement> {
  const body = one(`.react-flow__node[data-id="${nodeId}"] .board-node__body`);
  await commands.realInput([{ type: "dblclick", ...centreOf(await boxAtRest(() => body)) }]);
  await expect.poll(armedNode, POLL).toBe(nodeId);
  const inLayer = ".board-overlay-layer > .board-engine";
  await expect.poll(() => root.querySelector(inLayer) !== null, POLL).toBe(true);
  return one<HTMLElement>(inLayer);
}

function pickPicture(name: string): void {
  const transfer = new DataTransfer();
  transfer.items.add(new File([SKETCH], name, { type: "image/svg+xml" }));
  const input = one<HTMLInputElement>(".board-toolbar input[type='file']");
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** what an editor puts over its canvas (a palette, a pad, a popup) and a preview must not show */
const shownChrome = (engine: Element): string[] =>
  [
    ...engine.querySelectorAll<HTMLElement>(
      ".djs-container > :not(svg):not(.djs-overlay-container)",
    ),
  ]
    .filter((part) => getComputedStyle(part).display !== "none")
    .map((part) => part.className);

const drawnPictures = (): string[] =>
  all<HTMLImageElement>('.board-image[data-missing="false"] img')
    .filter((picture) => picture.naturalWidth > 0)
    .map((picture) => picture.alt)
    .sort();

let consoleError: MockInstance<typeof console.error>;

beforeAll(() => {
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  consoleError = vi.spyOn(console, "error");
});

afterAll(() => {
  window.removeEventListener("error", onError);
  window.removeEventListener("unhandledrejection", onRejection);
  const logged = consoleError.mock.calls
    .map((call) => call.map(String).join(" "))
    .filter((line) => !line.includes(RESIZE_OBSERVER));
  consoleError.mockRestore();
  expect({ pageErrors, logged }).toEqual({ pageErrors: [], logged: [] });
});

describe("the example", () => {
  afterEach(stop);

  test(
    "is shown with seven models drawn by their own editors, the picture, the notes and the group",
    async () => {
      const store = memoryStore();
      const { modeler } = await start(store);

      expect(
        all<HTMLElement>(".board-engine")
          .map((engine) => engine.dataset.notation)
          .sort(),
      ).toEqual([
        "business-model-canvas",
        "c4",
        "context-maps",
        "event-storming",
        "team-topologies",
        "value-chain",
        "wardley",
      ]);
      // each editor has drawn its model: a canvas with elements, not an empty frame
      for (const engine of all(".board-engine")) {
        expect(engine.querySelectorAll("svg .djs-element").length).toBeGreaterThan(1);
        // a preview is the canvas alone: the page loaded the editors' preview rule
        expect(engine.querySelector(".djs-palette")).not.toBeNull();
        expect(shownChrome(engine)).toEqual([]);
      }
      await expect.poll(drawnPictures, POLL).toEqual(["miragon-komet-blau.svg"]);
      expect(all(".board-image img")).toHaveLength(1);
      expect(all(".board-text")).toHaveLength(2);
      expect(all(".board-group")).toHaveLength(1);
      await expect.poll(() => all(".react-flow__edge").length, POLL).toBe(1);

      expect(modeler.exportText()).toBe(EXAMPLE.board);
      // showing the example keeps nothing
      expect(store.length).toBe(0);
      expect(note()).toBe("The example repository is kept in this browser.");
      expect(warning()).toBe("false");
      expect(one("a", one(".board-page__note")).getAttribute("href")).toBe("?reset");
    },
    READY_MS + STEP_MS,
  );

  test(
    "offers the seven models and no other file, and a model added from the picker opens",
    async () => {
      const store = memoryStore();
      const { modeler } = await start(store);
      const picker = one<HTMLSelectElement>(".board-toolbar__models");

      expect(
        [...picker.options].flatMap((option) => (option.disabled ? [] : [option.value])).sort(),
      ).toEqual(
        Object.keys(EXAMPLE.files)
          .filter((path) => path.startsWith("models/"))
          .sort(),
      );

      picker.value = TEA;
      picker.dispatchEvent(new Event("change", { bubbles: true }));

      await expect
        .poll(engineStates, { timeout: READY_MS, interval: 50 })
        .toEqual(Array.from({ length: 8 }, () => "ready"));
      expect(all('.board-engine[data-notation="wardley"]')).toHaveLength(2);
      // a new node is a line of the board, and no file changed
      expect(modeler.exportText().split("\n")).toHaveLength(EXAMPLE.board.split("\n").length + 1);
      expect(keptIn(store).board()).toBe(modeler.exportText());
      expect(keptIn(store).files()).toEqual(EXAMPLE.files);
    },
    READY_MS + STEP_MS,
  );

  test(
    "destroy() leaves the element as it was given and nothing of the board on the page",
    async () => {
      const first = await start(memoryStore());
      const element = root;
      const boardElement = one(".board-page__board");

      first.destroy();
      app = undefined;

      expect([element.id, element.className, element.childElementCount]).toEqual(["app", "", 0]);
      // the board itself went, not only the element it stood in
      await expect.poll(() => boardElement.childElementCount, POLL).toBe(0);
      await expect
        .poll(() => document.querySelector(".board-module, .board-engine, .board-page__note"), POLL)
        .toBeNull();
      // the same element takes the app again
      element.remove();
      await start(memoryStore());
      expect(all(".board-page__note")).toHaveLength(1);
    },
    2 * READY_MS,
  );

  test(
    "stands on a page that gives the board no ancestor a fixed popup would be placed against",
    async () => {
      await start(memoryStore());

      const offenders: string[] = [];
      for (
        let element: Element | null = one(".board-module");
        element !== null;
        element = element.parentElement
      ) {
        const style = getComputedStyle(element);
        const made = [
          style.transform !== "none" && "transform",
          style.filter !== "none" && "filter",
          style.perspective !== "none" && "perspective",
          style.contain !== "none" && "contain",
          style.willChange !== "auto" && "will-change",
        ].filter((name) => name !== false);
        if (made.length > 0)
          offenders.push(`${element.tagName}.${element.className}: ${made.join()}`);
      }
      expect(offenders).toEqual([]);
      // the board fills the window above the page's one line
      const board = one(".board-page__board").getBoundingClientRect();
      const line = one(".board-page__note").getBoundingClientRect();
      expect([board.left, board.top, board.width]).toEqual([0, 0, window.innerWidth]);
      expect(Math.round(board.height + line.height)).toBe(window.innerHeight);
      expect(Math.round(line.bottom)).toBe(window.innerHeight);
    },
    READY_MS,
  );
});

// One story on one store: each test goes on where the one before it ended, so their order is
// kept in a shuffled run too.
describe("what a person changes", { shuffle: false }, () => {
  const store = memoryStore();
  let teaAfterTheEdit = "";
  let boardAfterTheChanges = "";

  afterAll(stop);

  test(
    "a real edit in one model changes that file's text in the storage and not the board text",
    async () => {
      const { modeler } = await start(store);
      const engine = await arm(WARDLEY_NODE);
      expect((modeler.getViewState() as { zoom: number }).zoom).toBe(1);
      expect(shownChrome(engine).some((name) => name.includes("djs-palette"))).toBe(true);

      const water = (): Element => one('.djs-shape[data-element-id="cmp_water"] .djs-hit', engine);
      await commands.realInput([{ type: "click", ...centreOf(await boxAtRest(water)) }]);
      await expect.poll(() => engine.querySelectorAll(".djs-shape.selected").length, POLL).toBe(1);
      await commands.realInput([{ type: "press", key: "Delete" }]);

      await expect.poll(() => keptIn(store).files()[TEA], POLL).not.toBe(EXAMPLE.files[TEA]);
      teaAfterTheEdit = String(keptIn(store).files()[TEA]);
      // the notation's own text rules: the component and its link are gone, every other line of
      // the file stands where it stood
      const left = String(EXAMPLE.files[TEA])
        .split("\n")
        .filter((line) => line !== "component Water [0.38, 0.82]" && line !== "Hot Water -> Water");
      expect(teaAfterTheEdit.split("\n")).toEqual(left);
      expect(engine.querySelector('[data-element-id="cmp_water"]')).toBeNull();

      // the file, and nothing of the board
      expect(store.length).toBe(1);
      expect(keptIn(store).board()).toBe(EXAMPLE.board);
      expect(modeler.exportText()).toBe(EXAMPLE.board);
      expect(note()).toBe("The example repository is kept in this browser.");

      await realClick(one("[data-board-done]"));
      await expect.poll(armedNode, POLL).toBe("");
    },
    READY_MS + 3 * STEP_MS,
  );

  test(
    "a note added by the Text button changes the board text",
    async () => {
      const { modeler } = app ?? (await start(store));
      const teaBefore = keptIn(store).files()[TEA];

      await realClick(one('.board-toolbar button[title="Add a text note"]'));
      await expect.poll(() => all(".board-text").length, POLL).toBe(3);
      await expect.poll(() => document.activeElement?.tagName, POLL).toBe("TEXTAREA");
      await commands.realInput([
        { type: "text", text: NOTE_TEXT },
        { type: "press", key: "Escape" },
      ]);

      await expect.poll(() => keptIn(store).board(), POLL).toContain(`"text":"${NOTE_TEXT}"`);
      boardAfterTheChanges = keptIn(store).board();
      expect(boardAfterTheChanges).toBe(modeler.exportText());
      expect(boardAfterTheChanges.split("\n")).toHaveLength(EXAMPLE.board.split("\n").length + 1);
      // the board, and no model file
      expect(keptIn(store).files()[TEA]).toBe(teaBefore);
    },
    READY_MS,
  );

  test(
    "a picked picture is stored in the repository and kept with its bytes",
    async () => {
      const { modeler } = app ?? (await start(store));

      pickPicture("Site plan.svg");

      await expect.poll(drawnPictures, POLL).toEqual(["miragon-komet-blau.svg", "site-plan.svg"]);
      const kept = keptIn(store).files()["assets/site-plan.svg"];
      expect(typeof kept === "string" ? undefined : kept?.mime).toBe("image/svg+xml");
      expect(new TextDecoder().decode(typeof kept === "string" ? undefined : kept?.bytes)).toBe(
        SKETCH,
      );
      await expect
        .poll(() => keptIn(store).board(), POLL)
        .toContain('"file":"assets/site-plan.svg"');
      boardAfterTheChanges = keptIn(store).board();
      expect(boardAfterTheChanges).toBe(modeler.exportText());
    },
    READY_MS,
  );

  test(
    "a second start on the same storage shows the changes",
    async () => {
      stop();

      const { modeler } = await start(store);

      expect(modeler.exportText()).toBe(boardAfterTheChanges);
      const wardley = one(`.react-flow__node[data-id="${WARDLEY_NODE}"] .board-engine`);
      expect(wardley.querySelector('[data-element-id="cmp_water"]')).toBeNull();
      expect(wardley.querySelector('[data-element-id="cmp_hot_water"]')).not.toBeNull();
      await expect
        .poll(() => all(".board-text__body").map((body) => body.textContent.trim()), POLL)
        .toContain(NOTE_TEXT);
      await expect.poll(drawnPictures, POLL).toEqual(["miragon-komet-blau.svg", "site-plan.svg"]);
      // a start writes nothing: what is kept is what was kept
      expect(keptIn(store).files()[TEA]).toBe(teaAfterTheEdit);
      expect(keptIn(store).board()).toBe(boardAfterTheChanges);
      // the picked picture was kept, so nothing of this board is missing
      expect(note()).toBe("The example repository is kept in this browser.");
      expect(warning()).toBe("false");
    },
    READY_MS + STEP_MS,
  );

  test(
    "the reset brings the example's bytes back",
    async () => {
      stop();

      const { modeler } = await start(store, "?reset");

      expect(store.length).toBe(0);
      expect(modeler.exportText()).toBe(EXAMPLE.board);
      expect(keptIn(store).files()).toEqual(EXAMPLE.files);
      const wardley = one(`.react-flow__node[data-id="${WARDLEY_NODE}"] .board-engine`);
      expect(wardley.querySelector('[data-element-id="cmp_water"]')).not.toBeNull();
      expect(all(".board-text")).toHaveLength(2);
      await expect.poll(drawnPictures, POLL).toEqual(["miragon-komet-blau.svg"]);
      expect(all(".board-image")).toHaveLength(1);
    },
    READY_MS + STEP_MS,
  );
});

describe("a browser that does not keep", () => {
  afterEach(stop);

  test(
    "a storage that refuses: the page says so and the change stays on the board",
    async () => {
      const refusing: KeyValueStore = {
        ...memoryStore(),
        setItem() {
          throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        },
      };
      const { modeler } = await start(refusing);
      expect(warning()).toBe("false");

      await realClick(one('.board-toolbar button[title="Add a text note"]'));

      await expect
        .poll(note, POLL)
        .toBe("This browser did not keep all of your changes: its storage is blocked or full.");
      expect(warning()).toBe("true");
      expect(all(".board-text")).toHaveLength(3);
      expect(modeler.exportText()).not.toBe(EXAMPLE.board);
    },
    READY_MS,
  );

  test(
    "a picture the browser did not keep: the page says so until its node goes",
    async () => {
      // what a reload finds after a picture too large for the storage: its node, and no bytes
      const parsed = parseBoardText(EXAMPLE.board);
      if (!parsed.ok) throw new Error(parsed.reason);
      const lost = { kind: "node", type: "image", file: "assets/lost.png", z: "m" };
      const elements = {
        ...parsed.snapshot.elements,
        n_lost: { ...lost, x: -360, y: 0, width: 240, height: 180 },
      };
      const store = memoryStore();
      keptIn(store).keepBoard(encodeBoard({ ...parsed.snapshot, elements }));

      const { modeler } = await start(store);

      expect(note()).toBe("A picture of this board is missing: this browser did not keep it.");
      expect(warning()).toBe("true");
      const hole = (): Element[] => all('.board-image[data-missing="true"]');
      await expect.poll(() => hole().length, POLL).toBe(1);
      await expect.poll(drawnPictures, POLL).toEqual(["miragon-komet-blau.svg"]);

      // another change of the board leaves the line: the hole is still there
      await realClick(one('.board-toolbar button[title="Add a text note"]'));
      await expect.poll(() => all(".board-text").length, POLL).toBe(3);
      await commands.realInput([{ type: "press", key: "Escape" }]);
      await expect.poll(() => keptIn(store).board(), POLL).toBe(modeler.exportText());
      expect(note()).toBe("A picture of this board is missing: this browser did not keep it.");

      await commands.realInput([
        { type: "click", ...centreOf(await boxAtRest(() => hole()[0] ?? root)) },
      ]);
      await expect
        .poll(() => one<HTMLButtonElement>(".board-toolbar__delete").disabled, POLL)
        .toBe(false);
      await realClick(one(".board-toolbar__delete"));

      await expect.poll(() => hole().length, POLL).toBe(0);
      await expect.poll(note, POLL).toBe("The example repository is kept in this browser.");
      expect(warning()).toBe("false");
      expect(keptIn(store).board()).not.toContain("assets/lost.png");
    },
    READY_MS + 2 * STEP_MS,
  );

  test(
    "a kept picture no node shows any more is forgotten at the start, and its name is free",
    async () => {
      const store = memoryStore();
      const sketch = new TextEncoder().encode(SKETCH);
      keptIn(store).keepBytes("assets/removed.svg", sketch, "image/svg+xml");
      expect(store.length).toBe(1);

      await start(store);

      expect(store.length).toBe(0);
      expect(note()).toBe("The example repository is kept in this browser.");
      expect(warning()).toBe("false");
      // not `removed-2.svg`: the repository has no such file any more
      pickPicture("removed.svg");
      await expect.poll(drawnPictures, POLL).toEqual(["miragon-komet-blau.svg", "removed.svg"]);
      expect(Object.keys(keptIn(store).files()).filter((path) => path.includes("removed"))).toEqual(
        ["assets/removed.svg"],
      );
    },
    READY_MS + STEP_MS,
  );

  test(
    "a kept board that cannot be read: the example is shown and the page says so",
    async () => {
      const store = memoryStore();
      keptIn(store).keepBoard("not a board at all");

      const { modeler } = await start(store);

      expect(modeler.exportText()).toBe(EXAMPLE.board);
      expect(note()).toBe("The board kept in this browser could not be read. This is the example.");
      expect(warning()).toBe("true");
      // the text stays until a gesture on the board takes its place
      expect(keptIn(store).board()).toBe("not a board at all");
      await realClick(one('.board-toolbar button[title="Add a text note"]'));
      await expect.poll(() => keptIn(store).board(), POLL).toBe(modeler.exportText());
      expect(modeler.exportText()).not.toBe(EXAMPLE.board);
    },
    READY_MS,
  );
});
