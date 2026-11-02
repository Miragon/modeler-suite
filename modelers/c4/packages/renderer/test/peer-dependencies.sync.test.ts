import { readFileSync } from "node:fs";
import { satisfies, valid } from "semver";
import { describe, expect, it } from "vitest";

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface PeerPin {
  provider: string;
  peer: string;
  range: string;
  consumer: string;
  version: string;
}

function readManifest(directoryFromRepoRoot: string): Manifest {
  const manifestUrl = new URL(`../../../${directoryFromRepoRoot}package.json`, import.meta.url);
  return JSON.parse(readFileSync(manifestUrl, "utf8")) as Manifest;
}

/** The modeler's workspaces as npm resolved the suite's globs: the lockfile has one entry each. */
function modelerWorkspaces(): string[] {
  const repositoryRoot = new URL("../../../", import.meta.url);
  const suiteRoot = new URL("../../", repositoryRoot);
  const modeler = repositoryRoot.href.slice(suiteRoot.href.length);
  const lockfile = new URL("package-lock.json", suiteRoot);
  const { packages } = JSON.parse(readFileSync(lockfile, "utf8")) as { packages: object };
  return Object.keys(packages)
    .filter((path) => path.startsWith(modeler) && !path.includes("node_modules/"))
    .map((path) => path.slice(modeler.length));
}

const workspaces = modelerWorkspaces().map((directory) => readManifest(`${directory}/`));
const providers = workspaces.filter((manifest) => manifest.peerDependencies !== undefined);

function declaredVersions(manifest: Manifest, packageName: string): string[] {
  return [manifest.dependencies, manifest.devDependencies].flatMap((section) => {
    const version = section?.[packageName];
    return version === undefined ? [] : [version];
  });
}

function consumersOf(provider: Manifest): Manifest[] {
  return workspaces.filter(
    (manifest) => manifest === provider || declaredVersions(manifest, provider.name).length > 0,
  );
}

const peerPins: PeerPin[] = providers.flatMap((provider) =>
  Object.entries(provider.peerDependencies ?? {}).flatMap(([peer, range]) =>
    consumersOf(provider).flatMap((consumer) =>
      declaredVersions(consumer, peer).map((version) => ({
        provider: provider.name,
        peer,
        range,
        consumer: consumer.name,
        version,
      })),
    ),
  ),
);

/**
 * pin-check ignores `peerDependencies`, so nothing else notices when a Dependabot major moves the
 * exact pins past a peer range: the published package then fails `npm install` (ERESOLVE) for a
 * consumer that pins the version this repo builds and ships with.
 */
describe("peerDependencies of the workspace packages", () => {
  it("mirrors every ranged peer with an exact devDependency", () => {
    expect(providers.length).toBeGreaterThan(0);
    for (const provider of providers) {
      for (const [peer, range] of Object.entries(provider.peerDependencies ?? {})) {
        if (valid(range) === range) continue;
        const mirror = provider.devDependencies?.[peer];
        expect(mirror, `${provider.name} devDependency ${peer}`).toBeDefined();
        expect(valid(mirror), `${provider.name} devDependency ${peer}@${mirror}`).toBe(mirror);
      }
    }
  });

  it.each(peerPins)(
    "$consumer: $peer $version is inside the peer range $range of $provider",
    ({ version, range }) => {
      expect(satisfies(version, range)).toBe(true);
    },
  );
});
