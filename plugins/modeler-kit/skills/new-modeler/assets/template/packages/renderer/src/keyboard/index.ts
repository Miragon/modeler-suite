import type { ModuleDeclaration } from 'didi';
import EditorActionsModule from 'diagram-js/lib/features/editor-actions';
import KeyboardModule from 'diagram-js/lib/features/keyboard';
import CanvasKeys from './CanvasKeys.js';
import EditorActions from './EditorActions.js';
import KeyboardBindings from './KeyboardBindings.js';

export const keyboardModule: ModuleDeclaration = {
  __depends__: [KeyboardModule, EditorActionsModule],
  __init__: ['diagramEditorActions', 'canvasKeys'],
  keyboardBindings: ['type', KeyboardBindings],
  diagramEditorActions: ['type', EditorActions],
  canvasKeys: ['type', CanvasKeys],
};

export type { KeyboardConfig } from './KeyboardBindings.js';
