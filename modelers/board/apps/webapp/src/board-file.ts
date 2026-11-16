/**
 * The board file as the web app opens and downloads it: the one file of a board that has no
 * repository behind it, and the example's board on its way to a disk.
 */
import { isNodeAttrs, parseBoardText } from "@miragon/board-schema-model";

export const BOARD_SUFFIX = ".board";
const UNTITLED = "untitled";

/** The name of a download: the opened file's own, ending as a board file does. */
export function downloadName(name: string | undefined): string {
  // A browser hands in a bare name. A folder in front of it would be taken for part of the name.
  const bare = (name ?? "").replace(/^.*[\\/]/, "").trim();
  const stem = bare.toLowerCase().endsWith(BOARD_SUFFIX)
    ? bare.slice(0, bare.length - BOARD_SUFFIX.length)
    : bare;
  return `${stem === "" ? UNTITLED : stem}${BOARD_SUFFIX}`;
}

const asSentence = (reason: string): string =>
  `${reason.charAt(0).toUpperCase()}${reason.slice(1)}${reason.endsWith(".") ? "" : "."}`;

/** What the page says of a file that is no board: what happened, the reader's reason, what to do. */
export function unreadableFile(name: string, reason: string): string {
  return `Couldn't read “${name}”. ${asSentence(reason)} Check that it is a ${BOARD_SUFFIX} file.`;
}

export type BoardFileText = { ok: true; text: string } | { ok: false; reason: string };

/** A file's text as a board text, or the reader's reason why it is none. */
export function boardFileText(text: string): BoardFileText {
  const parsed = parseBoardText(text);
  return parsed.ok ? { ok: true, text } : { ok: false, reason: parsed.reason };
}

/** Whether a board text has no element: nothing a person would miss. A text that is no board has. */
export function holdsNothing(text: string): boolean {
  const parsed = parseBoardText(text);
  return parsed.ok && Object.keys(parsed.snapshot.elements).length === 0;
}

/** Whether a board shows a file of its repository: a model or a picture. */
export function namesFiles(text: string): boolean {
  const parsed = parseBoardText(text);
  if (!parsed.ok) return false;
  return Object.values(parsed.snapshot.elements).some(
    (attrs) => isNodeAttrs(attrs) && typeof attrs.file === "string" && attrs.file !== "",
  );
}

/** Hands the text to the browser as a download of that name. */
export function downloadText(page: Document, text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const anchor = page.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
