import { describe, expect, it } from "vitest";
import * as core from "../src/core.js";
import * as shell from "../src/index.js";
import * as vsCodeElectron from "../src/testing-vscode-electron.js";

describe("the entries", () => {
  it.each([
    ["@miragon/modeler-shell", shell],
    ["@miragon/modeler-shell/core", core],
  ])("%s no longer exports legendStartsOpen, removed in 0.7", (_entry, entry) => {
    expect(entry).not.toHaveProperty("legendStartsOpen");
  });

  it.each(["VSCODE_SMOKE_OPT_IN_STEPS", "vsCodeSmokeOptIn"])(
    "@miragon/modeler-shell/testing/vscode-electron no longer exports %s, removed in 0.9",
    (name) => {
      expect(vsCodeElectron).not.toHaveProperty(name);
    },
  );

  it("@miragon/modeler-shell/testing/vscode-electron no longer exports the type VsCodeSmokeOptInStep, removed in 0.9", () => {
    // @ts-expect-error the type is gone; VsCodeSmokeSkippableStep replaces it
    const step: import("../src/testing-vscode-electron.js").VsCodeSmokeOptInStep = "keys";
    expect(step).toBe("keys");
  });
});
