import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Drift guard for the suite's one release PR. release-please's node-workspace plugin bumps a
 * released component's package.json and every other component's pin on it. A pin in a workspace
 * that is no component (an e2e package, team-topologies' lockstep packages) is not part of its
 * graph, and the plugin leaves the root lockfile alone as soon as any `extra-files` entry points
 * into it: each of those places needs an entry of the pinned component, or the release PR leaves
 * it behind, npm can no longer link the workspace and `npm ci` fails on main.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LOCKFILE = "/package-lock.json";
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

interface PackageManifest {
  name: string;
  version: string;
  private?: boolean;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

type ExtraFile = string | { type: string; path: string; jsonpath?: string; glob?: boolean };

interface ComponentConfig {
  component?: string;
  "extra-files"?: ExtraFile[];
}

interface ReleaseConfig {
  plugins?: (string | { type: string })[];
  packages: Record<string, ComponentConfig>;
}

interface JsonLocation {
  path: string;
  jsonpath: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;
}

const config = readJson<ReleaseConfig>("release-please-config.json");
const manifest = readJson<Record<string, string>>(".release-please-manifest.json");
const lockfile = readJson<{ packages: Record<string, object> }>("package-lock.json");

const workspaces = Object.keys(lockfile.packages)
  .filter((path) => path !== "" && !path.includes("node_modules/"))
  .map((path) => ({ path, manifest: readJson<PackageManifest>(`${path}/package.json`) }));
const componentPaths = Object.keys(config.packages);

/** The component a workspace is released with: its own path, else the nearest one above it. */
function owningComponent(workspacePath: string): string | undefined {
  return componentPaths
    .filter((path) => workspacePath === path || workspacePath.startsWith(`${path}/`))
    .sort((left, right) => right.length - left.length)[0];
}

/** An extra-files path is relative to its component unless it starts with `/`. */
function suitePath(componentPath: string, path: string): string {
  return path.startsWith("/") ? path : `/${componentPath}/${path}`;
}

function jsonExtraFiles(componentPath: string): JsonLocation[] {
  return (config.packages[componentPath]?.["extra-files"] ?? []).flatMap((entry) =>
    typeof entry === "object" && entry.type === "json" && !entry.glob && entry.jsonpath
      ? [{ path: suitePath(componentPath, entry.path), jsonpath: entry.jsonpath }]
      : [],
  );
}

const describeLocation = ({ path, jsonpath }: JsonLocation): string => `${path} ${jsonpath}`;

/** Every place outside the node-workspace plugin's reach that carries a component's version. */
function locationsOutsideTheWorkspacePlugin(): Map<string, JsonLocation[]> {
  const byComponent = new Map<string, JsonLocation[]>(
    componentPaths.map((path) => [
      path,
      [{ path: LOCKFILE, jsonpath: `$.packages['${path}'].version` }],
    ]),
  );
  const ownerByName = new Map(
    workspaces.flatMap(({ path, manifest }) => {
      const owner = owningComponent(path);
      return owner ? [[manifest.name, { owner, isComponent: owner === path }] as const] : [];
    }),
  );
  for (const { path, manifest } of workspaces) {
    const owner = owningComponent(path);
    const isComponent = owner === path;
    if (owner && !isComponent) {
      byComponent
        .get(owner)!
        .push(
          { path: `/${path}/package.json`, jsonpath: "$.version" },
          { path: LOCKFILE, jsonpath: `$.packages['${path}'].version` },
        );
    }
    for (const section of DEPENDENCY_SECTIONS) {
      for (const dependency of Object.keys(manifest[section] ?? {})) {
        const pinned = ownerByName.get(dependency);
        if (!pinned) continue;
        const locations = byComponent.get(pinned.owner)!;
        locations.push({
          path: LOCKFILE,
          jsonpath: `$.packages['${path}'].${section}['${dependency}']`,
        });
        if (!(isComponent && pinned.isComponent)) {
          locations.push({
            path: `/${path}/package.json`,
            jsonpath: `$.${section}['${dependency}']`,
          });
        }
      }
    }
  }
  return byComponent;
}

const jsonpathSegment = /\.([\w-]+)|\['([^']+)'\]|\[(\d+)\]/y;

function readJsonPath(document: unknown, jsonpath: string): unknown {
  if (!jsonpath.startsWith("$")) throw new Error(`Unsupported jsonpath: ${jsonpath}`);
  let value = document;
  jsonpathSegment.lastIndex = 1;
  while (jsonpathSegment.lastIndex < jsonpath.length) {
    const match = jsonpathSegment.exec(jsonpath);
    if (!match) throw new Error(`Unsupported jsonpath: ${jsonpath}`);
    const key = match[1] ?? match[2] ?? Number(match[3]);
    value = (value as Record<string | number, unknown> | undefined)?.[key];
  }
  return value;
}

describe("the suite's release-please config", () => {
  it("lists every component in the manifest at the version of its package.json", () => {
    expect(Object.keys(manifest).sort()).toEqual([...componentPaths].sort());
    for (const path of componentPaths) {
      expect(manifest[path], path).toBe(readJson<PackageManifest>(`${path}/package.json`).version);
    }
  });

  it("gives every component a name of its own, so every tag is unique", () => {
    const names = componentPaths.map((path) => config.packages[path]!.component);
    expect(names.filter((name) => !name)).toEqual([]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("releases every published npm package and every VS Code extension", () => {
    const unreleased = workspaces
      .filter(({ manifest }) => !manifest.private || manifest.engines?.vscode)
      .filter(({ path }) => !owningComponent(path))
      .map(({ path }) => path);
    expect(unreleased).toEqual([]);
  });

  it("runs the node-workspace plugin, which the extra-files below rely on", () => {
    const plugins = (config.plugins ?? []).map((plugin) =>
      typeof plugin === "string" ? plugin : plugin.type,
    );
    expect(plugins).toContain("node-workspace");
  });

  it("bumps every pin and lockstep version the node-workspace plugin does not reach", () => {
    const missing = [...locationsOutsideTheWorkspacePlugin()].flatMap(([path, locations]) => {
      const listed = new Set(jsonExtraFiles(path).map(describeLocation));
      return locations
        .map(describeLocation)
        .filter((location) => !listed.has(location))
        .map((location) => `${path}: ${location}`);
    });
    expect(missing).toEqual([]);
  });

  // release-please skips a jsonpath that matches nothing without a log line, so a mistyped or
  // orphaned entry would silently drop its bump.
  it("points every json extra-file at a value that holds its component's version", () => {
    const stale = componentPaths.flatMap((path) =>
      jsonExtraFiles(path)
        .map((location) => ({
          location: `${path}: ${describeLocation(location)}`,
          value: readJsonPath(readJson(location.path), location.jsonpath),
        }))
        .filter(({ value }) => value !== manifest[path]),
    );
    expect(stale).toEqual([]);
  });

  // The catalog lists the manifest's version; a release that left it behind would publish a new
  // package.json version as an Orca plugin version that is listed already, which the catalog refuses.
  it("makes every Orca plugin's component bump its orca-plugin.json", () => {
    const plugins = workspaces
      .map(({ path }) => path)
      .filter((path) => existsSync(join(ROOT, path, "orca-plugin.json")));
    const unbumped = plugins.filter((path) => {
      const component = owningComponent(path);
      return (
        component === undefined ||
        !jsonExtraFiles(component).some(
          (location) =>
            location.path === `/${path}/orca-plugin.json` && location.jsonpath === "$.version",
        )
      );
    });
    expect(plugins.length).toBeGreaterThan(0);
    expect(unbumped).toEqual([]);
  });
});
