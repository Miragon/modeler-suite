import { expect, test, type Page } from "@playwright/test";
import { parseDocumentText } from "@miragon/context-maps-schema-model";
import { EXAMPLE_MAP } from "../../../apps/vscode/src/examples.js";
import { EMBED_KEYWORD, decodeDoc, pngExtractText } from "../../../apps/vscode/src/png.js";
import { pngChunks, textChunksWith } from "../../../apps/vscode/test/pngChunks.js";
import {
  openWebview,
  postFromHost,
  postedMessages,
  type PostedMessage,
} from "./support/webview.js";

/**
 * The webview as the `.cm.png` editor drives it (CmPngEditorProvider): to save, the host posts
 * `requestPng` and writes the Base64 PNG of the `pngResponse` to disk; to open, it reads the map
 * back from the PNG's tEXt chunk. The tests decode the posted PNG as the host does.
 */

async function savePng(page: Page, id: number): Promise<Uint8Array> {
  await postFromHost(page, { type: "requestPng", id });
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

/** The map the host reads back when it opens the PNG, or null when the PNG carries none. */
function reopenedMap(png: Uint8Array): string | null {
  const embedded = pngExtractText(png, EMBED_KEYWORD);
  return embedded === null ? null : decodeDoc(embedded);
}

async function addCoreDomain(page: Page): Promise<PostedMessage> {
  const edits = (await postedMessages(page)).filter((message) => message.type === "edit").length;
  await page.locator('.djs-palette [data-action="context.core"]').focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.locator(".djs-direct-editing-content")).toBeHidden();
  await expect
    .poll(
      async () => (await postedMessages(page)).filter((message) => message.type === "edit").length,
    )
    .toBeGreaterThan(edits);
  return (await postedMessages(page)).filter((message) => message.type === "edit").at(-1)!;
}

test.describe("VS Code webview: the .cm.png editor", () => {
  test("a save after an edit writes a valid PNG whose map chunk holds the edited map", async ({
    page,
  }) => {
    await openWebview(page);
    const edit = await addCoreDomain(page);

    const png = await savePng(page, 1);

    const chunks = pngChunks(png);
    expect(chunks.every((chunk) => chunk.crcValid)).toBe(true);
    expect(chunks[0]!.type).toBe("IHDR");
    expect(chunks.at(-1)!.type).toBe("IEND");
    expect(chunks.at(-2)!.type).toBe("tEXt");
    expect(textChunksWith(png, EMBED_KEYWORD)).toHaveLength(1);
    const map = reopenedMap(png);
    expect(map).toBe(edit.text);
    const parsed = parseDocumentText(map!);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.document.contexts).toHaveLength(7);

    const size = await page.evaluate(async (base64) => {
      const image = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${base64}`)).blob(),
      );
      return { width: image.width, height: image.height };
    }, Buffer.from(png).toString("base64"));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });

  test("each save embeds the map the host holds: as opened, edited and after the host's undo", async ({
    page,
  }) => {
    await openWebview(page);
    expect(reopenedMap(await savePng(page, 1))).toBe(EXAMPLE_MAP);

    const edit = await addCoreDomain(page);
    expect(reopenedMap(await savePng(page, 2))).toBe(edit.text);

    await postFromHost(page, { type: "update", text: EXAMPLE_MAP });
    const afterUndo = await savePng(page, 3);
    expect(reopenedMap(afterUndo)).toBe(EXAMPLE_MAP);
    expect(textChunksWith(afterUndo, EMBED_KEYWORD)).toHaveLength(1);
    expect(
      (await postedMessages(page))
        .filter((message) => message.type === "pngResponse")
        .map((message) => message.id),
    ).toEqual([1, 2, 3]);
  });
});
