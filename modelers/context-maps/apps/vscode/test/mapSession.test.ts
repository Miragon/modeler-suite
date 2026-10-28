import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_NESTING_DEPTH,
  SAMPLE_DOCUMENT,
  serializeDocumentText,
} from "@miragon/context-maps-schema-model";
import { MapSession } from "../src/MapSession.js";
import type { HostToWebview, WebviewToHost } from "../src/protocol.js";
import {
  DiagnosticSeverity,
  EventEmitter,
  MockDiagnosticCollection,
  vscodeMock,
} from "./__mocks__/vscode.js";

beforeEach(() => vscodeMock.reset());

function webviewPanel(): {
  panel: unknown;
  posted: HostToWebview[];
  send(message: WebviewToHost): void;
} {
  const received = new EventEmitter<WebviewToHost>();
  const posted: HostToWebview[] = [];
  const panel = {
    webview: {
      onDidReceiveMessage: received.event,
      postMessage(message: HostToWebview): Promise<boolean> {
        posted.push(message);
        return Promise.resolve(true);
      },
    },
  };
  return { panel, posted, send: (message) => received.fire(message) };
}

describe("MapSession", () => {
  it("shows the nesting issue of a text too deep for the tree parser in the Problems view and on the pill", async () => {
    const levels = 50_000;
    const text = serializeDocumentText(SAMPLE_DOCUMENT).replace(
      '"version": 1',
      `"x-deep": ${"[".repeat(levels)}${"]".repeat(levels)},\n  "version": 1`,
    );
    const document = vscodeMock.openDocument("/deep.cm", text);
    const diagnostics = new MockDiagnosticCollection("context-maps");
    const { panel, posted, send } = webviewPanel();

    const session = new MapSession(document as never, panel as never, diagnostics as never);
    const [diagnostic, ...rest] = diagnostics.get(document.uri) ?? [];
    expect(rest).toEqual([]);
    expect(diagnostic!.severity).toBe(DiagnosticSeverity.Error);
    expect(diagnostic!.message.endsWith(`may nest at most ${MAX_NESTING_DEPTH} levels deep`)).toBe(
      true,
    );
    expect(diagnostic!.range.start).toEqual({
      line: 1,
      character: '  "x-deep": '.length + MAX_NESTING_DEPTH - 1,
    });

    send({ type: "ready" });
    await vi.waitFor(() => expect(posted).toHaveLength(2));
    expect(posted).toEqual([
      { type: "init", text },
      { type: "problems", count: 1, errors: 1 },
    ]);

    session.dispose();
    expect(diagnostics.get(document.uri)).toBeUndefined();
  });
});
