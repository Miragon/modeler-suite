import type { ModuleDeclaration } from "didi";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import BendpointsModule from "diagram-js/lib/features/bendpoints";
import ConnectModule from "diagram-js/lib/features/connect";
import KeyboardMoveSelectionModule from "diagram-js/lib/features/keyboard-move-selection";
import MoveModule from "diagram-js/lib/features/move";
import OutlineModule from "diagram-js/lib/features/outline";
import ResizeModule from "diagram-js/lib/features/resize";
import KeyboardMoveModule from "diagram-js/lib/navigation/keyboard-move";
import { NavigatedViewer } from "./NavigatedViewer.js";
import { gesturesModule } from "./gestures/index.js";
import { keyboardModule } from "./keyboard/index.js";
import { labelEditingModule } from "./label-editing/index.js";
import { c4ModelingModule, elementFactoryModule } from "./modeling/index.js";
import { paletteModule } from "./palette/index.js";
import { readOnlyModule } from "./read-only/index.js";
import { rulesModule } from "./rules/index.js";

/**
 * The editor: the navigated viewer plus editing, with the canvas lock of an invalid file. The C4
 * modeling replaces diagram-js's ModelingModule (SPEC 1.3); the stock interaction modules stay as
 * they are and call it.
 */
export class Modeler extends NavigatedViewer {
  protected override modules(): ModuleDeclaration[] {
    return [
      ...super.modules(),
      c4ModelingModule,
      elementFactoryModule,
      MoveModule,
      ResizeModule,
      ConnectModule,
      BendpointsModule,
      OutlineModule,
      KeyboardMoveModule,
      KeyboardMoveSelectionModule,
      readOnlyModule,
      rulesModule,
      paletteModule,
      labelEditingModule,
      keyboardModule,
      gesturesModule,
    ];
  }

  undo(): void {
    this.get<CommandStack>("commandStack").undo();
  }

  redo(): void {
    this.get<CommandStack>("commandStack").redo();
  }
}
