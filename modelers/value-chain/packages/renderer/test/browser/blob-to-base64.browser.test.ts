import { describe, expect, it } from "vitest";
import { blobToBase64 } from "../../src/index.js";

describe("blobToBase64", () => {
  it("returns the blob's bytes in Base64, without the data: URL prefix", async () => {
    const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(await blobToBase64(new Blob([pngSignature], { type: "image/png" }))).toBe(
      "iVBORw0KGgo=",
    );
  });
});
