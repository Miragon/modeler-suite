import { describe, expect, it } from "vitest";
import * as renderer from "./index.js";

describe("the renderer's exports", () => {
  it.each(["createShortcutsDialog", "geistFontFaceCss", "embedSvgStyles", "GEIST_UNICODE_RANGES"])(
    "leave %s to the modeler shell",
    (name) => {
      expect(renderer).not.toHaveProperty(name);
    },
  );

  it("keep the title dialog, the shortcut groups and the menu for a host's chrome", () => {
    expect(renderer).toHaveProperty("createTitleDialog");
    expect(renderer).toHaveProperty("diagramShortcuts");
    expect(renderer).toHaveProperty("diagramMenu");
  });
});
