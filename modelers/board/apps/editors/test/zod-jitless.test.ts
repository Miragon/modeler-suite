import { config } from "zod";
import { describe, expect, it } from "vitest";

describe("src/zod-jitless.ts", () => {
  it("turns zod's eval probe off for every schema built after it", async () => {
    expect(config().jitless).not.toBe(true);
    await import("../src/zod-jitless.js");
    expect(config().jitless).toBe(true);
  });
});
