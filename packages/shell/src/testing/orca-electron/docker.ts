import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import {
  parseVsCodeSmokeDockerArguments,
  runVsCodeSmokeInDocker,
  vsCodeSmokeDockerfile,
  type VsCodeSmokeDockerOptions,
  type VsCodeSmokeDockerResult,
} from "../vscode-electron/docker.js";

/** The Orca the smoke runs on unless `--orca` names another release. */
export const DEFAULT_ORCA_VERSION = "1.4.249";
export const DEFAULT_ORCA_RESULTS = "test-results/orca-smoke";
export const DEFAULT_ORCA_COMMAND: readonly string[] = ["npm", "run", "test:orca"];
/** Where the image keeps the extracted Orca; the driver reads it from `ORCA_APP`. */
export const ORCA_APP_IN_IMAGE = "/opt/orca/squashfs-root";

/**
 * The VS Code smoke image (Node on Debian bookworm with Electron's libraries) plus the Orca
 * release's AppImage for the image's architecture, extracted, so it runs without FUSE.
 */
export function orcaSmokeDockerfile(nodeVersion: string, orcaVersion: string): string {
  return [
    vsCodeSmokeDockerfile(nodeVersion).trimEnd(),
    "RUN apt-get update && apt-get install -y --no-install-recommends curl dbus-x11 \\",
    "  && rm -rf /var/lib/apt/lists/*",
    "RUN mkdir -p /opt/orca && cd /opt/orca \\",
    '  && asset=$([ "$(dpkg --print-architecture)" = arm64 ] && echo orca-linux-arm64.AppImage || echo orca-linux.AppImage) \\',
    `  && curl -fsSL -o orca.AppImage "https://github.com/stablyai/orca/releases/download/v${orcaVersion}/$asset" \\`,
    "  && chmod +x orca.AppImage && ./orca.AppImage --appimage-extract > /dev/null && rm orca.AppImage",
    `ENV ORCA_APP=${ORCA_APP_IN_IMAGE}`,
    "",
  ].join("\n");
}

export function orcaSmokeDockerImage(
  nodeVersion: string,
  orcaVersion: string,
  platform?: string,
): string {
  const hash = createHash("sha256")
    .update(orcaSmokeDockerfile(nodeVersion, orcaVersion))
    .digest("hex")
    .slice(0, 12);
  const suffix = platform ? `-${platform.replace(/[^A-Za-z0-9_.-]+/g, "-")}` : "";
  return `modeler-shell-orca-smoke:node${nodeVersion}-orca${orcaVersion}-${hash}${suffix}`;
}

export interface OrcaSmokeDockerOptions extends VsCodeSmokeDockerOptions {
  /** The Orca release in the image; default `DEFAULT_ORCA_VERSION`. */
  orcaVersion?: string | undefined;
}

function build(docker: string, args: readonly string[], dockerfile: string): Promise<number> {
  return new Promise((done, reject) => {
    const child = spawn(docker, args, { stdio: ["pipe", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("close", (code) => done(code ?? 1));
    child.stdin.end(dockerfile);
  });
}

/**
 * Runs a modeler's Orca smoke test (`npm run test:orca`) in a Linux container under `xvfb-run -a`,
 * as `runVsCodeSmokeInDocker` runs the VS Code one: the image holds the extracted Orca, the
 * repository is copied in, `npm ci` and the command run there, and the results come back.
 */
export async function runOrcaSmokeInDocker(
  options: OrcaSmokeDockerOptions = {},
): Promise<VsCodeSmokeDockerResult> {
  const docker = options.docker ?? "docker";
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const orcaVersion = options.orcaVersion ?? DEFAULT_ORCA_VERSION;
  const image = options.image ?? orcaSmokeDockerImage(nodeVersion, orcaVersion, options.platform);
  if (!options.image) {
    const exists = spawnSync(docker, ["image", "inspect", image], { stdio: "ignore" }).status === 0;
    if (!exists || options.rebuild) {
      (options.log ?? console.log)(`[orca-docker] building ${image} (Orca ${orcaVersion})`);
      const platform = options.platform ? ["--platform", options.platform] : [];
      const code = await build(
        docker,
        ["build", ...platform, "--tag", image, "-"],
        orcaSmokeDockerfile(nodeVersion, orcaVersion),
      );
      if (code !== 0) throw new Error(`docker build of ${image} failed (exit code ${code})`);
    }
  }
  return runVsCodeSmokeInDocker({
    ...options,
    image,
    command: options.command && options.command.length > 0 ? options.command : DEFAULT_ORCA_COMMAND,
    results: options.results ?? DEFAULT_ORCA_RESULTS,
  });
}

export const ORCA_SMOKE_DOCKER_USAGE = `Usage: modeler-shell-orca-docker [options] [-- <command> [arguments]]

Runs the modeler's Orca smoke test in a Linux container under xvfb-run -a, so no Orca window opens
on this machine; the options of modeler-shell-vscode-docker, plus:

  --orca <version>        the Orca release in the image (default: ${DEFAULT_ORCA_VERSION})

The default script is test:orca, the default results ${DEFAULT_ORCA_RESULTS}.`;

export type OrcaSmokeDockerArguments =
  { help: true } | { help: false; options: OrcaSmokeDockerOptions };

export function parseOrcaSmokeDockerArguments(argv: readonly string[]): OrcaSmokeDockerArguments {
  const rest: string[] = [];
  let orcaVersion: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--") {
      rest.push(...argv.slice(index));
      break;
    }
    if (argument === "--orca" || argument.startsWith("--orca=")) {
      const value = argument.includes("=") ? argument.slice("--orca=".length) : argv[++index];
      if (!value) throw new Error("--orca needs a value");
      orcaVersion = value.replace(/^v/, "");
      continue;
    }
    rest.push(argument);
  }
  const parsed = parseVsCodeSmokeDockerArguments(rest);
  if (parsed.help) return parsed;
  return { help: false, options: { ...parsed.options, orcaVersion } };
}
