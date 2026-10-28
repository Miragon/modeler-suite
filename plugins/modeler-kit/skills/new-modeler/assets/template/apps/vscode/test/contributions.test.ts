import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface CommandContribution {
  command: string;
  title: string;
  shortTitle?: string;
  category?: string;
  icon?: string;
}
interface MenuContribution {
  command: string;
  when?: string;
  group?: string;
}
interface WalkthroughStep {
  id: string;
  description: string;
  media: { markdown: string };
  completionEvents: string[];
}

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  contributes: {
    commands: CommandContribution[];
    menus: Record<string, MenuContribution[]>;
    keybindings?: unknown;
    walkthroughs: Array<{ id: string; steps: WalkthroughStep[] }>;
  };
};
const { contributes } = manifest;
const commandById = new Map(contributes.commands.map((command) => [command.command, command]));
const ON_DIAGRAM = 'activeCustomEditorId == __NOTATION__.editor';
const ON_SOURCE = 'editorLangId == __NOTATION__';

// Guide §13.5: New (empty) and New from example as commands, in file/newFile and the walkthrough.
describe('package.json contributions', () => {
  it('offers a new empty diagram, then a new diagram from the example, in the New File menu', () => {
    expect(
      (contributes.menus['file/newFile'] ?? []).map((entry) => [
        entry.command,
        entry.group,
        commandById.get(entry.command)?.shortTitle,
      ]),
    ).toEqual([
      ['__NOTATION__.newDiagram', '__NOTATION__@1', '__DISPLAY_NAME__ Diagram'],
      [
        '__NOTATION__.newDiagramFromExample',
        '__NOTATION__@2',
        'New __DISPLAY_NAME__ Diagram from Example',
      ],
    ]);
  });

  it('titles the commands in Title Case in the modeler category', () => {
    expect(
      contributes.commands.map((command) => [command.command, command.category, command.title]),
    ).toEqual([
      ['__NOTATION__.newDiagram', '__DISPLAY_NAME__', 'New Empty Diagram'],
      ['__NOTATION__.newDiagramFromExample', '__DISPLAY_NAME__', 'New Diagram from Example'],
      ['__NOTATION__.openSource', '__DISPLAY_NAME__', 'Open Source to the Side'],
      ['__NOTATION__.openDiagram', '__DISPLAY_NAME__', 'Open Diagram to the Side'],
    ]);
  });

  it('offers the source beside a diagram and the diagram beside its source, with Codicons', () => {
    expect(commandById.get('__NOTATION__.openSource')?.icon).toBe('$(go-to-file)');
    expect(commandById.get('__NOTATION__.openDiagram')?.icon).toBe('$(open-preview)');
    expect(contributes.menus['editor/title']).toEqual([
      { command: '__NOTATION__.openSource', when: ON_DIAGRAM, group: 'navigation' },
      { command: '__NOTATION__.openDiagram', when: ON_SOURCE, group: 'navigation' },
    ]);
    expect(contributes.menus.commandPalette).toEqual([
      { command: '__NOTATION__.openSource', when: ON_DIAGRAM },
      { command: '__NOTATION__.openDiagram', when: ON_SOURCE },
    ]);
  });

  it('walks through new, example and source to the side, each completed by its command', () => {
    const [walkthrough] = contributes.walkthroughs;
    expect(walkthrough?.id).toBe('getStarted');
    const steps = walkthrough?.steps ?? [];
    expect(steps.map((step) => [step.id, step.completionEvents])).toEqual([
      ['new', ['onCommand:__NOTATION__.newDiagram']],
      ['example', ['onCommand:__NOTATION__.newDiagramFromExample']],
      ['source', ['onCommand:__NOTATION__.openSource']],
      ['learn', ['onStepSelected']],
    ]);
  });

  it('links only declared commands and existing media from the walkthrough', () => {
    for (const step of contributes.walkthroughs.flatMap((walkthrough) => walkthrough.steps)) {
      const media = new URL(`../${step.media.markdown}`, import.meta.url);
      expect(existsSync(media), step.media.markdown).toBe(true);
      const markdown = readFileSync(media, 'utf8');
      for (const [, command] of `${step.description}\n${markdown}`.matchAll(
        /\(command:([^)]+)\)/g,
      )) {
        expect(commandById.has(command!), `${step.id}: ${command}`).toBe(true);
      }
    }
  });

  it('references only declared commands in menus', () => {
    for (const entries of Object.values(contributes.menus)) {
      for (const entry of entries) expect(commandById.has(entry.command)).toBe(true);
    }
  });

  it('contributes no keybindings: the canvas keys apply while the webview has focus', () => {
    expect(contributes.keybindings).toBeUndefined();
  });
});
