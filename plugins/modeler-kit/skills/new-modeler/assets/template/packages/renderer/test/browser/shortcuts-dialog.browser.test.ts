import { afterEach, describe, expect, it } from 'vitest';
import {
  SHORTCUTS_KEY,
  createShortcutsDialog,
  type ShortcutGroup,
  type ShortcutsDialog,
  type ShortcutsDialogChrome,
  type ShortcutsDialogOptions,
} from '../../src/index.js';

/*
 * The shell draws the dialog and its kit case checks it in e2e. What the renderer owns is the data
 * it hands over and the rule for the key that opens it.
 */

interface Page {
  readonly chrome: ShortcutsDialogChrome;
  readonly dialog: ShortcutsDialog;
  readonly canvas: HTMLElement;
  readonly shown: ShortcutGroup[][];
  readonly screen: { startScreenShown: boolean };
}

const mounted: Array<{ root: HTMLElement; dialog: ShortcutsDialog }> = [];

afterEach(() => {
  for (const { root, dialog } of mounted.splice(0)) {
    dialog.destroy();
    root.remove();
  }
});

/** A chrome as the shell's handle gives it: a root, a start screen and a dialog that records. */
function mount(options: ShortcutsDialogOptions = { shortcutsKey: SHORTCUTS_KEY }): Page {
  const root = document.createElement('div');
  const canvas = document.createElement('div');
  canvas.tabIndex = 0;
  root.append(canvas);
  document.body.append(root);
  const shown: ShortcutGroup[][] = [];
  const screen = { startScreenShown: false };
  let open = false;
  const chrome: ShortcutsDialogChrome = {
    root,
    platform: 'other',
    lang: 'en',
    messages: {
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      zoomToActual: (percent) => `Zoom to ${percent}`,
      fit: 'Fit',
      keyNames: { ctrl: 'Ctrl', shift: 'Shift', plus: 'Plus', minus: 'Minus' },
    },
    showShortcutsDialog(groups) {
      shown.push([...groups]);
      open = true;
      return {
        isOpen: () => open,
        close: () => {
          open = false;
        },
      };
    },
    isEmptyStateShown: () => screen.startScreenShown,
  };
  const dialog = createShortcutsDialog(chrome, options);
  mounted.push({ root, dialog });
  return { chrome, dialog, canvas, shown, screen };
}

/** Presses the key on `target`; false when a listener prevented it. */
function press(target: Element, init: KeyboardEventInit = {}): boolean {
  return target.dispatchEvent(
    new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true, ...init }),
  );
}

describe('the keyboard shortcuts dialog', () => {
  it('opens on its key from the canvas and prevents it', () => {
    const page = mount();
    expect(press(page.canvas, { shiftKey: true })).toBe(false);
    expect(page.dialog.isOpen()).toBe(true);
    expect(page.shown).toHaveLength(1);
  });

  it('opens from the menu entry, shows what is open and closes', () => {
    const page = mount();
    expect(page.dialog.isOpen()).toBe(false);
    page.dialog.open();
    expect(page.dialog.isOpen()).toBe(true);
    page.dialog.close();
    expect(page.dialog.isOpen()).toBe(false);
  });

  it('hands the shell the rows of the diagram, its key in a Help group', () => {
    const page = mount();
    page.dialog.open();
    const [groups] = page.shown;
    expect(groups?.map((group) => group.title)).toEqual(['Edit', 'Tools', 'View', 'Help']);
    expect(groups?.at(-1)?.rows).toEqual([{ action: 'Keyboard shortcuts', keys: ['?'] }]);
  });

  it('leaves modified, composed and already handled keys alone', () => {
    const page = mount();
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(press(page.canvas, modifier)).toBe(true);
    }
    expect(press(page.canvas, { isComposing: true })).toBe(true);
    const handled = (event: Event) => event.preventDefault();
    window.addEventListener('keydown', handled, true);
    try {
      press(page.canvas);
    } finally {
      window.removeEventListener('keydown', handled, true);
    }
    expect(page.dialog.isOpen()).toBe(false);
  });

  it('leaves the key to text fields', () => {
    const page = mount();
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    const fields = [
      document.createElement('input'),
      document.createElement('textarea'),
      document.createElement('select'),
      editable,
    ];
    page.chrome.root.append(...fields);
    for (const field of fields) expect(press(field)).toBe(true);
    expect(page.dialog.isOpen()).toBe(false);
  });

  it('leaves the key to code editors: an EditContext editor and a Monaco editor', () => {
    const page = mount();
    const monaco = page.chrome.root.appendChild(document.createElement('div'));
    monaco.className = 'monaco-editor';
    const editors = [monaco.appendChild(document.createElement('div'))];
    const EditContext = (window as { EditContext?: new () => object }).EditContext;
    if (EditContext) {
      const editor = page.chrome.root.appendChild(document.createElement('div'));
      editors.push(Object.assign(editor, { editContext: new EditContext() }));
    }
    for (const editor of editors) expect(press(editor)).toBe(true);
    expect(page.dialog.isOpen()).toBe(false);
  });

  it('opens nothing over another dialog or the start screen', () => {
    const page = mount();
    const popover = document.createElement('div');
    popover.setAttribute('role', 'dialog');
    page.chrome.root.append(popover);
    expect(press(page.canvas)).toBe(true);
    popover.hidden = true;
    page.screen.startScreenShown = true;
    expect(press(page.canvas)).toBe(true);
    expect(page.dialog.isOpen()).toBe(false);
    page.screen.startScreenShown = false;
    expect(press(page.canvas)).toBe(false);
    expect(page.dialog.isOpen()).toBe(true);
  });

  it('without a key listens to nothing and lists no Help group', () => {
    const page = mount({});
    expect(press(page.canvas)).toBe(true);
    expect(page.dialog.isOpen()).toBe(false);
    page.dialog.open();
    expect(page.shown[0]?.map((group) => group.title)).toEqual(['Edit', 'Tools', 'View']);
  });

  it('stops listening once destroyed', () => {
    const page = mount();
    page.dialog.destroy();
    expect(press(page.canvas)).toBe(true);
    expect(page.shown).toHaveLength(0);
  });
});
