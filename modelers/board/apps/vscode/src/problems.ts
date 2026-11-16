/**
 * Why a board text cannot be read, as an entry of the Problems view: the reason of the board's
 * own reader, at the line it names. No `vscode` here, so a test page can count the same problem.
 */
import { parseBoardText } from "@miragon/board-schema-model";

export interface BoardProblem {
  /** the reader's reason as a sentence, and what follows from it for the board */
  readonly message: string;
  /** VS Code's line, counted from 0 */
  readonly line: number;
  /** how many characters that line has: the entry underlines all of it */
  readonly length: number;
}

/** what the canvas does about a text it refused, in the words of its own status box */
const CONSEQUENCE = "The board is read-only until you fix the text.";

/** the reader's reasons that name a line start with it: "line 4 is no JSON" */
const LINE = /^line (\d+) /;

/** the reader's reasons start small and end without a full stop */
const asSentence = (reason: string): string =>
  `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`;

/**
 * Where the reader's line `number` is in VS Code's lines. The reader breaks a text at every
 * line feed and counts from 1. VS Code also breaks at a carriage return that stands alone, so
 * its count runs ahead behind one. A document of VS Code never holds such a return: VS Code
 * turns it into the document's line break when it reads the file (seen in 1.146 and 1.96), and
 * the two then count alike. The count is for a host that hands a text over as it is.
 */
function placeOf(text: string, number: number): { line: number; length: number } {
  let start = 0;
  for (let line = 1; line < number; line += 1) start = text.indexOf("\n", start) + 1;
  const breaksBefore = text.slice(0, start).match(/\r\n|\n|\r/g)?.length ?? 0;
  const rest = text.slice(start);
  const end = rest.search(/[\r\n]/);
  return { line: breaksBefore, length: end === -1 ? rest.length : end };
}

/** the problem of a board text, undefined for a text the board reads */
export function boardProblem(text: string): BoardProblem | undefined {
  const parsed = parseBoardText(text);
  if (parsed.ok) return undefined;
  // A reason without a line is about the whole text (it has no header): shown at its first line.
  const number = Number(LINE.exec(parsed.reason)?.[1] ?? 1);
  return { message: `${asSentence(parsed.reason)} ${CONSEQUENCE}`, ...placeOf(text, number) };
}
