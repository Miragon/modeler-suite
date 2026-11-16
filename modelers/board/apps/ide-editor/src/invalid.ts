/**
 * The lock of a board whose text the board refused. The canvas keeps what it showed last and
 * takes no input: an edit of it would be written over the text somebody is repairing.
 */
import { INVALID_STATUS_DELAY_MS } from "@miragon/modeler-shell/core";

/** The canvas's name in the shell's sentences ("This file isn't a valid board right now."). */
export const BOARD_NAME = "board";

/** What the lock drives of the shell. A `ShellHandle` fits. */
export interface LockedShell {
  /** the slot the board is attached to */
  readonly canvas: { inert: boolean };
  readonly messages: { invalidFile(diagram: string): string };
  setReadOnly(readOnly: boolean, options?: { delayMs?: number | undefined }): void;
  setStatus(
    status: { severity: "danger"; text: string } | null,
    options?: { delayMs?: number | undefined },
  ): void;
}

export interface BoardLock {
  /** The board refused a text. `reason` is the reader's, such as "line 3 is no JSON". */
  refused(reason: string): void;
  /** The board accepted a text. */
  accepted(): void;
  /** The host opened the document read only: locked whatever the text says, without a status. */
  readOnlyDocument(): void;
  /** Whether the board takes no input right now. */
  locked(): boolean;
}

const asSentence = (reason: string): string =>
  `${reason.charAt(0).toUpperCase()}${reason.slice(1)}${reason.endsWith(".") ? "" : "."}`;

/** What the status box says about a refused text: the shell's sentence, then the reader's reason. */
export function invalidStatus(shell: Pick<LockedShell, "messages">, reason: string): string {
  return `${shell.messages.invalidFile(BOARD_NAME)} ${asSentence(reason)}`;
}

export function createBoardLock(shell: LockedShell): BoardLock {
  let invalid = false;
  let readOnly = false;
  let inert = false;
  // Inert and not a rule of the sheet: the whole slot, the board's toolbar and an armed editor
  // with it, takes neither pointer nor key, and loses the focus it had.
  const apply = (delayMs?: number): void => {
    const locked = invalid || readOnly;
    // Only a change of the lock is written. The slot's inert is the shell's as well: behind a
    // web app's start screen it stays, whatever text the board accepts meanwhile.
    if (locked !== inert) {
      inert = locked;
      shell.canvas.inert = locked;
    }
    shell.setReadOnly(locked, delayMs === undefined ? undefined : { delayMs });
  };
  return {
    refused(reason) {
      invalid = true;
      // The lock is there at once. Its marks and the status box wait, so that a person who types
      // in the text editor beside the board sees no flicker.
      apply(INVALID_STATUS_DELAY_MS);
      shell.setStatus(
        { severity: "danger", text: invalidStatus(shell, reason) },
        { delayMs: INVALID_STATUS_DELAY_MS },
      );
    },
    accepted() {
      invalid = false;
      apply();
      shell.setStatus(null);
    },
    readOnlyDocument() {
      readOnly = true;
      apply();
    },
    locked: () => invalid || readOnly,
  };
}
