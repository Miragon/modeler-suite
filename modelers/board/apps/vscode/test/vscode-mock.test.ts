import * as vscode from "vscode";
import { describe, expect, it } from "vitest";
import * as mock from "./__mocks__/vscode.js";

// The extension host's sources import `vscode`, and a test drives them through the mock's control
// surface, which it imports by path. Both must load one module, or the host would register its
// editor in one copy and the test would look for it in another.
describe("the vscode module of the unit project", () => {
  it("is the mock a test imports by its path", () => {
    expect(vscode).toBe(mock);
    expect(Object.keys(vscode)).toContain("vscodeMock");
  });
});
