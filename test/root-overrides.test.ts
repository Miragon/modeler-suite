/**
 * The root `overrides`. Besides the toolchain (`vite`, `@types/node`), an override lifts a
 * transitive dependency past a security advisory when no release of the package that pulls it in
 * accepts the fixed version yet. Every override is an exact pin, as every dependency is, and every
 * copy in the lockfile is on it. The advisories below stay out of the lockfile: one is fixed by an
 * override, the other by a newer `@azure/identity` within `@vscode/vsce`'s own range.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface LockedPackage {
  version?: string;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;
const overrides = readJson<{ overrides: Record<string, string> }>("package.json").overrides;
const lockedPackages = readJson<{ packages: Record<string, LockedPackage> }>(
  "package-lock.json",
).packages;

const lockedVersionsOf = (name: string): string[] =>
  Object.entries(lockedPackages)
    .filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
    .map(([, locked]) => locked.version ?? "");

const ADVISORIES = [
  { id: "GHSA-xcx6-jx8p-x3h5", name: "@azure/msal-node", vulnerable: ">=5.0.0-beta.0 <7.1.0" },
  { id: "GHSA-g3hv-75wg-m249", name: "minimatch", vulnerable: "<11.0.1" },
];

describe("the root overrides", () => {
  it.each(Object.entries(overrides))("pin %s to an exact version", (_, version) => {
    expect(semver.valid(version), version).not.toBeNull();
  });

  it.each(Object.entries(overrides))("put every locked copy of %s on it", (name, version) => {
    expect(lockedVersionsOf(name)).not.toEqual([]);
    expect(new Set(lockedVersionsOf(name))).toEqual(new Set([version]));
  });
});

describe.each(ADVISORIES)("the root lockfile and $id", ({ name, vulnerable }) => {
  it(`locks no ${name} the advisory names`, () => {
    const affected = lockedVersionsOf(name).filter((version) =>
      semver.satisfies(version, vulnerable, { includePrerelease: true }),
    );
    expect(affected).toEqual([]);
  });
});
