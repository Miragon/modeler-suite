import {
  parseVsCodeSmokeDockerArguments,
  runVsCodeSmokeInDocker,
  type VsCodeSmokeDockerOptions,
  type VsCodeSmokeDockerResult,
} from "../vscode-electron/docker.js";

/** The Orca the smoke runs on unless `--orca` names another release. */
export const DEFAULT_ORCA_VERSION = "1.4.254";
export const DEFAULT_ORCA_RESULTS = "test-results/orca-smoke";
export const DEFAULT_ORCA_COMMAND: readonly string[] = ["npm", "run", "test:orca"];

/**
 * Miragon/orca-plugin-kit's image of an Orca release: Node 22 on Debian bookworm with Orca's
 * libraries, xvfb and the extracted Orca, whose folder `ORCA_APP` names.
 */
export function orcaSmokeDockerImage(orcaVersion: string): string {
  return `ghcr.io/miragon/orca:${orcaVersion}`;
}

export interface OrcaSmokeDockerOptions extends VsCodeSmokeDockerOptions {
  /** The Orca release in the image; default `DEFAULT_ORCA_VERSION`. */
  orcaVersion?: string | undefined;
}

/**
 * Runs a modeler's Orca smoke test (`npm run test:orca`) in a Linux container under `xvfb-run -a`,
 * as `runVsCodeSmokeInDocker` runs the VS Code one, on `orcaSmokeDockerImage`: the repository is
 * copied in, `npm ci` and the command run there, and the results come back.
 */
export function runOrcaSmokeInDocker(
  options: OrcaSmokeDockerOptions = {},
): Promise<VsCodeSmokeDockerResult> {
  return runVsCodeSmokeInDocker({
    ...options,
    image: options.image ?? orcaSmokeDockerImage(options.orcaVersion ?? DEFAULT_ORCA_VERSION),
    command: options.command && options.command.length > 0 ? options.command : DEFAULT_ORCA_COMMAND,
    results: options.results ?? DEFAULT_ORCA_RESULTS,
  });
}

export const ORCA_SMOKE_DOCKER_USAGE = `Usage: modeler-shell-orca-docker [options] [-- <command> [arguments]]

Runs the modeler's Orca smoke test in a Linux container under xvfb-run -a, so no Orca window opens
on this machine; the options of modeler-shell-vscode-docker, plus:

  --orca <version>        the Orca release, ghcr.io/miragon/orca:<version> (default: ${DEFAULT_ORCA_VERSION})

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
