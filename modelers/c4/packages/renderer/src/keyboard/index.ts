import type { ModuleDeclaration } from "didi";
import EditorActionsModule from "diagram-js/lib/features/editor-actions";
import KeyboardModule from "diagram-js/lib/features/keyboard";
import { navigationModule } from "../navigation/index.js";
import CanvasKeys from "./CanvasKeys.js";
import EditorActions from "./EditorActions.js";
import KeyboardBindings from "./KeyboardBindings.js";

/** The editor's keys; the navigation's keys and dialogs come with them (Enter, U, G, Shift+Delete). */
export const keyboardModule: ModuleDeclaration = {
  __depends__: [KeyboardModule, EditorActionsModule, navigationModule],
  __init__: ["diagramEditorActions", "canvasKeys"],
  keyboardBindings: ["type", KeyboardBindings],
  diagramEditorActions: ["type", EditorActions],
  canvasKeys: ["type", CanvasKeys],
};

export type { KeyboardConfig } from "./KeyboardBindings.js";
