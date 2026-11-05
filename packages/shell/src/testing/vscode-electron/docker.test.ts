import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  DOCKER_RESULTS_MARKER,
  VSCODE_SMOKE_CONTAINER_SCRIPT,
  VSCODE_SMOKE_DOCKER_VOLUMES,
  findRepositoryRoot,
  parseVsCodeSmokeDockerArguments,
  pathInside,
  prepareResultsDirectory,
  runVsCodeSmokeInDocker,
  vsCodeSmokeDockerImage,
  vsCodeSmokeDockerRunArgs,
  vsCodeSmokeDockerfile,
} from "./docker.js";

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "modeler-shell-docker-")));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let directoryCount = 0;
function freshDirectory(): string {
  const directory = join(scratch, `case-${directoryCount++}`);
  mkdirSync(directory, { recursive: true });
  return directory;
}

function write(path: string, text = ""): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

describe("vsCodeSmokeDockerfile", () => {
  const dockerfile = vsCodeSmokeDockerfile("22.22.2");

  it("starts from the official Node image of the version on a fixed Debian release", () => {
    expect(dockerfile.split("\n")[0]).toBe("FROM node:22.22.2-bookworm-slim");
  });

  it("installs an X server for xvfb-run, Electron's libraries, fonts, unzip and git, and no recommends", () => {
    const packageLines = dockerfile
      .split("\n")
      .filter((line) => line.startsWith(" "))
      .map((line) => line.trimStart());
    for (const name of [
      "xvfb",
      "xauth",
      "libgtk-3-0",
      "libnss3",
      "libgbm1",
      "libasound2",
      "libxkbfile1",
      "libsecret-1-0",
      "fonts-liberation",
      "unzip",
      "git",
    ]) {
      expect(packageLines).toContain(`${name} \\`);
    }
    expect(dockerfile).toContain("apt-get install -y --no-install-recommends");
    expect(dockerfile).toContain("rm -rf /var/lib/apt/lists/*");
  });
});

describe("vsCodeSmokeDockerImage", () => {
  it("names a local image after the Node version and the recipe's hash", () => {
    expect(vsCodeSmokeDockerImage("22.22.2")).toMatch(
      /^modeler-shell-vscode-smoke:node22\.22\.2-[0-9a-f]{12}$/,
    );
    expect(vsCodeSmokeDockerImage("22.22.2")).toBe(vsCodeSmokeDockerImage("22.22.2"));
    expect(vsCodeSmokeDockerImage("24.15.0")).not.toBe(vsCodeSmokeDockerImage("22.22.2"));
  });

  it("ends the tag with a requested platform, so the native and the emulated image never share one", () => {
    const native = vsCodeSmokeDockerImage("22.22.2");
    expect(vsCodeSmokeDockerImage("22.22.2", "linux/amd64")).toBe(`${native}-linux-amd64`);
    expect(vsCodeSmokeDockerImage("22.22.2", "linux/arm/v7")).toBe(`${native}-linux-arm-v7`);
    expect(vsCodeSmokeDockerImage("22.22.2", "")).toBe(native);
  });
});

describe("vsCodeSmokeDockerRunArgs", () => {
  const args = vsCodeSmokeDockerRunArgs({
    image: "modeler-shell-vscode-smoke:node22.22.2-abc",
    root: "/repos/wardley",
    workdir: "",
    results: "test-results/vscode-smoke",
    command: ["npm", "run", "test:vscode"],
    env: { VSCODE_SMOKE_VERSION: "1.96.0" },
    hostUser: { uid: 501, gid: 20 },
  });
  const volumes = args.flatMap((arg, index) => (args[index - 1] === "--volume" ? [arg] : []));
  const environment = args.flatMap((arg, index) => (args[index - 1] === "--env" ? [arg] : []));

  it("removes the container, reaps VS Code's processes and gives Chromium shared memory", () => {
    expect(args.slice(0, 4)).toEqual(["run", "--rm", "--init", "--shm-size=1g"]);
    expect(args).not.toContain("--platform");
  });

  it("mounts the repository read-only, the results writable, and the two shared caches", () => {
    expect(volumes).toEqual([
      "/repos/wardley:/repo:ro",
      "/repos/wardley/test-results/vscode-smoke:/results",
      `${VSCODE_SMOKE_DOCKER_VOLUMES.cache}:/root/.cache`,
      `${VSCODE_SMOKE_DOCKER_VOLUMES.npm}:/root/.npm`,
    ]);
  });

  it("passes the modeler's variables, the paths, the host's user, no Git hooks and Ctrl+C to every process", () => {
    expect(environment).toEqual([
      "VSCODE_SMOKE_VERSION=1.96.0",
      "SMOKE_RESULTS=test-results/vscode-smoke",
      "SMOKE_WORKDIR=",
      "HOST_UID=501",
      "HOST_GID=20",
      "TMPDIR=/tmp/vscode-smoke",
      "HUSKY=0",
      "TINI_KILL_PROCESS_GROUP=1",
    ]);
  });

  it("ends with the image, the container script and the command as its arguments", () => {
    const imageAt = args.indexOf("modeler-shell-vscode-smoke:node22.22.2-abc");
    expect(args.slice(imageAt)).toEqual([
      "modeler-shell-vscode-smoke:node22.22.2-abc",
      "bash",
      "-c",
      VSCODE_SMOKE_CONTAINER_SCRIPT,
      "vscode-smoke",
      "npm",
      "run",
      "test:vscode",
    ]);
  });

  it("adds --platform when one is asked for", () => {
    const amd64 = vsCodeSmokeDockerRunArgs({
      image: "i",
      root: "/r",
      workdir: "apps/vscode",
      results: "out",
      command: ["true"],
      platform: "linux/amd64",
    });
    expect(amd64.slice(amd64.indexOf("--platform"), amd64.indexOf("--platform") + 2)).toEqual([
      "--platform",
      "linux/amd64",
    ]);
    expect(amd64).toContain("HOST_UID=");
  });
});

describe("the container script", () => {
  const hasBash = spawnSync("bash", ["--version"]).status === 0;

  it("is valid bash", { skip: !hasBash }, () => {
    expect(spawnSync("bash", ["-n"], { input: VSCODE_SMOKE_CONTAINER_SCRIPT }).status).toBe(0);
  });

  // The container's tools stubbed: npm records its call, xvfb-run runs its command after the flags.
  // The case's directory reaches them through the environment: a temporary path is no shell code.
  it(
    "copies the repository without node_modules, .git and the results, runs npm ci, then the command, and copies the results back",
    { skip: !hasBash },
    () => {
      const base = freshDirectory();
      const [repo, work, out, bin, temp] = ["repo", "work", "out", "bin", "temp"].map((name) =>
        join(base, name),
      ) as [string, string, string, string, string];
      write(join(repo, "package.json"), "{}");
      write(join(repo, "apps/vscode/src/extension.ts"), "export {};");
      write(join(repo, "node_modules/esbuild/index.js"));
      write(join(repo, "apps/vscode/node_modules/x/index.js"));
      write(join(repo, ".git/HEAD"));
      write(join(repo, "test-results/vscode-smoke/stale.png"));
      mkdirSync(out, { recursive: true });
      write(
        join(bin, "npm"),
        `#!/bin/sh\nif [ "$1" = "-v" ]; then echo 10.0.0; else echo "$@" >> "$CASE_DIRECTORY/npm-calls"; fi\n`,
      );
      write(join(bin, "node"), "#!/bin/sh\necho v22.22.2\n");
      write(
        join(bin, "xvfb-run"),
        `#!/bin/sh\necho "$@" > "$CASE_DIRECTORY/xvfb-args"\nshift 3\nexec "$@"\n`,
      );
      for (const tool of ["npm", "node", "xvfb-run"]) chmodSync(join(bin, tool), 0o755);
      const command = [
        "sh",
        "-c",
        `ls -A > "$CASE_DIRECTORY/seen"; mkdir -p ../../test-results/vscode-smoke; echo png > ../../test-results/vscode-smoke/tool-light.png; ` +
          `mkdir -p "$TMPDIR/modeler-shell-vscode-1/user-data/logs/s/window1"; echo log > "$TMPDIR/modeler-shell-vscode-1/user-data/logs/s/window1/exthost.log"; exit 3`,
      ];
      const ran = spawnSync(
        "bash",
        ["-c", VSCODE_SMOKE_CONTAINER_SCRIPT, "vscode-smoke", ...command],
        {
          encoding: "utf8",
          env: {
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            SMOKE_REPO: repo,
            SMOKE_WORK: work,
            SMOKE_OUT: out,
            SMOKE_RESULTS: "test-results/vscode-smoke",
            SMOKE_WORKDIR: "apps/vscode",
            HOST_UID: "",
            HOST_GID: "",
            TMPDIR: temp,
            CASE_DIRECTORY: base,
          },
        },
      );
      expect(ran.status, ran.stderr).toBe(3);
      expect(ran.stdout).toContain("[vscode-docker] npm ci in");
      expect(ran.stdout).toContain("[vscode-docker] the command exited with code 3 after");
      expect(readFileSync(join(base, "npm-calls"), "utf8")).toBe("ci --no-audit --no-fund\n");
      expect(readFileSync(join(base, "xvfb-args"), "utf8")).toMatch(
        /^-a -s -screen 0 1920x1200x24 sh -c /,
      );
      // the command ran in the workdir of the copy, which has the sources and none of the excluded
      expect(readFileSync(join(base, "seen"), "utf8").split("\n")).toEqual(["src", ""]);
      expect(existsSync(join(work, "package.json"))).toBe(true);
      expect(existsSync(join(work, "node_modules"))).toBe(false);
      expect(existsSync(join(work, "apps/vscode/node_modules"))).toBe(false);
      expect(existsSync(join(work, ".git"))).toBe(false);
      expect(existsSync(join(work, "test-results/vscode-smoke/stale.png"))).toBe(false);
      expect(readdirSync(out).sort()).toEqual(["tool-light.png", "vscode-logs"]);
      expect(
        readFileSync(join(out, "vscode-logs/modeler-shell-vscode-1/s/window1/exthost.log"), "utf8"),
      ).toBe("log\n");
    },
  );
});

describe("findRepositoryRoot", () => {
  it("finds the nearest directory with a package-lock.json, the root of an npm workspace", () => {
    const root = freshDirectory();
    write(join(root, "package-lock.json"), "{}");
    mkdirSync(join(root, "apps", "vscode"), { recursive: true });
    expect(findRepositoryRoot(join(root, "apps", "vscode"))).toBe(root);
    expect(findRepositoryRoot(root)).toBe(root);
  });
});

describe("pathInside", () => {
  it("keeps paths inside the root, relative and with forward slashes, and rejects the rest", () => {
    expect(pathInside("/r", "test-results/vscode-smoke")).toBe("test-results/vscode-smoke");
    expect(pathInside("/r", "/r/out")).toBe("out");
    expect(pathInside("/r", ".")).toBe("");
    expect(pathInside("/r", "../elsewhere")).toBeUndefined();
    expect(pathInside("/r", "/elsewhere")).toBeUndefined();
  });
});

describe("prepareResultsDirectory", () => {
  it("creates a missing directory with the marker", () => {
    const directory = join(freshDirectory(), "test-results", "vscode-smoke");
    expect(prepareResultsDirectory(directory)).toBe(true);
    expect(readdirSync(directory)).toEqual([DOCKER_RESULTS_MARKER]);
  });

  it("empties a directory an earlier run created", () => {
    const directory = freshDirectory();
    prepareResultsDirectory(directory);
    write(join(directory, "wardley-open-failure.png"));
    write(join(directory, "vscode-logs", "run", "main.log"));
    expect(prepareResultsDirectory(directory)).toBe(true);
    expect(readdirSync(directory)).toEqual([DOCKER_RESULTS_MARKER]);
  });

  it("empties the directory in place, so a bind mount of it stays valid", () => {
    const directory = freshDirectory();
    prepareResultsDirectory(directory);
    write(join(directory, "wardley-light.png"));
    const before = statSync(directory).ino;
    expect(prepareResultsDirectory(directory)).toBe(true);
    expect(statSync(directory).ino).toBe(before);
    expect(readdirSync(directory)).toEqual([DOCKER_RESULTS_MARKER]);
  });

  it("leaves a directory with files of its own alone", () => {
    const directory = freshDirectory();
    write(join(directory, "notes.md"), "mine");
    expect(prepareResultsDirectory(directory)).toBe(false);
    expect(readdirSync(directory)).toEqual(["notes.md"]);
  });

  it("empties an owned directory, the default one, without the marker", () => {
    const directory = freshDirectory();
    write(join(directory, "wardley-light.png"), "from a local run");
    expect(prepareResultsDirectory(directory, true)).toBe(true);
    expect(readdirSync(directory)).toEqual([DOCKER_RESULTS_MARKER]);
  });
});

describe("parseVsCodeSmokeDockerArguments", () => {
  it("defaults to npm run test:vscode with no options", () => {
    expect(parseVsCodeSmokeDockerArguments([], {})).toEqual({ help: false, options: {} });
  });

  it("reads every option, separate or with =", () => {
    expect(
      parseVsCodeSmokeDockerArguments(
        [
          "--script",
          "test:vscode-smoke",
          "--results=out/smoke",
          "--node",
          "v22.22.2",
          "--image=mine:1",
          "--platform",
          "linux/amd64",
          "--rebuild",
        ],
        {},
      ),
    ).toEqual({
      help: false,
      options: {
        command: ["npm", "run", "test:vscode-smoke"],
        results: "out/smoke",
        nodeVersion: "22.22.2",
        image: "mine:1",
        platform: "linux/amd64",
        rebuild: true,
      },
    });
  });

  it("passes variables with a value, takes the rest from the environment and skips unset ones", () => {
    const parsed = parseVsCodeSmokeDockerArguments(
      [
        "--env",
        "VSCODE_SMOKE_VERSION=1.96.0",
        "--env",
        "VSCODE_SMOKE_KEEP",
        "--env",
        "UNSET",
        "--env=A=b=c",
      ],
      { VSCODE_SMOKE_KEEP: "1" },
    );
    expect(parsed).toEqual({
      help: false,
      options: { env: { VSCODE_SMOKE_VERSION: "1.96.0", VSCODE_SMOKE_KEEP: "1", A: "b=c" } },
    });
  });

  it("takes everything after -- as the command", () => {
    expect(
      parseVsCodeSmokeDockerArguments(["--rebuild", "--", "npm", "run", "x", "--", "--flag"], {}),
    ).toEqual({
      help: false,
      options: { rebuild: true, command: ["npm", "run", "x", "--", "--flag"] },
    });
  });

  it("asks for help, and rejects unknown options, missing values and two commands", () => {
    expect(parseVsCodeSmokeDockerArguments(["-h"], {})).toEqual({ help: true });
    expect(parseVsCodeSmokeDockerArguments(["--help"], {})).toEqual({ help: true });
    expect(() => parseVsCodeSmokeDockerArguments(["--bogus"], {})).toThrow(
      /unknown option --bogus[\s\S]*Usage/,
    );
    expect(() => parseVsCodeSmokeDockerArguments(["--script"], {})).toThrow(
      "--script needs a value",
    );
    expect(() => parseVsCodeSmokeDockerArguments(["--env", "1X=2"], {})).toThrow(
      "not a variable name",
    );
    expect(() => parseVsCodeSmokeDockerArguments(["--script", "a", "--", "b"], {})).toThrow(
      "exclude each other",
    );
  });
});

// Docker stubbed by a script that logs its calls; the environment picks its answers.
describe("runVsCodeSmokeInDocker", { skip: process.platform === "win32" }, () => {
  const stubDirectory = freshDirectory();
  const stub = join(stubDirectory, "docker");
  const calls = join(stubDirectory, "calls");
  const stdinCopy = join(stubDirectory, "stdin");
  write(
    stub,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> "${calls}"`,
      'case "$1" in',
      '  version) [ -n "$STUB_NO_DOCKER" ] && { echo "Cannot connect to the Docker daemon" >&2; exit 1; }; echo "29.0.0 arm64";;',
      // STUB_IMAGE_EXISTS: 1 for every image, or the one tag that exists
      '  image) [ "$STUB_IMAGE_EXISTS" = 1 ] || [ "$STUB_IMAGE_EXISTS" = "$3" ] || exit 1;;',
      `  build) cat > "${stdinCopy}";;`,
      '  run) exit "${STUB_RUN_EXIT:-0}";;',
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(stub, 0o755);
  const saved = { ...process.env };
  afterEach(() => {
    for (const name of ["STUB_NO_DOCKER", "STUB_IMAGE_EXISTS", "STUB_RUN_EXIT"])
      delete process.env[name];
    Object.assign(process.env, saved);
    rmSync(calls, { force: true });
    rmSync(stdinCopy, { force: true });
  });

  function repository(): string {
    const root = freshDirectory();
    write(join(root, "package-lock.json"), "{}");
    mkdirSync(join(root, "apps", "vscode"), { recursive: true });
    return root;
  }

  const lines: string[] = [];
  const log = (line: string) => lines.push(line);

  it("builds a missing image from the Dockerfile on stdin, runs the container and returns its exit code", async () => {
    process.env.STUB_RUN_EXIT = "7";
    const root = repository();
    const result = await runVsCodeSmokeInDocker({
      cwd: join(root, "apps", "vscode"),
      docker: stub,
      nodeVersion: "22.22.2",
      env: { VSCODE_SMOKE_KEEP: "1" },
      log,
    });
    const image = vsCodeSmokeDockerImage("22.22.2");
    expect(result).toMatchObject({
      exitCode: 7,
      image,
      root,
      results: join(root, "test-results", "vscode-smoke"),
    });
    const called = readFileSync(calls, "utf8").trim().split("\n");
    expect(called.slice(0, 3)).toEqual([
      "version --format {{.Server.Version}}",
      `image inspect ${image}`,
      `build --tag ${image} -`,
    ]);
    expect(called[3]).toMatch(/^run --rm --init /);
    expect(called[3]).toContain(`--volume ${root}:/repo:ro`);
    expect(called[3]).toContain("SMOKE_WORKDIR=apps/vscode");
    expect(called[3]).toContain("VSCODE_SMOKE_KEEP=1");
    expect(called.at(-1)).toMatch(/vscode-smoke npm run test:vscode$/);
    expect(readFileSync(stdinCopy, "utf8")).toBe(vsCodeSmokeDockerfile("22.22.2"));
    expect(readdirSync(result.results)).toEqual([DOCKER_RESULTS_MARKER]);
  });

  it("empties the default results directory of a local run, but not a directory of one's own", async () => {
    process.env.STUB_IMAGE_EXISTS = "1";
    const root = repository();
    write(join(root, "test-results", "vscode-smoke", "wardley-open-failure.png"));
    write(join(root, "docs", "images", "map.png"));
    await runVsCodeSmokeInDocker({ cwd: root, docker: stub, nodeVersion: "22.22.2", log });
    expect(readdirSync(join(root, "test-results", "vscode-smoke"))).toEqual([
      DOCKER_RESULTS_MARKER,
    ]);
    const logged = lines.length;
    await runVsCodeSmokeInDocker({
      cwd: root,
      docker: stub,
      nodeVersion: "22.22.2",
      results: "docs/images",
      log,
    });
    expect(readdirSync(join(root, "docs", "images"))).toEqual(["map.png"]);
    expect(
      lines.slice(logged).filter((line) => line.includes("has files of its own")),
    ).toHaveLength(1);
  });

  it("reuses an existing image, builds none for an image of one's own, and runs the given command", async () => {
    process.env.STUB_IMAGE_EXISTS = "1";
    const root = repository();
    await runVsCodeSmokeInDocker({ cwd: root, docker: stub, nodeVersion: "22.22.2", log });
    expect(readFileSync(calls, "utf8")).not.toContain("build");
    rmSync(calls);
    const own = await runVsCodeSmokeInDocker({
      cwd: root,
      docker: stub,
      image: "mine:1",
      command: ["npm", "run", "test:vscode-smoke"],
      results: "out",
      log,
    });
    const called = readFileSync(calls, "utf8");
    expect(called).not.toContain("image inspect");
    expect(called).toContain(" mine:1 bash -c ");
    expect(called.trim()).toMatch(/npm run test:vscode-smoke$/);
    expect(own).toMatchObject({ exitCode: 0, image: "mine:1", results: join(root, "out") });
  });

  it("builds and runs an image of its own for a requested platform, next to the native one", async () => {
    process.env.STUB_IMAGE_EXISTS = vsCodeSmokeDockerImage("22.22.2");
    const root = repository();
    const result = await runVsCodeSmokeInDocker({
      cwd: root,
      docker: stub,
      nodeVersion: "22.22.2",
      platform: "linux/amd64",
      command: ["uname", "-m"],
      log,
    });
    const amd64 = vsCodeSmokeDockerImage("22.22.2", "linux/amd64");
    expect(result.image).toBe(amd64);
    const called = readFileSync(calls, "utf8").trim().split("\n");
    expect(called.slice(1, 3)).toEqual([
      `image inspect ${amd64}`,
      `build --platform linux/amd64 --tag ${amd64} -`,
    ]);
    expect(called[3]).toContain("--platform linux/amd64");
    expect(called[3]).toContain(` ${amd64} bash -c `);
    rmSync(calls);
    await runVsCodeSmokeInDocker({ cwd: root, docker: stub, nodeVersion: "22.22.2", log });
    expect(readFileSync(calls, "utf8")).not.toContain("build");
    expect(readFileSync(calls, "utf8")).toContain(` ${vsCodeSmokeDockerImage("22.22.2")} bash -c `);
  });

  it("takes an absolute results directory through a symlink to the repository", async () => {
    process.env.STUB_IMAGE_EXISTS = "1";
    const root = repository();
    const linked = join(freshDirectory(), "linked");
    symlinkSync(root, linked);
    const result = await runVsCodeSmokeInDocker({
      cwd: join(linked, "apps", "vscode"),
      docker: stub,
      nodeVersion: "22.22.2",
      results: join(linked, "out", "smoke"),
      log,
    });
    expect(result).toMatchObject({ root, results: join(root, "out", "smoke") });
    const called = readFileSync(calls, "utf8");
    expect(called).toContain(`--volume ${join(root, "out", "smoke")}:/results`);
    expect(called).toContain("SMOKE_RESULTS=out/smoke");
    expect(called).toContain("SMOKE_WORKDIR=apps/vscode");
    expect(readdirSync(join(root, "out", "smoke"))).toEqual([DOCKER_RESULTS_MARKER]);
  });

  it("rejects a results directory that a symlink inside the repository leads out of it", async () => {
    process.env.STUB_IMAGE_EXISTS = "1";
    const root = repository();
    const elsewhere = freshDirectory();
    symlinkSync(elsewhere, join(root, "escape"));
    await expect(
      runVsCodeSmokeInDocker({ cwd: root, docker: stub, results: "escape/smoke", log }),
    ).rejects.toThrow("has to be a directory inside");
    expect(readdirSync(elsewhere)).toEqual([]);
  });

  it("explains a Docker that does not answer, a directory without a lockfile and results outside the repository", async () => {
    process.env.STUB_NO_DOCKER = "1";
    const root = repository();
    await expect(runVsCodeSmokeInDocker({ cwd: root, docker: stub, log })).rejects.toThrow(
      "Docker is not available (Cannot connect to the Docker daemon)",
    );
    await expect(runVsCodeSmokeInDocker({ cwd: "/", docker: stub, log })).rejects.toThrow(
      "no package-lock.json in / or above",
    );
    await expect(
      runVsCodeSmokeInDocker({ cwd: root, docker: stub, results: "..", log }),
    ).rejects.toThrow("has to be a directory inside");
    await expect(
      runVsCodeSmokeInDocker({ cwd: root, docker: stub, results: ".", log }),
    ).rejects.toThrow("not the root");
  });
});
