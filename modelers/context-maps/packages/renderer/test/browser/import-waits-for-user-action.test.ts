import { afterEach, describe, expect, test } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element as DiagramElement, Shape } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  type CmElementFactory,
  type CmLabelEditing,
  type CollaborativeContextMapsModeler,
} from "@miragon/context-maps-renderer";
import {
  emptyDocument,
  parseDocumentText,
  serializeDocumentText,
} from "@miragon/context-maps-schema-model";
import type { CmDocument } from "@miragon/context-maps-schema-model";

const CONTEXT_SIZE = { width: 200, height: 110 };

const BEFORE = (() => {
  const contextMap = emptyDocument("User actions");
  contextMap.contexts = [
    { id: "a", label: "A", position: { x: 100, y: 100 }, size: CONTEXT_SIZE },
    { id: "b", label: "B", position: { x: 450, y: 100 }, size: CONTEXT_SIZE },
    { id: "c", label: "C", position: { x: 450, y: 380 }, size: CONTEXT_SIZE },
  ];
  contextMap.relationships = [{ id: "r", from: "a", to: "b", pattern: "upstream-downstream" }];
  return serializeDocumentText(contextMap);
})();

/** Free canvas between B and C, in diagram coordinates. */
const FREE_SPOT = { x: 550, y: 295 };

interface ClientPoint {
  clientX: number;
  clientY: number;
}

interface DirectEditing {
  isActive(element?: unknown): boolean;
  complete(): void;
}

interface Stage {
  modeler: CollaborativeContextMapsModeler;
  changes(): number;
  errors: unknown[];
  /** What the canvas did, in order: the import, and each popup and label editor that opened. */
  steps: string[];
}

const teardowns: Array<() => void> = [];

afterEach(() => {
  for (const teardown of teardowns.splice(0)) teardown();
});

async function stage(): Promise<Stage> {
  const host = attachedHost(900, 640);
  const modeler = createCollaborativeModeler();
  modeler.attachTo(host);
  await modeler.importText(BEFORE);
  let changes = 0;
  modeler.onContentChanged(() => (changes += 1));
  const steps: string[] = [];
  const eventBus = modeler.diagram.get<EventBus>("eventBus");
  eventBus.on("import.done", () => steps.push("import"));
  eventBus.on("popupMenu.open", () => steps.push("menu"));
  eventBus.on("directEditing.activate", () => steps.push("editor"));
  const errors: unknown[] = [];
  const collectError = (event: ErrorEvent) => errors.push(event.error ?? event.message);
  window.addEventListener("error", collectError);
  teardowns.push(() => {
    window.removeEventListener("error", collectError);
    modeler.destroy();
    host.parentElement?.remove();
  });
  return { modeler, changes: () => changes, errors, steps };
}

/** The host echoes its own change back: it imports the export from inside the change listener. */
function echoOnce(stage: Stage): () => Promise<unknown> | undefined {
  let echo: Promise<unknown> | undefined;
  stage.modeler.onContentChanged(() => {
    echo ??= stage.modeler.importText(stage.modeler.exportText());
  });
  return () => echo;
}

interface Echoes {
  calls: Array<Promise<unknown>>;
  /** The indices of the echoes in the order their promises settled. */
  settled: number[];
}

/** A host that echoes every change back, each with the export of the moment it was told. */
function echoEach(stage: Stage): Echoes {
  const echoes: Echoes = { calls: [], settled: [] };
  stage.modeler.onContentChanged(() => {
    const index = echoes.calls.length;
    echoes.calls.push(
      stage.modeler.importText(stage.modeler.exportText()).then(() => echoes.settled.push(index)),
    );
  });
  return echoes;
}

/** Lets the tasks run that the canvas deferred (the pad's position, the type menu, the editor). */
async function nextTasks(count = 4): Promise<void> {
  for (let task = 0; task < count; task += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function service<T>(stage: Stage, name: string): T {
  return stage.modeler.diagram.get<T>(name);
}

function container(stage: Stage): HTMLElement {
  return service<Canvas>(stage, "canvas").getContainer();
}

function svg(stage: Stage): SVGSVGElement {
  return container(stage).querySelector<SVGSVGElement>(":scope > svg")!;
}

function shape(stage: Stage, id: string): Shape {
  return service<ElementRegistry>(stage, "elementRegistry").get(id) as Shape;
}

function clientPoint(stage: Stage, point: { x: number; y: number }): ClientPoint {
  const canvas = service<Canvas>(stage, "canvas");
  const viewbox = canvas.viewbox();
  const box = canvas.getContainer().getBoundingClientRect();
  return {
    clientX: box.left + (point.x - viewbox.x) * viewbox.scale,
    clientY: box.top + (point.y - viewbox.y) * viewbox.scale,
  };
}

function centreOfShape(stage: Stage, id: string): ClientPoint {
  const { x, y, width, height } = shape(stage, id);
  return clientPoint(stage, { x: x + width / 2, y: y + height / 2 });
}

function centreOfBox(element: Element): ClientPoint {
  const box = element.getBoundingClientRect();
  return { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
}

function shifted(point: ClientPoint, right: number, down: number): ClientPoint {
  return { clientX: point.clientX + right, clientY: point.clientY + down };
}

function pointer(
  target: EventTarget,
  type: string,
  at: ClientPoint,
  init: MouseEventInit = {},
): void {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...at, ...init }),
  );
}

function hitArea(stage: Stage, id: string): SVGElement {
  const graphics = service<ElementRegistry>(stage, "elementRegistry").getGraphics(id);
  return graphics.querySelector<SVGElement>(".djs-hit") ?? graphics;
}

function hoverCanvasAt(stage: Stage, at: ClientPoint): void {
  pointer(document, "mousemove", at);
  pointer(svg(stage), "mouseover", at);
  pointer(document, "mousemove", at);
}

function contextPadEntry(stage: Stage, contextId: string, action: string): HTMLElement {
  service<Selection>(stage, "selection").select(shape(stage, contextId) as DiagramElement);
  const entry = container(stage).querySelector<HTMLElement>(
    `.djs-context-pad.open [data-action="${action}"]`,
  );
  if (!entry) throw new Error(`the context pad of ${contextId} has no "${action}" entry`);
  return entry;
}

function paletteEntry(stage: Stage, action: string): HTMLElement {
  const entry = container(stage).querySelector<HTMLElement>(
    `.djs-palette [data-action="${action}"]`,
  );
  if (!entry) throw new Error(`the palette has no "${action}" entry`);
  return entry;
}

function exported(stage: Stage): CmDocument {
  const parsed = parseDocumentText(stage.modeler.exportText());
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.document;
}

function exportedContext(stage: Stage, id: string): CmDocument["contexts"][number] | undefined {
  return exported(stage).contexts.find((context) => context.id === id);
}

function selectedIds(stage: Stage): string[] {
  return (service<Selection>(stage, "selection").get() as DiagramElement[])
    .map((element) => element.id)
    .sort();
}

function labelEditing(stage: Stage): CmLabelEditing {
  return service<CmLabelEditing>(stage, "cmLabelEditing");
}

function directEditing(stage: Stage): DirectEditing {
  return service<DirectEditing>(stage, "directEditing");
}

function editorContent(stage: Stage): HTMLElement {
  const content = container(stage).querySelector<HTMLElement>(".djs-direct-editing-content");
  if (!content) throw new Error("no label editor is open");
  return content;
}

/** Opens the name editor of context A and types a new name, uncommitted. */
function typeNameOfA(stage: Stage, name: string): void {
  labelEditing(stage).activate(shape(stage, "a") as never);
  editorContent(stage).innerText = name;
}

/** The open label editor edits the element the canvas holds under `id`, not a removed one. */
function expectEditorOnLiveElement(stage: Stage, id: string): void {
  expect(labelEditing(stage).openEdit()?.elementId).toBe(id);
  expect(directEditing(stage).isActive(shape(stage, id))).toBe(true);
}

/** The element the open popup menu acts on; its entries change exactly that element. */
function popupTarget(stage: Stage): unknown {
  const popupMenu = service<PopupMenu>(stage, "popupMenu");
  if (!popupMenu.isOpen()) return undefined;
  return (popupMenu as unknown as { _current: { target: unknown } })._current.target;
}

function chooseInMenu(entryId: string): void {
  const entry = document.querySelector(`.djs-popup [data-id="${entryId}"]`);
  if (!entry) throw new Error(`the open menu has no "${entryId}" entry`);
  entry.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
}

function addedContextId(stage: Stage): string {
  const added = exported(stage).contexts.find((context) => !["a", "b", "c"].includes(context.id));
  if (!added) throw new Error("no context was added");
  return added.id;
}

/** A peer's text: the map on the canvas right now, with context C renamed. */
function peerText(stage: Stage, label = "C by a peer"): string {
  const document = exported(stage);
  document.contexts = document.contexts.map((context) =>
    context.id === "c" ? { ...context, label } : context,
  );
  return serializeDocumentText(document);
}

/** Records each value `interaction` reports, in order. */
function interactionChanges(stage: Stage): boolean[] {
  const changes: boolean[] = [];
  stage.modeler.interaction.onChange((active) => changes.push(active));
  return changes;
}

/** Opens the description prompt of context A and types a description, uncommitted. */
function typeDescriptionOfA(stage: Stage, description: string): HTMLTextAreaElement {
  const entry = contextPadEntry(stage, "a", "description");
  pointer(entry, "click", centreOfBox(entry), { detail: 1 });
  const field = container(stage).querySelector<HTMLTextAreaElement>(".cm-pad-prompt__field");
  if (!field) throw new Error("no description prompt is open");
  field.value = description;
  return field;
}

/** Presses on context B, then moves it 60 px to the right and releases it. */
async function pressAndMoveB(
  stage: Stage,
  afterPress: () => void = () => undefined,
): Promise<void> {
  const start = centreOfShape(stage, "b");
  pointer(hitArea(stage, "b"), "mousedown", start);
  afterPress();
  await nextTasks(1);
  pointer(document, "mousemove", shifted(start, 20, 0));
  hoverCanvasAt(stage, shifted(start, 60, 0));
  pointer(document, "mouseup", shifted(start, 60, 0));
  await nextTasks();
}

describe("an import from the change listener of a user action waits until the action has finished", () => {
  test("a click append from the context pad, the subdomain-type menu it opens included", async () => {
    const running = await stage();
    const echo = echoOnce(running);
    const entry = contextPadEntry(running, "b", "append-context");

    pointer(entry, "click", centreOfBox(entry), { detail: 1 });
    expect(echo()).toBeDefined();
    const appendedText = running.modeler.exportText();
    const appended = addedContextId(running);
    await echo();
    await nextTasks();

    expect(running.steps).toEqual(["menu", "import", "menu"]);
    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(1);
    expect(running.modeler.exportText()).toBe(appendedText);
    expect(selectedIds(running)).toEqual([appended]);
    expect(service<ContextPad>(running, "contextPad").isOpen(shape(running, appended))).toBe(true);
    expect(popupTarget(running)).toBe(shape(running, appended));
    expect(document.querySelector(".djs-popup-title")?.textContent).toBe("Subdomain type");

    chooseInMenu("type-core");
    expect(running.changes()).toBe(2);
    expect(exportedContext(running, appended)).toMatchObject({ subdomainType: "core" });
  });

  test("an append dragged from the context pad, the subdomain-type menu it opens included", async () => {
    const running = await stage();
    const echo = echoOnce(running);
    const entry = contextPadEntry(running, "b", "append-context");
    const start = centreOfBox(entry);
    entry.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, ...start }));
    const onCanvas = clientPoint(running, FREE_SPOT);
    hoverCanvasAt(running, onCanvas);
    pointer(document, "mousemove", shifted(onCanvas, 10, 0));
    pointer(document, "mouseup", shifted(onCanvas, 10, 0));
    expect(echo()).toBeDefined();
    const appended = addedContextId(running);
    await echo();
    await nextTasks();

    expect(running.steps).toEqual(["menu", "import", "menu"]);
    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(1);
    expect(popupTarget(running)).toBe(shape(running, appended));
  });

  test("a keyboard create from the palette, its name editor included", async () => {
    const running = await stage();
    const echo = echoOnce(running);

    paletteEntry(running, "context.core").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }),
    );
    expect(echo()).toBeDefined();
    const created = addedContextId(running);
    await echo();
    await nextTasks();

    expect(running.steps).toEqual(["editor", "import", "editor"]);
    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(1);
    expectEditorOnLiveElement(running, created);
    expect(selectedIds(running)).toEqual([created]);

    editorContent(running).innerText = "Billing";
    directEditing(running).complete();
    expect(running.changes()).toBe(2);
    expect(exportedContext(running, created)?.label).toBe("Billing");
  });

  test.each([
    {
      commit: "Enter",
      event: () =>
        new KeyboardEvent("keydown", {
          key: "Enter",
          keyCode: 13,
          bubbles: true,
          cancelable: true,
        }),
    },
    { commit: "leaving the field", event: () => new FocusEvent("focusout", { bubbles: true }) },
  ])("a label commit with $commit, which closes the editor", async ({ event }) => {
    const running = await stage();
    const echo = echoOnce(running);
    typeNameOfA(running, "Billing");

    editorContent(running).dispatchEvent(event());
    expect(echo()).toBeDefined();
    await echo();
    await nextTasks();

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(1);
    expect(exportedContext(running, "a")?.label).toBe("Billing");
    expect(labelEditing(running).openEdit()).toBeUndefined();
    expect(container(running).querySelector(".djs-direct-editing-content")).toBeNull();
  });

  test("a toggle in the integration-roles menu, which keeps the menu open", async () => {
    const running = await stage();
    const echo = echoOnce(running);
    const entry = contextPadEntry(running, "r", "roles");
    pointer(entry, "click", centreOfBox(entry), { detail: 1 });

    chooseInMenu("upstream-OHS");
    expect(echo()).toBeDefined();
    await echo();
    await nextTasks();

    expect(running.steps).toEqual(["menu", "menu", "import", "menu"]);
    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(1);
    expect(popupTarget(running)).toBe(shape(running, "r"));
    expect(document.querySelector(".djs-popup-title")?.textContent).toBe("Integration roles");

    chooseInMenu("upstream-PL");
    expect(running.changes()).toBe(2);
    expect(exported(running).relationships[0]).toMatchObject({ upstreamRoles: ["OHS", "PL"] });
  });

  test("a press on another context that commits the label, whose move the import ends", async () => {
    const running = await stage();
    const echoes = echoEach(running);
    const reported = interactionChanges(running);
    typeNameOfA(running, "Billing");
    running.steps.length = 0;

    await pressAndMoveB(running, () => {
      expect(echoes.calls).toHaveLength(1);
      expect(running.steps).toEqual([]);
    });
    await Promise.all(echoes.calls);

    expect(running.steps).toEqual(["import"]);
    expect(echoes.calls).toHaveLength(1);
    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(1);
    expect(exportedContext(running, "a")?.label).toBe("Billing");
    expect(exportedContext(running, "b")?.position.x).toBe(450);
    expect(service<Dragging>(running, "dragging").context()).toBeFalsy();
    expect(reported).toEqual([]);
  });

  test("a press that commits the description prompt, whose move the import ends", async () => {
    const running = await stage();
    const echoes = echoEach(running);
    const field = typeDescriptionOfA(running, "Purpose");
    expect(document.activeElement).toBe(field);
    running.steps.length = 0;

    // The browser moves the focus after the press has run, which commits the prompt.
    await pressAndMoveB(running, () => svg(running).focus());
    await Promise.all(echoes.calls);

    expect(running.steps).toEqual(["import"]);
    expect(echoes.calls).toHaveLength(1);
    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(1);
    expect(exportedContext(running, "a")?.description).toBe("Purpose");
    expect(exportedContext(running, "b")?.position.x).toBe(450);
    expect(service<Dragging>(running, "dragging").context()).toBeFalsy();
  });

  test("a peer's text imported during a press that committed a label ends the press, and nothing is reported after it", async () => {
    const running = await stage();
    let lastReported: string | undefined;
    running.modeler.onContentChanged(() => (lastReported = running.modeler.exportText()));
    typeNameOfA(running, "Billing");
    let peerImport: Promise<unknown> | undefined;
    let peer = "";

    await pressAndMoveB(running, () => {
      expect(running.changes()).toBe(1);
      expect(running.modeler.interaction.active()).toBe(false);
      peer = peerText(running);
      peerImport = running.modeler.importText(peer);
    });
    await peerImport;

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(1);
    expect(lastReported).toBeDefined();
    expect(running.modeler.exportText()).toBe(peer);
    expect(exportedContext(running, "b")?.position.x).toBe(450);
    expect(exportedContext(running, "c")?.label).toBe("C by a peer");
  });

  test("a click on a creating palette entry that commits the label, whose create the import ends", async () => {
    const running = await stage();
    const echoes = echoEach(running);
    const reported = interactionChanges(running);
    typeNameOfA(running, "Billing");

    const entry = paletteEntry(running, "context.supporting");
    pointer(entry, "click", centreOfBox(entry), { detail: 1 });
    expect(echoes.calls).toHaveLength(1);
    expect(running.errors).toEqual([]);
    expect(service<Dragging>(running, "dragging").context()?.prefix).toBe("create");
    expect(running.modeler.interaction.active()).toBe(true);
    await Promise.all(echoes.calls);
    expect(service<Dragging>(running, "dragging").context()).toBeFalsy();
    expect(running.modeler.interaction.active()).toBe(false);

    const drop = clientPoint(running, FREE_SPOT);
    hoverCanvasAt(running, drop);
    pointer(svg(running), "mousedown", drop);
    pointer(document, "mouseup", drop);
    await nextTasks();

    expect(echoes.calls).toHaveLength(1);
    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(1);
    expect(reported).toEqual([true, false]);
    expect(exportedContext(running, "a")?.label).toBe("Billing");
    expect(exported(running).contexts).toHaveLength(3);
  });

  test("a click on the lasso tool that commits the label leaves the tool armed", async () => {
    const running = await stage();
    const echo = echoOnce(running);
    typeNameOfA(running, "Billing");

    const entry = paletteEntry(running, "lasso-tool");
    pointer(entry, "click", centreOfBox(entry), { detail: 1 });
    expect(echo()).toBeDefined();
    await echo();

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(1);
    expect(exportedContext(running, "a")?.label).toBe("Billing");
    expect(service<Dragging>(running, "dragging").context()?.prefix).toBe("lasso.selection");
    expect(running.modeler.interaction.active()).toBe(false);
  });

  test("a peer's import after the append has finished closes its subdomain-type menu", async () => {
    const running = await stage();
    const entry = contextPadEntry(running, "b", "append-context");
    pointer(entry, "click", centreOfBox(entry), { detail: 1 });
    await nextTasks();
    expect(document.querySelector(".djs-popup-title")?.textContent).toBe("Subdomain type");

    await running.modeler.importText(peerText(running));
    await nextTasks();

    expect(running.steps).toEqual(["menu", "import"]);
    expect(service<PopupMenu>(running, "popupMenu").isOpen()).toBe(false);
    expect(exportedContext(running, "c")?.label).toBe("C by a peer");
  });

  test("a peer's import after a roles toggle has finished closes the integration-roles menu", async () => {
    const running = await stage();
    const entry = contextPadEntry(running, "r", "roles");
    pointer(entry, "click", centreOfBox(entry), { detail: 1 });
    chooseInMenu("upstream-OHS");
    await nextTasks();
    expect(document.querySelector(".djs-popup-title")?.textContent).toBe("Integration roles");

    await running.modeler.importText(peerText(running));
    await nextTasks();

    expect(running.steps).toEqual(["menu", "menu", "import"]);
    expect(service<PopupMenu>(running, "popupMenu").isOpen()).toBe(false);
    expect(exported(running).relationships[0]).toMatchObject({ upstreamRoles: ["OHS"] });
  });

  test("an import that waits for the action rejects once the modeler is destroyed", async () => {
    const running = await stage();
    const echo = echoOnce(running);
    const entry = contextPadEntry(running, "b", "append-context");
    pointer(entry, "click", centreOfBox(entry), { detail: 1 });

    running.modeler.destroy();

    await expect(echo()).rejects.toThrow(/destroyed/);
    expect(running.errors).toEqual([]);
  });
});

function commandStack(stage: Stage): CommandStack {
  return service<CommandStack>(stage, "commandStack");
}

function modeling(stage: Stage): Modeling {
  return service<Modeling>(stage, "modeling");
}

function select(stage: Stage, id: string): void {
  service<Selection>(stage, "selection").select(shape(stage, id) as DiagramElement);
}

/** A host that imports `text` once, from the first selection change after this call. */
function importOnSelection(stage: Stage, text: string): () => Promise<unknown> | undefined {
  let reimport: Promise<unknown> | undefined;
  stage.modeler.elements.onSelection(() => {
    reimport ??= stage.modeler.importText(text);
  });
  return () => reimport;
}

/** The next edit is reported and exported, and its undo goes back to the imported text only. */
function expectTheNextEditApplied(stage: Stage, imported: string): void {
  const changesBefore = stage.changes();
  modeling(stage).moveElements([shape(stage, "c")], { x: 40, y: 0 });
  expect(stage.changes()).toBe(changesBefore + 1);
  expect(exportedContext(stage, "c")?.position.x).toBe(490);
  commandStack(stage).undo();
  expect(stage.modeler.exportText()).toBe(imported);
  expect(commandStack(stage).canUndo()).toBe(false);
}

interface DeselectingCommand {
  what: string;
  /** Selects the context the command removes; returns the command. */
  prepare(stage: Stage): () => void;
}

// diagram-js deselects an element its canvas removes, inside the command and before its change.
const DESELECTING_COMMANDS: DeselectingCommand[] = [
  {
    what: "a delete of the selected context from its context pad",
    prepare(stage) {
      const entry = contextPadEntry(stage, "b", "delete");
      return () => pointer(entry, "click", centreOfBox(entry), { detail: 1 });
    },
  },
  {
    what: "an undo of the create of the selected context",
    prepare(stage) {
      const context = service<CmElementFactory>(stage, "cmElementFactory").createNewContext(
        "core",
        "Billing",
      );
      const created = modeling(stage).createShape(
        context as unknown as Shape,
        { x: 900, y: 450 },
        service<Canvas>(stage, "canvas").getRootElement() as Shape,
      );
      select(stage, created.id);
      return () => commandStack(stage).undo();
    },
  },
  {
    what: "a redo of the delete of the selected context",
    prepare(stage) {
      modeling(stage).removeElements([shape(stage, "b")]);
      commandStack(stage).undo();
      select(stage, "b");
      return () => commandStack(stage).redo();
    },
  },
];

describe("an import from the selection listener inside a command, an undo or a redo waits until it has finished", () => {
  test.each(DESELECTING_COMMANDS)(
    "$what: the command runs whole, then the import replaces its result",
    async ({ prepare }) => {
      const running = await stage();
      const run = prepare(running);
      await nextTasks();
      const changesBefore = running.changes();
      const imported = peerText(running);
      const reimport = importOnSelection(running, imported);
      running.steps.length = 0;

      run();
      expect(reimport()).toBeDefined();
      expect(running.steps).not.toContain("import");
      expect(running.errors).toEqual([]);
      await reimport();
      await nextTasks();

      expect(running.steps).toEqual(["import"]);
      expect(running.errors).toEqual([]);
      expect(running.changes()).toBe(changesBefore + 1);
      expect(running.modeler.exportText()).toBe(imported);
      expect(commandStack(running).canUndo()).toBe(false);
      expect(commandStack(running).canRedo()).toBe(false);
      expectTheNextEditApplied(running, imported);
    },
  );
});

interface DragStart {
  what: string;
  /** Activates a drag; its start deselects context A. */
  start(stage: Stage): void;
}

const DRAG_STARTS_WHILE_A_IS_SELECTED: DragStart[] = [
  {
    what: "a move of another context",
    start(stage) {
      const from = centreOfShape(stage, "b");
      pointer(hitArea(stage, "b"), "mousedown", from);
      pointer(document, "mousemove", shifted(from, 20, 0));
    },
  },
  {
    what: "a create from the palette",
    start(stage) {
      const entry = paletteEntry(stage, "context.supporting");
      pointer(entry, "click", centreOfBox(entry), { detail: 1 });
    },
  },
];

describe("an import from the selection listener at a drag's start runs once diagram-js has started the drag, and ends it", () => {
  test("a move of another context, whose start deselects the selected one", async () => {
    const running = await stage();
    const reported = interactionChanges(running);
    select(running, "a");
    const imported = peerText(running);
    const reimport = importOnSelection(running, imported);
    const start = centreOfShape(running, "b");

    pointer(hitArea(running, "b"), "mousedown", start);
    expect(reimport()).toBeUndefined();
    pointer(document, "mousemove", shifted(start, 20, 0));
    expect(reimport()).toBeDefined();
    expect(running.errors).toEqual([]);
    expect(service<Dragging>(running, "dragging").context()?.prefix).toBe("shape.move");
    expect(running.modeler.interaction.active()).toBe(true);
    await reimport();
    expect(service<Dragging>(running, "dragging").context()).toBeFalsy();

    hoverCanvasAt(running, shifted(start, 60, 0));
    pointer(document, "mouseup", shifted(start, 60, 0));
    await nextTasks();

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(0);
    expect(reported).toEqual([true, false]);
    expect(running.modeler.exportText()).toBe(imported);
    expect(exportedContext(running, "b")?.position.x).toBe(450);
    expectTheNextEditApplied(running, imported);
  });

  test("a create from the palette while a context is selected", async () => {
    const running = await stage();
    const reported = interactionChanges(running);
    select(running, "a");
    const imported = peerText(running);
    const reimport = importOnSelection(running, imported);

    const entry = paletteEntry(running, "context.supporting");
    pointer(entry, "click", centreOfBox(entry), { detail: 1 });
    expect(reimport()).toBeDefined();
    expect(running.errors).toEqual([]);
    expect(service<Dragging>(running, "dragging").context()?.prefix).toBe("create");
    expect(running.modeler.interaction.active()).toBe(true);
    await reimport();
    expect(service<Dragging>(running, "dragging").context()).toBeFalsy();

    const drop = clientPoint(running, FREE_SPOT);
    hoverCanvasAt(running, drop);
    pointer(svg(running), "mousedown", drop);
    pointer(document, "mouseup", drop);
    await nextTasks();

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(0);
    expect(reported).toEqual([true, false]);
    expect(running.modeler.exportText()).toBe(imported);
    expect(exported(running).contexts).toHaveLength(3);
    expectTheNextEditApplied(running, imported);
  });

  test.each(DRAG_STARTS_WHILE_A_IS_SELECTED)(
    "$what: an import called after the one that waits, in the same task, runs after it",
    async ({ start }) => {
      const running = await stage();
      select(running, "a");
      const waiting = importOnSelection(running, peerText(running, "C by the first peer"));
      const later = peerText(running, "C by the second peer");
      const settled: string[] = [];

      start(running);
      expect(waiting()).toBeDefined();
      void waiting()?.then(() => settled.push("first"));
      await running.modeler.importText(later).then(() => settled.push("second"));
      await nextTasks();

      expect(running.errors).toEqual([]);
      expect(settled).toEqual(["first", "second"]);
      expect(running.steps.filter((step) => step === "import")).toHaveLength(2);
      expect(running.modeler.exportText()).toBe(later);
      expect(service<Dragging>(running, "dragging").context()).toBeFalsy();
      expect(running.changes()).toBe(0);
      expectTheNextEditApplied(running, later);
    },
  );

  test("an import from the interaction listener when the move starts", async () => {
    const running = await stage();
    const imported = peerText(running);
    let reimport: Promise<unknown> | undefined;
    running.modeler.interaction.onChange((active) => {
      if (active) reimport ??= running.modeler.importText(imported);
    });
    const reported = interactionChanges(running);
    const start = centreOfShape(running, "b");

    pointer(hitArea(running, "b"), "mousedown", start);
    pointer(document, "mousemove", shifted(start, 20, 0));
    expect(reimport).toBeDefined();
    expect(running.errors).toEqual([]);
    expect(service<Dragging>(running, "dragging").context()?.prefix).toBe("shape.move");
    await reimport;
    expect(service<Dragging>(running, "dragging").context()).toBeFalsy();

    hoverCanvasAt(running, shifted(start, 60, 0));
    pointer(document, "mouseup", shifted(start, 60, 0));
    await nextTasks();

    expect(running.errors).toEqual([]);
    expect(running.changes()).toBe(0);
    expect(reported).toEqual([true, false]);
    expect(running.modeler.exportText()).toBe(imported);
    expectTheNextEditApplied(running, imported);
  });

  test("a first move that a listener aborts leaves no import waiting", async () => {
    const running = await stage();
    const failure = new Error("a listener of the first move failed");
    service<EventBus>(running, "eventBus").once("drag.move", () => {
      throw failure;
    });
    const imported = peerText(running);
    const start = centreOfShape(running, "b");
    pointer(hitArea(running, "b"), "mousedown", start);
    pointer(document, "mousemove", shifted(start, 20, 0));
    await nextTasks(1);

    const settled = await Promise.race([
      running.modeler.importText(imported).then(() => "settled"),
      nextTasks(5).then(() => "pending"),
    ]);

    expect(settled).toBe("settled");
    expect(running.errors).toEqual([failure]);
    expect(running.modeler.exportText()).toBe(imported);
    expect(service<Dragging>(running, "dragging").context()).toBeFalsy();
  });
});

/**
 * Read before the destroy, since a service read afterwards would build a fresh diagram: once the
 * input's handler has returned, the modeler is destroyed, no error reached the window, the drag
 * and the canvas are gone, the release runs no command, and the modeler keeps its text.
 */
function destroyedCleanly(running: Stage): () => Promise<void> {
  const dragging = service<Dragging>(running, "dragging");
  let commands = 0;
  service<EventBus>(running, "eventBus").on("commandStack.changed", () => (commands += 1));
  const canvas = svg(running);
  const release = clientPoint(running, FREE_SPOT);
  const before = running.modeler.exportText();
  return async () => {
    await nextTasks(1);
    expect(running.errors).toEqual([]);
    expect(dragging.context()).toBeFalsy();
    expect(canvas.isConnected).toBe(false);
    pointer(document, "mouseup", release);
    await nextTasks(1);
    expect(running.errors).toEqual([]);
    expect(commands).toBe(0);
    expect(running.modeler.interaction.active()).toBe(false);
    expect(running.modeler.exportText()).toBe(before);
  };
}

describe("a destroy from a listener at a drag's start throws nothing, and nothing reaches the host afterwards (#346)", () => {
  test.each(DRAG_STARTS_WHILE_A_IS_SELECTED)(
    "$what, from the selection listener: the listener hears nothing more",
    async ({ start }) => {
      const running = await stage();
      select(running, "a");
      const expectDestroyedCleanly = destroyedCleanly(running);
      const reported = interactionChanges(running);
      const heard: string[][] = [];
      running.modeler.elements.onSelection((ids) => {
        heard.push(ids);
        running.modeler.destroy();
      });

      start(running);
      expect(heard).toEqual([[]]);
      await expectDestroyedCleanly();
      expect(heard).toEqual([[]]);
      expect(reported).toEqual([]);
    },
  );

  test.each(DRAG_STARTS_WHILE_A_IS_SELECTED)(
    "$what, from the interaction listener: no later listener hears of it",
    async ({ start }) => {
      const running = await stage();
      const expectDestroyedCleanly = destroyedCleanly(running);
      running.modeler.interaction.onChange(() => running.modeler.destroy());
      const later = interactionChanges(running);

      start(running);
      await expectDestroyedCleanly();
      expect(later).toEqual([]);
    },
  );
});
