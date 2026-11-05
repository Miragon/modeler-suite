#!/usr/bin/env node
// The `modeler-shell-orca-docker` command: the Orca smoke test in a Linux container.
import {
  ORCA_SMOKE_DOCKER_USAGE,
  parseOrcaSmokeDockerArguments,
  runOrcaSmokeInDocker,
} from "./docker.js";

try {
  const parsed = parseOrcaSmokeDockerArguments(process.argv.slice(2));
  if (parsed.help) {
    console.log(ORCA_SMOKE_DOCKER_USAGE);
  } else {
    const result = await runOrcaSmokeInDocker(parsed.options);
    process.exitCode = result.exitCode;
  }
} catch (error) {
  console.error(
    `modeler-shell-orca-docker: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
}
