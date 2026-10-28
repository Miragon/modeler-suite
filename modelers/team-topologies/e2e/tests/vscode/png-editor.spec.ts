import { expect, test, type Page } from "@playwright/test";
import { parseDocument } from "@miragon/team-topologies-schema-model";
import { EXAMPLE_MAP } from "../../../apps/vscode/src/examples.js";
import { EMBED_KEYWORD, decodeDoc, pngExtractText } from "../../../apps/vscode/src/png.js";
import {
  pngChunks,
  textChunksWith,
  textWith,
} from "../../../apps/vscode/src/pngChunks.test-support.js";
import {
  openWebview,
  postFromHost,
  postedMessages,
  type PostedMessage,
} from "./support/webview.js";

/**
 * The webview as the `.tt.png` editor drives it (TtPngEditorProvider): to save, the host posts
 * `requestPng` and writes the Base64 PNG of the `pngResponse` to disk; to open, it reads the
 * diagram back from the PNG's tEXt chunk. The tests decode the posted PNG as the host does.
 */

async function savePng(page: Page, id: number): Promise<Uint8Array> {
  await postFromHost(page, { type: "requestPng", id, includeDraft: true });
  await page.waitForFunction(
    (wanted) =>
      (window.__modelerShellVsCodeStub?.posted ?? []).some(
        (message) =>
          (message as { type?: unknown }).type === "pngResponse" &&
          (message as { id?: unknown }).id === wanted,
      ),
    id,
  );
  const response = (await postedMessages(page)).find(
    (message) => message.type === "pngResponse" && message.id === id,
  )!;
  expect(response.error).toBeUndefined();
  return new Uint8Array(Buffer.from(response.data as string, "base64"));
}

/** The diagram the host reads back when it opens the PNG, or null when the PNG carries none. */
function reopenedDiagram(png: Uint8Array): string | null {
  const embedded = pngExtractText(png, EMBED_KEYWORD);
  return embedded === null ? null : decodeDoc(embedded);
}

async function removeTeam(page: Page, id: string): Promise<PostedMessage> {
  const editCount = async () =>
    (await postedMessages(page)).filter((message) => message.type === "edit").length;
  const edits = await editCount();
  const team = page.locator(`[data-element-id="${id}"]`);
  await team.click();
  await expect(team).toHaveClass(/selected/);
  await page.keyboard.press("Delete");
  await expect(team).toHaveCount(0);
  await expect.poll(editCount).toBeGreaterThan(edits);
  return (await postedMessages(page)).filter((message) => message.type === "edit").at(-1)!;
}

test.describe("VS Code webview: the .tt.png editor", () => {
  test("a save after an edit writes a valid PNG whose diagram chunk holds the edited diagram", async ({
    page,
  }) => {
    await openWebview(page);
    const edit = await removeTeam(page, "team_fraud");

    const png = await savePng(page, 1);

    const chunks = pngChunks(png);
    expect(chunks.every((chunk) => chunk.crcValid)).toBe(true);
    expect(chunks[0]!.type).toBe("IHDR");
    expect(chunks.at(-1)!.type).toBe("IEND");
    const diagramBeforeIend = textWith(chunks.at(-2)!, EMBED_KEYWORD);
    expect(diagramBeforeIend).toBeDefined();
    expect(decodeDoc(diagramBeforeIend!)).toBe(edit.text);
    expect(textChunksWith(png, EMBED_KEYWORD)).toHaveLength(1);
    const diagram = reopenedDiagram(png);
    expect(diagram).toBe(edit.text);
    const parsed = parseDocument(JSON.parse(diagram!));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.document.nodes.map((node) => node.id)).not.toContain("team_fraud");

    const size = await page.evaluate(async (base64) => {
      const image = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${base64}`)).blob(),
      );
      return { width: image.width, height: image.height };
    }, Buffer.from(png).toString("base64"));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });

  test("each save embeds the diagram the host holds: as opened, edited and after the host's undo", async ({
    page,
  }) => {
    await openWebview(page);
    expect(reopenedDiagram(await savePng(page, 1))).toBe(EXAMPLE_MAP);

    const edit = await removeTeam(page, "team_fraud");
    expect(reopenedDiagram(await savePng(page, 2))).toBe(edit.text);

    await postFromHost(page, { type: "update", text: EXAMPLE_MAP });
    const afterUndo = await savePng(page, 3);
    expect(reopenedDiagram(afterUndo)).toBe(EXAMPLE_MAP);
    expect(textChunksWith(afterUndo, EMBED_KEYWORD)).toHaveLength(1);
    expect(
      (await postedMessages(page))
        .filter((message) => message.type === "pngResponse")
        .map((message) => message.id),
    ).toEqual([1, 2, 3]);
  });
});
