/**
 * The web app as `main.ts` starts it, on a storage of the test's own: the start screen in the
 * shell's web column, a board that is made new or opened from a file, the example repository
 * with the seven modelers of the suite in its model nodes, an edit by real mouse and keyboard,
 * and what the browser keeps over a restart. A reload, the browser's own file dialog and a
 * download that lands on a disk need a real page: the Playwright spec of the e2e workspace has
 * them.
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
import { CARD_NOTE, NO_SHOW_TEXT, OPEN_LABEL } from "@miragon/board-host";
import { addNode } from "@miragon/board-renderer";
import { encodeBoard, isNodeAttrs, parseBoardText } from "@miragon/board-schema-model";
import { BOARD_VIEW_KEY, fittedView, type BoardView } from "board-ide-editor";
import { startApp, type App } from "../../src/app.js";
import { EXAMPLE } from "../../src/example.js";
import { NO_MODEL, NO_MODELS_TO_ADD, NO_PICTURE } from "../../src/no-repository.js";
import {
  createAppStorage,
  createOpenStorage,
  memoryStore,
  type KeyValueStore,
  type OpenDocument,
} from "../../src/storage.js";

// The first start of a run loads the seven renderers from their sources.
const READY_MS = 90_000;
const STEP_MS = 15_000;
const POLL = { timeout: STEP_MS, interval: 25 };

const TEA = "models/tea.owm";
const WARDLEY_NODE = "n_wardley_map";
const NOTE_TEXT = "Kept over a restart";
const SKETCH = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30"/></svg>`;
// The page's mark is a file of its public folder, which a test page does not serve.
const KOMET = `data:image/svg+xml,${encodeURIComponent(SKETCH)}`;

const KEPT_TOAST =
  "The example repository is kept in this browser. “Reset the example” in the menu starts it over.";
const NOT_KEPT = "This browser did not keep all of your changes: its storage is blocked or full.";
const MISSING = "A picture of this board is missing: this browser did not keep it.";

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
const keptIn = (store: KeyValueStore): ReturnType<typeof createAppStorage> =>
  createAppStorage(store, EXAMPLE);
const openIn = (store: KeyValueStore): OpenDocument | undefined => createOpenStorage(store).read();
/** how many keys of the example's own a store holds: its board, its changed files, its pictures */
const exampleKeys = (store: KeyValueStore): number =>
  Array.from({ length: store.length }, (_, index) => store.key(index) ?? "").filter((key) =>
    key.startsWith("miragon-board-example:"),
  ).length;

/** the line of the shell's status box, null while it shows none */
function status(): string | null {
  const box = one<HTMLElement>('[data-chrome="status"]');
  return box.hidden ? null : one(".cd-shell-status-text", box).textContent;
}
/** the toasts on the page, oldest first, as `status: text` */
const toasts = (): string[] =>
  all<HTMLElement>(".cd-shell-toast:not([data-leaving])").map(
    (toast) => `${toast.dataset.status}: ${one(".cd-shell-toast-text", toast).textContent}`,
  );
const startCard = (): HTMLElement => one<HTMLElement>('[data-chrome="empty-state"]');
const cardButton = (label: string): HTMLButtonElement => {
  const found = [...startCard().querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );
  if (!found) throw new Error(`the start screen has no button “${label}”`);
  return found;
};
const shownAs = (): string => {
  try {
    return app?.shown() ?? "nothing";
  } catch {
    return "nothing";
  }
};
/** the open board's text; none while one document is closed and the next not yet mounted */
const boardText = (): string => {
  try {
    return app?.editor().modeler.exportText() ?? "";
  } catch {
    return "";
  }
};

/**
 * The board's toolbar is a part that loads, and every document has a board of its own: it is
 * there a moment after the board, and a test that reaches for it at once would depend on what
 * ran before it.
 */
const toolbarReady = (): Promise<void> =>
  expect.poll(() => root.querySelector(".board-toolbar") !== null, POLL).toBe(true);

/** the app on a page as index.html has it: #app in the body, the sheets of the page loaded */
async function start(store: KeyValueStore, search = ""): Promise<App> {
  root = document.createElement("div");
  root.id = "app";
  document.body.append(root);
  app = startApp(root, { storage: store, search, komet: KOMET });
  await app.ready;
  await toolbarReady();
  return app;
}

const modelsReady = (count = 7): Promise<void> =>
  expect
    .poll(engineStates, { timeout: READY_MS, interval: 50 })
    .toEqual(Array.from({ length: count }, () => "ready"));

/** the example as a person gets to it: from the start screen on a fresh page, kept open after */
async function startExample(store: KeyValueStore, search = ""): Promise<App> {
  const started = await start(store, search);
  if (started.editor().shell.isEmptyStateShown()) await realClick(cardButton("Show example"));
  await expect.poll(shownAs, POLL).toBe("example");
  await modelsReady();
  await toolbarReady();
  return started;
}

async function stop(): Promise<void> {
  await app?.destroy();
  app = undefined;
  root.remove();
}

/** an entry of the shell's menu, chosen by a real click on the trigger and then on the entry */
async function chooseFromMenu(id: string): Promise<void> {
  await realClick(one('[data-chrome="menu"]'));
  const entry = (): HTMLElement => one<HTMLElement>(`[data-menu-id="${id}"]`);
  await expect.poll(() => root.querySelector(`[data-menu-id="${id}"]`) !== null, POLL).toBe(true);
  await commands.realInput([{ type: "click", ...centreOf(await boxAtRest(entry)) }]);
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

function handIn(input: HTMLInputElement, file: File): void {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
async function pickPicture(name: string): Promise<void> {
  await toolbarReady();
  handIn(
    one<HTMLInputElement>(".board-toolbar input[type='file']"),
    new File([SKETCH], name, { type: "image/svg+xml" }),
  );
}
/** a file of the disk, handed to the page as the browser's file dialog hands one over */
async function openFile(name: string, text: string): Promise<void> {
  handIn(one<HTMLInputElement>('input[data-board-app="open"]', document), new File([text], name));
  // the page reads the file, closes the open board and mounts the next one
  await app?.settled();
  await toolbarReady();
}

/** how many notes the open board's document holds, drawn or not */
function notesOfTheBoard(): number {
  const parsed = parseBoardText(boardText());
  if (!parsed.ok) return 0;
  return Object.values(parsed.snapshot.elements).filter(
    (attrs) => isNodeAttrs(attrs) && attrs.type === "text",
  ).length;
}

async function addNote(text: string): Promise<void> {
  await toolbarReady();
  // a board that was just mounted draws its notes a moment after it has them
  const before = notesOfTheBoard();
  await expect.poll(() => all(".board-text").length, POLL).toBe(before);
  await realClick(one('.board-toolbar button[title="Add a text note"]'));
  await expect.poll(() => all(".board-text").length, POLL).toBe(before + 1);
  await expect.poll(() => document.activeElement?.tagName, POLL).toBe("TEXTAREA");
  await commands.realInput([
    { type: "text", text },
    { type: "press", key: "Escape" },
  ]);
  await expect.poll(boardText, POLL).toContain(`"text":"${text}"`);
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

const node = (type: string, more: Record<string, unknown>): Record<string, unknown> => ({
  kind: "node",
  type,
  y: 0,
  z: "a",
  ...more,
});
/** a board as a repository holds it: a note, a model of the repository and a picture of it */
const TEAM_BOARD = encodeBoard({
  meta: { title: "Team board", version: 1 },
  elements: {
    n_note: node("text", { text: "From a disk", x: 0, width: 240, height: 160 }),
    n_tea: node("model", { file: TEA, x: 320, width: 800, height: 540, z: "b" }),
    n_logo: node("image", { file: "assets/logo.svg", x: 0, y: 240, width: 240, height: 180 }),
  },
});
/** a board of notes alone */
const NOTES_BOARD = encodeBoard({
  meta: { title: "Notes", version: 1 },
  elements: { n_note: node("text", { text: "Only a note", x: 0, width: 240, height: 160 }) },
});

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

describe("the start screen", () => {
  afterEach(stop);

  test(
    "a fresh page shows the card and the legal line alone, over a new board",
    async () => {
      const store = memoryStore();
      const started = await start(store);

      expect(started.shown()).toBe("board");
      expect(started.editor().shell.isEmptyStateShown()).toBe(true);
      expect(startCard().hidden).toBe(false);
      expect(one("h1", startCard()).textContent).toBe("Modeler Board");
      expect(one(".cd-shell-empty-state-text", startCard()).textContent).toBe(
        "Start a new diagram, or explore the example.",
      );
      expect(one<HTMLImageElement>("img", startCard()).getAttribute("src")).toBe(KOMET);
      // exactly two buttons and the link to a file; no drop zone, so no word of dropping one
      expect(
        [...startCard().querySelectorAll("button")].map((button) => button.textContent),
      ).toEqual(["New diagram", "Show example", "Open a file…"]);
      expect(one(".cd-shell-empty-state-hint", startCard()).textContent).not.toContain("drop");
      expect(root.querySelector('[data-chrome="drop-zone"]')).toBeNull();

      // the work chrome is out of sight: the shell's own, and the board's toolbar with it
      for (const chrome of ['[data-chrome="menu"]', '[data-chrome="zoom"]', ".board-toolbar"]) {
        expect([chrome, getComputedStyle(one(chrome)).visibility]).toEqual([chrome, "hidden"]);
      }
      expect(one<HTMLElement>(".cd-shell-canvas").inert).toBe(true);

      const legal = one('[data-chrome="legal"]');
      expect(getComputedStyle(legal).visibility).toBe("visible");
      expect([...legal.querySelectorAll("a")].map((link) => link.textContent)).toEqual([
        `© ${new Date().getFullYear()} Miragon GmbH`,
        "Impressum",
        "Datenschutz",
        "GitHub",
      ]);
      expect([...legal.querySelectorAll("a")].at(-1)?.href).toBe(
        "https://github.com/Miragon/modeler-suite/tree/main/modelers/board",
      );

      // a page nobody touched keeps nothing, and says nothing
      expect(store.length).toBe(0);
      expect(status()).toBeNull();
      expect(toasts()).toEqual([]);
      expect(document.title).toBe("Modeler Board");
    },
    READY_MS,
  );

  test(
    "New diagram leaves the card for the empty board, and a note on it is there at the next start",
    async () => {
      const store = memoryStore();
      const started = await start(store);

      await realClick(cardButton("New diagram"));

      await expect.poll(() => startCard().hidden, POLL).toBe(true);
      expect(started.editor().shell.isEmptyStateShown()).toBe(false);
      expect(getComputedStyle(one(".board-toolbar")).visibility).toBe("visible");
      expect(one<HTMLElement>(".cd-shell-canvas").inert).toBe(false);
      // the card's button went with the card: the board has the keys
      expect(document.activeElement).toBe(one(".react-flow__pane"));
      // the hint names what this board can add: it has no repository to take a model from
      const hint = one<HTMLElement>(".cd-shell-hint");
      await expect.poll(() => hint.hidden, POLL).toBe(false);
      expect(hint.textContent).toBe("Add a note or a group from the toolbar to start.");
      // an empty board is not worth keeping: a reload would show the start screen again
      expect(store.length).toBe(0);
      expect(parseBoardText(boardText())).toEqual({
        ok: true,
        snapshot: { elements: {}, meta: {} },
      });

      await addNote(NOTE_TEXT);

      await expect.poll(() => hint.hidden, POLL).toBe(true);
      expect(openIn(store)).toEqual({ kind: "board", text: boardText() });
      expect(exampleKeys(store)).toBe(0);
      expect(status()).toBeNull();

      await stop();
      const again = await start(store);

      expect(again.editor().shell.isEmptyStateShown()).toBe(false);
      expect(again.shown()).toBe("board");
      await expect
        .poll(() => all(".board-text__body").map((body) => body.textContent.trim()), POLL)
        .toEqual([NOTE_TEXT]);
      expect(document.title).toBe("Modeler Board");
    },
    READY_MS,
  );

  test(
    "a board that is emptied again is not kept: the next start is the start screen",
    async () => {
      const store = memoryStore();
      await start(store);
      await realClick(cardButton("New diagram"));
      await addNote("Soon gone");
      expect(openIn(store)).toEqual({ kind: "board", text: boardText() });

      // the note is still selected from when it was added
      await expect
        .poll(() => one<HTMLButtonElement>(".board-toolbar__delete").disabled, POLL)
        .toBe(false);
      await realClick(one(".board-toolbar__delete"));

      await expect.poll(() => all(".board-text").length, POLL).toBe(0);
      await expect.poll(() => openIn(store), POLL).toBeUndefined();
      expect(store.length).toBe(0);

      await stop();
      const again = await start(store);
      expect(again.editor().shell.isEmptyStateShown()).toBe(true);
    },
    READY_MS,
  );

  test(
    "a kept board that is no board any more: the start screen, and the page says so",
    async () => {
      const store = memoryStore();
      createOpenStorage(store).keep({ kind: "board", name: "lost.board", text: "not a board" });

      const started = await start(store);

      expect(started.editor().shell.isEmptyStateShown()).toBe(true);
      expect(toasts()).toEqual([
        "danger: Couldn't restore the board of your last visit. Start a new board or open a file.",
      ]);
      // the text stays for a rescue by hand until another board is kept
      expect(openIn(store)).toEqual({ kind: "board", name: "lost.board", text: "not a board" });
    },
    READY_MS,
  );
});

describe("a board without a repository", () => {
  afterEach(async () => {
    // the board's notices are one list per page: a refusal of this test is none of the next
    for (const dismiss of all<HTMLElement>('.board-notice button[title="Dismiss"]')) {
      dismiss.click();
    }
    await stop();
  });

  test(
    "a file from the disk is shown, and its model and its picture say where they are",
    async () => {
      const store = memoryStore();
      const started = await start(store);

      await openFile("team.board", TEAM_BOARD);

      await expect.poll(() => started.editor().shell.isEmptyStateShown(), POLL).toBe(false);
      await expect.poll(boardText, POLL).toBe(TEAM_BOARD);
      expect(started.shown()).toBe("board");
      await expect
        .poll(() => all(".board-text__body").map((body) => body.textContent.trim()), POLL)
        .toEqual(["From a disk"]);
      expect(document.title).toBe("team.board · Modeler Board");
      expect(openIn(store)).toEqual({ kind: "board", name: "team.board", text: TEAM_BOARD });

      // the model: the host package's line for a file that could not be opened, then the page's
      // own sentence of why not
      await expect.poll(engineStates, { timeout: READY_MS, interval: 50 }).toEqual(["failed"]);
      expect(one(".board-engine > .board-host-state").textContent).toBe(
        `This file could not be opened. ${NO_MODEL}`,
      );
      expect(NO_MODEL).toBe(
        "This board was opened as a single file. Its models are files of the repository it came from, and this page has only the board.",
      );
      // the picture: the board's own figure for a file that is not there
      await expect.poll(() => all('.board-image[data-missing="true"]').length, POLL).toBe(1);
      expect(toasts()).toEqual([
        "warning: “team.board” was opened as a single file: the models and pictures of its repository are not shown.",
      ]);
      expect(status()).toBeNull();
    },
    READY_MS + STEP_MS,
  );

  test(
    "the board that was opened has the keys: an undo by the keyboard, with no click before it",
    async () => {
      const started = await start(memoryStore());
      await openFile("notes.board", NOTES_BOARD);
      await expect.poll(boardText, POLL).toBe(NOTES_BOARD);
      await expect
        .poll(() => document.activeElement?.className, POLL)
        .toContain("react-flow__pane");

      // a change of the board that is on its history, made without a click that would bring the
      // focus along: the key alone has to find the board
      const { store } = started.editor().modeler.board;
      addNode(store, { type: "group", width: 320, height: 200, text: "Group" }, { x: 400, y: 0 });
      await expect.poll(() => all(".board-group").length, POLL).toBe(1);

      await commands.realInput([{ type: "press", key: "Control+z" }]);

      await expect.poll(() => all(".board-group").length, POLL).toBe(0);
      expect(boardText()).toBe(NOTES_BOARD);
    },
    READY_MS,
  );

  test(
    "the model picker offers nothing, and the page says why when a person goes to it",
    async () => {
      await start(memoryStore());
      await openFile("notes.board", NOTES_BOARD);
      await expect.poll(boardText, POLL).toBe(NOTES_BOARD);
      // a board of notes alone names no file: nothing is said about a repository
      expect(toasts()).toEqual([]);
      const picker = one<HTMLSelectElement>(".board-toolbar__models");
      expect([...picker.options].map((option) => [option.textContent, option.disabled])).toEqual([
        ["Model…", true],
      ]);

      await realClick(picker);

      await expect.poll(toasts, POLL).toEqual([`info: ${NO_MODELS_TO_ADD}`]);
      expect(NO_MODELS_TO_ADD).toBe(
        "This board has no repository behind it, so there is no model to add. Show the example to try models on a board.",
      );
      // the list a browser opens for a select takes the next key: it is closed again
      await commands.realInput([{ type: "press", key: "Escape" }]);

      // the press and the focus it brings are one sentence, not two
      expect(all(".cd-shell-toast")).toHaveLength(1);

      // by the keyboard the focus alone says it
      picker.blur();
      one<HTMLElement>(".cd-shell-toast-close").click();
      await expect.poll(toasts, POLL).toEqual([]);
      picker.focus();
      await expect.poll(toasts, POLL).toEqual([`info: ${NO_MODELS_TO_ADD}`]);
    },
    READY_MS,
  );

  test(
    "a picture is refused in words: the board has no repository to keep it in",
    async () => {
      const store = memoryStore();
      await start(store);
      await openFile("notes.board", NOTES_BOARD);
      await expect.poll(boardText, POLL).toBe(NOTES_BOARD);

      await pickPicture("Site plan.svg");

      await expect
        .poll(
          () => all('.board-notice[data-kind="refused"] span').map((notice) => notice.textContent),
          POLL,
        )
        .toEqual([`Site plan.svg was not added: ${NO_PICTURE}`]);
      // no node, no file, and the board as it was opened
      expect(all(".board-image")).toHaveLength(0);
      expect(boardText()).toBe(NOTES_BOARD);
      expect(exampleKeys(store)).toBe(0);
    },
    READY_MS,
  );

  test(
    "a file that is no board leaves the open board as it is, and the page says what is wrong",
    async () => {
      const store = memoryStore();
      const started = await start(store);
      await openFile("notes.board", NOTES_BOARD);
      await expect.poll(boardText, POLL).toBe(NOTES_BOARD);
      const editor = started.editor();

      await openFile("tea.owm", String(EXAMPLE.files[TEA]));

      expect(toasts()).toEqual([
        "danger: Couldn't read “tea.owm”. Line 1 is no JSON. Check that it is a .board file.",
      ]);
      // the same editor, the same board, the same kept document
      expect(started.editor()).toBe(editor);
      expect(boardText()).toBe(NOTES_BOARD);
      expect(openIn(store)).toEqual({ kind: "board", name: "notes.board", text: NOTES_BOARD });
      expect(document.title).toBe("notes.board · Modeler Board");
    },
    READY_MS,
  );

  test(
    "a board that holds something is offered back when another takes its place",
    async () => {
      const store = memoryStore();
      const started = await start(store);
      await openFile("notes.board", NOTES_BOARD);
      await expect.poll(boardText, POLL).toBe(NOTES_BOARD);
      // a new board in the place of the start screen's empty one is nothing to offer back
      expect(toasts()).toEqual([]);
      await addNote("A second note");
      const changed = boardText();

      await chooseFromMenu("new-diagram");

      await expect.poll(toasts, POLL).toEqual(["info: Board replaced"]);
      expect(all(".board-text")).toHaveLength(0);
      expect(openIn(store)).toBeUndefined();
      expect(document.title).toBe("Modeler Board");

      await realClick(one(".cd-shell-toast-action"));

      await expect.poll(boardText, POLL).toBe(changed);
      await started.settled();
      await expect.poll(() => all(".board-text").length, POLL).toBe(2);
      expect(openIn(store)).toEqual({ kind: "board", name: "notes.board", text: changed });
      expect(document.title).toBe("notes.board · Modeler Board");
      // taking it back is no replacement of its own: nothing more is offered
      expect(toasts()).toEqual([]);
    },
    READY_MS + STEP_MS,
  );

  test(
    "the offer goes with the first change of the board that took the place",
    async () => {
      const started = await start(memoryStore());
      await openFile("notes.board", NOTES_BOARD);
      await expect.poll(boardText, POLL).toBe(NOTES_BOARD);
      await chooseFromMenu("new-diagram");
      await expect.poll(toasts, POLL).toEqual(["info: Board replaced"]);
      await started.settled();

      await addNote("On the new board");

      // what the offer would bring back no longer stands beside this note
      await expect.poll(toasts, POLL).toEqual([]);
    },
    READY_MS,
  );

  test(
    "the reset in the page's address over a kept board of the person's own offers that board back",
    async () => {
      const store = memoryStore();
      createOpenStorage(store).keep({ kind: "board", name: "notes.board", text: NOTES_BOARD });

      const started = await start(store, "?reset");
      await modelsReady();

      // the address asked for the example, and the example is what the next visit opens
      expect(started.shown()).toBe("example");
      expect(openIn(store)).toEqual({ kind: "example" });
      expect(document.title).toBe("example.board · Modeler Board");
      // the board this visit would have opened took no part in the request: it is offered back
      await expect.poll(toasts, POLL).toEqual(["info: Board replaced"]);

      await realClick(one(".cd-shell-toast-action"));

      await expect.poll(boardText, POLL).toBe(NOTES_BOARD);
      await started.settled();
      expect(started.shown()).toBe("board");
      expect(openIn(store)).toEqual({ kind: "board", name: "notes.board", text: NOTES_BOARD });
      expect(document.title).toBe("notes.board · Modeler Board");
      expect(toasts()).toEqual([]);
    },
    READY_MS + STEP_MS,
  );

  test(
    "the reset in the page's address has nothing to offer back for a kept text that is no board",
    async () => {
      const store = memoryStore();
      createOpenStorage(store).keep({ kind: "board", name: "lost.board", text: "not a board" });

      const started = await start(store, "?reset");
      await modelsReady();

      expect(started.shown()).toBe("example");
      expect(openIn(store)).toEqual({ kind: "example" });
      expect(toasts()).toEqual([]);
    },
    READY_MS + STEP_MS,
  );
});

describe("a file no editor of the board covers", () => {
  afterEach(stop);

  const DECISION = "decisions/credit-limit.dmn";
  /** a card as a person meets it: what it says, and the buttons a pointer could press */
  function cardOf(nodeId: string): { text: string; buttons: string[] } {
    const engine = one<HTMLElement>(`.react-flow__node[data-id="${nodeId}"] .board-engine`);
    return {
      // as it is rendered: what a part that is hidden holds is no word to a person
      text: engine.innerText,
      buttons: [...engine.querySelectorAll("button")]
        .filter((button) => button.checkVisibility())
        .map((button) => button.textContent),
    };
  }

  test(
    "is a card with the file's name and no button on a board that was opened from a file: this page shows no file",
    async () => {
      await start(memoryStore());
      await openFile(
        "from-designiq.board",
        encodeBoard({
          meta: { title: "From another tool", version: 1 },
          elements: {
            n_decision: node("model", { file: DECISION, x: 0, width: 480, height: 320 }),
          },
        }),
      );

      await expect.poll(engineStates, POLL).toEqual(["card"]);
      const card = cardOf("n_decision");
      expect(card.text).toContain("credit-limit.dmn");
      expect(card.text).toContain(CARD_NOTE);
      expect(card.text).toContain(NO_SHOW_TEXT);
      expect(NO_SHOW_TEXT).toBe("This app cannot show this file.");
      // nothing to press, and no word of an editor the page does not have
      expect(card.buttons).toEqual([]);
      expect(card.text).not.toContain(OPEN_LABEL);
      expect(status()).toBeNull();
    },
    READY_MS,
  );

  test(
    "is the same card on the example, whose repository is in the page and has no editor to show a file in",
    async () => {
      const store = memoryStore();
      const parsed = parseBoardText(EXAMPLE.board);
      if (!parsed.ok) throw new Error("the example is no board");
      keptIn(store).keepBoard(
        encodeBoard({
          ...parsed.snapshot,
          elements: {
            ...parsed.snapshot.elements,
            n_decision: node("model", { file: DECISION, x: 0, y: -400, width: 480, height: 320 }),
          },
        }),
      );
      createOpenStorage(store).keep({ kind: "example" });

      await start(store);

      // the seven models of the example in their editors, and the eighth node as a card
      await expect
        .poll(() => engineStates().sort(), { timeout: READY_MS, interval: 50 })
        .toEqual(["card", ...Array.from({ length: 7 }, () => "ready")]);
      const card = cardOf("n_decision");
      expect(card.text).toContain("credit-limit.dmn");
      expect(card.text).toContain(NO_SHOW_TEXT);
      expect(card.buttons).toEqual([]);
      // the picker still offers the seven notations' files only
      expect(
        all<HTMLOptionElement>("select.board-toolbar__models option:not([disabled])").map(
          (option) => option.value,
        ),
      ).not.toContain(DECISION);
    },
    READY_MS + STEP_MS,
  );
});

describe("the keys the page names", () => {
  afterEach(stop);

  async function shortcutRows(): Promise<string[]> {
    await chooseFromMenu("keyboard-shortcuts");
    await expect.poll(() => root.querySelector("dialog[open]") !== null, POLL).toBe(true);
    return all("dialog[open] tr").map((row) => row.textContent);
  }

  test(
    "the example keeps pictures: its shortcuts name the paste and the drop, which a browser hands the page",
    async () => {
      await startExample(memoryStore());
      const rows = await shortcutRows();
      expect(rows.filter((row) => row.startsWith("Add a picture"))).toHaveLength(1);
      expect(rows.find((row) => row.startsWith("Add a picture"))).toMatch(
        /^Add a picture(Ctrl\+V|⌘V)Drop$/,
      );
    },
    READY_MS + STEP_MS,
  );

  test(
    "a board without a repository keeps no picture: its shortcuts name no way to add one",
    async () => {
      await start(memoryStore());
      await realClick(cardButton("New diagram"));
      const rows = await shortcutRows();
      expect(rows.some((row) => row.startsWith("Delete the selection"))).toBe(true);
      expect(rows.filter((row) => row.startsWith("Add a picture"))).toEqual([]);
    },
    READY_MS,
  );
});

describe("where a person left the board", () => {
  afterEach(stop);

  /**
   * Two notes 1400 px apart from edge to edge: the fit of this board is below 100 %, and at
   * 100 % around its middle a part of each note is still in sight.
   */
  const WIDE_BOARD = encodeBoard({
    meta: { title: "Wide", version: 1 },
    elements: {
      n_near: node("text", { text: "Near", x: 0, width: 240, height: 160 }),
      n_far: node("text", { text: "Far", x: 1160, width: 240, height: 160, z: "b" }),
    },
  });
  /** The same two notes 2640 px apart: at 100 % around the middle neither is in sight. */
  const FAR_APART_BOARD = encodeBoard({
    meta: { title: "Far apart", version: 1 },
    elements: {
      n_near: node("text", { text: "Near", x: 0, width: 240, height: 160 }),
      n_far: node("text", { text: "Far", x: 2400, width: 240, height: 160, z: "b" }),
    },
  });
  const keptView = (store: KeyValueStore): unknown =>
    createOpenStorage(store).state(BOARD_VIEW_KEY);
  /** the open board's view; none while one document is closed and the next not yet mounted */
  const viewNow = (): BoardView | undefined => {
    try {
      return app?.editor().modeler.getViewState() as BoardView | undefined;
    } catch {
      return undefined;
    }
  };
  /** the view the shell's fit gives the open board in this window */
  function fitNow(): BoardView | undefined {
    const editor = app?.editor();
    if (!editor) return undefined;
    const slot = editor.shell.canvas;
    return fittedView(
      editor.modeler.contentBounds(),
      { width: slot.clientWidth, height: slot.clientHeight },
      editor.shell.fitInsets(),
    );
  }
  const zoomTo100 = async (): Promise<void> => {
    await realClick(one('[data-zoom="actual"]'));
    await expect.poll(() => viewNow()?.zoom, POLL).toBe(1);
  };

  test(
    "a second start comes back to the view the board was left at, and not to its fit",
    async () => {
      const store = memoryStore();
      createOpenStorage(store).keep({ kind: "board", name: "wide.board", text: WIDE_BOARD });
      await start(store);
      await expect.poll(viewNow, POLL).toEqual(fitNow());
      const fitted = viewNow();
      expect(fitted?.zoom).toBeLessThan(1);
      // the fit is the page's own view: nothing is kept of it
      expect(keptView(store)).toBeUndefined();

      await zoomTo100();
      // kept with the board in the browser once it rested, without the page going
      await expect.poll(() => keptView(store), POLL).toEqual(viewNow());
      const left = viewNow();
      expect(left).not.toEqual(fitted);
      expect(openIn(store)).toEqual({ kind: "board", name: "wide.board", text: WIDE_BOARD });

      await stop();
      await start(store);

      await expect.poll(viewNow, POLL).toEqual(left);
      await expect.poll(() => one('[data-zoom="actual"]').textContent, POLL).toBe("100%");
      // coming back keeps nothing anew, and tells nobody
      expect(keptView(store)).toEqual(left);
      expect(toasts()).toEqual([]);
      expect(status()).toBeNull();
    },
    READY_MS + STEP_MS,
  );

  test(
    "a view that was left on the empty space between two notes comes back as the fit: no start shows an empty canvas",
    async () => {
      const store = memoryStore();
      createOpenStorage(store).keep({ kind: "board", name: "far.board", text: FAR_APART_BOARD });
      await start(store);
      await expect.poll(viewNow, POLL).toEqual(fitNow());
      // 100 % around the middle of this board: both notes are out of sight
      await zoomTo100();
      await expect.poll(() => keptView(store), POLL).toEqual(viewNow());
      const left = viewNow();

      await stop();
      await start(store);

      await expect.poll(viewNow, POLL).toEqual(fitNow());
      expect(viewNow()?.zoom).toBeLessThan(1);
      // what was kept stays kept until the person moves the view
      expect(keptView(store)).toEqual(left);
    },
    READY_MS + STEP_MS,
  );

  test(
    "another document starts fitted: the view of the board before it is forgotten, for its Undo too",
    async () => {
      const store = memoryStore();
      createOpenStorage(store).keep({ kind: "board", name: "wide.board", text: WIDE_BOARD });
      const started = await start(store);
      await expect.poll(viewNow, POLL).toEqual(fitNow());
      await zoomTo100();
      await expect.poll(() => keptView(store), POLL).toEqual(viewNow());
      const left = viewNow();

      await openFile("notes.board", NOTES_BOARD);

      await expect.poll(boardText, POLL).toBe(NOTES_BOARD);
      expect(keptView(store)).toBeUndefined();
      await expect.poll(viewNow, POLL).toEqual(fitNow());
      expect(viewNow()).not.toEqual(left);

      // the board that was replaced comes back as a document that is opened: fitted
      await expect.poll(toasts, POLL).toContain("info: Board replaced");
      await realClick(one(".cd-shell-toast-action"));
      await expect.poll(boardText, POLL).toBe(WIDE_BOARD);
      await started.settled();
      await expect.poll(viewNow, POLL).toEqual(fitNow());
      expect(viewNow()?.zoom).toBeLessThan(1);
      expect(keptView(store)).toBeUndefined();
    },
    READY_MS + STEP_MS,
  );

  test(
    "a browser that does not keep the view stops nothing and says nothing: the next start is fitted",
    async () => {
      const store = memoryStore();
      createOpenStorage(store).keep({ kind: "board", name: "wide.board", text: WIDE_BOARD });
      let refused = 0;
      const withoutRoomForAView: KeyValueStore = {
        get length() {
          return store.length;
        },
        key: (index) => store.key(index),
        getItem: (key) => store.getItem(key),
        removeItem: (key) => store.removeItem(key),
        setItem(key, value) {
          if (key === "miragon-board:open-state") {
            refused++;
            throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
          }
          store.setItem(key, value);
        },
      };
      await start(withoutRoomForAView);
      await expect.poll(viewNow, POLL).toEqual(fitNow());

      await zoomTo100();
      await expect.poll(() => refused, POLL).toBe(1);
      // a view is no change a person loses: no line about what the browser did not keep
      expect(status()).toBeNull();
      expect(toasts()).toEqual([]);

      await stop();
      await start(withoutRoomForAView);
      await expect.poll(viewNow, POLL).toEqual(fitNow());
      expect(viewNow()?.zoom).toBeLessThan(1);
    },
    READY_MS + STEP_MS,
  );
});

describe("the board as a download", () => {
  let made: MockInstance<typeof URL.createObjectURL>;
  let clicked: MockInstance<HTMLAnchorElement["click"]>;
  const downloads: Array<{ name: string; blob: Blob }> = [];

  beforeAll(() => {
    // The browser's own download is the Playwright spec's. Here the anchor the page clicks is
    // held, with the blob its address stands for.
    const blobs = new Map<string, Blob>();
    const address = URL.createObjectURL.bind(URL);
    made = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      const url = address(blob);
      if (blob instanceof Blob) blobs.set(url, blob);
      return url;
    });
    clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      const blob = blobs.get(this.href);
      if (blob) downloads.push({ name: this.download, blob });
    });
  });
  afterAll(() => {
    made.mockRestore();
    clicked.mockRestore();
  });
  afterEach(async () => {
    downloads.length = 0;
    await stop();
  });

  test(
    "is the board's text under the name of its file, from the menu and by the key",
    async () => {
      const started = await start(memoryStore());
      await openFile("team notes.board", NOTES_BOARD);
      await expect.poll(boardText, POLL).toBe(NOTES_BOARD);
      await addNote("Written before the download");
      const text = boardText();

      await chooseFromMenu("export-board");

      await expect.poll(() => downloads.length, POLL).toBe(1);
      expect(downloads[0]?.name).toBe("team notes.board");
      expect(downloads[0]?.blob.type).toBe("text/plain");
      expect(await downloads[0]?.blob.text()).toBe(text);
      await expect.poll(toasts, POLL).toEqual(["success: Exported team notes.board."]);

      // the key the menu shows beside the entry, with the focus on the board
      await realClick(one(".react-flow__pane"));
      await commands.realInput([{ type: "press", key: "Control+s" }]);

      await expect.poll(() => downloads.length, POLL).toBe(2);
      expect(await downloads[1]?.blob.text()).toBe(text);
      expect(started.editor().modeler.exportText()).toBe(text);
    },
    READY_MS,
  );

  test(
    "takes the note that is being typed with it",
    async () => {
      await start(memoryStore());
      await realClick(cardButton("New diagram"));
      await realClick(one('.board-toolbar button[title="Add a text note"]'));
      await expect.poll(() => document.activeElement?.tagName, POLL).toBe("TEXTAREA");

      await commands.realInput([
        { type: "text", text: "Still in its field" },
        { type: "press", key: "Control+s" },
      ]);

      await expect.poll(() => downloads.length, POLL).toBe(1);
      // a board that was made new has no file yet
      expect(downloads[0]?.name).toBe("untitled.board");
      expect(await downloads[0]?.blob.text()).toContain('"text":"Still in its field"');
      expect(await downloads[0]?.blob.text()).toBe(boardText());
    },
    READY_MS,
  );

  test(
    "is nothing on the start screen, where no board was made yet, and Open is its other key",
    async () => {
      await start(memoryStore());
      const picker = one<HTMLInputElement>('input[data-board-app="open"]', document);
      // the browser's file dialog is the Playwright spec's: here only that the page asks for it
      const asked = vi.spyOn(picker, "click").mockImplementation(() => undefined);
      // a press on the card's title does nothing but bring the keys to the page
      await realClick(one("h1", startCard()));

      await commands.realInput([
        { type: "press", key: "Control+s" },
        { type: "press", key: "Control+o" },
      ]);

      await expect.poll(() => asked.mock.calls.length, POLL).toBe(1);
      expect(downloads).toEqual([]);
      expect(toasts()).toEqual([]);
      expect(picker.accept).toBe(".board");
    },
    READY_MS,
  );
});

describe("the example", () => {
  afterEach(stop);

  test(
    "is shown with seven models drawn by their own editors, the picture, the notes and the group",
    async () => {
      const store = memoryStore();
      const started = await start(store);
      await realClick(cardButton("Show example"));
      await expect.poll(shownAs, POLL).toBe("example");
      // the page says where the example is kept and how to start it over, and no warning
      await expect.poll(toasts, POLL).toEqual([`info: ${KEPT_TOAST}`]);
      expect(status()).toBeNull();
      expect(startCard().hidden).toBe(true);
      await modelsReady();

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
      await expect.poll(() => all(".board-text").length, POLL).toBe(2);
      expect(all(".board-group")).toHaveLength(1);
      await expect.poll(() => all(".react-flow__edge").length, POLL).toBe(1);

      expect(started.editor().modeler.exportText()).toBe(EXAMPLE.board);
      // showing the example keeps nothing of it: only that it is what is open
      expect(exampleKeys(store)).toBe(0);
      expect(openIn(store)).toEqual({ kind: "example" });
      expect(store.length).toBe(1);
      expect(status()).toBeNull();
      expect(document.title).toBe("example.board · Modeler Board");
      await realClick(one('[data-chrome="menu"]'));
      await expect
        .poll(() => root.querySelector('[data-menu-id="reset-example"]')?.textContent, POLL)
        .toBe("Reset the example");
    },
    READY_MS + STEP_MS,
  );

  test(
    "offers the seven models and no other file, and a model added from the picker opens",
    async () => {
      const store = memoryStore();
      const { modeler } = (await startExample(store)).editor();
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

      await modelsReady(8);
      expect(all('.board-engine[data-notation="wardley"]')).toHaveLength(2);
      // a new node is a line of the board, and no file changed
      expect(modeler.exportText().split("\n")).toHaveLength(EXAMPLE.board.split("\n").length + 1);
      expect(keptIn(store).board()).toBe(modeler.exportText());
      expect(keptIn(store).files()).toEqual(EXAMPLE.files);
      // going to the picker of a board that has a repository says nothing
      await realClick(picker);
      await commands.realInput([{ type: "press", key: "Escape" }]);
      expect(toasts().filter((toast) => toast.includes("no repository"))).toEqual([]);
    },
    READY_MS + STEP_MS,
  );

  test(
    "destroy() leaves the element and the page as they were, and nothing of the board on it",
    async () => {
      // a title of the page's own: what an earlier test left would be the example's again
      const titleAtStart = document.title;
      const titleBefore = "A page of its own";
      document.title = titleBefore;
      const first = await startExample(memoryStore());
      expect(document.title).toBe("example.board · Modeler Board");
      const element = root;
      const boardElement = one(".cd-shell-canvas");
      expect(document.documentElement.classList.contains("cd-shell-document")).toBe(true);

      await first.destroy();
      app = undefined;

      expect([element.id, element.className, element.childElementCount]).toEqual(["app", "", 0]);
      // the board itself went, not only the element it stood in
      await expect.poll(() => boardElement.childElementCount, POLL).toBe(0);
      await expect
        .poll(
          () =>
            document.querySelector(
              ".board-module, .board-engine, .cd-shell-legal, input[data-board-app]",
            ),
          POLL,
        )
        .toBeNull();
      expect(document.documentElement.classList.contains("cd-shell-document")).toBe(false);
      expect(document.title).toBe(titleBefore);
      document.title = titleAtStart;
      // a second call is the first one's end
      await expect(first.destroy()).resolves.toBeUndefined();
      // the same element takes the app again
      element.remove();
      await startExample(memoryStore());
      expect(all('[data-chrome="legal"]')).toHaveLength(1);
    },
    2 * READY_MS,
  );

  test(
    "stands on a page that gives the board no ancestor a fixed popup would be placed against",
    async () => {
      await startExample(memoryStore());

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
      // the board fills the window, under the shell's islands
      const board = one(".cd-shell-canvas").getBoundingClientRect();
      expect([board.left, board.top, board.width, board.height]).toEqual([
        0,
        0,
        window.innerWidth,
        window.innerHeight,
      ]);
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
      const { modeler } = (await startExample(store)).editor();
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
      expect(exampleKeys(store)).toBe(1);
      expect(keptIn(store).board()).toBe(EXAMPLE.board);
      expect(modeler.exportText()).toBe(EXAMPLE.board);
      expect(status()).toBeNull();

      await realClick(one("[data-board-done]"));
      await expect.poll(armedNode, POLL).toBe("");
    },
    READY_MS + 3 * STEP_MS,
  );

  test(
    "a note added by the Text button changes the board text",
    async () => {
      const { modeler } = (app ?? (await startExample(store))).editor();
      const teaBefore = keptIn(store).files()[TEA];

      await addNote(NOTE_TEXT);

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
      const { modeler } = (app ?? (await startExample(store))).editor();

      await pickPicture("Site plan.svg");

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
    "a second start on the same storage shows the changes, without the start screen",
    async () => {
      await stop();

      const started = await start(store);
      // the example was open when the page went: it is open again, and nobody is told a thing
      expect(started.editor().shell.isEmptyStateShown()).toBe(false);
      expect(started.shown()).toBe("example");
      await modelsReady();

      expect(started.editor().modeler.exportText()).toBe(boardAfterTheChanges);
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
      expect(status()).toBeNull();
      expect(toasts()).toEqual([]);
    },
    READY_MS + STEP_MS,
  );

  test(
    "Reset the example in the menu brings the example's bytes back, and offers the changes back",
    async () => {
      const started = app ?? (await startExample(store));
      const keptBefore = { board: keptIn(store).board(), files: keptIn(store).files() };

      await chooseFromMenu("reset-example");

      await expect.poll(boardText, POLL).toBe(EXAMPLE.board);
      await started.settled();
      await modelsReady();
      expect(exampleKeys(store)).toBe(0);
      expect(keptIn(store).files()).toEqual(EXAMPLE.files);
      const wardley = (): Element =>
        one(`.react-flow__node[data-id="${WARDLEY_NODE}"] .board-engine`);
      expect(wardley().querySelector('[data-element-id="cmp_water"]')).not.toBeNull();
      await expect.poll(() => all(".board-text").length, POLL).toBe(2);
      await expect.poll(drawnPictures, POLL).toEqual(["miragon-komet-blau.svg"]);
      expect(toasts()).toEqual(["info: Example reset"]);

      // Undo: the board, the model's file and the picture as they were kept
      await realClick(one(".cd-shell-toast-action"));

      await expect.poll(boardText, POLL).toBe(keptBefore.board);
      await started.settled();
      await modelsReady();
      expect(keptIn(store).board()).toBe(keptBefore.board);
      expect(keptIn(store).files()).toEqual(keptBefore.files);
      expect(wardley().querySelector('[data-element-id="cmp_water"]')).toBeNull();
      await expect.poll(drawnPictures, POLL).toEqual(["miragon-komet-blau.svg", "site-plan.svg"]);
      expect(toasts()).toEqual([]);
      expect(status()).toBeNull();
    },
    2 * READY_MS,
  );

  test(
    "the reset in the page's address brings the example's bytes back",
    async () => {
      await stop();

      const started = await start(store, "?reset");
      await modelsReady();

      expect(exampleKeys(store)).toBe(0);
      expect(started.shown()).toBe("example");
      // the example was what was open: the request replaces no board, so nothing is offered
      expect(toasts()).toEqual([]);
      expect(started.editor().modeler.exportText()).toBe(EXAMPLE.board);
      expect(keptIn(store).files()).toEqual(EXAMPLE.files);
      const wardley = one(`.react-flow__node[data-id="${WARDLEY_NODE}"] .board-engine`);
      expect(wardley.querySelector('[data-element-id="cmp_water"]')).not.toBeNull();
      await expect.poll(() => all(".board-text").length, POLL).toBe(2);
      await expect.poll(drawnPictures, POLL).toEqual(["miragon-komet-blau.svg"]);
      expect(all(".board-image")).toHaveLength(1);
    },
    READY_MS + STEP_MS,
  );
});

describe("a kept model its editor refuses", () => {
  afterEach(stop);

  test(
    "says what this page can do about it: the reset, since the page has no editor for the file",
    async () => {
      const store = memoryStore();
      // what another program, or a hand, can leave under the key of a model
      keptIn(store).keepText("models/porter.vc.json", "{ this is no value chain");
      createOpenStorage(store).keep({ kind: "example" });
      await start(store);

      await expect
        .poll(() => engineStates().sort(), { timeout: READY_MS, interval: 50 })
        .toEqual(["invalid", ...Array.from({ length: 6 }, () => "ready")]);
      const refused = one<HTMLElement>('.board-engine[data-embed-state="invalid"]');
      expect(refused.dataset.notation).toBe("value-chain");
      const line = one<HTMLElement>(":scope > .board-host-state", refused);
      expect(line.textContent).toBe(
        "This file cannot be shown as it is. “Reset the example” restores it, and undoes every other change.",
      );
      // the modeler's own reason is there for whoever looks closer
      expect(line.title).not.toBe("");

      // and the reset the line names is in the menu, and does what the line says
      await chooseFromMenu("reset-example");
      await modelsReady();
      expect(exampleKeys(store)).toBe(0);
    },
    2 * READY_MS,
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
      const started = await startExample(refusing);

      // the first thing the browser refused to keep: that the example is what is open
      expect(status()).toBe(NOT_KEPT);
      expect(one<HTMLElement>('[data-chrome="status"]').dataset.severity).toBe("warning");

      await addNote("Not kept");

      expect(status()).toBe(NOT_KEPT);
      expect(all(".board-text")).toHaveLength(3);
      expect(started.editor().modeler.exportText()).not.toBe(EXAMPLE.board);
    },
    READY_MS,
  );

  test(
    "a storage with no room for a change: the page says so from that change on, and for good",
    async () => {
      const store = memoryStore();
      let full = false;
      const filling: KeyValueStore = {
        get length() {
          return store.length;
        },
        key: (index) => store.key(index),
        getItem: (key) => store.getItem(key),
        removeItem: (key) => store.removeItem(key),
        setItem(key, value) {
          if (full) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
          store.setItem(key, value);
        },
      };
      await startExample(filling);
      expect(status()).toBeNull();

      full = true;
      await addNote("Not kept");

      await expect.poll(status, POLL).toBe(NOT_KEPT);
      expect(keptIn(store).board()).toBe(EXAMPLE.board);

      // room again: what was not kept is still not there after a reload, so the line stays
      full = false;
      await addNote("Kept again");
      await expect.poll(() => keptIn(store).board(), POLL).toContain("Kept again");
      expect(status()).toBe(NOT_KEPT);
    },
    READY_MS + STEP_MS,
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

      const started = await startExample(store);

      expect(status()).toBe(MISSING);
      const hole = (): Element[] => all('.board-image[data-missing="true"]');
      await expect.poll(() => hole().length, POLL).toBe(1);
      await expect.poll(drawnPictures, POLL).toEqual(["miragon-komet-blau.svg"]);

      // another change of the board leaves the line: the hole is still there
      await addNote("Beside the hole");
      await expect
        .poll(() => keptIn(store).board(), POLL)
        .toBe(started.editor().modeler.exportText());
      expect(status()).toBe(MISSING);

      await commands.realInput([
        { type: "click", ...centreOf(await boxAtRest(() => hole()[0] ?? root)) },
      ]);
      await expect
        .poll(() => one<HTMLButtonElement>(".board-toolbar__delete").disabled, POLL)
        .toBe(false);
      await realClick(one(".board-toolbar__delete"));

      await expect.poll(() => hole().length, POLL).toBe(0);
      await expect.poll(status, POLL).toBeNull();
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
      expect(exampleKeys(store)).toBe(1);

      await startExample(store);

      expect(exampleKeys(store)).toBe(0);
      expect(status()).toBeNull();
      // not `removed-2.svg`: the repository has no such file any more
      await pickPicture("removed.svg");
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

      const started = await startExample(store);
      const { modeler } = started.editor();

      expect(modeler.exportText()).toBe(EXAMPLE.board);
      expect(status()).toBe(
        "The board kept in this browser could not be read. This is the example.",
      );
      // no lock is left from the refused text: the board takes a gesture
      expect(one<HTMLElement>(".cd-shell-canvas").inert).toBe(false);
      expect(started.editor().shell.isReadOnly()).toBe(false);
      // the text stays until a gesture on the board takes its place
      expect(keptIn(store).board()).toBe("not a board at all");
      await addNote("In its place");
      await expect.poll(() => keptIn(store).board(), POLL).toBe(modeler.exportText());
      expect(modeler.exportText()).not.toBe(EXAMPLE.board);
      // what the line was about is gone with it
      await expect.poll(status, POLL).toBeNull();
    },
    READY_MS,
  );
});
