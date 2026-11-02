import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyEdit, parseWorkspace } from "@miragon/c4-dsl";
import {
  C4_COLOUR_STYLES,
  defaultSize,
  resolveElementStyle,
  viewCatalog,
  viewMembers,
  type Box,
} from "@miragon/c4-schema-model";
import { EXAMPLE } from "../src/example.js";

const FILE = readFileSync(new URL("../../../example/bookshop.c4", import.meta.url), "utf8");
const parse = parseWorkspace(EXAMPLE);
const { workspace } = parse;

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe("the example (SPEC 8.1)", () => {
  it("is example/bookshop.c4 byte for byte, the file both apps ship", () => {
    expect(EXAMPLE).toBe(FILE);
  });

  it("opens without an error or a warning", () => {
    expect(parse.ok).toBe(true);
    expect(parse.diagnostics.filter((diagnostic) => diagnostic.severity !== "info")).toEqual([]);
  });

  it("is the Bookshop: Customer, its containers and components, and two existing systems", () => {
    expect(workspace.name).toBe("Bookshop");
    const names = (kind: string) =>
      workspace.elements.filter((element) => element.kind === kind).map((element) => element.name);
    expect(names("person")).toEqual(["Customer"]);
    expect(names("softwareSystem")).toEqual(["Bookshop", "Payment Provider", "E-mail System"]);
    expect(names("container")).toEqual(["Web App", "API", "Database"]);
    expect(names("component")).toEqual(["Catalogue", "Orders", "Notifications"]);
  });

  it("has a view of every editable type, opening on the landscape", () => {
    const catalog = viewCatalog(workspace);
    const written = catalog.list().filter((entry) => entry.state === "written");
    expect(written.map((entry) => [entry.type, entry.editable])).toEqual([
      ["systemLandscape", true],
      ["systemContext", true],
      ["container", true],
      ["component", true],
      ["dynamic", false],
      ["deployment", false],
    ]);
    expect(catalog.defaultView().key).toBe("SystemLandscape");
    expect(EXAMPLE).toMatch(/^ {8}deploymentEnvironment "Live" \{$/m);
  });

  it("stores a box for every element of every editable view, and no two boxes overlap", () => {
    for (const view of workspace.views.filter((definition) => definition.editable)) {
      const entry = viewCatalog(workspace).resolve(view.key);
      if (!entry) throw new Error(`no catalog entry for ${view.key}`);
      const members = viewMembers(workspace, entry).elements;
      expect([...view.layout.elements.keys()].sort()).toEqual([...members].sort());
      expect(view.layout.unmatched).toEqual([]);
      expect(view.layout.malformed).toEqual([]);
      const boxes = members.map((id) => {
        const element = workspace.elements.find((candidate) => candidate.id === id);
        const stored = view.layout.elements.get(id);
        if (!element || !stored) throw new Error(`${id} has no element or box`);
        return {
          x: stored.x,
          y: stored.y,
          ...defaultSize(resolveElementStyle(element, workspace.styles).shape),
        };
      });
      boxes.forEach((box, index) => {
        for (const other of boxes.slice(index + 1)) expect(overlaps(box, other)).toBe(false);
      });
    }
  });

  it("ships the C4 colours, so Apply C4 colours changes nothing", () => {
    for (const colours of C4_COLOUR_STYLES) {
      const style = workspace.styles.elements.find((candidate) => candidate.tag === colours.tag);
      expect(style).toMatchObject({
        background: colours.background.toLowerCase(),
        color: colours.color.toLowerCase(),
        stroke: colours.stroke.toLowerCase(),
      });
    }
    const outcome = applyEdit(
      parse,
      { type: "applyC4Colours" },
      {
        view: "SystemLandscape",
        boxes: new Map(),
        vertices: new Map(),
        fresh: new Set(),
        identifiers: "readable",
        random: () => "0000",
      },
    );
    expect(outcome.ok && outcome.text).toBe(EXAMPLE);
  });
});
