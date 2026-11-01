/** A stock modeling call the notation has no edit for: the rules keep its gesture from starting. */
export class C4UnsupportedOperationError extends Error {
  constructor(readonly operation: string) {
    super(`The C4 modeler does not support ${operation}.`);
    this.name = "C4UnsupportedOperationError";
  }
}

/**
 * An undo or redo whose text patch was made against another text. Between two imports only the
 * document command changes the text, and every import and rebase clears the history, so this is
 * a bug, never a user's situation.
 */
export class C4HistoryMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(`The history patch expects text ${expected}, but the document is ${actual}.`);
    this.name = "C4HistoryMismatchError";
  }
}
