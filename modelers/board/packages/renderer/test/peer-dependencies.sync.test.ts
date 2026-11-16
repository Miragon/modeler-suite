import { readFileSync } from "node:fs";
import { satisfies, valid } from "semver";
import { describe, expect, it } from "vitest";

/**
 * The published renderer takes `yjs`, `react`, `react-dom` and `@xyflow/react` as ranged peers, so
 * a host dedupes them against its own copy. Inside the monorepo npm resolves a workspace's peers
 * from the workspace's own folder, where its exact devDependency mirror sits, and `pin-check`
 * skips `peerDependencies`. So install, build and tests stay green when a peer range rejects the
 * version the suite pins, and only a host that pins that version, as the board's apps do, hits
 * ERESOLVE on the published package (the Wardley Maps renderer's test, after #151).
 */

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const repositoryRoot = new URL("../../../", import.meta.url);
const suiteRoot = new URL("../../", repositoryRoot);

/** The modeler's workspaces as npm resolved the suite's globs: the lockfile has one entry each. */
function modelerWorkspaces(): string[] {
  const modeler = repositoryRoot.href.slice(suiteRoot.href.length);
  const lockfile = new URL("package-lock.json", suiteRoot);
  const { packages } = JSON.parse(readFileSync(lockfile, "utf8")) as { packages: object };
  return Object.keys(packages)
    .filter((path) => path.startsWith(modeler) && !path.includes("node_modules/"))
    .map((path) => path.slice(modeler.length));
}

function readManifest(directory: string): Manifest {
  const path = new URL(`${directory}/package.json`, repositoryRoot);
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

const workspaces = modelerWorkspaces().map(readManifest);
const workspacesByName = new Map(workspaces.map((manifest) => [manifest.name, manifest]));

function peersOf(manifest: Manifest): Array<[string, string]> {
  return Object.entries(manifest.peerDependencies ?? {});
}

function workspaceDependenciesOf(manifest: Manifest): Manifest[] {
  return Object.keys({ ...manifest.devDependencies, ...manifest.dependencies })
    .map((name) => workspacesByName.get(name))
    .filter((dependency): dependency is Manifest => dependency !== undefined);
}

function mirrorViolations(manifest: Manifest): string[] {
  return peersOf(manifest).flatMap(([peer, range]) => {
    const mirror = manifest.devDependencies?.[peer];
    if (mirror === undefined) return [`${peer}: no devDependency mirrors the peer ${range}`];
    if (valid(mirror) === null) return [`${peer}: the devDependency ${mirror} is not exact`];
    if (satisfies(mirror, range)) return [];
    return [`${peer}: the devDependency ${mirror} is outside the peer range ${range}`];
  });
}

function hostViolations(host: Manifest): string[] {
  return workspaceDependenciesOf(host).flatMap((dependency) =>
    peersOf(dependency).flatMap(([peer, range]) => {
      const installed = host.dependencies?.[peer] ?? host.devDependencies?.[peer];
      if (installed === undefined) {
        return [`${peer}: ${dependency.name} needs the peer ${range}, which is not installed`];
      }
      if (satisfies(installed, range)) return [];
      return [`${peer}: ${installed} is outside the peer range ${range} of ${dependency.name}`];
    }),
  );
}

const packagesWithPeers = workspaces.filter((manifest) => peersOf(manifest).length > 0);
const hostsOfPeers = workspaces.filter((manifest) =>
  workspaceDependenciesOf(manifest).some((dependency) => peersOf(dependency).length > 0),
);

describe("peer dependency ranges", () => {
  it("are the renderer's four shared libraries, and nobody else's", () => {
    expect(
      packagesWithPeers.map((manifest) => [manifest.name, Object.keys(manifest.peerDependencies!)]),
    ).toEqual([["@miragon/board-renderer", ["@xyflow/react", "react", "react-dom", "yjs"]]]);
  });

  it("reach every workspace that depends on the renderer", () => {
    expect(hostsOfPeers.map((manifest) => manifest.name).sort()).toEqual([
      "@miragon/board-host",
      "@miragon/board-webapp",
      "board-ide-editor",
      "board-modeler",
    ]);
  });

  it.each(packagesWithPeers)(
    "$name accepts the exact devDependency it builds and tests each peer with",
    (manifest) => {
      expect(mirrorViolations(manifest)).toEqual([]);
    },
  );

  it.each(hostsOfPeers)(
    "$name installs a version of each peer that its workspace dependencies accept",
    (manifest) => {
      expect(hostViolations(manifest)).toEqual([]);
    },
  );
});
