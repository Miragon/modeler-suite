import type { ModuleDeclaration } from "didi";
import { BaseViewer } from "./BaseViewer.js";
import { drawModule } from "./draw/index.js";
import { ioModule } from "./io/index.js";
import { modelModule } from "./model/index.js";

/** Renders documents, without navigation or editing. */
export class Viewer extends BaseViewer {
  protected modules(): ModuleDeclaration[] {
    return [modelModule, drawModule, ioModule];
  }
}
