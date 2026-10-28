import { describe, expect, it } from "vitest";
import * as core from "../src/core.js";
import * as shell from "../src/index.js";

describe("the entries", () => {
  it.each([
    ["@miragon/modeler-shell", shell],
    ["@miragon/modeler-shell/core", core],
  ])("%s no longer exports legendStartsOpen, removed in 0.7", (_entry, entry) => {
    expect(entry).not.toHaveProperty("legendStartsOpen");
  });
});
