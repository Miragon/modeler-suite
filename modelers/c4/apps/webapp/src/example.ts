// The text arrives through Vite's raw loader; the reference brings its module types to every
// program that compiles this file (the app, the unit tests and the e2e suite).
/// <reference types="vite/client" />
import workspaceText from "../../../example/bookshop.c4?raw";

/**
 * The "Show example" workspace: the original Bookshop of `example/bookshop.c4`, the file both
 * apps ship. Every editable view type with its layout, the C4 colours, and a dynamic view and a
 * deployment environment the modeler keeps for Structurizr.
 */
export const EXAMPLE: string = workspaceText;
