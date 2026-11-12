import { describe, expect, it } from "vitest";

import {
  DEFAULT_ORCA_VERSION,
  orcaSmokeDockerImage,
  parseOrcaSmokeDockerArguments,
} from "./docker.js";

describe("the Orca smoke image", () => {
  it("is Miragon/orca-modelers' image of the Orca release", () => {
    expect(orcaSmokeDockerImage("1.4.254")).toBe("ghcr.io/miragon/orca:1.4.254");
  });
});

describe("modeler-shell-orca-docker's command line", () => {
  it("takes --orca and passes everything else on as modeler-shell-vscode-docker reads it", () => {
    expect(parseOrcaSmokeDockerArguments(["--orca", "v1.4.248", "--env", "A=1"])).toEqual({
      help: false,
      options: { orcaVersion: "1.4.248", env: { A: "1" } },
    });
    expect(parseOrcaSmokeDockerArguments(["--", "npm", "run", "x", "--orca", "1"])).toEqual({
      help: false,
      options: { command: ["npm", "run", "x", "--orca", "1"], orcaVersion: undefined },
    });
    expect(parseOrcaSmokeDockerArguments(["-h"])).toEqual({ help: true });
    expect(() => parseOrcaSmokeDockerArguments(["--orca"])).toThrow("--orca needs a value");
    expect(DEFAULT_ORCA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
