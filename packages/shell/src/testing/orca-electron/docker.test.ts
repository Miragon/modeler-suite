import { describe, expect, it } from "vitest";

import { vsCodeSmokeDockerfile } from "../vscode-electron/docker.js";
import {
  DEFAULT_ORCA_VERSION,
  orcaSmokeDockerImage,
  orcaSmokeDockerfile,
  parseOrcaSmokeDockerArguments,
} from "./docker.js";

describe("the Orca smoke image", () => {
  it("is the VS Code smoke image plus the release's AppImage for the architecture, extracted", () => {
    const dockerfile = orcaSmokeDockerfile("24.15.0", "1.4.249");
    expect(dockerfile.startsWith(vsCodeSmokeDockerfile("24.15.0").trimEnd())).toBe(true);
    expect(dockerfile).toContain(
      "https://github.com/stablyai/orca/releases/download/v1.4.249/$asset",
    );
    expect(dockerfile).toContain("orca-linux-arm64.AppImage || echo orca-linux.AppImage");
    expect(dockerfile).toContain("--appimage-extract");
    expect(dockerfile).toContain("ENV ORCA_APP=/opt/orca/squashfs-root");
  });

  it("gets a tag per Node, Orca and platform", () => {
    const tag = orcaSmokeDockerImage("24.15.0", "1.4.249", "linux/amd64");
    expect(tag).toMatch(
      /^modeler-shell-orca-smoke:node24\.15\.0-orca1\.4\.249-[0-9a-f]{12}-linux-amd64$/,
    );
    expect(orcaSmokeDockerImage("24.15.0", "1.4.248")).not.toBe(
      orcaSmokeDockerImage("24.15.0", "1.4.249"),
    );
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
