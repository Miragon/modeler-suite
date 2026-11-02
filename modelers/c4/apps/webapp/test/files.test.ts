import { describe, expect, it } from "vitest";
import {
  NATIVE_EXTENSION,
  OPENABLE_FILE_TYPES,
  WORKSPACE_FILE_NAME,
  nativeFileName,
  pictureFileName,
  slugify,
} from "../src/files.js";

describe("slugify", () => {
  it("writes ASCII words with dashes: marks go, ß becomes ss, camel case splits", () => {
    expect(slugify("Größe & Übergabe")).toBe("grosse-ubergabe");
    expect(slugify("SystemLandscape")).toBe("system-landscape");
    expect(slugify("Containers-bookshop")).toBe("containers-bookshop");
    expect(slugify("  !!! ")).toBe("");
    expect(slugify("a".repeat(80))).toBe("a".repeat(60));
  });
});

describe("pictureFileName", () => {
  it("names the workspace and the view the picture shows", () => {
    expect(pictureFileName("Bookshop", "Containers-bookshop", "png")).toBe(
      "bookshop-containers-bookshop.png",
    );
    expect(pictureFileName("Bookshop", "SystemLandscape", "svg")).toBe(
      "bookshop-system-landscape.svg",
    );
  });

  it("falls back to “workspace” for a workspace without a name", () => {
    expect(pictureFileName("", "SystemLandscape", "png")).toBe("workspace-system-landscape.png");
    expect(pictureFileName(" ", "", "svg")).toBe("workspace.svg");
  });
});

describe("nativeFileName", () => {
  it("names the native .c4 file after the workspace", () => {
    expect(NATIVE_EXTENSION).toBe(".c4");
    expect(nativeFileName("Bookshop")).toBe("bookshop.c4");
    expect(nativeFileName("Größe & Übergabe")).toBe("grosse-ubergabe.c4");
  });

  it("falls back to “workspace” for a workspace without a name", () => {
    expect(nativeFileName("")).toBe("workspace.c4");
    expect(nativeFileName(" !!! ")).toBe("workspace.c4");
  });
});

describe("WORKSPACE_FILE_NAME", () => {
  it("is the file Structurizr's own tools open", () => {
    expect(WORKSPACE_FILE_NAME).toBe("workspace.dsl");
  });
});

describe("OPENABLE_FILE_TYPES", () => {
  it("takes the native .c4 file, Structurizr DSL and plain text", () => {
    expect(OPENABLE_FILE_TYPES).toEqual([".c4", ".dsl", ".txt", "text/plain"]);
  });
});
