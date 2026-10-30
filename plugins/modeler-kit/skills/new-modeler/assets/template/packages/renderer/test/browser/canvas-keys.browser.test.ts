import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachedHost } from '@miragon/modeler-api/conformance';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Dragging from 'diagram-js/lib/features/dragging/Dragging';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import {
  createCollaborativeModeler,
  type CollaborativeDiagram,
  type LabelEditing,
} from '../../src/index.js';
import orders from './fixtures/orders.__EXT__?raw';

let modeler: CollaborativeDiagram;
let host: HTMLElement;

beforeEach(async () => {
  modeler = createCollaborativeModeler();
  host = attachedHost();
  modeler.attachTo(host);
  await modeler.importText(orders);
});

afterEach(() => {
  modeler.destroy();
  host.parentElement?.remove();
});

function service<T>(name: string): T {
  return modeler.diagram.get<T>(name);
}

function canvasSvg(): SVGSVGElement {
  const svg = service<Canvas>('canvas').getContainer().querySelector<SVGSVGElement>(':scope > svg');
  if (!svg) throw new Error('the canvas has no svg');
  return svg;
}

function pressOnCanvas(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  canvasSvg().dispatchEvent(event);
  return event;
}

/** Selects `pay`, focuses the canvas and moves `pay` once, so the canvas is known to take keys. */
function focusCanvasThatTakesKeys(): string {
  service<Selection>('selection').select(service<ElementRegistry>('elementRegistry').get('pay')!);
  canvasSvg().focus();
  const imported = modeler.exportText();
  expect(pressOnCanvas({ key: 'ArrowRight' }).defaultPrevented).toBe(true);
  const before = modeler.exportText();
  expect(before).not.toBe(imported);
  return before;
}

function expectNothingChanged(before: string): void {
  expect(modeler.exportText()).toBe(before);
  expect(modeler.elements.selection()).toEqual(['pay']);
  expect(service<Dragging>('dragging').context()).toBeFalsy();
  expect(service<LabelEditing>('labelEditing').openEdit()).toBeUndefined();
}

const CANVAS_KEYS: KeyboardEventInit[] = [
  { key: 'Delete' },
  { key: 'Backspace' },
  { key: 'ArrowLeft' },
  { key: 'e' },
  { key: 'h' },
  { key: 'l' },
  { key: 'a', ctrlKey: true },
  { key: 'z', ctrlKey: true },
  { key: 'z', metaKey: true },
];

describe('keys stay on the canvas', () => {
  it.each([
    ['made it inert', () => (host.inert = true)],
    ['hid it with display: none', () => (host.style.display = 'none')],
    ['hid it with visibility: hidden', () => (host.style.visibility = 'hidden')],
  ])(
    'a key that reaches the canvas before the browser moves the focus off it passes, once the host %s',
    (_how, hide) => {
      const before = focusCanvasThatTakesKeys();

      hide();
      expect(document.activeElement).toBe(canvasSvg());
      for (const init of CANVAS_KEYS) {
        expect(pressOnCanvas(init).defaultPrevented, init.key).toBe(false);
      }

      expectNothingChanged(before);
    },
  );

  it('a key the host has handled already passes', () => {
    const before = focusCanvasThatTakesKeys();

    const handledByTheHost = (event: Event) => event.preventDefault();
    window.addEventListener('keydown', handledByTheHost, true);
    try {
      for (const init of CANVAS_KEYS) pressOnCanvas(init);
    } finally {
      window.removeEventListener('keydown', handledByTheHost, true);
    }

    expectNothingChanged(before);
  });

  it.each([
    ['while it composes', { isComposing: true }],
    ['when it confirms a candidate in Safari', { isComposing: false, keyCode: 229 }],
  ])('a key of an input method passes %s', (_when, composition) => {
    const before = focusCanvasThatTakesKeys();

    for (const init of CANVAS_KEYS) {
      expect(pressOnCanvas({ ...init, ...composition }).defaultPrevented, init.key).toBe(false);
    }

    expectNothingChanged(before);
  });
});
