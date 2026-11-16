/**
 * The port for a host whose files are in the page: the client and the server of the protocol on
 * a message channel of the page's own. Such a host runs the same path checks and gets its
 * messages copied, one task each and in the same order, as a host behind a webview.
 */
import { createFilesClient } from "./client.js";
import type { FilesRule } from "./paths.js";
import type { BoardFiles } from "./port.js";
import type { Channel } from "./protocol.js";
import { serveFiles, type FilesBackend } from "./server.js";

function portChannel<Out, In>(port: MessagePort): Channel<Out, In> {
  return {
    post: (message) => port.postMessage(message),
    onMessage(listener) {
      const handler = (event: { data: unknown }): void => listener(event.data as In);
      port.addEventListener("message", handler);
      // a port keeps what it is sent until it is started
      port.start();
      return () => port.removeEventListener("message", handler);
    },
  };
}

/**
 * `rule` is the host's word of what a board may reach, as `serveFiles` takes it. `dispose()`
 * ends the server too and closes the channel; the backend is the caller's. What the page posted
 * in the task of the dispose is dropped with the channel, as with a webview that closes: whoever
 * must have a write in the backend awaits `settled()` first.
 */
export function connectBackend(backend: FilesBackend, rule: FilesRule): BoardFiles {
  const pipe = new MessageChannel();
  const server = serveFiles(portChannel(pipe.port2), backend, rule);
  const client = createFilesClient(portChannel(pipe.port1));
  return {
    ...client,
    dispose() {
      client.dispose();
      server.dispose();
      pipe.port1.close();
      pipe.port2.close();
    },
  };
}
