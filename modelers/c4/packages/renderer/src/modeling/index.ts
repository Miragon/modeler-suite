import type { ModuleDeclaration } from "didi";
import CommandModule from "diagram-js/lib/command";
import ChangeSupportModule from "diagram-js/lib/features/change-support";
import RulesModule from "diagram-js/lib/features/rules";
import SelectionModule from "diagram-js/lib/features/selection";
import C4ConnectionDocking from "./C4ConnectionDocking.js";
import C4ElementFactory from "./C4ElementFactory.js";
import C4Layouter from "./C4Layouter.js";
import C4Modeling from "./C4Modeling.js";

/**
 * Replaces diagram-js's ModelingModule (SPEC 1.3). Its dependencies are listed explicitly, since
 * the stock module that brought them is gone: `ChangeSupport` is what redraws on
 * `elements.changed`.
 */
export const c4ModelingModule: ModuleDeclaration = {
  __depends__: [CommandModule, ChangeSupportModule, SelectionModule, RulesModule],
  __init__: ["modeling"],
  modeling: ["type", C4Modeling],
  layouter: ["type", C4Layouter],
  connectionDocking: ["type", C4ConnectionDocking],
};

/** The previews of a create; the viewer needs them for nothing, the harness and the palette do. */
export const elementFactoryModule: ModuleDeclaration = {
  c4ElementFactory: ["type", C4ElementFactory],
};

export { default as C4Modeling, READ_ONLY_MESSAGE, type C4ModelingConfig } from "./C4Modeling.js";
export {
  default as DocumentChangeHandler,
  DOCUMENT_CHANGE,
  type DocumentChangeContext,
} from "./DocumentChangeHandler.js";
export { default as C4ElementFactory, PREVIEW_PREFIX } from "./C4ElementFactory.js";
export { default as C4Layouter } from "./C4Layouter.js";
export { C4HistoryMismatchError, C4UnsupportedOperationError } from "./errors.js";
export { deleteDoneText } from "./deleteDoneText.js";
export { refusalLevel } from "./refusalLevel.js";
