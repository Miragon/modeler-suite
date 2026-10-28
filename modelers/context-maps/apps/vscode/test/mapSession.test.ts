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
  Range,
  vscodeMock,
  workspace,
  WorkspaceEdit,
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

  it("keeps the Problems view current when an edit cuts a string short in front of a deep value", async () => {
    const levels = 50_000;
    const title = `"title": ${JSON.stringify(SAMPLE_DOCUMENT.title)}`;
    const text = serializeDocumentText(SAMPLE_DOCUMENT).replace(
      title,
      `${title},\n  "x-deep": ${"[".repeat(levels)}${"]".repeat(levels)}`,
    );
    const document = vscodeMock.openDocument("/deep.cm", text);
    const diagnostics = new MockDiagnosticCollection("context-maps");
    const { panel, posted, send } = webviewPanel();
    const session = new MapSession(document as never, panel as never, diagnostics as never);
    send({ type: "ready" });
    await vi.waitFor(() => expect(posted).toHaveLength(2));

    const titleLine = 2;
    const closingQuote = `  ${title}`.length - 1;
    const edit = new WorkspaceEdit();
    edit.replace(document.uri, new Range(titleLine, closingQuote, titleLine, closingQuote + 1), "");
    await workspace.applyEdit(edit);

    const [diagnostic, ...rest] = diagnostics.get(document.uri) ?? [];
    expect(rest).toEqual([]);
    expect(diagnostic!.message).toMatch(/^not valid JSON: Bad control character in string literal/);
    expect(diagnostic!.range.start).toEqual({ line: titleLine, character: closingQuote + 1 });
    expect(posted.at(-1)).toEqual({ type: "update", text: document.getText() });
    session.dispose();
  });
});
