import { afterAll, afterEach, describe, expect, test } from 'vitest';
import {
  attachedHost,
  registerConformance,
  type ConformanceHarness,
  type GestureKind,
  type HeldGesture,
  type HeldPan,
} from '@miragon/modeler-api/conformance';
import type { CollaborativeModeler } from '@miragon/modeler-api';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Shape } from 'diagram-js/lib/model/Types';
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeDiagram,
  type DomainModeling,
  type LabelEditing,
  type NodeFactory,
  type NodeShape,
} from '../../src/index.js';
import orders from './fixtures/orders.__EXT__?raw';
import ordersLoose from './fixtures/orders.loose.__EXT__?raw';
import ordersForeign from './fixtures/orders.foreign.__EXT__?raw';
import payments from './fixtures/payments.__EXT__?raw';

const hosts: HTMLElement[] = [];

afterEach(() => {
  for (const host of hosts.splice(0)) host.parentElement?.remove();
});

function mountedHost(): HTMLElement {
  const host = attachedHost();
  hosts.push(host);
  return host;
}

function diagramOf(modeler: CollaborativeModeler): CollaborativeDiagram['diagram'] {
  return (modeler as CollaborativeDiagram).diagram;
}

// Shared across instances: every call creates a node with a label of its own, so the kit's
// collision case compares the ids two peers allocate for DIFFERENT elements.
let createdNodes = 0;

function addNode(modeler: CollaborativeModeler): void {
  const diagram = diagramOf(modeler);
  createdNodes += 1;
  const node = diagram.get<NodeFactory>('nodeFactory').createNew(`Node ${createdNodes}`);
  const root = diagram.get<Canvas>('canvas').getRootElement() as Shape;
  diagram.get<Modeling>('modeling').createShape(node, { x: 900, y: 500 }, root);
}

function nodeToEdit(modeler: CollaborativeModeler): NodeShape {
  const node = diagramOf(modeler).get<ElementRegistry>('elementRegistry').get('order');
  if (!node) throw new Error('the imported document has no node "order"');
  return node as NodeShape;
}

function labelField(modeler: CollaborativeModeler): HTMLTextAreaElement {
  const field = diagramOf(modeler)
    .get<Canvas>('canvas')
    .getContainer()
    .querySelector<HTMLTextAreaElement>('textarea.diagram-label-editor');
  if (!field) throw new Error('no label editor is open');
  return field;
}

interface Point {
  x: number;
  y: number;
}

/** Below the nodes of `orders`, inside the view the import fits: where a create lands. */
const FREE_SPOT: Point = { x: 360, y: 260 };

/** Real pointer events on the canvas of `modeler`, at points in diagram coordinates. */
function pointerOn(modeler: CollaborativeModeler) {
  const canvas = diagramOf(modeler).get<Canvas>('canvas');
  const svg = canvas.getContainer().querySelector<SVGSVGElement>(':scope > svg');
  if (!svg) throw new Error('the canvas has no svg');
  const client = (point: Point) => {
    const rect = canvas.getContainer().getBoundingClientRect();
    const viewbox = canvas.viewbox();
    return {
      clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
      clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
    };
  };
  const fire = (type: string, target: EventTarget, at: Point, init: MouseEventInit = {}): void => {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...client(at), ...init }),
    );
  };
  return {
    svg,
    client,
    press: (target: EventTarget, at: Point) => fire('mousedown', target, at),
    moveTo: (at: Point) => fire('mousemove', document, at),
    /** The pointer enters the canvas there: diagram-js takes a drop target from the hover events. */
    hover(at: Point): void {
      fire('mouseover', svg, at);
      fire('mousemove', document, at);
    },
    release: (at: Point) => fire('mouseup', document, at),
    /** A pointer click on a palette entry; returns its centre in diagram coordinates. */
    clickPalette(action: string): Point {
      const entry = diagramOf(modeler).container.querySelector(
        `.djs-palette [data-action="${action}"]`,
      );
      if (!entry) throw new Error(`no palette entry ${action}`);
      const box = entry.getBoundingClientRect();
      const rect = canvas.getContainer().getBoundingClientRect();
      const viewbox = canvas.viewbox();
      const at = {
        x: viewbox.x + (box.left + box.width / 2 - rect.left) / viewbox.scale,
        y: viewbox.y + (box.top + box.height / 2 - rect.top) / viewbox.scale,
      };
      fire('click', entry, at, { detail: 1 });
      return at;
    },
  };
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
}

/**
 * The kit's gestures on `orders`: a move of the node "order" past the drag threshold, a create
 * from the palette held over free canvas, or still over the palette. A drop lands where it
 * applies, so the create held over the palette is brought onto the canvas first.
 */
function startGesture(modeler: CollaborativeModeler, kind: GestureKind): HeldGesture {
  const pointer = pointerOn(modeler);
  if (kind === 'move') {
    const node = nodeToEdit(modeler);
    const start = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    const target = { x: start.x + 60, y: start.y + 160 };
    pointer.press(
      diagramOf(modeler).get<ElementRegistry>('elementRegistry').getGraphics(node),
      start,
    );
    pointer.moveTo({ x: start.x + 20, y: start.y + 40 });
    pointer.moveTo({ x: start.x + 40, y: start.y + 80 });
    return {
      drop() {
        pointer.hover(target);
        pointer.release(target);
      },
      cancel: pressEscape,
    };
  }
  const at = pointer.clickPalette('create.node');
  if (kind === 'create') pointer.hover(FREE_SPOT);
  else pointer.moveTo({ x: at.x + 4, y: at.y + 4 });
  return {
    drop() {
      pointer.hover(FREE_SPOT);
      pointer.release(FREE_SPOT);
    },
    cancel: pressEscape,
  };
}

/** One step of the kit's pan, in screen pixels. */
const PAN_STEP = 40;

/** A pan with the palette's hand tool, pressed on free canvas and moved one step at a time. */
function startPan(modeler: CollaborativeModeler): HeldPan {
  const pointer = pointerOn(modeler);
  const at = pointer.clickPalette('hand-tool');
  pointer.hover({ x: at.x + 60, y: at.y + 60 });
  pointer.hover(FREE_SPOT);
  const { clientX, clientY } = pointer.client(FREE_SPOT);
  let steps = 0;
  const fire = (type: string, target: EventTarget): void => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: clientX + steps * PAN_STEP,
        clientY,
      }),
    );
  };
  fire('mousedown', pointer.svg);
  steps = 1;
  fire('mousemove', document);
  return {
    move() {
      steps += 1;
      fire('mousemove', document);
    },
    drop() {
      fire('mouseup', document);
    },
  };
}

const harness: ConformanceHarness = {
  async create() {
    const modeler = createCollaborativeModeler();
    modeler.attachTo(mountedHost());
    return modeler;
  },
  async createReadonly() {
    const viewer = createCollaborativeViewer();
    viewer.attachTo(mountedHost());
    return viewer;
  },
  // Two DISTINCT texts, reviewed byte by byte: the undo law needs a second document.
  canonicalTexts: [orders, payments],
  looseTexts: [ordersLoose],
  invalidTexts: ['node order "Twice" [0, 0]\nnode order "Twice" [200, 0]\n'],
  foreignTexts: [
    { text: ordersForeign, mustSurvive: ['x-vendor: keep-me', '# owner team-orders'] },
  ],
  // damaged forms the parser meets while a peer types, on top of the probes the kit derives
  probeTexts: ['node order "Place', 'node order "Place order" [40,', 'title'],
  viewState: { x: 120, y: 80, width: 640, height: 480 },
  mutate: addNode,
  configMutations: [
    {
      name: 'title',
      run: (modeler) => {
        const modeling = diagramOf(modeler).get<DomainModeling>('domainModeling');
        modeling.setTitle(`${modeling.getTitle() ?? 'Untitled'} (edited)`);
      },
    },
  ],
  undo: (modeler) => diagramOf(modeler).get<CommandStack>('commandStack').undo(),
  redo: (modeler) => diagramOf(modeler).get<CommandStack>('commandStack').redo(),
  moveElement(modeler) {
    const node = nodeToEdit(modeler);
    diagramOf(modeler).get<Modeling>('modeling').moveElements([node], { x: 160, y: 120 });
    return node.id;
  },
  // The same input on every call: the kit compares the commit with and without a view change.
  openInteraction(modeler) {
    diagramOf(modeler).get<LabelEditing>('labelEditing').activate(nodeToEdit(modeler));
    labelField(modeler).value = 'typed, not committed';
  },
  interactionState: (modeler) => diagramOf(modeler).get<LabelEditing>('labelEditing').openEdit(),
  commitInteraction(modeler) {
    labelField(modeler).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  },
  startGesture,
  // the palette's lasso, armed and waiting for its next press over the canvas
  armTool(modeler) {
    const pointer = pointerOn(modeler);
    const at = pointer.clickPalette('lasso-tool');
    pointer.moveTo({ x: at.x + 60, y: at.y + 60 });
  },
  startPan,
  exportImage: (modeler) => diagramOf(modeler).saveSVG().svg,
  settle: () => new Promise((resolve) => setTimeout(resolve, 30)),
};

const advisories: string[] = [];

describe('the renderer implements the collaborative-modeler contract', () => {
  // Every hook is filled, so a skip is a gap of this harness; a new case of a later kit release
  // names the field it needs.
  registerConformance(harness, test, {
    onSkip(caseName, reason) {
      throw new Error(`conformance case skipped: "${caseName}": ${reason}`);
    },
    onAdvisory(caseName, advice) {
      advisories.push(`${caseName}: ${advice}`);
    },
  });

  // The renderer follows every recommendation, so an advisory is a regression to look at.
  afterAll(() => {
    expect(advisories).toEqual([]);
  });
});
