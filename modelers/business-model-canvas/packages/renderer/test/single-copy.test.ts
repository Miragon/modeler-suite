import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * This modeler publishes nothing, so it has no ranged peers that let a host dedupe the libraries
 * it shares with the renderer. One copy of each is what keeps `instanceof`, schema identity and
 * the diagram-js injector working, so the lockfile must install exactly the root's copy.
 */
const SHARED = ["zod", "diagram-js", "didi", "tiny-svg"] as const;
const MODELER = "modelers/business-model-canvas";

interface LockEntry {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const lock = JSON.parse(
  readFileSync(new URL("../../../../../package-lock.json", import.meta.url), "utf8"),
) as { packages: Record<string, LockEntry> };

describe("the libraries the renderer shares with its hosts", () => {
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
