import type { ModuleDeclaration } from "didi";
import SelectionModule from "diagram-js/lib/features/selection";
import MoveCanvasModule from "diagram-js/lib/navigation/movecanvas";
import ZoomScrollModule from "diagram-js/lib/navigation/zoomscroll";
import { navigationModule } from "./navigation/index.js";
import { Viewer } from "./Viewer.js";

/**
 * The viewer plus zoom, pan, selection and the navigation between views (drill badge, Enter, U,
 * SPEC 1.10): the contract's read-only mount. A view switch writes nothing, so it needs no editing.
 */
export class NavigatedViewer extends Viewer {
  protected override modules(): ModuleDeclaration[] {
    return [
      ...super.modules(),
      SelectionModule,
      ZoomScrollModule,
      MoveCanvasModule,
      navigationModule,
    ];
  }
}
