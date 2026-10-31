import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { revealFileLabel } from '@miragon/modeler-shell/vscode/extension';
import { DIAGRAM_VIEW_TYPE } from '../src/diagramEditorOptions.js';
import { EMPTY_DIAGRAM, EXAMPLE_DIAGRAM } from '../src/examples.js';
import { activate } from '../src/extension.js';
import { FakeUri, fakeVsCode } from './fakeVsCode.js';

vi.mock('vscode', async () => (await import('./fakeVsCode.js')).vscodeModule);

/** The save dialog's file type: a computed key, so the name may hold a space. */
const FILE_TYPE = '__DISPLAY_NAME__';
const DIAGRAM = FakeUri.file('/diagrams/orders.__EXT__');
const PNG_BASE64 = Buffer.from('png!').toString('base64');
const subscriptions: Array<{ dispose(): unknown }> = [];

beforeEach(() => {
  fakeVsCode.reset();
  activate({
    extensionUri: FakeUri.file('/extension'),
    subscriptions,
  } as unknown as vscode.ExtensionContext);
});
afterEach(() => {
  for (const subscription of subscriptions.splice(0)) subscription.dispose();
  vi.restoreAllMocks();
});

function openDiagram(uri = DIAGRAM) {
  return fakeVsCode.openCustomEditor(DIAGRAM_VIEW_TYPE, uri, EXAMPLE_DIAGRAM);
}

function writtenTexts(): Array<[string, string]> {
  return fakeVsCode.writtenFiles.map(({ path, bytes }) => [path, Buffer.from(bytes).toString()]);
}

describe("an export of the diagram editor, through the shell's save dialog", () => {
  it.each([
    ['png', 'Export as PNG', 'PNG image'],
    ['svg', 'Export as SVG', 'SVG image'],
  ] as const)('suggests the %s beside the diagram', async (format, title, filter) => {
    const panel = await openDiagram();

    await panel.receive({ type: 'export', format, data: '' });

    expect(fakeVsCode.saveDialogs).toEqual([
      {
        title,
        saveLabel: 'Export',
        filters: { [filter]: [format] },
        defaultUri: FakeUri.file(`/diagrams/orders.${format}`),
      },
    ]);
  });

  it('suggests __NOTATION__ in the first workspace folder for a diagram that is no file', async () => {
    fakeVsCode.setWorkspaceFolder('/workspace');
    const panel = await openDiagram(new FakeUri('untitled', 'Untitled-1'));

    await panel.receive({ type: 'export', format: 'svg', data: '<svg/>' });

    expect(fakeVsCode.saveDialogs).toMatchObject([
      { defaultUri: FakeUri.file('/workspace/__NOTATION__.svg') },
    ]);
  });

  it('writes the PNG and names the file with the action that shows it', async () => {
    const reveal = revealFileLabel(process.platform);
    const target = FakeUri.file('/diagrams/orders.png');
    fakeVsCode.answer({ saveDialog: target, notification: reveal });
    const panel = await openDiagram();

    await panel.receive({ type: 'export', format: 'png', data: PNG_BASE64 });

    expect(writtenTexts()).toEqual([['/diagrams/orders.png', 'png!']]);
    expect(fakeVsCode.notifications).toEqual([
      { severity: 'info', message: 'Exported orders.png.', items: [reveal] },
    ]);
    expect(fakeVsCode.executedCommands).toEqual([['revealFileInOS', target]]);
  });

  it('warns instead of confirming when the labels of the PNG fell back to the system font', async () => {
    fakeVsCode.answer({ saveDialog: FakeUri.file('/diagrams/orders.png') });
    const panel = await openDiagram();

    await panel.receive({ type: 'export', format: 'png', data: PNG_BASE64, fontFallback: true });

    expect(fakeVsCode.notifications).toEqual([
      {
        severity: 'warning',
        message: "Exported orders.png in a system font. Geist couldn't be embedded.",
        items: [revealFileLabel(process.platform)],
      },
    ]);
  });

  it('says in its own words when the file cannot be written, and confirms nothing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fakeVsCode.answer({
      saveDialog: FakeUri.file('/diagrams/orders.png'),
      writeError: new Error('EACCES: permission denied'),
    });
    const panel = await openDiagram();

    await panel.receive({ type: 'export', format: 'png', data: PNG_BASE64 });

    expect(fakeVsCode.notifications).toEqual([
      {
        severity: 'error',
        message: "Couldn't export orders.png. Try again, or choose another folder.",
        items: [],
      },
    ]);
    expect(consoleError).toHaveBeenCalled();
  });

  it('writes and shows nothing when the save dialog is dismissed', async () => {
    const panel = await openDiagram();

    await panel.receive({ type: 'export', format: 'png', data: PNG_BASE64 });

    expect(fakeVsCode.writtenFiles).toEqual([]);
    expect(fakeVsCode.notifications).toEqual([]);
  });
});

describe('New Empty Diagram and New Diagram from Example', () => {
  it.each([
    ['__NOTATION__.newDiagram', EMPTY_DIAGRAM],
    ['__NOTATION__.newDiagramFromExample', EXAMPLE_DIAGRAM],
  ])(
    '%s writes a new file where the user says and opens it in the diagram editor',
    async (command, text) => {
      fakeVsCode.setWorkspaceFolder('/workspace');
      const target = FakeUri.file('/workspace/orders.__EXT__');
      fakeVsCode.answer({ saveDialog: target });

      await fakeVsCode.runCommand(command);

      expect(fakeVsCode.saveDialogs).toEqual([
        {
          title: 'New __DISPLAY_NAME__ Diagram',
          saveLabel: 'Create diagram',
          filters: { [FILE_TYPE]: ['__EXT__'] },
          defaultUri: FakeUri.file('/workspace/untitled.__EXT__'),
        },
      ]);
      expect(writtenTexts()).toEqual([['/workspace/orders.__EXT__', text]]);
      expect(fakeVsCode.executedCommands).toEqual([['vscode.openWith', target, DIAGRAM_VIEW_TYPE]]);
    },
  );

  it('writes and opens nothing when the save dialog is dismissed', async () => {
    await fakeVsCode.runCommand('__NOTATION__.newDiagramFromExample');

    expect(fakeVsCode.writtenFiles).toEqual([]);
    expect(fakeVsCode.executedCommands).toEqual([]);
  });

  it('says in its own words when the file cannot be written, and opens nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fakeVsCode.answer({
      saveDialog: FakeUri.file('/workspace/orders.__EXT__'),
      writeError: new Error('EROFS: read-only file system'),
    });

    await fakeVsCode.runCommand('__NOTATION__.newDiagram');

    expect(fakeVsCode.notifications).toEqual([
      {
        severity: 'error',
        message: "Couldn't create orders.__EXT__. Try again, or choose another folder.",
        items: [],
      },
    ]);
    expect(fakeVsCode.executedCommands).toEqual([]);
  });
});
