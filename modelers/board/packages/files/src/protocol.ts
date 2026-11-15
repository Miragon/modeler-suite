/**
 * The messages between the page of a board and the host that keeps the files. Every type starts
 * with `board.`, so the messages share a channel with the shell's (`init`, `update`, `edit` and
 * so on) and collide with none. The VS Code host is written against these names and shapes: a
 * change to one is a new `PROTOCOL`.
 *
 * The rules both sides keep: nothing is pushed before the hello; whatever the page awaits carries
 * a `requestId` and ends in its answer or in `board.failed`; the page never gets its own edit
 * back; a write the host refused is answered with the text as the host has it; there is one
 * subscription per path however many readers the page has on it. A hello starts the life of a
 * page: what the page before it had open is closed, and a hello of another protocol is none.
 */
import type { FileMove } from "./port.js";

export const PROTOCOL = 1;

/** page to host */
export type ClientMessage =
  | { type: "board.hello"; protocol: number }
  | { type: "board.text.open"; requestId: number; path: string }
  | { type: "board.text.edit"; path: string; text: string }
  | { type: "board.text.close"; path: string }
  | { type: "board.bytes.read"; requestId: number; path: string }
  | { type: "board.file.create"; requestId: number; path: string; base64: string; mime: string };

/** host to page; `board.paths` is the whole list, after the hello and after every change */
export type HostMessage =
  | { type: "board.paths"; paths: string[] }
  | { type: "board.text.opened"; requestId: number; path: string; text: string; readOnly: boolean }
  | { type: "board.text.update"; path: string; text: string }
  | { type: "board.text.gone"; path: string }
  | { type: "board.moved"; moves: FileMove[] }
  | { type: "board.bytes"; requestId: number; path: string; base64: string | null; mime: string }
  | { type: "board.bytes.changed"; paths: string[] }
  | { type: "board.done"; requestId: number }
  | { type: "board.failed"; requestId: number; message: string };

/** one side of a channel: a webview's postMessage, an extension's panel, a MessagePort */
export interface Channel<Out, In> {
  post(message: Out): void;
  /** returns the unsubscribe; a message that is not the other side's is never delivered here */
  onMessage(listener: (message: In) => void): () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** whether a message on a shared channel is one of this protocol, by its type alone */
export const isBoardMessage = (
  value: unknown,
): value is { type: string } & Record<string, unknown> =>
  isRecord(value) && typeof value.type === "string" && value.type.startsWith("board.");

/** bytes travel as base64, as the suite's exports do: a webview's channel carries JSON */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
