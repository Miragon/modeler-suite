/**
 * File IO for the webapp: open Event Storming boards (.storm / .json) and export them as pictures
 * (SVG / PNG) or files (.storm / .json). Sharing an editable board is done via the URL (see
 * share.ts), not via the image.
 */
import { loadBoard, type EventStormingBoard } from "@miragon/event-storming-schema-model";
import { COLORS, type ImportWarning, type Modeler } from "@miragon/event-storming-renderer";
import { svgToPng } from "@miragon/modeler-shell/export";

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

/** A file read and checked, ready to import: board text, or a validated board from JSON. */
export type BoardFile =
  | { readonly kind: "dsl"; readonly text: string }
  | { readonly kind: "board"; readonly board: EventStormingBoard };

/**
 * Reads a file as a board without touching the canvas. Throws with a descriptive message for a
 * picture or JSON that is no valid board; any other text is board text (the DSL keeps every line).
 */
export async function readBoardFile(file: File): Promise<BoardFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".png") || name.endsWith(".svg") || file.type.startsWith("image/")) {
    throw new Error("Images cannot be opened as boards: open a .storm or .json file.");
  }
  const text = await file.text();
  if (name.endsWith(".json")) return { kind: "board", board: loadBoard(JSON.parse(text)) };
  return { kind: "dsl", text };
}

/** Imports a board read by `readBoardFile`. */
export async function importBoardFile(
  boardFile: BoardFile,
  viewer: Modeler,
): Promise<ImportWarning[]> {
  const { warnings } =
    boardFile.kind === "board"
      ? await viewer.importMap(boardFile.board)
      : await viewer.importDSL(boardFile.text);
  return warnings;
}

/** Reads a file and imports it into the modeler. Throws with a descriptive message on errors. */
export async function openFile(file: File, viewer: Modeler): Promise<ImportWarning[]> {
  return importBoardFile(await readBoardFile(file), viewer);
}

// ---------------------------------------------------------------------------
// PNG export
// ---------------------------------------------------------------------------

/** Guide §10.7: the ground of "Export as PNG" is `hell['--cd-ui-grund']`; a unit test pins it. */
export const PNG_BACKGROUND = COLORS.paper;

export interface BoardPng {
  readonly blob: Blob;
  /** The labels came out in the system font because Geist could not be embedded. */
  readonly fontFallback: boolean;
}

/**
 * "Export as PNG" (2×, on the paper) or, `transparent`, "Export as PNG (4×, transparent)". The
 * page's own Geist faces go into the picture, since an SVG drawn as an image cannot use them.
 */
export async function boardToPng(svg: string, transparent = false): Promise<BoardPng> {
  let fontFallback = false;
  const blob = await svgToPng(svg, {
    ...(transparent ? { background: "transparent", scale: 4 } : { background: PNG_BACKGROUND }),
    onFontFallback: () => {
      fontFallback = true;
    },
  });
  return { blob, fontFallback };
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}
