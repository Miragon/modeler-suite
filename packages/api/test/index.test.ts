/**
 * The package root (src/index.ts): the contract version and its compatibility rule, what the root
 * exports and what package.json declares, and the types the renderers implement. tsc checks the
 * type blocks, as `npm run typecheck` includes test/.
 */
import { describe, expect, expectTypeOf, test } from "vitest";

import pkg from "../package.json" with { type: "json" };
import * as kit from "../src/conformance.js";
import * as root from "../src/index.js";
import {
  type AppearanceRequest,
  type AppearanceSurface,
  type AppearanceTheme,
  type CollaborativeModeler,
  type CollaborativeModelerOptions,
  type DiagramPoint,
  type FreeAreaInsets,
  type InteractionSurface,
  MODELER_API_VERSION,
} from "../src/index.js";

describe("the package root", () => {
  test("the contract version constant IS the package version (one identity)", () => {
    expect(MODELER_API_VERSION).toBe(pkg.version);
  });

  test("apiVersion compatibility: same major; while 0.x, the same minor too", () => {
    expect(root.apiVersionsCompatible("0.3.1", "0.3.9")).toBe(true);
    expect(root.apiVersionsCompatible("0.3.1", "0.4.0")).toBe(false);
    expect(root.apiVersionsCompatible("1.2.0", "1.9.3")).toBe(true);
    expect(root.apiVersionsCompatible("1.2.0", "2.0.0")).toBe(false);
    // an optional surface is a minor: a 1.2 renderer binds to a 1.3 host and the other way round
    expect(root.apiVersionsCompatible("1.2.0", "1.3.0")).toBe(true);
    expect(root.apiVersionsCompatible("1.3.0", "1.2.0")).toBe(true);
  });

  test("hosts bind from the package root: /conformance exports the kit alone, without apiVersionsCompatible (since 2.0)", () => {
    expect(Object.keys(kit).sort()).toEqual([
      "attachedHost",
      "conformanceCases",
      "mergeConformanceCases",
      "registerConformance",
      "registerMergeConformance",
    ]);
  });

  test("the package root carries no kit code — a host bundle that binds from it stays free of the kit", () => {
    expect(Object.keys(root).sort()).toEqual([
      "MODELER_API_VERSION",
      "MergeConflictError",
      "apiVersionsCompatible",
      "isMergeConflict",
      "mergeItemsById",
      "mergeItemsByOccurrence",
      "mergeRecord",
      "mergeTextLines",
      "mergeValue",
      "sameJsonValue",
    ]);
  });

  test("the contract has no runtime dependencies: package.json declares no dependencies, optional or peer ones", () => {
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      expect(pkg, field).not.toHaveProperty(field);
    }
  });
});

describe("the aligned factory options (a type the renderers implement, checked by tsc)", () => {
  test("the free area takes insets or a centre, never both, next to fitOnImport and undoRedoKeys", () => {
    const insets = (): FreeAreaInsets => ({ top: 88, right: 24, bottom: 64, left: 24 });
    const center = (): DiagramPoint | undefined => ({ x: 400, y: 300 });
    /** a renderer's contract factory, as a host calls it */
    const createModeler = (_options: CollaborativeModelerOptions = {}): void => undefined;

    createModeler({});
    createModeler({ freeArea: { insets }, fitOnImport: false, undoRedoKeys: false });
    createModeler({ freeArea: { center } });
    // @ts-expect-error one form only: a renderer given both could not tell which one the host means
    createModeler({ freeArea: { insets, center } });
  });
});

describe("the optional 1.5 surfaces (types the renderers implement, checked by tsc)", () => {
  test("interaction has an active() and an onChange that returns its unsubscribe", () => {
    expectTypeOf<InteractionSurface["active"]>().toEqualTypeOf<() => boolean>();
    expectTypeOf<InteractionSurface["onChange"]>().toEqualTypeOf<
      (listener: (active: boolean) => void) => () => void
    >();
  });

  test("appearance takes light or dark with a contrast, and a host only reads its themes", () => {
    const appearance: AppearanceSurface = { themes: ["light"], set: () => undefined };

    appearance.set({ theme: "dark" });
    appearance.set({ theme: "dark", contrast: "high" });
    appearance.set({ theme: "light", contrast: "normal" });
    // @ts-expect-error the contract spells high contrast "high"; "hoch" is the guide's attribute value
    appearance.set({ theme: "light", contrast: "hoch" });
    // @ts-expect-error a modeler draws light or dark; following the system is the host's decision
    appearance.set({ theme: "system" });

    expectTypeOf<AppearanceSurface["themes"]>().toEqualTypeOf<readonly AppearanceTheme[]>();
    expectTypeOf<AppearanceSurface["set"]>().parameter(0).toEqualTypeOf<AppearanceRequest>();
    expectTypeOf({}).toExtend<Pick<CollaborativeModeler, "interaction" | "appearance">>();
  });
});
