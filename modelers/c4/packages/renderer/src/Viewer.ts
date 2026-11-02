import type { ModuleDeclaration } from "didi";
import ChangeSupportModule from "diagram-js/lib/features/change-support";
import { BaseViewer } from "./BaseViewer.js";
import { documentModule } from "./document/index.js";
import { drawModule } from "./draw/index.js";
import { engineModule } from "./engine/index.js";
import { ioModule } from "./io/index.js";
import { reconcileModule } from "./reconcile/index.js";
import { sceneModule } from "./scene/index.js";
import { viewsModule } from "./views/index.js";

/**
 * Renders documents, without navigation or editing. It holds the store, the engine, the scene,
 * the reconciler and the views like the modeler, and registers no command stack: its in-place
 * sync redraws through `ChangeSupport`.
 */
export class Viewer extends BaseViewer {
  protected modules(): ModuleDeclaration[] {
    return [
      engineModule,
      documentModule,
      sceneModule,
      reconcileModule,
      viewsModule,
      ChangeSupportModule,
      drawModule,
      ioModule,
    ];
  }
}
