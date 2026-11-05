import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { constants } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * What VS Code needs on a Debian bookworm without a desktop: an X server for `xvfb-run` (with
 * `xauth`), Electron's shared libraries, fonts for the workbench, and `unzip` and `git`, which
 * modelers' smoke tests and builds call.
 */
export const VSCODE_SMOKE_DOCKER_PACKAGES: readonly string[] = [
  "ca-certificates",
  "git",
  "unzip",
  "xauth",
  "xvfb",
  "fonts-dejavu-core",
  "fonts-liberation",
  "libasound2",
  "libatk-bridge2.0-0",
  "libatk1.0-0",
  "libatspi2.0-0",
  "libcairo2",
  "libcups2",
  "libdbus-1-3",
  "libdrm2",
  "libexpat1",
  "libgbm1",
  "libglib2.0-0",
  "libgtk-3-0",
  "libnspr4",
  "libnss3",
  "libpango-1.0-0",
  "libsecret-1-0",
  "libx11-6",
  "libx11-xcb1",
  "libxcb1",
  "libxcomposite1",
  "libxdamage1",
  "libxext6",
  "libxfixes3",
  "libxkbcommon0",
  "libxkbfile1",
  "libxrandr2",
  "libxshmfence1",
  "libxss1",
  "libxtst6",
];

/** The named Docker volumes every run shares: VS Code's downloads (`~/.cache`) and npm's cache. */
export const VSCODE_SMOKE_DOCKER_VOLUMES = {
  cache: "modeler-shell-vscode-cache",
  npm: "modeler-shell-npm-cache",
} as const;

export const DEFAULT_DOCKER_RESULTS = "test-results/vscode-smoke";
export const DEFAULT_DOCKER_COMMAND: readonly string[] = ["npm", "run", "test:vscode"];

/** The image's Dockerfile: the official Node image of `nodeVersion` on Debian bookworm, plus the packages. */
export function vsCodeSmokeDockerfile(nodeVersion: string): string {
  return [
    `FROM node:${nodeVersion}-bookworm-slim`,
    "RUN apt-get update \\",
    "  && apt-get install -y --no-install-recommends \\",
    ...VSCODE_SMOKE_DOCKER_PACKAGES.map((name) => `    ${name} \\`),
    "  && rm -rf /var/lib/apt/lists/*",
    "",
  ].join("\n");
}

/**
 * The local image's tag; the hash of the Dockerfile in it builds a new image when the recipe changes.
 * A `platform` (`linux/amd64`) ends the tag (`-linux-amd64`): a tag holds one platform's image, so
 * the native and the emulated image need one each.
 */
export function vsCodeSmokeDockerImage(nodeVersion: string, platform?: string): string {
  const hash = createHash("sha256")
    .update(vsCodeSmokeDockerfile(nodeVersion))
    .digest("hex")
    .slice(0, 12);
  const suffix = platform ? `-${platform.replace(/[^A-Za-z0-9_.-]+/g, "-")}` : "";
  return `modeler-shell-vscode-smoke:node${nodeVersion}-${hash}${suffix}`;
}

/**
 * What runs in the container: copy the read-only repository into the container without
 * `node_modules`, `.git`, `.vscode-test` and the results, `npm ci` (Linux builds of the native
 * packages, not the host's), the command under `xvfb-run -a`, then the results and VS Code's kept
 * logs out to `/results`. Exits with the command's code.
 */
export const VSCODE_SMOKE_CONTAINER_SCRIPT = `set -euo pipefail
repo=\${SMOKE_REPO:-/repo} work=\${SMOKE_WORK:-/work} out=\${SMOKE_OUT:-/results}
say() { echo "[vscode-docker] $*"; }
since() { echo "$(( $(date +%s) - $1 )) s"; }
start=$(date +%s)
mkdir -p "$work" "$TMPDIR"
tar -C "$repo" --exclude=node_modules --exclude=.git --exclude=.vscode-test --exclude="./$SMOKE_RESULTS" -cf - . | tar -C "$work" -xf -
say "copied the repository in $(since "$start")"
cd "$work"
start=$(date +%s)
if ! npm ci --no-audit --no-fund > "$TMPDIR/npm-ci.log" 2>&1; then
  tail -n 40 "$TMPDIR/npm-ci.log"
  say "npm ci failed after $(since "$start")"
  exit 1
fi
say "npm ci in $(since "$start") (node $(node -v), npm $(npm -v))"
cd "$work/$SMOKE_WORKDIR"
say "xvfb-run -a $*"
start=$(date +%s)
set +e
xvfb-run -a -s "-screen 0 1920x1200x24" "$@"
code=$?
set -e
say "the command exited with code $code after $(since "$start")"
if [ -d "$work/$SMOKE_RESULTS" ]; then cp -R "$work/$SMOKE_RESULTS/." "$out/"; fi
for logs in "$TMPDIR"/modeler-shell-vscode-*/user-data/logs; do
  [ -d "$logs" ] || continue
  run=$(basename "$(dirname "$(dirname "$logs")")")
  mkdir -p "$out/vscode-logs/$run"
  cp -R "$logs/." "$out/vscode-logs/$run/"
done
if [ -n "$HOST_UID" ]; then chown -R "$HOST_UID:$HOST_GID" "$out" 2>/dev/null || true; fi
exit "$code"
`;

export interface VsCodeSmokeDockerRunOptions {
  image: string;
  /** The repository root on the host, absolute. */
  root: string;
  /** Where the command runs, relative to the root; `""` for the root. */
  workdir: string;
  /** The results, relative to the root (`test-results/vscode-smoke`). */
  results: string;
  command: readonly string[];
  env?: Readonly<Record<string, string>> | undefined;
  platform?: string | undefined;
  /** The host's user, who gets the results; none on Windows. */
  hostUser?: { uid: number; gid: number } | undefined;
}

/** `docker run`'s arguments for one smoke run. */
export function vsCodeSmokeDockerRunArgs(options: VsCodeSmokeDockerRunOptions): string[] {
  const environment: Record<string, string> = {
    ...options.env,
    SMOKE_RESULTS: options.results,
    SMOKE_WORKDIR: options.workdir,
    HOST_UID: options.hostUser ? String(options.hostUser.uid) : "",
    HOST_GID: options.hostUser ? String(options.hostUser.gid) : "",
    TMPDIR: "/tmp/vscode-smoke",
    HUSKY: "0",
    // --init's tini passes Ctrl+C to the whole process group: bash defers it while it waits for
    // xvfb-run, so the test would run on to its end
    TINI_KILL_PROCESS_GROUP: "1",
  };
  return [
    "run",
    "--rm",
    // reaps the many processes of VS Code and passes Ctrl+C on
    "--init",
    // Chromium's shared memory; Docker's 64 MB default crashes renderers
    "--shm-size=1g",
    ...(options.platform ? ["--platform", options.platform] : []),
    "--volume",
    `${options.root}:/repo:ro`,
    "--volume",
    `${join(options.root, options.results)}:/results`,
    "--volume",
    `${VSCODE_SMOKE_DOCKER_VOLUMES.cache}:/root/.cache`,
    "--volume",
    `${VSCODE_SMOKE_DOCKER_VOLUMES.npm}:/root/.npm`,
    ...Object.entries(environment).flatMap(([name, value]) => ["--env", `${name}=${value}`]),
    options.image,
    "bash",
    "-c",
    VSCODE_SMOKE_CONTAINER_SCRIPT,
    "vscode-smoke",
    ...options.command,
  ];
}

/** The nearest directory from `start` upwards with a `package-lock.json`: the root `npm ci` needs. */
export function findRepositoryRoot(start: string): string | undefined {
  let directory = resolve(start);
  for (;;) {
    if (existsSync(join(directory, "package-lock.json"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

/** A path inside `root`, relative and with forward slashes (`""` for the root); undefined when it leaves the root. */
export function pathInside(root: string, path: string): string | undefined {
  const inside = relative(root, resolve(root, path));
  if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return undefined;
  return inside.split(sep).join("/");
}

/**
 * `path` with the symlinks of its longest existing part resolved and the missing rest appended, so
 * a path through a symlink (`/tmp` on macOS is `/private/tmp`) compares with a real root.
 */
export function realPathOf(path: string): string {
  const missing: string[] = [];
  let existing = resolve(path);
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    missing.unshift(basename(existing));
    existing = parent;
  }
  return join(realpathSync(existing), ...missing);
}

/** Marks a results directory this command created, so the next run may empty it. */
export const DOCKER_RESULTS_MARKER = ".modeler-shell-vscode-docker";

/**
 * Prepares the host's results directory: empties one that an earlier run created (it has the
 * marker) or that is `owned` anyway, and creates a missing or empty one with the marker. Any other
 * directory with files stays as it is, the run's files land next to them. Returns whether it
 * starts empty.
 */
export function prepareResultsDirectory(directory: string, owned = false): boolean {
  if (owned || existsSync(join(directory, DOCKER_RESULTS_MARKER))) {
    // emptied in place, never removed: Docker Desktop's file sharing can keep the bind mount on a
    // directory removed just before the run, and the copy back into its replacement then fails
    if (existsSync(directory)) {
      for (const entry of readdirSync(directory))
        rmSync(join(directory, entry), { recursive: true, force: true });
    }
  }
  if (existsSync(directory) && readdirSync(directory).length > 0) return false;
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, DOCKER_RESULTS_MARKER),
    "Created by modeler-shell-vscode-docker, which empties this directory on its next run.\n",
  );
  return true;
}

export interface VsCodeSmokeDockerOptions {
  /** Where the command runs; the repository root is the nearest directory with a `package-lock.json`. */
  cwd?: string | undefined;
  /** Run under `xvfb-run -a` in the container after `npm ci`; default `npm run test:vscode`. */
  command?: readonly string[] | undefined;
  /** Copied back to the host after the run, relative to the root; default `test-results/vscode-smoke`. */
  results?: string | undefined;
  /** The Node.js version of the image; default the one that runs this. */
  nodeVersion?: string | undefined;
  /** Into the container's environment. */
  env?: Readonly<Record<string, string>> | undefined;
  /** An image of one's own instead of the one built from `vsCodeSmokeDockerfile`. */
  image?: string | undefined;
  /** `docker --platform`, with an image of its own; default the Docker host's. */
  platform?: string | undefined;
  /** Builds the image even when it exists. */
  rebuild?: boolean | undefined;
  /** The Docker CLI; default `docker`. */
  docker?: string | undefined;
  /** Progress lines; default `console.log`. */
  log?: ((line: string) => void) | undefined;
}

export interface VsCodeSmokeDockerResult {
  /** The command's exit code in the container (`npm ci` failing: 1). */
  exitCode: number;
  image: string;
  root: string;
  /** The results on the host, absolute. */
  results: string;
  /** Milliseconds: building the image (0 when it existed) and the container run. */
  timings: { image: number; run: number };
}

function elapsed(since: number): number {
  return Math.round(performance.now() - since);
}

function run(command: string, args: readonly string[], input?: string): Promise<number> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
    });
    // Ctrl+C reaches docker too; it stops the container and exits, and this process with it.
    const ignore = () => undefined;
    process.on("SIGINT", ignore);
    child.once("error", (error) => {
      process.off("SIGINT", ignore);
      reject(error);
    });
    child.once("close", (code, signal) => {
      process.off("SIGINT", ignore);
      resolveExit(code ?? 128 + (signal ? constants.signals[signal] : 0));
    });
    if (input !== undefined) child.stdin?.end(input);
  });
}

/**
 * Runs a modeler's VS Code smoke test in a Linux container under `xvfb-run -a`, so no VS Code
 * window opens on the host: builds the image once, mounts the repository read-only, keeps VS
 * Code's downloads and npm's cache in named volumes, and copies the results directory back.
 * Throws when Docker is not available or the options are unusable; the test's failure is the exit code.
 */
export async function runVsCodeSmokeInDocker(
  options: VsCodeSmokeDockerOptions = {},
): Promise<VsCodeSmokeDockerResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  const docker = options.docker ?? "docker";
  const cwd = resolve(options.cwd ?? process.cwd());
  const found = findRepositoryRoot(cwd);
  if (!found)
    throw new Error(
      `no package-lock.json in ${cwd} or above: run it inside the modeler's repository`,
    );
  const root = realpathSync(found);
  const workdir = pathInside(root, realpathSync(cwd)) ?? "";
  const results = pathInside(
    root,
    realPathOf(resolve(root, options.results ?? DEFAULT_DOCKER_RESULTS)),
  );
  if (!results)
    throw new Error(`the results directory has to be a directory inside ${root}, not the root`);

  const server = spawnSync(docker, ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
  });
  if (server.status !== 0) {
    const reason = server.error
      ? server.error.message
      : (server.stderr ?? "").trim().split("\n")[0];
    throw new Error(
      `Docker is not available (${reason}): install and start Docker Desktop or Docker Engine`,
    );
  }
  log(`[vscode-docker] Docker ${server.stdout.trim()}`);

  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const image = options.image ?? vsCodeSmokeDockerImage(nodeVersion, options.platform);
  const imageStarted = performance.now();
  if (!options.image) {
    const exists = spawnSync(docker, ["image", "inspect", image], { stdio: "ignore" }).status === 0;
    if (!exists || options.rebuild) {
      log(
        `[vscode-docker] building ${image} (node:${nodeVersion}-bookworm-slim with VS Code's libraries)`,
      );
      const platform = options.platform ? ["--platform", options.platform] : [];
      const code = await run(
        docker,
        ["build", ...platform, "--tag", image, "-"],
        vsCodeSmokeDockerfile(nodeVersion),
      );
      if (code !== 0) {
        throw new Error(
          `docker build of ${image} failed (exit code ${code}); is node:${nodeVersion}-bookworm-slim on Docker Hub? --node picks another version`,
        );
      }
    }
  }
  const imageMs = elapsed(imageStarted);

  const hostResults = join(root, results);
  // The default directory is the smoke test's own; the modelers' tests empty it on every local run.
  if (!prepareResultsDirectory(hostResults, results === DEFAULT_DOCKER_RESULTS)) {
    log(`[vscode-docker] ${hostResults} has files of its own; the run's files land next to them`);
  }
  const command =
    options.command && options.command.length > 0 ? options.command : DEFAULT_DOCKER_COMMAND;
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  const args = vsCodeSmokeDockerRunArgs({
    image,
    root,
    workdir,
    results,
    command,
    env: options.env,
    platform: options.platform,
    hostUser: uid === undefined || gid === undefined ? undefined : { uid, gid },
  });
  log(`[vscode-docker] ${image}: ${root} → /repo (read-only), xvfb-run -a ${command.join(" ")}`);
  const runStarted = performance.now();
  const exitCode = await run(docker, args);
  const runMs = elapsed(runStarted);
  log(
    `[vscode-docker] exit code ${exitCode} after ${(runMs / 1000).toFixed(1)} s; results in ${hostResults}`,
  );
  return { exitCode, image, root, results: hostResults, timings: { image: imageMs, run: runMs } };
}

export const VSCODE_SMOKE_DOCKER_USAGE = `Usage: modeler-shell-vscode-docker [options] [-- <command> [arguments]]

Runs the modeler's VS Code smoke test in a Linux container under xvfb-run -a, so no VS Code window
opens on this machine. The repository (the nearest directory with a package-lock.json) is mounted
read-only and copied into the container without node_modules and .git; npm ci and the command run
there, and the results directory comes back.

Options:
  --script <name>         the npm script to run (default: test:vscode)
  --results <directory>   copied back, relative to the repository (default: ${DEFAULT_DOCKER_RESULTS})
  --env <NAME[=value]>    into the container's environment, the value from here when it has none (repeatable)
  --node <version>        the Node.js version of the image (default: this Node.js, ${process.versions.node})
  --image <name>          an image of one's own instead of the built one
  --platform <platform>   docker --platform, e.g. linux/amd64 (default: the Docker host's)
  --rebuild               build the image again
  -h, --help              this text

After -- the command replaces npm run <script>, e.g. -- npm run test:vscode-smoke.`;

export type VsCodeSmokeDockerArguments =
  { help: true } | { help: false; options: VsCodeSmokeDockerOptions };

/** The command line of `modeler-shell-vscode-docker`; throws for an unknown option or a missing value. */
export function parseVsCodeSmokeDockerArguments(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): VsCodeSmokeDockerArguments {
  const options: VsCodeSmokeDockerOptions = {};
  const env: Record<string, string> = {};
  let script: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--") {
      options.command = argv.slice(index + 1);
      break;
    }
    if (argument === "-h" || argument === "--help") return { help: true };
    if (argument === "--rebuild") {
      options.rebuild = true;
      continue;
    }
    const [name, inline] =
      argument.startsWith("--") && argument.includes("=") ? splitOnce(argument) : [argument];
    const valued = ["--script", "--results", "--env", "--node", "--image", "--platform"];
    if (!valued.includes(name))
      throw new Error(`unknown option ${argument}\n\n${VSCODE_SMOKE_DOCKER_USAGE}`);
    const value = inline ?? argv[++index];
    if (value === undefined || value === "") throw new Error(`${name} needs a value`);
    if (name === "--script") script = value;
    else if (name === "--results") options.results = value;
    else if (name === "--node") options.nodeVersion = value.replace(/^v/, "");
    else if (name === "--image") options.image = value;
    else if (name === "--platform") options.platform = value;
    else {
      const [variable, assigned] = splitOnce(value);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable))
        throw new Error(`--env ${value}: not a variable name`);
      const fromHere = assigned ?? environment[variable];
      if (fromHere !== undefined) env[variable] = fromHere;
    }
  }
  if (script && options.command) throw new Error("--script and -- <command> exclude each other");
  if (script) options.command = ["npm", "run", script];
  if (Object.keys(env).length > 0) options.env = env;
  return { help: false, options };
}

function splitOnce(text: string): [string, string | undefined] {
  const at = text.indexOf("=");
  return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
}
