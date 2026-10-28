import { afterEach, describe, expect, it } from 'vitest';
import { attachedHost } from '@miragon/modeler-api/conformance';
import type { AppearanceRequest } from '@miragon/modeler-api';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import {
  THEMES,
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeDiagram,
  type DomainModeling,
  type LabelEditing,
  type NodeShape,
} from '../../src/index.js';
import orders from './fixtures/orders.__EXT__?raw';
import payments from './fixtures/payments.__EXT__?raw';

const COLOUR_PROPERTIES = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'outline-color',
  'fill',
  'stroke',
] as const;

const mounted: CollaborativeDiagram[] = [];

afterEach(() => {
  for (const modeler of mounted.splice(0)) modeler.destroy();
  for (const wrapper of document.querySelectorAll('body > div')) wrapper.remove();
  document.documentElement.removeAttribute('data-cd-theme');
  document.documentElement.removeAttribute('data-cd-kontrast');
});

async function mount(
  factory: typeof createCollaborativeModeler = createCollaborativeModeler,
): Promise<CollaborativeDiagram> {
  const modeler = factory();
  mounted.push(modeler);
  modeler.attachTo(attachedHost());
  await modeler.importText(orders);
  return modeler;
}

function rootOf(modeler: CollaborativeDiagram): HTMLElement {
  return modeler.diagram.container;
}

/** The computed colours of every element the modeler drew into its host. */
function colours(modeler: CollaborativeDiagram): string[] {
  const host = rootOf(modeler).parentElement!;
  return [...host.querySelectorAll('*')].map((element) => {
    const style = getComputedStyle(element);
    return COLOUR_PROPERTIES.map((property) => style.getPropertyValue(property)).join(' ');
  });
}

function setPage(theme: 'dark' | undefined, highContrast: boolean): void {
  const html = document.documentElement;
  if (theme) html.setAttribute('data-cd-theme', theme);
  else html.removeAttribute('data-cd-theme');
  if (highContrast) html.setAttribute('data-cd-kontrast', 'hoch');
  else html.removeAttribute('data-cd-kontrast');
}

describe('appearance (contract 1.5)', () => {
  it('lists light only, the one constant, on every read, instance and the viewer', async () => {
    const modeler = await mount();
    const viewer = await mount(createCollaborativeViewer);
    expect(THEMES).toEqual(['light']);
    expect(Object.isFrozen(THEMES)).toBe(true);
    expect(modeler.appearance.themes).toBe(THEMES);
    expect(modeler.appearance.themes).toBe(modeler.appearance.themes);
    expect(viewer.appearance.themes).toBe(THEMES);
  });

  it('applies before attachTo and before the first import, and holds across imports', async () => {
    const modeler = createCollaborativeModeler();
    mounted.push(modeler);
    modeler.appearance.set({ theme: 'dark', contrast: 'high' });
    expect(rootOf(modeler).getAttribute('data-cd-theme')).toBe('light');
    expect(rootOf(modeler).getAttribute('data-cd-kontrast')).toBe('hoch');

    modeler.attachTo(attachedHost());
    await modeler.importText(orders);
    await modeler.importText(payments);

    expect(rootOf(modeler).getAttribute('data-cd-theme')).toBe('light');
    expect(rootOf(modeler).getAttribute('data-cd-kontrast')).toBe('hoch');
  });

  it('draws nothing of its own until the first set', async () => {
    const modeler = await mount();
    expect(rootOf(modeler).hasAttribute('data-cd-theme')).toBe(false);
    expect(rootOf(modeler).hasAttribute('data-cd-kontrast')).toBe(false);
  });

  it('replaces the whole request on each call, and an unknown one falls back to light', async () => {
    const modeler = await mount();
    const root = rootOf(modeler);
    const requests: Array<[unknown, string, string | null]> = [
      [{ theme: 'light', contrast: 'high' }, 'light', 'hoch'],
      [{ theme: 'light' }, 'light', null],
      [{ theme: 'dark', contrast: 'high' }, 'light', 'hoch'],
      [{ theme: 'dark', contrast: 'normal' }, 'light', null],
      [{ theme: 'sepia', contrast: 'loud' }, 'light', null],
      [null, 'light', null],
      [42, 'light', null],
    ];
    for (const [request, theme, contrast] of requests) {
      expect(() => modeler.appearance.set(request as AppearanceRequest)).not.toThrow();
      expect(root.getAttribute('data-cd-theme')).toBe(theme);
      expect(root.getAttribute('data-cd-kontrast')).toBe(contrast);
    }
  });

  it('is view state: the document, the exports, the history, the view and the selection stay', async () => {
    const modeler = await mount();
    let changes = 0;
    modeler.onContentChanged(() => (changes += 1));
    modeler.diagram.get<DomainModeling>('domainModeling').setTitle('Orders (edited)');
    modeler.elements.reveal('pay');
    modeler.setViewState({ x: 120, y: 80, width: 640, height: 480 });
    const before = {
      text: modeler.exportText(),
      svg: modeler.diagram.saveSVG().svg,
      view: modeler.getViewState(),
      selection: modeler.elements.selection(),
      canUndo: modeler.diagram.get<CommandStack>('commandStack').canUndo(),
    };
    changes = 0;

    for (const request of [
      { theme: 'light', contrast: 'high' },
      { theme: 'dark' },
      { theme: 'dark', contrast: 'high' },
      { theme: 'sepia' },
    ]) {
      modeler.appearance.set(request as AppearanceRequest);
      expect(changes).toBe(0);
      expect(modeler.exportText()).toBe(before.text);
      expect(modeler.diagram.saveSVG().svg).toBe(before.svg);
      expect(modeler.getViewState()).toEqual(before.view);
      expect(modeler.elements.selection()).toEqual(before.selection);
      expect(modeler.diagram.get<CommandStack>('commandStack').canUndo()).toBe(before.canUndo);
    }
  });

  it('keeps an open label editor open with its typed text', async () => {
    const modeler = await mount();
    let changes = 0;
    modeler.onContentChanged(() => (changes += 1));
    const labelEditing = modeler.diagram.get<LabelEditing>('labelEditing');
    const order = modeler.diagram.get<ElementRegistry>('elementRegistry').get('order');
    labelEditing.activate(order as NodeShape);
    rootOf(modeler).querySelector<HTMLTextAreaElement>('textarea')!.value = 'typed';

    modeler.appearance.set({ theme: 'dark', contrast: 'high' });

    expect(labelEditing.openEdit()).toEqual({ elementId: 'order', text: 'typed' });
    expect(changes).toBe(0);
  });

  for (const factory of [createCollaborativeModeler, createCollaborativeViewer]) {
    const mountName = factory === createCollaborativeViewer ? 'viewer' : 'modeler';
    it(`a light-only ${mountName} stays light, with the contrast requested, on a dark page`, async () => {
      const modeler = await mount(factory);
      modeler.appearance.set({ theme: 'light', contrast: 'high' });
      const highContrast = colours(modeler);
      modeler.appearance.set({ theme: 'light', contrast: 'normal' });
      const reference = { high: highContrast, normal: colours(modeler) } as const;
      expect(reference.high).not.toEqual(reference.normal);

      setPage('dark', true);
      for (const contrast of ['high', 'normal'] as const) {
        for (const theme of ['dark', 'sepia']) {
          modeler.appearance.set({ theme, contrast } as AppearanceRequest);
          expect(colours(modeler)).toEqual(reference[contrast]);
          await modeler.importText(orders);
          expect(colours(modeler)).toEqual(reference[contrast]);
        }
      }
    });
  }

  it('takes its roles from a dark page without a request, which is why hosts call set', async () => {
    const modeler = await mount();
    const light = colours(modeler);
    setPage('dark', false);
    expect(colours(modeler)).not.toEqual(light);
  });
});
