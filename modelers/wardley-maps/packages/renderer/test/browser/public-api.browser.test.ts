import { describe, expect, it } from "vitest";
import type { ModuleDeclaration } from "didi";
import * as api from "../../src/index.js";
import wardleyCss from "../../src/assets/wardley.css?raw";

describe("public API", () => {
  it("exports every Wardley module the Modeler is built from, for custom editors", () => {
    const modeler = new api.Modeler();
    const modules = (modeler as unknown as { _getModules(): ModuleDeclaration[] })._getModules();
    const exported = new Set<unknown>(Object.values(api));
    const ownService =
      /^(wardley|mapResize|mapProjection|pipelineGroup|evolution|stageSnapping|panConstraint)/u;
    const wardleyModules = modules.filter(
      (module) =>
        module === api.canvasAccessibilityModule ||
        Object.keys(module).some((name) => ownService.test(name)),
    );
    expect(wardleyModules.length).toBeGreaterThan(10);
    for (const module of wardleyModules) {
      expect(exported.has(module), JSON.stringify(Object.keys(module))).toBe(true);
    }
    modeler.destroy();
  });

  it("leaves the keyboard shortcuts dialog and the PNG to the shell, keeping their data and helpers (#258)", () => {
    expect(api).not.toHaveProperty("createShortcutsDialog");
    expect(api).not.toHaveProperty("svgToPng");
    expect(wardleyCss).not.toContain(".wardley-shortcuts");
    for (const kept of [
      api.mapShortcuts,
      api.mapMenu,
      api.createMapDialog,
      api.createTitleDialog,
      api.blobToBase64,
    ]) {
      expect(kept).toBeTypeOf("function");
    }
  });
});
