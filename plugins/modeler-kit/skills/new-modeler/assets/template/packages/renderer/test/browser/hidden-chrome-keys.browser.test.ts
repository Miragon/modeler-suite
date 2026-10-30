import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachedHost } from '@miragon/modeler-api/conformance';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import {
  createCollaborativeModeler,
  isNodeShape,
  type CollaborativeDiagram,
  type LabelEditing,
  type NodeShape,
} from '../../src/index.js';
import orders from './fixtures/orders.__EXT__?raw';

/**
 * The ways a host hides a diagram it keeps. The browser moves the focus off the hidden control only
 * at its next rendering update, so each case presses its keys at the still-focused control first.
 */
const hostHidings = [
  {
    how: 'made it inert',
    hide: (host: HTMLElement) => (host.inert = true),
    show: (host: HTMLElement) => (host.inert = false),
  },
  {
    how: 'hid it with display: none',
    hide: (host: HTMLElement) => (host.style.display = 'none'),
    show: (host: HTMLElement) => host.style.removeProperty('display'),
  },
  {
    how: 'hid it with visibility: hidden',
    hide: (host: HTMLElement) => host.style.setProperty('visibility', 'hidden'),
    show: (host: HTMLElement) => host.style.removeProperty('visibility'),
  },
];

let modeler: CollaborativeDiagram;
let host: HTMLElement;
const keysAtWindow: string[] = [];
const countKeyAtWindow = (event: KeyboardEvent) => keysAtWindow.push(event.key);

beforeEach(async () => {
  modeler = createCollaborativeModeler();
  host = attachedHost();
  modeler.attachTo(host);
  await modeler.importText(orders);
  window.addEventListener('keydown', countKeyAtWindow);
});

afterEach(() => {
  window.removeEventListener('keydown', countKeyAtWindow);
  keysAtWindow.length = 0;
  modeler.destroy();
  host.parentElement?.remove();
});

function pay(): NodeShape {
  const shape = modeler.diagram.get<ElementRegistry>('elementRegistry').get('pay');
  if (!isNodeShape(shape)) throw new Error('no node pay in the diagram');
  return shape;
}

function pressKey(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("the diagram's own chrome on a diagram the host hides", () => {
  it.each(hostHidings)(
    'the label editor neither saves nor closes once the host $how',
    ({ hide, show }) => {
      const labelEditing = modeler.diagram.get<LabelEditing>('labelEditing');
      labelEditing.activate(pay());
      const field = host.querySelector<HTMLTextAreaElement>('.diagram-label-editor')!;
      expect(document.activeElement).toBe(field);
      field.value = 'Charge';
      hide(host);

      for (const key of ['Enter', 'Escape']) {
        const before = keysAtWindow.length;
        expect(pressKey(field, key).defaultPrevented, key).toBe(false);
        expect(keysAtWindow.length, `${key} at the window`).toBe(before + 1);
      }
      expect(labelEditing.isActive()).toBe(true);
      expect(pay().elementLabel).toBe('Pay');

      show(host);
      expect(pressKey(field, 'Enter').defaultPrevented).toBe(true);
      expect(labelEditing.isActive()).toBe(false);
      expect(pay().elementLabel).toBe('Charge');
    },
  );
});
