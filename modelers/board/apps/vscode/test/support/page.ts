/**
 * The page's end of a fake panel: the real files client of the board over what the extension
 * posts and receives, so that a test of the extension has the page's own bookkeeping (versions,
 * sessions, a dropped edit's word) and not messages written by hand. What the page posts can be
 * held back, which is how a test puts an edit on its way while something else happens.
 */
import {
  createFilesClient,
  type BoardFiles,
  type ClientMessage,
  type HostMessage,
} from "@miragon/board-files";

import type { FakePanel } from "./panel.js";
import { settled } from "./wire.js";

export interface FakePage {
  readonly files: BoardFiles;
  /** what the page posted and heard of the files protocol, in order, as `type path` */
  readonly log: string[];
  /** hands the page what the extension posted since the last call */
  pump(): void;
  /** holds back what the page posts from now on where `which` says so */
  hold(which: (message: ClientMessage) => boolean): void;
  /** hands the extension what was held, in order, and holds nothing more */
  release(): Promise<void>;
  /** resolves once nothing is on its way between the two ends */
  rest(): Promise<void>;
}

const pathOf = (message: object): string =>
  "path" in message && typeof message.path === "string" ? ` ${message.path}` : "";

export function pageOf(panel: FakePanel): FakePage {
  const listeners = new Set<(message: HostMessage) => void>();
  const held: ClientMessage[] = [];
  const log: string[] = [];
  let holding: ((message: ClientMessage) => boolean) | undefined;
  let delivered = 0;
  const pump = (): void => {
    while (delivered < panel.posted.length) {
      const message = panel.posted[delivered++] as Partial<HostMessage>;
      if (typeof message?.type !== "string" || !message.type.startsWith("board.")) continue;
      log.push(`host ${message.type}${pathOf(message)}`);
      for (const listener of [...listeners]) listener(structuredClone(message) as HostMessage);
    }
  };
  const files = createFilesClient({
    post(message) {
      const copy = structuredClone(message);
      if (holding?.(copy)) {
        held.push(copy);
        return;
      }
      log.push(`page ${copy.type}${pathOf(copy)}`);
      void panel.receive(copy);
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  });
  const rest = async (): Promise<void> => {
    for (let round = 0; round < 8; round += 1) {
      await settled();
      pump();
    }
  };
  return {
    files,
    log,
    pump,
    hold(which) {
      holding = which;
    },
    async release() {
      holding = undefined;
      for (const message of held.splice(0)) {
        log.push(`page ${message.type}${pathOf(message)}`);
        await panel.receive(message);
      }
      await rest();
    },
    rest,
  };
}
