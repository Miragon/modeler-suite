import type { ModuleDeclaration } from "didi";
import type CommandStack from "diagram-js/lib/command/CommandStack";

import ConnectionPreviewModule from "diagram-js/lib/features/connection-preview";
import ModelingModule from "diagram-js/lib/features/modeling";
import MoveModule from "diagram-js/lib/features/move";
import OutlineModule from "diagram-js/lib/features/outline";

import { NavigatedViewer } from "./NavigatedViewer.js";
import { cmModelingModule } from "./modeling/index.js";
import { cmRulesModule } from "./rules/index.js";
import { cmBehaviorsModule } from "./behaviors/index.js";
import { cmPaletteModule } from "./palette/index.js";
import { cmHoverTooltipTeardownModule } from "./palette/CmHoverTooltipTeardown.js";
import { cmContextPadModule } from "./context-pad/index.js";
import { cmLabelEditingModule } from "./label-editing/index.js";
import { cmKeyboardModule } from "./keyboard/index.js";
import { cmValidationModule } from "./validation/index.js";
import { cmZOrderModule } from "./zorder/index.js";
import { cmReadOnlyModule } from "./read-only/index.js";
import { cmGestureCancelModule } from "./gesture-cancel/index.js";

/**
 * Full Context Maps editor: palette/create, move, connect with rules,
 * context pad, inline label editing, undo/redo, and the edit lock for a
 * document the host cannot take edits for (`cmReadOnly`). Boxes are
 * fixed-size — no resize feature.
 */
export class Modeler extends NavigatedViewer {
  protected override _getModules(): ModuleDeclaration[] {
    return [
      ...super._getModules(),
      // diagram-js stock
      ConnectionPreviewModule,
      ModelingModule,
      MoveModule,
      OutlineModule,
      // Context Maps editor
      cmReadOnlyModule,
      cmModelingModule,
      cmRulesModule,
      cmBehaviorsModule,
      cmPaletteModule,
      cmHoverTooltipTeardownModule,
      cmContextPadModule,
      cmLabelEditingModule,
      cmKeyboardModule,
      cmValidationModule,
      cmZOrderModule,
      cmGestureCancelModule,
    ];
  }

  undo(): void {
    this.get<CommandStack>("commandStack").undo();
  }

  redo(): void {
    this.get<CommandStack>("commandStack").redo();
  }

  canUndo(): boolean {
    return this.get<CommandStack>("commandStack").canUndo();
  }

  canRedo(): boolean {
    return this.get<CommandStack>("commandStack").canRedo();
  }
}
