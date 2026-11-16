/**
 * The adapter alone: a modeler of the contract in the element a board would hand it, without a
 * board. The element here stands in for the board's `.board-engine`: the test gives it the size,
 * the place and the `data-armed` flag the board would, and the sheet of this package is loaded
 * as a host loads it.
 */
import type { EmbeddedEditorContext } from "@miragon/board-renderer";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../../src/assets/embed.css";
import {
  bindTextSession,
  EDITOR_INSETS,
  embedModeler,
  fitBox,
  openEditor,
  type BindModel,
  type EditorNotice,
  type EditorState,
  type EmbedOptions,
  type EmbeddedModeler,
  type Insets,
} from "../../src/index.js";
import { fakeFiles, fakeSession, settled, type FakeSession } from "../support/fake-files.js";
import {
  ITEM,
  STAND_IN,
  standInEditors,
  standInModule,
  type StandInModeler,
  type StandInModuleOptions,
} from "../support/stand-in-modeler.js";
import { watchWindowErrors, type WindowErrors } from "../support/window-errors.js";

const TEXT = "a 0 0 Alpha\nb 200 100 Beta\n";
/** the box of the two items of TEXT */
const BOUNDS = { x: 0, y: 0, width: 200 + ITEM.width, height: 100 + ITEM.height };
const SIZE = { width: 480, height: 320 };

interface Engine {
  element: HTMLElement;
  context: EmbeddedEditorContext;
  setArmed(armed: boolean): void;
}

const made: HTMLElement[] = [];
const editors: EmbeddedModeler[] = [];
let windowErrors: WindowErrors;

beforeAll(() => {
  windowErrors = watchWindowErrors();
});
afterEach(async () => {
  for (const editor of editors.splice(0)) editor.destroy();
  for (const element of made.splice(0)) element.remove();
  window.getSelection()?.removeAllRanges();
  await settled();
  expect(windowErrors.errors).toEqual([]);
});
afterAll(() => {
  windowErrors.stop();
});

function attached(element: HTMLElement): HTMLElement {
  document.body.append(element);
  made.push(element);
  return element;
}

/** the element a board makes for an editor, of a node body's size, in a box the test may scale */
function engine(options: { armed?: boolean; scale?: number } = {}): Engine {
  const box = document.createElement("div");
  box.style.cssText = `position:absolute;left:40px;top:40px;width:${SIZE.width}px;height:${SIZE.height}px;transform-origin:0 0`;
  if (options.scale !== undefined) box.style.transform = `scale(${options.scale})`;
  const element = document.createElement("div");
  element.className = "board-engine";
  element.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%";
  let armed = options.armed ?? false;
  element.dataset.armed = String(armed);
  box.append(element);
  attached(box);
  return {
    element,
    context: {
      nodeId: "n_0",
      path: "plans/plan.items",
      element,
      armed: () => armed,
      onArmedChange: () => () => undefined,
      relocate: () => undefined,
    },
    setArmed(next) {
      armed = next;
      element.dataset.armed = String(next);
    },
  };
}

interface Embedded {
  editor: EmbeddedModeler;
  modeler: StandInModeler;
  session: FakeSession;
  states: EditorState[];
}

function embed(
  target: Engine,
  options: {
    text?: string;
    embed?: Partial<EmbedOptions>;
    module?: StandInModuleOptions;
  } = {},
): Embedded {
  const session = fakeSession(target.context.path, options.text ?? TEXT);
  const { module } = standInModule(options.module);
  const states: EditorState[] = [];
  const editor = embedModeler(target.context, {
    module,
    notation: STAND_IN,
    bind: bindTextSession(session, module.text),
    onState: (state) => states.push(state),
    ...options.embed,
  });
  editors.push(editor);
  return { editor, modeler: editor.modeler as StandInModeler, session, states };
}

const displayOf = (element: Element | null): string =>
  element ? getComputedStyle(element).display : "absent";
const svgOf = (target: Engine): SVGSVGElement => {
  const svg = target.element.querySelector<SVGSVGElement>(".djs-container > svg");
  if (!svg) throw new Error("the editor drew no svg");
  return svg;
};
const hitOf = (target: Engine, id: string): Element => {
  const hit = target.element.querySelector(`.djs-shape[data-element-id="${id}"] .djs-hit`);
  if (!hit) throw new Error(`the editor drew no item ${id}`);
  return hit;
};

/** the keys that reach the window, as a host that forwards them would hear them */
function keysAtWindow(): { heard: string[]; stop(): void } {
  const heard: string[] = [];
  const listener = (event: KeyboardEvent): void => {
    heard.push(
      `${event.ctrlKey ? "Control+" : ""}${event.metaKey ? "Meta+" : ""}${event.altKey ? "Alt+" : ""}${event.key}`,
    );
  };
  window.addEventListener("keydown", listener);
  return { heard, stop: () => window.removeEventListener("keydown", listener) };
}
const keydown = (target: EventTarget, init: KeyboardEventInit): void =>
  void target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );

describe("what the adapter puts into the element", () => {
  it("marks the element and mounts the modeler in a child of its own, unfitted by the modeler", async () => {
    const target = engine();
    const { editor, modeler } = embed(target);
    await editor.ready;

    expect(target.element.dataset.embed).toBe("diagram-js");
    expect(target.element.dataset.notation).toBe(STAND_IN);
    expect(target.element.children).toHaveLength(1);
    const root = target.element.querySelector(":scope > .board-host-editor");
    expect(root?.querySelector(":scope > .djs-container")).toBe(modeler.container());
    // the fit is the adapter's, in layout px: the modeler's own would read the screen
    expect(modeler.record.options).toEqual({ fitOnImport: false });
    expect(modeler.exportText()).toBe(TEXT);
  });

  it("gives that child the whole element and clips it there", async () => {
    const target = engine({ armed: true });
    const { editor } = embed(target);
    await editor.ready;

    const root = target.element.querySelector<HTMLElement>(".board-host-editor");
    const style = getComputedStyle(root as HTMLElement);
    expect(style.position).toBe("absolute");
    expect(style.overflow).toBe("hidden");
    expect([root?.offsetLeft, root?.offsetTop, root?.offsetWidth, root?.offsetHeight]).toEqual([
      0,
      0,
      SIZE.width,
      SIZE.height,
    ]);
    // the element itself keeps the place and the size the board gave it
    expect(target.element.style.cssText).toBe(
      "position: absolute; left: 0px; top: 0px; width: 100%; height: 100%;",
    );
  });

  it("refuses a modeler of another notation and leaves nothing behind", () => {
    const target = engine();
    const { module, made: modelers } = standInModule({ madeNotation: "another" });
    const session = fakeSession(target.context.path, TEXT);

    expect(() =>
      embedModeler(target.context, {
        module,
        notation: STAND_IN,
        bind: bindTextSession(session),
      }),
    ).toThrow("expected a 'stand-in' modeler, got 'another'");

    expect(modelers.map((modeler) => modeler.record.destroyed)).toEqual([1]);
    expect(target.element.children).toHaveLength(0);
    expect(target.element.dataset.embed).toBeUndefined();
    expect(target.element.dataset.notation).toBeUndefined();
  });
});

describe("the first fit", () => {
  it("is made in layout px: a preview the board scales is fitted as one at zoom 1", async () => {
    const plain = engine();
    const scaled = engine({ scale: 0.5 });
    const atOne = embed(plain);
    const atHalf = embed(scaled);
    await Promise.all([atOne.editor.ready, atHalf.editor.ready]);

    // the element's rectangle on screen is half the size; its layout size is the node body's
    expect(scaled.element.getBoundingClientRect().width).toBe(SIZE.width / 2);
    const expected = fitBox(BOUNDS, SIZE, EDITOR_INSETS);
    expect(expected).toBeDefined();
    expect(atOne.modeler.record.viewboxes).toEqual([expected]);
    expect(atHalf.modeler.record.viewboxes).toEqual([expected]);
  });

  it("leaves the default room for the editor's palette, on screen", async () => {
    const target = engine();
    const { editor } = embed(target);
    await editor.ready;

    const box = target.element.getBoundingClientRect();
    const first = hitOf(target, "a").getBoundingClientRect();
    const last = hitOf(target, "b").getBoundingClientRect();
    // the content is smaller than the free area: 100 %, centred in what the insets leave
    expect(first.width).toBe(ITEM.width);
    expect(first.left - box.left).toBe(24 + (SIZE.width - 48 - BOUNDS.width) / 2);
    expect(first.top - box.top).toBe(64 + (SIZE.height - 88 - BOUNDS.height) / 2);
    expect(box.right - last.right).toBe(first.left - box.left);
  });

  it("takes the insets it is given in place of the default ones", async () => {
    const column: Insets = { top: 24, right: 24, bottom: 24, left: 160 };
    const target = engine();
    const { editor, modeler } = embed(target, { embed: { insets: column } });
    await editor.ready;

    expect(modeler.record.viewboxes).toEqual([fitBox(BOUNDS, SIZE, column)]);
    expect(fitBox(BOUNDS, SIZE, column)).not.toEqual(fitBox(BOUNDS, SIZE, EDITOR_INSETS));
  });

  it("is made once: a later text keeps the view the person has", async () => {
    const target = engine();
    const { editor, modeler, session } = embed(target);
    await editor.ready;
    modeler.setViewState({ x: 10, y: 20, scale: 2 });

    session.replace(`${TEXT}c 900 900 Far\n`);
    await expect.poll(() => modeler.exportText()).toContain("Far");
    await settled();

    expect(modeler.record.viewboxes).toHaveLength(1);
    expect(modeler.getViewState()).toEqual({ x: 10, y: 20, scale: 2 });
  });

  it("is made for the first text the modeler accepts, also after one it refused", async () => {
    const target = engine();
    const { editor, modeler, session, states } = embed(target, { text: "no item\n" });
    await editor.ready;
    expect(states.map((state) => state.kind)).toEqual(["invalid"]);
    expect(modeler.record.viewboxes).toEqual([]);
    // a canvas whose changes cannot be written takes no input
    const root = target.element.querySelector<HTMLElement>(".board-host-editor");
    expect(root?.inert).toBe(true);

    session.replace(TEXT);
    await expect.poll(() => states.at(-1)?.kind).toBe("ok");

    expect(modeler.record.viewboxes).toEqual([fitBox(BOUNDS, SIZE, EDITOR_INSETS)]);
    // the fit stands: no view of the empty canvas is put back over it
    expect(modeler.record.viewStates).toEqual([]);
    expect(root?.inert).toBe(false);
  });

  it("is left out for a file without content", async () => {
    const target = engine();
    const { editor, modeler, states } = embed(target, { text: "# nothing yet\n" });
    await editor.ready;

    expect(states).toEqual([{ kind: "ok" }]);
    expect(modeler.record.viewboxes).toEqual([]);
  });
});

describe("the preview rule of the sheet", () => {
  it("takes the editor's chrome out of a preview and leaves its canvas and its overlays", async () => {
    const target = engine({ armed: false });
    const { editor } = embed(target);
    await editor.ready;
    const container = target.element.querySelector(".djs-container");

    expect(displayOf(container?.querySelector(":scope > .djs-palette") ?? null)).toBe("none");
    expect(displayOf(container?.querySelector(":scope > svg") ?? null)).toBe("block");
    expect(displayOf(container?.querySelector(":scope > .djs-overlay-container") ?? null)).toBe(
      "block",
    );

    target.setArmed(true);
    expect(displayOf(container?.querySelector(":scope > .djs-palette") ?? null)).toBe("block");
  });

  it("reaches no editor that the adapter did not mark", () => {
    // an editor a host mounts another way keeps its chrome's room: its own rules hide it
    const other = attached(document.createElement("div"));
    other.className = "board-engine";
    other.dataset.armed = "false";
    other.innerHTML = `<div class="djs-container"><svg></svg><div class="djs-palette">tools</div></div>`;

    expect(displayOf(other.querySelector(".djs-palette"))).toBe("block");
    other.dataset.embed = "diagram-js";
    expect(displayOf(other.querySelector(".djs-palette"))).toBe("none");
  });
});

describe("release", () => {
  it("leaves nothing selected, open or focused in the editor", async () => {
    const target = engine({ armed: true });
    const { editor, modeler } = embed(target);
    await editor.ready;
    modeler.elements?.reveal("a");
    svgOf(target).focus();
    window.getSelection()?.selectAllChildren(hitOf(target, "a").parentElement as Element);
    expect(target.element.querySelector(".stand-in-pad")).not.toBeNull();
    expect(document.activeElement).toBe(svgOf(target));

    editor.release();

    expect(modeler.elements?.selection()).toEqual([]);
    expect(target.element.querySelector(".stand-in-pad")).toBeNull();
    expect(target.element.contains(document.activeElement)).toBe(false);
    expect(window.getSelection()?.rangeCount).toBe(0);
  });

  it("ends a drag the pointer still holds, and its release writes nothing", async () => {
    const target = engine({ armed: true });
    const { editor, modeler, session } = embed(target);
    await editor.ready;
    const from = hitOf(target, "b").getBoundingClientRect();
    const start = { clientX: from.left + 20, clientY: from.top + 20 };
    const pointer = { bubbles: true, button: 0, pointerId: 1, isPrimary: true };
    hitOf(target, "b").dispatchEvent(new PointerEvent("pointerdown", { ...pointer, ...start }));
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        ...pointer,
        clientX: start.clientX + 30,
        clientY: start.clientY,
      }),
    );
    expect(modeler.interaction?.active()).toBe(true);

    editor.release();
    expect(modeler.interaction?.active()).toBe(false);
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        ...pointer,
        clientX: start.clientX + 30,
        clientY: start.clientY,
      }),
    );

    expect(session.writes).toEqual([]);
    expect(modeler.exportText()).toBe(TEXT);
  });

  it("touches neither the focus nor the selected text outside the element", async () => {
    const target = engine({ armed: true });
    const { editor } = embed(target);
    await editor.ready;
    const outside = attached(document.createElement("div"));
    outside.innerHTML = `<input /><p>some text of the page</p>`;
    const field = outside.querySelector("input") as HTMLInputElement;
    const text = outside.querySelector("p") as HTMLElement;
    field.focus();
    window.getSelection()?.selectAllChildren(text);

    editor.release();

    expect(document.activeElement).toBe(field);
    expect(window.getSelection()?.toString()).toBe("some text of the page");
  });
});

describe("focus", () => {
  it("lets the notation lay out again and gives the canvas the keys", async () => {
    const target = engine({ armed: true });
    const { editor, modeler } = embed(target);
    await editor.ready;
    expect(document.activeElement).not.toBe(svgOf(target));

    editor.focus?.();

    expect(modeler.record.relayouts).toBe(1);
    expect(modeler.record.focuses).toBe(1);
    expect(document.activeElement).toBe(svgOf(target));
  });
});

describe("the history keys of an armed editor", () => {
  it("never reach the window, and the editor's own listener on the document still undoes", async () => {
    const target = engine({ armed: true });
    const { editor, modeler, session } = embed(target, { embed: { containHistoryKeys: true } });
    await editor.ready;
    svgOf(target).focus();
    modeler.commands.move("a", 10, 10);
    expect(session.writes).toHaveLength(1);
    const keys = keysAtWindow();

    keydown(svgOf(target), { key: "z", ctrlKey: true });
    keys.stop();

    // the stand-in takes its undo on the document, as Wardley Maps and Team Topologies do
    expect(session.writes).toEqual([expect.any(String), TEXT]);
    expect(keys.heard).toEqual([]);
  });

  it("are Control or Command with Z or Y, whatever the case, and no other key", async () => {
    const target = engine({ armed: true });
    const { editor } = embed(target, { embed: { containHistoryKeys: true } });
    await editor.ready;
    const keys = keysAtWindow();
    const svg = svgOf(target);

    keydown(svg, { key: "z", metaKey: true });
    keydown(svg, { key: "Z", ctrlKey: true, shiftKey: true });
    keydown(svg, { key: "y", ctrlKey: true });
    expect(keys.heard).toEqual([]);

    keydown(svg, { key: "z", ctrlKey: true, altKey: true });
    keydown(svg, { key: "a", ctrlKey: true });
    keydown(svg, { key: "z" });
    keys.stop();
    expect(keys.heard).toEqual(["Control+Alt+z", "Control+a", "z"]);
  });

  it("reach the window from a preview and from outside the element", async () => {
    const target = engine({ armed: false });
    const { editor } = embed(target, { embed: { containHistoryKeys: true } });
    await editor.ready;
    const keys = keysAtWindow();

    keydown(svgOf(target), { key: "z", ctrlKey: true });
    target.setArmed(true);
    keydown(document.body, { key: "z", ctrlKey: true });
    keys.stop();

    expect(keys.heard).toEqual(["Control+z", "Control+z"]);
  });

  it("reach the window where the host did not ask to keep them", async () => {
    const target = engine({ armed: true });
    const { editor } = embed(target);
    await editor.ready;
    const keys = keysAtWindow();

    keydown(svgOf(target), { key: "z", ctrlKey: true });
    keys.stop();

    expect(keys.heard).toEqual(["Control+z"]);
  });
});

describe("destroy", () => {
  it("ends the modeler and its binding and takes back what the adapter wrote", async () => {
    const target = engine({ armed: true });
    const { editor, modeler, session } = embed(target, { embed: { containHistoryKeys: true } });
    await editor.ready;
    const container = modeler.container();

    editor.destroy();
    editors.length = 0;

    expect(modeler.record.destroyed).toBe(1);
    expect(target.element.children).toHaveLength(0);
    expect(container?.isConnected).toBe(false);
    expect(target.element.dataset.embed).toBeUndefined();
    expect(target.element.dataset.notation).toBeUndefined();

    // unbound: a later text of the file is not imported
    session.replace(`${TEXT}c 0 300 Late\n`);
    await settled();
    expect(modeler.record.imports).toEqual([TEXT]);

    // the key listener is off the document: a key from the element reaches the window again
    const keys = keysAtWindow();
    keydown(target.element, { key: "z", ctrlKey: true });
    keys.stop();
    expect(keys.heard).toEqual(["Control+z"]);
  });
});

describe("an editor that moves into another element", () => {
  it("stands in the new element as it stood in the old one: the same modeler, its view kept, nothing imported", async () => {
    const old = engine({ armed: true });
    const { editor, modeler } = embed(old);
    await editor.ready;
    modeler.setViewState({ x: -30, y: 12, scale: 0.8 });
    modeler.record.viewStates.length = 0;
    const next = engine({ armed: true });

    editor.rehome(next.context);

    const root = next.element.querySelector(":scope > .board-host-editor");
    expect(root?.querySelector(":scope > .djs-container")).toBe(modeler.container());
    expect([next.element.dataset.embed, next.element.dataset.notation]).toEqual([
      "diagram-js",
      STAND_IN,
    ]);
    // the old element is as the board made it
    expect(old.element.children).toHaveLength(0);
    expect(old.element.dataset.embed).toBeUndefined();
    expect(old.element.dataset.notation).toBeUndefined();
    expect(modeler.record.imports).toEqual([TEXT]);
    expect(modeler.record.destroyed).toBe(0);
    expect(modeler.getViewState()).toEqual({ x: -30, y: 12, scale: 0.8 });
    expect(modeler.record.viewStates).toEqual([]);
    // no second fit: the view is the person's
    expect(modeler.record.viewboxes).toHaveLength(1);
  });

  it("keeps the history keys of the element it stands in now, by that element's arming", async () => {
    const old = engine({ armed: true });
    const { editor } = embed(old, { embed: { containHistoryKeys: true } });
    await editor.ready;
    const next = engine({ armed: false });
    editor.rehome(next.context);
    const keys = keysAtWindow();

    // from the old element, which is armed and holds no editor any more
    keydown(old.element, { key: "z", ctrlKey: true });
    // from the new one while it is a preview
    keydown(svgOf(next), { key: "z", ctrlKey: true });
    expect(keys.heard).toEqual(["Control+z", "Control+z"]);

    next.setArmed(true);
    keydown(svgOf(next), { key: "z", ctrlKey: true });
    keys.stop();
    expect(keys.heard).toEqual(["Control+z", "Control+z"]);
  });

  it("is released in the element it stands in now", async () => {
    const old = engine({ armed: true });
    const { editor, modeler } = embed(old);
    await editor.ready;
    const next = engine({ armed: true });
    editor.rehome(next.context);
    modeler.elements?.reveal("a");
    svgOf(next).focus();
    expect(next.element.querySelector(".stand-in-pad")).not.toBeNull();

    editor.release();

    expect(modeler.elements?.selection()).toEqual([]);
    expect(next.element.contains(document.activeElement)).toBe(false);
  });

  it("does nothing for the element it stands in already, and leaves the new one clean when it ends", async () => {
    const old = engine({ armed: true });
    const { editor, modeler } = embed(old, { embed: { containHistoryKeys: true } });
    await editor.ready;
    const root = old.element.querySelector(".board-host-editor");

    // not taken out and put back: the canvas keeps the focus it has
    svgOf(old).focus();
    editor.rehome(old.context);
    expect(document.activeElement).toBe(svgOf(old));
    expect(old.element.querySelector(":scope > .board-host-editor")).toBe(root);
    expect(old.element.dataset.embed).toBe("diagram-js");
    const keys = keysAtWindow();
    keydown(svgOf(old), { key: "z", ctrlKey: true });
    expect(keys.heard).toEqual([]);

    const next = engine({ armed: true });
    editor.rehome(next.context);
    editor.destroy();
    editors.length = 0;
    expect(modeler.record.destroyed).toBe(1);
    expect(next.element.children).toHaveLength(0);
    expect(next.element.dataset.embed).toBeUndefined();
    expect(next.element.dataset.notation).toBeUndefined();
    keydown(next.element, { key: "z", ctrlKey: true });
    keys.stop();
    expect(keys.heard).toEqual(["Control+z"]);
  });
});

describe("what a binding says once", () => {
  it("reaches the host that asked for it: a dropped change with its reason, and the change after it", async () => {
    const target = engine({ armed: true });
    const notices: EditorNotice[] = [];
    const { editor, modeler, session } = embed(target, {
      embed: { onNotice: (notice) => notices.push(notice) },
    });
    await editor.ready;

    modeler.commands.move("a", 10, 10);
    session.drop("too-large");

    expect(notices).toEqual([{ kind: "edited" }, { kind: "dropped", reason: "too-large" }]);
  });

  it("is said to nobody where the host did not ask", async () => {
    const target = engine({ armed: true });
    const { editor, modeler, session } = embed(target);
    await editor.ready;

    modeler.commands.move("a", 10, 10);
    session.drop("crossed");

    expect(session.writes).toHaveLength(1);
  });
});

describe("a binding of the host's own", () => {
  it("gets the mounted modeler, and the first document it calls shown is fitted", async () => {
    const target = engine();
    const { module } = standInModule();
    const states: EditorState[] = [];
    let unbound = 0;
    let report: ((state: EditorState) => void) | undefined;
    const bind: BindModel = (modeler, tell) => {
      report = tell;
      return {
        // as a live document does: the text is there before anybody asks
        ready: modeler.importText(TEXT).then(() => undefined),
        unbind: () => void (unbound += 1),
      };
    };
    const editor = embedModeler(target.context, {
      module,
      notation: STAND_IN,
      bind,
      onState: (state) => states.push(state),
    });
    editors.push(editor);
    const modeler = editor.modeler as StandInModeler;
    await editor.ready;
    expect(modeler.record.viewboxes).toEqual([]);

    report?.({ kind: "loading" });
    expect(modeler.record.viewboxes).toEqual([]);
    report?.({ kind: "ok" });
    report?.({ kind: "ok" });

    expect(modeler.record.viewboxes).toEqual([fitBox(BOUNDS, SIZE, EDITOR_INSETS)]);
    expect(states.map((state) => state.kind)).toEqual(["loading", "ok", "ok"]);

    editor.destroy();
    editors.length = 0;
    expect(unbound).toBe(1);
  });
});

describe("the facade without a board that reads its ready", () => {
  it("says a failure in the element and leaves no unhandled rejection on the page", async () => {
    const target = engine();
    const files = fakeFiles([target.context.path]);
    const { entry } = standInEditors();

    // the fake port opens no text: the editor cannot be made, and nobody waits for `ready`
    const editor = openEditor(target.context, { entry, files });
    await expect.poll(() => target.element.dataset.embedState).toBe("failed");

    expect(target.element.querySelector(".board-host-state")?.textContent).toBe(
      "This file could not be opened. the fake opens no text",
    );
    await settled();
    expect(windowErrors.errors).toEqual([]);
    // whoever does wait is told
    await expect(editor.ready).rejects.toThrow("the fake opens no text");

    // it follows a file that moves, and waits for one that comes
    expect(files.listening()).toBe(2);
    editor.destroy();
    expect(target.element.children).toHaveLength(0);
    expect(target.element.dataset.embedState).toBeUndefined();
    expect(files.listening()).toBe(0);
  });

  it("asks for its file again whenever the list changes and has its path, and never after its end", async () => {
    const target = engine();
    const { path } = target.context;
    const files = fakeFiles([]);
    const { entry } = standInEditors();
    const editor = openEditor(target.context, { entry, files });
    await expect.poll(() => target.element.dataset.embedState).toBe("failed");
    expect(files.opens).toEqual([path]);

    // a list without the path: the file is still not there
    files.setPaths(["plans/another.items"]);
    await settled();
    expect(files.opens).toEqual([path]);

    files.setPaths(["plans/another.items", path]);
    await settled();
    expect(files.opens).toEqual([path, path]);
    // the fake refused again: the element says what the last try came to, and a later list is a new try
    expect(target.element.dataset.embedState).toBe("failed");
    files.setPaths([path]);
    await settled();
    expect(files.opens).toEqual([path, path, path]);
    await settled();
    expect(windowErrors.errors).toEqual([]);

    editor.destroy();
    files.setPaths([path, "plans/more.items"]);
    await settled();
    expect(files.opens).toEqual([path, path, path]);
  });

  it("asks once for two changes of the list in a row: not again while a try is on its way", async () => {
    const target = engine();
    const { path } = target.context;
    const files = fakeFiles([]);
    const { entry } = standInEditors();
    const editor = openEditor(target.context, { entry, files });
    await expect.poll(() => target.element.dataset.embedState).toBe("failed");

    files.setPaths([path, "plans/a.items"]);
    files.setPaths([path]);
    await settled();

    expect(files.opens).toEqual([path, path]);
    editor.destroy();
  });
});
