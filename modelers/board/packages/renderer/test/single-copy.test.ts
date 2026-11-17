import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The board shares these libraries with whoever mounts it, and each works only as one copy: the
 * store tells its elements by `instanceof Y.Map`, a second React has hooks of its own, and a
 * second React Flow a store the board's parts cannot read. A host of the published renderer
 * dedupes them through its ranged peers (`peer-dependencies.sync.test.ts`); the board's own apps
 * bundle the renderer from source, where no peer range is read: the lockfile must install exactly
 * the root's copy.
 */
const SHARED = ["yjs", "react", "react-dom", "@xyflow/react"] as const;
const MODELER = "modelers/board";

interface LockEntry {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const lock = JSON.parse(
  readFileSync(new URL("../../../../../package-lock.json", import.meta.url), "utf8"),
) as { packages: Record<string, LockEntry> };

describe("the libraries the board shares with its hosts", () => {
  it("are installed once, at the root, never nested under this modeler", () => {
    const nested = Object.keys(lock.packages).filter(
      (path) =>
        path.startsWith(`${MODELER}/`) &&
        SHARED.some((name) => path.endsWith(`node_modules/${name}`)),
    );
    expect(nested).toEqual([]);
  });

  it.each(SHARED)("%s is pinned to the hoisted version in every workspace", (name) => {
    const hoisted = lock.packages[`node_modules/${name}`]?.version;
    expect(hoisted).toBeDefined();
    const pins = Object.entries(lock.packages)
      .filter(([path]) => path.startsWith(MODELER) && !path.includes("node_modules"))
      .flatMap(([path, entry]) =>
        [entry.dependencies?.[name], entry.devDependencies?.[name]].flatMap((pin) =>
          pin === undefined ? [] : [{ path, pin }],
        ),
      );
    expect(pins.length).toBeGreaterThan(0);
    expect(pins.filter(({ pin }) => pin !== hoisted)).toEqual([]);
  });
});
