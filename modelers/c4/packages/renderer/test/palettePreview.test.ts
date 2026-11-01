import { describe, expect, it } from "vitest";
import { newWorkspaceText, parseWorkspace } from "@miragon/c4-dsl";
import { C4_COLOUR_STYLES, type Styles } from "@miragon/c4-schema-model";
import { createdElementStyle } from "../src/draw/SceneLookup.js";
import { shapePreviewSvg } from "../src/draw/preview.js";
import { schemaModelNotation } from "../src/scene/notation.js";

const NO_STYLES: Styles = { elements: [], relationships: [], themes: [] };

function c4Styles(): Styles {
  const parse = parseWorkspace(newWorkspaceText());
  return parse.workspace.styles;
}

function pathsOf(markup: string): Array<Record<string, string>> {
  return [...markup.matchAll(/<path ([^>]*)\/>/g)].map(([, attributes]) =>
    Object.fromEntries(
      [...(attributes ?? "").matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [
        name,
        value,
      ]),
    ),
  );
}

describe("the look a create lands in (palette previews, create preview)", () => {
  it("is the kind's look under the workspace's styles", () => {
    const styles = c4Styles();
    const colour = (tag: string) =>
      C4_COLOUR_STYLES.find((style) => style.tag === tag)?.background.toLowerCase();
    expect(createdElementStyle("person", [], styles, schemaModelNotation)).toMatchObject({
      shape: "Person",
      fill: colour("Person"),
    });
    expect(createdElementStyle("softwareSystem", [], styles, schemaModelNotation).fill).toBe(
      colour("Software System"),
    );
    expect(createdElementStyle("container", [], styles, schemaModelNotation).fill).toBe(
      colour("Container"),
    );
    expect(createdElementStyle("component", [], styles, schemaModelNotation).fill).toBe(
      colour("Component"),
    );
  });

  it("gives the Database entry the cylinder its create writes when no style has the tag", () => {
    const style = createdElementStyle("container", ["Database"], c4Styles(), schemaModelNotation);
    expect(style.shape).toBe("Cylinder");
    expect(style.fill).toBe(
      createdElementStyle("container", [], c4Styles(), schemaModelNotation).fill,
    );
  });

  it("keeps a Database style the workspace has, even one without a shape", () => {
    const styles: Styles = {
      ...NO_STYLES,
      elements: [{ tag: "Database", background: "#123456" }],
    };
    expect(
      createdElementStyle("container", ["Database"], styles, schemaModelNotation),
    ).toMatchObject({ shape: "Box", fill: "#123456" });
  });

  it("is the default look in a workspace without styles", () => {
    const style = createdElementStyle("softwareSystem", [], NO_STYLES, schemaModelNotation);
    expect(style).toMatchObject({ shape: "Box", fill: undefined, stroke: undefined });
  });
});

describe("the 24 px previews (guide §5.5, §11)", () => {
  it("tell the five creating entries apart in the C4 colours", () => {
    const styles = c4Styles();
    const previews = [
      createdElementStyle("person", [], styles, schemaModelNotation),
      createdElementStyle("softwareSystem", [], styles, schemaModelNotation),
      createdElementStyle("container", [], styles, schemaModelNotation),
      createdElementStyle("container", ["Database"], styles, schemaModelNotation),
      createdElementStyle("component", [], styles, schemaModelNotation),
    ].map((style) => shapePreviewSvg(style.shape, style));
    expect(new Set(previews).size).toBe(5);
  });

  it("draw a person with a gap between head and body, and rounded shoulders", () => {
    const [body, head] = pathsOf(shapePreviewSvg("Person"));
    const bodyTop = Number(/^M0,([\d.]+)A/.exec(body?.d ?? "")?.[1]);
    const shoulder = Number(/A([\d.]+),/.exec(body?.d ?? "")?.[1]);
    const headArc = /^M([\d.]+),([\d.]+)A([\d.]+),/.exec(head?.d ?? "");
    const headBottom = Number(headArc?.[2]) + Number(headArc?.[3]);
    const strokeWidth = Number(body?.["stroke-width"]);
    expect(bodyTop - shoulder - headBottom).toBeGreaterThan(strokeWidth);
    expect(shoulder).toBeGreaterThan(216 * 0.25);
  });
});
