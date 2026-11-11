import type { ModuleDeclaration } from "didi";
import SelectionModule from "diagram-js/lib/features/selection";
import MoveCanvasModule from "diagram-js/lib/navigation/movecanvas";
import ZoomScrollModule from "diagram-js/lib/navigation/zoomscroll";
import { Viewer } from "./Viewer.js";

/** The viewer plus zoom, pan and selection: the contract's read-only mount. */
export class NavigatedViewer extends Viewer {
  protected override modules(): ModuleDeclaration[] {
    return [...super.modules(), SelectionModule, ZoomScrollModule, MoveCanvasModule];
  }
}
