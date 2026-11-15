/**
 * A channel in memory between a page and the files server, after the one the files package
 * tests its protocol on (`packages/files/test/support/wire.ts`): every message is copied and
 * delivered later and in order, as a webview's channel does it.
 */
import type { Channel, ClientMessage, HostMessage } from "@miragon/board-files";

export interface Wire {
  /** the host's end: what `serveFiles` is handed */
  readonly host: Channel<HostMessage, ClientMessage>;
  /** what the host posted since the last `taken()`, whole and in order */
  readonly fromHost: HostMessage[];
  /** a message of the page */
  send(message: ClientMessage): void;
  /** empties `fromHost` and hands back what was in it */
  taken(): HostMessage[];
}

export function createWire(): Wire {
  const fromHost: HostMessage[] = [];
  const atHost = new Set<(message: ClientMessage) => void>();
  return {
    host: {
      post: (message) => void fromHost.push(structuredClone(message)),
      onMessage(listener) {
        atHost.add(listener);
        return () => void atHost.delete(listener);
      },
    },
    fromHost,
    send(message) {
      const copy = structuredClone(message);
      queueMicrotask(() => {
        for (const listener of [...atHost]) listener(copy);
      });
    },
    taken: () => fromHost.splice(0),
  };
}

/**
 * Resolves once nothing is on its way. The wire, the files server and the fake VS Code all
 * answer in microtasks, so one task later every chain a test started has run to its end.
 */
export const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
