import type { ModuleDeclaration } from 'didi';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import KeyboardMoveSelectionModule from 'diagram-js/lib/features/keyboard-move-selection';
import ModelingModule from 'diagram-js/lib/features/modeling';
import MoveModule from 'diagram-js/lib/features/move';
import OutlineModule from 'diagram-js/lib/features/outline';
import KeyboardMoveModule from 'diagram-js/lib/navigation/keyboard-move';
import { NavigatedViewer } from './NavigatedViewer.js';
import { gesturesModule } from './gestures/index.js';
import { keyboardModule } from './keyboard/index.js';
import { labelEditingModule } from './label-editing/index.js';
import { domainModelingModule } from './modeling/index.js';
import { paletteModule } from './palette/index.js';
import { readOnlyModule } from './read-only/index.js';
import { rulesModule } from './rules/index.js';

/** The editor: the navigated viewer plus editing, with the canvas lock of an invalid file. */
export class Modeler extends NavigatedViewer {
  protected override modules(): ModuleDeclaration[] {
    return [
      ...super.modules(),
      ModelingModule,
      MoveModule,
      OutlineModule,
      KeyboardMoveModule,
      KeyboardMoveSelectionModule,
      readOnlyModule,
      domainModelingModule,
      rulesModule,
      paletteModule,
      labelEditingModule,
      keyboardModule,
      gesturesModule,
    ];
  }

  undo(): void {
    this.get<CommandStack>('commandStack').undo();
  }

  redo(): void {
    this.get<CommandStack>('commandStack').redo();
  }
}
