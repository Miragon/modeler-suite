import type { EditRefusal } from "../types.js";

/** Thrown inside an operation; `applyEdit` turns it into a refused outcome (SPEC 3.4). */
export class EditRefused extends Error {
  constructor(
    readonly reason: EditRefusal,
    message: string,
  ) {
    super(message);
    this.name = "EditRefused";
  }
}

export function refuse(reason: EditRefusal, message: string): never {
  throw new EditRefused(reason, message);
}

export const GENERIC_MESSAGE = "Couldn't write this change into the DSL. Edit the text instead.";

export const UNREPRESENTABLE_MESSAGE =
  "A backslash before n or a quote, or a backslash at the end, can't be stored in the DSL.";
