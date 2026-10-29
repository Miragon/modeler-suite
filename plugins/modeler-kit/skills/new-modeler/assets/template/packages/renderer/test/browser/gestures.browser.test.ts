import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachedHost } from '@miragon/modeler-api/conformance';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Dragging from 'diagram-js/lib/features/dragging/Dragging';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { Shape } from 'diagram-js/lib/model/Types';
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeDiagram,
  type Gestures,
  type LabelEditing,
  type NodeFactory,
  type NodeShape,
} from '../../src/index.js';
import orders from './fixtures/orders.__EXT__?raw';
import payments from './fixtures/payments.__EXT__?raw';

interface Point {
  x: number;
  y: number;
}

interface ClientPoint {
  clientX: number;
  clientY: number;
}

/** The kinds of the kit's planned `startGesture` (packages/api README, "Cases for the 1.5 surfaces"). */
type GestureKind = 'move' | 'create' | 'createOffCanvas';

interface HeldGesture {
  /** Releases the pointer where the gesture is. */
  drop(): void;
  /** Escape, as the user cancels it. */
  cancel(): void;
}

const GESTURE_KINDS: readonly GestureKind[] = ['move', 'create', 'createOffCanvas'];
const INVALID_TEXT = 'node order "Twice" [0, 0]\nnode order "Twice" [200, 0]\n';
/** Below the nodes of `orders`, inside the view the import fits. */
const FREE_SPOT: Point = { x: 360, y: 260 };

let modeler: CollaborativeDiagram;
let changes = 0;
let errors: unknown[] = [];
let createdNodes = 0;

function recordError(event: ErrorEvent): void {
  errors.push(event.error);
}

/**
 * The next task, where a user's next input comes: the action of the input before has finished, and
 * an edit an import took down has opened again.
 */
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  modeler = createCollaborativeModeler();
  modeler.attachTo(attachedHost());
  await modeler.importText(orders);
  changes = 0;
  errors = [];
  modeler.onContentChanged(() => (changes += 1));
  window.addEventListener('error', recordError);
});

afterEach(() => {
  window.removeEventListener('error', recordError);
  modeler.destroy();
  for (const wrapper of document.querySelectorAll('body > div')) wrapper.remove();
});

function service<T>(name: string): T {
  return modeler.diagram.get<T>(name);
}

function node(id: string): NodeShape {
  const found = service<ElementRegistry>('elementRegistry').get(id);
  if (!found) throw new Error(`no node ${id}`);
  return found as NodeShape;
}

function centreOf(id: string): Point {
  const { x, y, width, height } = node(id);
  return { x: x + width / 2, y: y + height / 2 };
}

function client(point: Point): ClientPoint {
  const canvas = service<Canvas>('canvas');
  const rect = canvas.getContainer().getBoundingClientRect();
  const viewbox = canvas.viewbox();
  return {
    clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
    clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
  };
}

function pointer(type: string, at: Point, init: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...client(at),
    ...init,
  });
}

function press(target: EventTarget, at: Point, init: MouseEventInit = {}): void {
  target.dispatchEvent(pointer('mousedown', at, init));
}

function moveTo(at: Point): void {
  document.dispatchEvent(pointer('mousemove', at));
}

/** What the browser fires when the pointer enters an element's graphics (diagram-js hover). */
function hover(target: EventTarget, at: Point): void {
  target.dispatchEvent(pointer('mouseover', at));
  moveTo(at);
}

function release(at: Point): void {
  document.dispatchEvent(pointer('mouseup', at));
}

function escape(): void {
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
}

function canvasSvg(): SVGSVGElement {
  const svg = service<Canvas>('canvas').getContainer().querySelector<SVGSVGElement>(':scope > svg');
  if (!svg) throw new Error('the canvas has no svg');
  return svg;
}

function graphics(id: string): SVGElement {
  return service<ElementRegistry>('elementRegistry').getGraphics(node(id));
}

/** A palette entry, and its centre in diagram coordinates, where a pointer clicks it. */
function paletteEntry(action: string): { entry: Element; at: Point } {
  const entry = modeler.diagram.container.querySelector(`.djs-palette [data-action="${action}"]`);
  if (!entry) throw new Error(`no palette entry ${action}`);
  const box = entry.getBoundingClientRect();
  const canvas = service<Canvas>('canvas');
  const rect = canvas.getContainer().getBoundingClientRect();
  const viewbox = canvas.viewbox();
  return {
    entry,
    at: {
      x: viewbox.x + (box.left + box.width / 2 - rect.left) / viewbox.scale,
      y: viewbox.y + (box.top + box.height / 2 - rect.top) / viewbox.scale,
    },
  };
}

function clickPalette(action: string): Point {
  const { entry, at } = paletteEntry(action);
  entry.dispatchEvent(pointer('click', at, { detail: 1 }));
  return at;
}

/** The prefix of the running drag: a palette tool that waits for its next press runs one too. */
function dragPrefix(): string | undefined {
  return (service<Dragging>('dragging').context() as { prefix: string } | null)?.prefix;
}

/** Holds a gesture on `orders` the way a user does: the kit's planned harness field. */
function startGesture(kind: GestureKind): HeldGesture {
  if (kind === 'move') {
    const start = centreOf('order');
    const target = { x: start.x + 60, y: start.y + 160 };
    press(graphics('order'), start);
    moveTo({ x: start.x + 20, y: start.y + 40 });
    moveTo({ x: start.x + 40, y: start.y + 80 });
    return {
      drop() {
        hover(canvasSvg(), target);
        release(target);
      },
      cancel: escape,
    };
  }
  const at = clickPalette('create.node');
  if (kind === 'create') hover(canvasSvg(), FREE_SPOT);
  else moveTo({ x: at.x + 4, y: at.y + 4 });
  return {
    drop() {
      hover(canvasSvg(), FREE_SPOT);
      release(FREE_SPOT);
    },
    cancel: escape,
  };
}

/** Arms the palette's lasso without pressing: the kit's planned `armTool`. */
function armTool(): void {
  const at = clickPalette('lasso-tool');
  moveTo({ x: at.x + 60, y: at.y + 60 });
}

function addNode(): Shape {
  createdNodes += 1;
  const created = service<NodeFactory>('nodeFactory').createNew(`Node ${createdNodes}`);
  const root = service<Canvas>('canvas').getRootElement() as Shape;
  return service<Modeling>('modeling').createShape(created, { x: 900, y: 500 }, root);
}

function recordInteraction(): boolean[] {
  const calls: boolean[] = [];
  modeler.interaction.onChange((active) => calls.push(active));
  return calls;
}

/** The import replaced the document and the gesture applied nothing, also on its release. */
function expectImportOnly(text: string): void {
  expect(errors).toEqual([]);
  expect(changes).toBe(0);
  expect(modeler.exportText()).toBe(text);
  service<CommandStack>('commandStack').undo();
  expect(changes).toBe(0);
  expect(modeler.exportText()).toBe(text);
  addNode();
  expect(changes).toBe(1);
}

describe('an accepted import ends a running gesture the way Escape does', () => {
  for (const kind of GESTURE_KINDS) {
    for (const [which, text] of [
      ['another document', payments],
      ['the same document again', orders],
    ] as const) {
      it(`${kind}, importing ${which}`, async () => {
        const gesture = startGesture(kind);
        // A peer's text arrives after the input that started the drag; one in its task waits.
        await nextTask();
        expect(modeler.interaction.active()).toBe(true);
        const calls = recordInteraction();

        const imported = modeler.importText(text);
        expect(dragPrefix()).toBeUndefined();
        expect(modeler.interaction.active()).toBe(false);
        expect(calls).toEqual([false]);
        await imported;
        gesture.drop();

        expectImportOnly(text);
        expect(modeler.diagram.container.querySelector('.djs-drag-group')).toBeNull();
      });
    }
  }

  it('a press that has not reached the drag threshold yet', async () => {
    const start = centreOf('order');
    press(graphics('order'), start);
    moveTo({ x: start.x + 2, y: start.y });
    expect(dragPrefix()).toBe('shape.move');
    expect(modeler.interaction.active()).toBe(false);

    await modeler.importText(payments);
    expect(dragPrefix()).toBeUndefined();
    moveTo({ x: start.x + 80, y: start.y });
    release({ x: start.x + 80, y: start.y });

    expectImportOnly(payments);
  });

  it('a lasso drawn with Shift and a press on the canvas', async () => {
    const start = { x: 20, y: 200 };
    press(canvasSvg(), start, { shiftKey: true });
    moveTo({ x: 300, y: 20 });
    expect(dragPrefix()).toBe('lasso');

    await modeler.importText(orders);
    moveTo({ x: 700, y: 20 });
    release({ x: 700, y: 20 });

    expect(service<Selection>('selection').get()).toEqual([]);
    expectImportOnly(orders);
  });

  it('a rejected import leaves the gesture running, and its drop applies', async () => {
    const gesture = startGesture('move');
    const calls = recordInteraction();

    await expect(modeler.importText(INVALID_TEXT)).rejects.toThrow();
    expect(dragPrefix()).toBe('shape.move');
    expect(modeler.interaction.active()).toBe(true);
    expect(calls).toEqual([]);
    gesture.drop();

    expect(errors).toEqual([]);
    expect(changes).toBe(1);
    expect(calls).toEqual([false]);
    expect(node('order').x).toBe(100);
  });
});

describe('a drag that holds no element runs on through an import', () => {
  it('the lasso the palette armed stays armed for the next press', async () => {
    armTool();
    const calls = recordInteraction();

    await modeler.importText(payments);
    expect(dragPrefix()).toBe('lasso.selection');
    expect(modeler.interaction.active()).toBe(false);
    expect(calls).toEqual([]);

    const start = { x: 20, y: 160 };
    hover(canvasSvg(), start);
    press(canvasSvg(), start);
    expect(dragPrefix()).toBe('lasso');
  });

  it('the hand the palette armed stays armed', async () => {
    const at = clickPalette('hand-tool');
    moveTo({ x: at.x + 60, y: at.y + 60 });

    await modeler.importText(payments);
    expect(dragPrefix()).toBe('hand');
    expect(modeler.interaction.active()).toBe(false);
  });

  /** Presses the hand tool on the canvas and pans by 60 px; returns where the pointer is. */
  function startPan(): ClientPoint {
    const at = clickPalette('hand-tool');
    const start = { x: 300, y: 200 };
    hover(canvasSvg(), { x: at.x + 60, y: at.y + 60 });
    hover(canvasSvg(), start);
    press(canvasSvg(), start);
    moveTo({ x: start.x + 30, y: start.y });
    const pointerAt = client({ x: start.x + 60, y: start.y });
    panTo(pointerAt);
    expect(dragPrefix()).toBe('hand.move');
    return pointerAt;
  }

  /** A move in client pixels, so the point does not follow the view the pan changes. */
  function panTo({ clientX, clientY }: ClientPoint): void {
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX, clientY }));
  }

  it("the hand tool's pan goes on from the view the import fitted", async () => {
    const calls = recordInteraction();
    const { clientX, clientY } = startPan();

    await modeler.importText(payments);
    expect(dragPrefix()).toBe('hand.move');
    const fitted = service<Canvas>('canvas').viewbox();
    panTo({ clientX: clientX + 40, clientY });
    const panned = service<Canvas>('canvas').viewbox();

    expect(panned.x).toBeCloseTo(fitted.x - 40 / fitted.scale, 3);
    expect(panned.y).toBeCloseTo(fitted.y, 3);
    expect(modeler.interaction.active()).toBe(false);
    expect(calls).toEqual([]);
    expect(changes).toBe(0);
  });

  it('the pan goes on from the view a host restores after the import (L5)', async () => {
    const { clientX, clientY } = startPan();
    const before = service<Canvas>('canvas').viewbox();
    const snapshot = modeler.getViewState();

    await modeler.importText(payments);
    modeler.setViewState(snapshot);
    const restored = service<Canvas>('canvas').viewbox();
    panTo({ clientX: clientX + 40, clientY });
    const panned = service<Canvas>('canvas').viewbox();

    expect(restored.x).toBeCloseTo(before.x, 3);
    expect(restored.y).toBeCloseTo(before.y, 3);
    expect(panned.x).toBeCloseTo(restored.x - 40 / restored.scale, 3);
    expect(panned.y).toBeCloseTo(restored.y, 3);
    expect(dragPrefix()).toBe('hand.move');
  });

  it('the pan goes on from a view the host sets while it runs', () => {
    const { clientX, clientY } = startPan();
    const { x, y, width, height } = service<Canvas>('canvas').viewbox();
    modeler.setViewState({ x: x + 500, y: y - 300, width: width * 2, height: height * 2 });
    const changed = service<Canvas>('canvas').viewbox();
    panTo({ clientX: clientX + 40, clientY: clientY + 20 });
    const panned = service<Canvas>('canvas').viewbox();

    expect(panned.x).toBeCloseTo(changed.x - 40 / changed.scale, 3);
    expect(panned.y).toBeCloseTo(changed.y - 20 / changed.scale, 3);
  });
});

describe('an import called during a user action waits until the action has finished (#248, #285)', () => {
  /** What the board looked like to every listener of the drop: replaced by an import or not. */
  function watchDrop(): { importsDuringDrop: number; endings: string[] } {
    const watch = { importsDuringDrop: 0, endings: [] as string[] };
    let dropping = false;
    const eventBus = service<EventBus>('eventBus');
    // A diagram-js listener that returns a value stops the event: this one returns nothing.
    eventBus.on('drag.end', 200_000, () => {
      dropping = true;
    });
    eventBus.on(['drag.ended', 'drag.canceled'], 1, (event: { type: string }) => {
      watch.endings.push(event.type);
      dropping = false;
    });
    eventBus.on('import.render.start', () => {
      if (dropping) watch.importsDuringDrop += 1;
    });
    return watch;
  }

  it('a move with a node selected before the drag, onto a document without the moved node', async () => {
    const watch = watchDrop();
    let reimport: Promise<unknown> | undefined;
    let settled = false;
    modeler.onContentChanged(() => {
      reimport ??= modeler.importText(payments).then(() => (settled = true));
    });
    service<Selection>('selection').select(node('pay'));

    startGesture('move').drop();
    expect(reimport).toBeDefined();
    expect(settled).toBe(false);
    expect(watch.endings).toEqual(['drag.ended']);
    await reimport;

    expect(errors).toEqual([]);
    expect(watch.importsDuringDrop).toBe(0);
    expect(modeler.exportText()).toBe(payments);
  });

  for (const kind of ['create', 'createOffCanvas'] as const) {
    it(`a ${kind} whose change a host imports back as it is`, async () => {
      const watch = watchDrop();
      let reimport: Promise<unknown> | undefined;
      modeler.onContentChanged(() => {
        reimport ??= modeler.importText(modeler.exportText());
      });

      startGesture(kind).drop();
      const created = modeler.exportText();
      await reimport;

      expect(errors).toEqual([]);
      expect(watch.importsDuringDrop).toBe(0);
      expect(watch.endings).toEqual(['drag.ended']);
      expect(changes).toBe(1);
      expect(modeler.exportText()).toBe(created);
      expect(modeler.elements.list()).toHaveLength(4);
    });
  }

  it('imports run in call order, also one called after the drop while an earlier one waits', async () => {
    const order: string[] = [];
    const imports: Array<Promise<unknown>> = [];
    modeler.onContentChanged(() => {
      if (imports.length > 0) return;
      imports.push(
        modeler.importText(payments).then(() => order.push('payments')),
        modeler.importText(orders).then(() => order.push('orders')),
      );
    });

    startGesture('move').drop();
    imports.push(modeler.importText(payments).then(() => order.push('payments again')));
    await Promise.all(imports);

    expect(order).toEqual(['payments', 'orders', 'payments again']);
    expect(modeler.exportText()).toBe(payments);
    expect(errors).toEqual([]);
  });

  it('a rejected text rejects once the drop has ended, which applied', async () => {
    let reimport: Promise<unknown> | undefined;
    modeler.onContentChanged(() => {
      reimport ??= modeler.importText(INVALID_TEXT);
    });

    startGesture('move').drop();

    await expect(reimport).rejects.toThrow();
    expect(errors).toEqual([]);
    expect(changes).toBe(1);
    expect(node('order').x).toBe(100);
  });

  it("the diagram's own importText leaves a drop that is applied to finish", async () => {
    const watch = watchDrop();
    let echoed = false;
    modeler.onContentChanged(() => {
      if (echoed) return;
      echoed = true;
      modeler.diagram.importText(modeler.exportText());
    });

    startGesture('move').drop();

    expect(echoed).toBe(true);
    expect(errors).toEqual([]);
    expect(watch.endings).toEqual(['drag.ended']);
    expect(node('order').x).toBe(100);
  });

  /** A host that imports its own change back as it is, once; returns that import. */
  function echoOnce(): () => Promise<unknown> | undefined {
    let reimport: Promise<unknown> | undefined;
    modeler.onContentChanged(() => {
      reimport ??= modeler.importText(modeler.exportText());
    });
    return () => reimport;
  }

  /** How many imports have rendered so far. */
  function countImports(): { rendered: number } {
    const count = { rendered: 0 };
    service<EventBus>('eventBus').on('import.render.start', () => (count.rendered += 1));
    return count;
  }

  function labelField(): HTMLTextAreaElement {
    const field = modeler.diagram.container.querySelector<HTMLTextAreaElement>(
      'textarea.diagram-label-editor',
    );
    if (!field) throw new Error('no label editor is open');
    return field;
  }

  function editLabel(id: string, text: string): void {
    service<LabelEditing>('labelEditing').activate(node(id));
    labelField().value = text;
  }

  function commitLabel(text: string): void {
    labelField().value = text;
    labelField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  /** Enter or Space on the palette's creating entry: the shell's synthetic click, detail 0. */
  function createWithKeyboard(): void {
    const { entry } = paletteEntry('create.node');
    entry.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
  }

  for (const [count, which] of [
    [1, 'one import'],
    [2, 'two imports'],
  ] as const) {
    it(`a keyboard create: the name typed after ${which} from its change lands`, async () => {
      const imports: Array<Promise<unknown>> = [];
      modeler.onContentChanged(() => {
        if (imports.length > 0) return;
        const text = modeler.exportText();
        for (let index = 0; index < count; index += 1) imports.push(modeler.importText(text));
      });
      const watch = countImports();

      createWithKeyboard();
      const opened = service<LabelEditing>('labelEditing').openEdit();
      expect(imports).toHaveLength(count);
      expect(watch.rendered).toBe(0);
      await Promise.all(imports);
      await nextTask();

      expect(watch.rendered).toBe(count);
      expect(opened).toBeDefined();
      expect(service<LabelEditing>('labelEditing').openEdit()?.elementId).toBe(opened?.elementId);
      commitLabel('Typed name');

      expect(errors).toEqual([]);
      expect(changes).toBe(2);
      expect(node(opened?.elementId ?? '').elementLabel).toBe('Typed name');
      expect(modeler.exportText()).toContain('"Typed name"');
    });
  }

  it('an import that fails to render reopens the edit it took down, and no later import does', async () => {
    const labelEditing = service<LabelEditing>('labelEditing');
    editLabel('pay', 'Typed, not committed');
    const importer = service<{ import(document: unknown): void }>('importer');
    const render = importer.import.bind(importer);
    let failures = 1;
    importer.import = (document) => {
      if (failures === 0) return render(document);
      failures -= 1;
      throw new Error('render failed');
    };

    await expect(modeler.importText(payments)).rejects.toThrow('render failed');
    await nextTask();
    expect(modeler.exportText()).toBe(orders);
    expect(labelEditing.openEdit()).toEqual({ elementId: 'pay', text: 'Typed, not committed' });

    labelEditing.cancel();
    await modeler.importText(orders);
    await nextTask();
    expect(labelEditing.openEdit()).toBeUndefined();
    expect(changes).toBe(0);
  });

  it('a label commit at a press on another node: the import ends the drag the press started', async () => {
    const reimport = echoOnce();
    const watch = countImports();
    editLabel('pay', 'Paid');

    const start = centreOf('order');
    press(graphics('order'), start);
    expect(reimport()).toBeDefined();
    expect(watch.rendered).toBe(0);
    expect(dragPrefix()).toBe('shape.move');
    await reimport();
    expect(dragPrefix()).toBeUndefined();
    moveTo({ x: start.x + 20, y: start.y + 40 });
    moveTo({ x: start.x + 60, y: start.y + 160 });
    release({ x: start.x + 60, y: start.y + 160 });

    expect(errors).toEqual([]);
    expect(changes).toBe(1);
    expect(node('pay').elementLabel).toBe('Paid');
    expect(node('order').x).toBe(40);
    expect(modeler.interaction.active()).toBe(false);
  });

  it('a label commit at the start of a palette create: the import ends the create, without an error', async () => {
    const reimport = echoOnce();
    const watch = countImports();
    editLabel('pay', 'Paid');

    const gesture = startGesture('create');
    expect(reimport()).toBeDefined();
    expect(watch.rendered).toBe(0);
    expect(modeler.interaction.active()).toBe(true);
    await reimport();
    expect(modeler.interaction.active()).toBe(false);
    gesture.drop();

    expect(errors).toEqual([]);
    expect(changes).toBe(1);
    expect(node('pay').elementLabel).toBe('Paid');
    expect(modeler.elements.list()).toHaveLength(3);
  });

  describe('an import from the selection listener inside a command waits for the command', () => {
    /**
     * Runs `command` while a host imports `text` from the first selection change it hears, then
     * expects the command's one change, the imported text, and a next edit that applies and undoes.
     */
    async function expectImportAfterTheCommand(text: string, command: () => void): Promise<void> {
      let reimport: Promise<unknown> | undefined;
      modeler.elements.onSelection(() => {
        reimport ??= modeler.importText(text);
      });
      const watch = countImports();
      changes = 0;

      command();
      expect(reimport).toBeDefined();
      expect(watch.rendered).toBe(0);
      await reimport;

      expect(errors).toEqual([]);
      expect(changes).toBe(1);
      expect(modeler.exportText()).toBe(text);
      expect(canvasSvg().querySelectorAll('.djs-shape')).toHaveLength(
        modeler.elements.list().length,
      );
      addNode();
      expect(changes).toBe(2);
      service<CommandStack>('commandStack').undo();
      expect(modeler.exportText()).toBe(text);
    }

    it('the Delete key on a selected node', async () => {
      service<Selection>('selection').select(node('pay'));
      service<Canvas>('canvas').focus();

      await expectImportAfterTheCommand(orders, () =>
        canvasSvg().dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
        ),
      );
    });

    it('an undo of the create of a selected node', async () => {
      service<Selection>('selection').select(addNode());
      await nextTask();
      const created = modeler.exportText();

      await expectImportAfterTheCommand(created, () =>
        service<CommandStack>('commandStack').undo(),
      );
    });

    it('a redo of the delete of a selected node', async () => {
      service<Modeling>('modeling').removeShape(node('pay'));
      service<CommandStack>('commandStack').undo();
      service<Selection>('selection').select(node('pay'));
      await nextTask();
      const restored = modeler.exportText();

      await expectImportAfterTheCommand(restored, () =>
        service<CommandStack>('commandStack').redo(),
      );
    });
  });

  describe("an import from the selection listener at a drag's start runs once the drag has started (#336)", () => {
    for (const kind of GESTURE_KINDS) {
      it(`a ${kind} while a node is selected: the import ends it, without an error`, async () => {
        service<Selection>('selection').select(node('pay'));
        let reimport: Promise<unknown> | undefined;
        // diagram-js clears the selection as it starts the drag, inside its own `move`.
        modeler.elements.onSelection(() => {
          reimport ??= modeler.importText(modeler.exportText());
        });
        const watch = countImports();

        const gesture = startGesture(kind);
        expect(reimport).toBeDefined();
        expect(watch.rendered).toBe(0);
        expect(modeler.interaction.active()).toBe(true);
        await reimport;
        expect(watch.rendered).toBe(1);
        expect(modeler.interaction.active()).toBe(false);
        expect(dragPrefix()).toBeUndefined();
        gesture.drop();

        expectImportOnly(orders);
        expect(modeler.diagram.container.querySelector('.djs-drag-group')).toBeNull();
      });
    }

    it('an import in the task that starts a drag waits for that task, then ends the drag', async () => {
      const gesture = startGesture('move');
      const imported = modeler.importText(payments);
      expect(modeler.exportText()).toBe(orders);
      expect(modeler.interaction.active()).toBe(true);
      await imported;
      expect(modeler.interaction.active()).toBe(false);
      gesture.drop();

      expectImportOnly(payments);
    });
  });

  it('a step the action scheduled for later holds the import until it has run', async () => {
    const gestures = service<Gestures>('gestures');
    let stepFoundItsNode: boolean | undefined;
    // A follow-up of the drop, the way a popup or a label editor opens after an append.
    service<EventBus>('eventBus').on('shape.move.end', (event: { shape: NodeShape }) => {
      const moved = event.shape;
      const release = gestures.holdAction();
      setTimeout(() => {
        stepFoundItsNode = service<ElementRegistry>('elementRegistry').get(moved.id) === moved;
        release();
      }, 0);
    });
    const reimport = echoOnce();

    startGesture('move').drop();
    await reimport();

    expect(stepFoundItsNode).toBe(true);
    expect(errors).toEqual([]);
    expect(node('order').x).toBe(100);
  });

  it('an import waiting for a step that never runs rejects once the modeler is destroyed', async () => {
    service<Gestures>('gestures').holdAction();
    const imported = modeler.importText(payments);
    modeler.destroy();
    await expect(imported).rejects.toThrow('destroyed');
  });

  it('an import in the task of a command waits for that task, also one called after the command', async () => {
    addNode();
    const imported = modeler.importText(payments);
    expect(modeler.exportText()).not.toBe(payments);
    await imported;
    expect(modeler.exportText()).toBe(payments);
  });

  it('an import outside a user action runs at once, also right after the task of a command', async () => {
    void modeler.importText(payments);
    expect(modeler.exportText()).toBe(payments);
    addNode();
    await nextTask();
    void modeler.importText(orders);
    expect(modeler.exportText()).toBe(orders);
  });
});

describe('interaction (contract 1.5)', () => {
  it('is false before the first import and at rest', async () => {
    const fresh = createCollaborativeModeler();
    expect(fresh.interaction.active()).toBe(false);
    fresh.attachTo(attachedHost());
    expect(fresh.interaction.active()).toBe(false);
    await fresh.importText(orders);
    expect(fresh.interaction.active()).toBe(false);
    fresh.destroy();
    expect(modeler.interaction.active()).toBe(false);
  });

  for (const kind of GESTURE_KINDS) {
    for (const ending of ['drop', 'cancel'] as const) {
      it(`follows a ${kind} until its ${ending}, with one call each way`, () => {
        const calls: Array<[boolean, boolean]> = [];
        modeler.interaction.onChange((active) =>
          calls.push([active, modeler.interaction.active()]),
        );

        const gesture = startGesture(kind);
        expect(modeler.interaction.active()).toBe(true);
        expect(calls).toEqual([[true, true]]);
        gesture[ending]();

        expect(modeler.interaction.active()).toBe(false);
        expect(calls).toEqual([
          [true, true],
          [false, false],
        ]);
        expect(changes).toBe(ending === 'drop' ? 1 : 0);
      });
    }
  }

  it('is false while a palette tool is only armed, and calls nothing', () => {
    const calls = recordInteraction();
    armTool();
    expect(dragPrefix()).toBe('lasso.selection');
    expect(modeler.interaction.active()).toBe(false);
    expect(calls).toEqual([]);
  });

  it('stops calling once unsubscribed', () => {
    const calls: boolean[] = [];
    const unsubscribe = modeler.interaction.onChange((active) => calls.push(active));
    startGesture('move').cancel();
    unsubscribe();
    startGesture('move').cancel();
    expect(calls).toEqual([true, false]);
  });

  it('reports a listener that throws and keeps the gesture as it was', () => {
    const reported: unknown[] = [];
    const listener = (event: ErrorEvent) => {
      reported.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', listener);
    modeler.interaction.onChange(() => {
      throw new Error('a host listener failed');
    });
    const calls = recordInteraction();

    startGesture('move').drop();
    window.removeEventListener('error', listener);

    expect(reported).toHaveLength(2);
    expect(calls).toEqual([true, false]);
    expect(changes).toBe(1);
    errors = [];
  });

  it('calls nothing after destroy, a running gesture included', () => {
    const calls = recordInteraction();
    startGesture('move');
    modeler.destroy();
    expect(calls).toEqual([true]);
    expect(modeler.interaction.active()).toBe(false);
  });

  it('is false on the viewer, which has no editing gesture', async () => {
    const viewer = createCollaborativeViewer();
    viewer.attachTo(attachedHost());
    await viewer.importText(orders);
    const unsubscribe = viewer.interaction.onChange(() => {
      throw new Error('the viewer has no gesture');
    });
    expect(viewer.interaction.active()).toBe(false);
    unsubscribe();
    viewer.destroy();
  });
});
