import type { Appearance } from "../core/index.js";

/** The one message the theme bridge posts to the webview. */
export const APPEARANCE_MESSAGE_TYPE = "modelerShell.appearance";

export interface AppearanceMessage {
  type: typeof APPEARANCE_MESSAGE_TYPE;
  /** Already resolved against the modeler's themes. */
  appearance: Appearance;
}

/** A plain, JSON-safe message (no `kontrast: undefined` key). */
export function appearanceMessage(appearance: Appearance): AppearanceMessage {
  return {
    type: APPEARANCE_MESSAGE_TYPE,
    appearance: appearance.kontrast
      ? { theme: appearance.theme, kontrast: appearance.kontrast }
      : { theme: appearance.theme },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Type guard for `MessageEvent.data` in the webview. */
export function isAppearanceMessage(value: unknown): value is AppearanceMessage {
  if (!isRecord(value) || value.type !== APPEARANCE_MESSAGE_TYPE || !isRecord(value.appearance))
    return false;
  const { theme, kontrast } = value.appearance;
  return (theme === "light" || theme === "dark") && (kontrast === undefined || kontrast === "hoch");
}

/** The problems pill's summary of a document's findings, as the Problems view lists them. */
export interface ProblemCounts {
  count: number;
  /** How many of them are errors; the pill's icon and wording follow it. */
  errors: number;
}

/**
 * What the extension's document plumbing (`registerModelerEditor`) posts to the webview. The types
 * are the ones the Miragon modelers used before the shell took the plumbing over, so a test page
 * that posts `{ type: "init", text }` keeps working.
 */
export type DocumentHostMessage =
  /** The document's text, the answer to `ready`. */
  | { type: "init"; text: string }
  /** A change the webview did not make: the text editor, Git, undo, "Insert example". */
  | { type: "update"; text: string }
  | { type: "problems"; count: number; errors: number }
  /** A Command Palette or editor title command for this editor. */
  | { type: "command"; name: string };

/** What the webview posts to the extension's document plumbing (`connectDocumentSync`). */
export type DocumentWebviewMessage =
  | { type: "ready" }
  /** The document as the canvas shows it now. */
  | { type: "edit"; text: string }
  /** The empty-file hint's "Insert example": one edit, one undo step (guide §13.5). */
  | { type: "insertExample" }
  /** The problems pill: open the Problems view. */
  | { type: "showProblems" }
  /** A notification of the host, only for an action the user triggered (guide §13.5). */
  | { type: "info"; message: string }
  | { type: "error"; message: string };

/** A message of either side as it arrives: a record with a string `type`. */
export interface TypedMessage {
  readonly type: string;
  readonly [key: string]: unknown;
}

/** Type guard for a message from the other side, which nothing types at runtime. */
export function isTypedMessage(value: unknown): value is TypedMessage {
  return isRecord(value) && typeof value.type === "string";
}
