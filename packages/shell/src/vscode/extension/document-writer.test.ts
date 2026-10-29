import { describe, expect, it } from "vitest";

import { createVsCodeHostStub } from "../../testing/vscode-host-stub.js";
import { createDocumentWriter } from "./index.js";

describe("createDocumentWriter", () => {
  it("writes one minimal line edit per text and recognises its echo once", async () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/map.wmap", "title A\ncomponent X [0.5, 0.5]\n");
    const writer = createDocumentWriter(host.vscode, document);
    let echoes = 0;
    host.vscode.workspace.onDidChangeTextDocument(() => {
      if (writer.consumeEcho()) echoes++;
    });

    expect(
      await writer.write(() => "title A\ncomponent X [0.6, 0.5]\n", { suppressEcho: true }),
    ).toBe(true);

    expect(host.appliedEdits).toEqual([
      expect.objectContaining({
        range: { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } },
        text: "component X [0.6, 0.5]\n",
      }),
    ]);
    expect(echoes).toBe(1);
    expect(writer.consumeEcho()).toBe(false);
  });

  it("recognises the echo in a CRLF document, whose line breaks VS Code keeps", async () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/map.wmap", "title A\r\nnote\r\n");
    const writer = createDocumentWriter(host.vscode, document);
    const echoes: boolean[] = [];
    host.vscode.workspace.onDidChangeTextDocument(() => echoes.push(writer.consumeEcho()));

    await writer.write(() => "title B\nnote\n", { suppressEcho: true });

    expect(document.getText()).toBe("title B\r\nnote\r\n");
    expect(echoes).toEqual([true]);
  });

  it("keeps no echo for a write the canvas does not show yet", async () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/map.wmap", "title A\n");
    const writer = createDocumentWriter(host.vscode, document);
    const echoes: boolean[] = [];
    host.vscode.workspace.onDidChangeTextDocument(() => echoes.push(writer.consumeEcho()));

    await writer.write((text) => `${text}component X [0.5, 0.5]\n`, { suppressEcho: false });

    expect(document.getText()).toBe("title A\ncomponent X [0.5, 0.5]\n");
    expect(echoes).toEqual([false]);
  });

  it("writes nothing for the same text, for line breaks only, and for undefined", async () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/map.wmap", "title A\r\n");
    const writer = createDocumentWriter(host.vscode, document);

    expect(await writer.write(() => "title A\r\n", { suppressEcho: true })).toBe(true);
    expect(await writer.write(() => "title A\n", { suppressEcho: true })).toBe(true);
    expect(await writer.write(() => undefined, { suppressEcho: false })).toBe(true);

    expect(host.appliedEdits).toEqual([]);
    expect(writer.consumeEcho()).toBe(false);
  });

  it("resolves to false and forgets the echo when VS Code refuses the edit", async () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/map.wmap", "title A\n");
    document.readOnly = true;
    const writer = createDocumentWriter(host.vscode, document);

    expect(await writer.write(() => "title B\n", { suppressEcho: true })).toBe(false);

    document.readOnly = false;
    host.replaceText(document, "title B\n");
    expect(writer.consumeEcho()).toBe(false);
  });

  it("resolves to false when applyEdit rejects, and goes on with the next write", async () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/map.wmap", "title A\n");
    const vscode = {
      ...host.vscode,
      workspace: {
        ...host.vscode.workspace,
        applyEdit: () => Promise.reject(new Error("The document changed in the meantime.")),
      },
    };
    const rejecting = createDocumentWriter(vscode, document);
    expect(await rejecting.write(() => "title B\n", { suppressEcho: true })).toBe(false);
    expect(rejecting.consumeEcho()).toBe(false);
    expect(document.getText()).toBe("title A\n");
  });

  it("diffs each write against the document the write before it left", async () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/map.wmap", "title A\ncomponent X [0.5, 0.5]\n");
    const writer = createDocumentWriter(host.vscode, document);
    const release = host.holdEdits();

    const added = "title A\ncomponent Y [0.4, 0.4]\ncomponent X [0.5, 0.5]\n";
    const moved = "title A\ncomponent Y [0.4, 0.4]\ncomponent X [0.6, 0.5]\n";
    const writes = [
      writer.write(() => added, { suppressEcho: true }),
      writer.write(() => moved, { suppressEcho: true }),
    ];
    expect(writer.pending).toBe(2);
    await Promise.resolve();
    release();

    expect(await Promise.all(writes)).toEqual([true, true]);
    expect(document.getText()).toBe(moved);
    // Each canvas change is an undo step of its own (guide §13.5).
    expect(host.appliedEdits.map((edit) => edit.text)).toEqual([
      "component Y [0.4, 0.4]\n",
      "component X [0.6, 0.5]\n",
    ]);
    expect(writer.pending).toBe(0);
  });

  it("settles once every write queued so far has landed", async () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/map.wmap", "title A\n");
    const writer = createDocumentWriter(host.vscode, document);
    const release = host.holdEdits();
    void writer.write(() => "title B\n", { suppressEcho: true });
    let settled = false;
    void writer.settled().then(() => (settled = true));

    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await writer.settled();
    expect(settled).toBe(true);
    expect(document.getText()).toBe("title B\n");
  });
});
