import { describe, expect, it } from "vitest";
import { newWorkspaceText, parseWorkspace } from "@miragon/c4-dsl";
import { C4_COLOUR_STYLES, viewCatalog } from "@miragon/c4-schema-model";
import { DIAGRAM_EDITOR_OPTIONS } from "../src/diagramEditorOptions.js";
import { EMPTY_DIAGRAM, EXAMPLE_DIAGRAM, withExampleInserted } from "../src/examples.js";

describe("the new workspace", () => {
  it("is the skeleton the web app starts from, with nothing to report", () => {
    expect(EMPTY_DIAGRAM).toBe(newWorkspaceText());
    const result = parseWorkspace(EMPTY_DIAGRAM);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("shows the implicit landscape", () => {
    const { workspace } = parseWorkspace(EMPTY_DIAGRAM);
    expect(viewCatalog(workspace).defaultView()).toMatchObject({
      key: "SystemLandscape",
      state: "implicit",
    });
  });

  // As every modeler of the suite shows its notation's colours from the start.
  it("carries the colours of Apply C4 colours and no element", () => {
    const { workspace } = parseWorkspace(EMPTY_DIAGRAM);
    expect(workspace.elements).toEqual([]);
    expect(
      workspace.styles.elements.map(({ tag, background, color, stroke }) => ({
        tag,
        background,
        color,
        stroke,
      })),
    ).toEqual(
      C4_COLOUR_STYLES.map(({ tag, background, color, stroke }) => ({
        tag,
        background: background.toLowerCase(),
        color: color.toLowerCase(),
        stroke: stroke.toLowerCase(),
      })),
    );
  });
});

describe("the example", () => {
  const result = parseWorkspace(EXAMPLE_DIAGRAM);

  it("reads without an error or a warning", () => {
    expect(result.ok).toBe(true);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity !== "info")).toEqual([]);
  });

  it("has a view of every type the canvas edits, and two it keeps for Structurizr", () => {
    expect(result.workspace.views.map((view) => [view.key, view.type, view.editable])).toEqual([
      ["SystemLandscape", "systemLandscape", true],
      ["SystemContext-bookshop", "systemContext", true],
      ["Containers-bookshop", "container", true],
      ["Components-api", "component", true],
      ["PlaceOrder", "dynamic", false],
      ["LiveDeployment", "deployment", false],
    ]);
  });

  it("carries the colours of Apply C4 colours", () => {
    for (const style of C4_COLOUR_STYLES) {
      expect(result.workspace.styles.elements, style.tag).toContainEqual(
        expect.objectContaining({
          tag: style.tag,
          background: style.background.toLowerCase(),
          color: style.color.toLowerCase(),
          stroke: style.stroke.toLowerCase(),
        }),
      );
    }
  });
});

const isProblem = (diagnostic: { severity: string }) => diagnostic.severity !== "info";

describe("Insert example", () => {
  /** The example's workspace block without its header line and closing brace. */
  const EXAMPLE_BODY = EXAMPLE_DIAGRAM.slice(
    EXAMPLE_DIAGRAM.indexOf("\n") + 1,
    EXAMPLE_DIAGRAM.lastIndexOf("}"),
  );

  it.each([
    ["a blank file", ""],
    ["a file of blank lines", "\n  \n"],
    ["the skeleton of New Empty C4 Diagram", newWorkspaceText()],
    ["a skeleton without a views block", "workspace {\n    model {\n    }\n}\n"],
  ])("turns %s into the example", (_name, text) => {
    expect(withExampleInserted(text)).toBe(EXAMPLE_DIAGRAM);
  });

  it("writes the example with the file's line breaks", () => {
    const crlf = (text: string) => text.replace(/\n/g, "\r\n");
    expect(withExampleInserted(crlf(newWorkspaceText()))).toBe(crlf(EXAMPLE_DIAGRAM));
  });

  // Guide §13.5: what the file already holds stays, so Insert example needs no confirmation.
  it.each([
    ["in its header", 'workspace "Shop" "Sells things." {\n    model {\n    }\n}\n', ""],
    ["as statements", 'workspace {\n    name "Shop"\n    model {\n    }\n}\n', '    name "Shop"\n'],
  ])("keeps the workspace's own name %s", (_name, text, statements) => {
    const head = text.slice(0, text.indexOf("\n") + 1);
    const inserted = withExampleInserted(text)!;

    expect(inserted).toBe(`${head}${statements}${EXAMPLE_BODY}}\n`);
    expect(parseWorkspace(inserted).workspace.name).toBe("Shop");
    expect(parseWorkspace(inserted).diagnostics.filter(isProblem)).toEqual([]);
  });

  it("keeps the comments inside the skeleton, in the blocks they were in", () => {
    const text =
      "workspace {\n    // The shop\n    model {\n        // People first\n    }\n    views {\n        /* Landscape first */\n    }\n}\n";
    const inserted = withExampleInserted(text)!;
    const lines = inserted.split("\n");

    expect(lines.slice(0, 2)).toEqual([EXAMPLE_DIAGRAM.split("\n")[0], "    // The shop"]);
    expect(lines[lines.indexOf("    model {") + 1]).toBe("        // People first");
    expect(lines[lines.indexOf("    views {") + 1]).toBe("        /* Landscape first */");
    expect(inserted.replace(/^ *(\/\/|\/\*).*\n/gm, "")).toBe(EXAMPLE_DIAGRAM);
  });

  it("indents the example as the file is indented", () => {
    const inTabs = (text: string) =>
      text.replace(/^(?: {4})+/gm, (indent) => "\t".repeat(indent.length / 4));
    const inserted = withExampleInserted("workspace {\n\tmodel {\n\t}\n}\n")!;

    expect(inserted).toBe(inTabs(EXAMPLE_DIAGRAM));
    expect(parseWorkspace(inserted).ok).toBe(true);
    expect(withExampleInserted(inTabs(newWorkspaceText()))).toBe(inTabs(EXAMPLE_DIAGRAM));
  });

  it("keeps a comment of the new skeleton's views block, beside its colours", () => {
    const text = newWorkspaceText().replace(
      "    views {\n",
      "    views {\n        // Views first\n",
    );
    const inserted = withExampleInserted(text)!;
    const lines = inserted.split("\n");

    expect(lines[lines.indexOf("    views {") + 1]).toBe("        // Views first");
    expect(inserted.replace(/^ *\/\/.*\n/gm, "")).toBe(EXAMPLE_DIAGRAM);
  });

  it("keeps the comments around the skeleton", () => {
    const text = `// The shop's architecture\n\n${newWorkspaceText()}// The end\n`;
    expect(withExampleInserted(text)).toBe(
      `// The shop's architecture\n\n${EXAMPLE_DIAGRAM}// The end\n`,
    );
  });

  it("puts the example after a file of comments", () => {
    expect(withExampleInserted("// to do\n")).toBe(`// to do\n${EXAMPLE_DIAGRAM}`);
  });

  it.each([
    ["an element", 'workspace {\n    model {\n        a = person "A"\n    }\n}\n'],
    [
      "a view",
      "workspace {\n    model {\n    }\n    views {\n        systemLandscape {\n        }\n    }\n}\n",
    ],
    [
      "styles",
      'workspace {\n    views {\n        styles {\n            element "Person" {\n            }\n        }\n    }\n}\n',
    ],
    [
      "the new skeleton's colours and a style of its own",
      newWorkspaceText().replace(
        "        styles {\n",
        '        styles {\n            element "Database" {\n                shape cylinder\n            }\n',
      ),
    ],
    [
      "a comment inside the new skeleton's colours",
      newWorkspaceText().replace("        styles {\n", "        styles {\n            // Ours\n"),
    ],
    ["a directive", "workspace {\n    !identifiers hierarchical\n    model {\n    }\n}\n"],
    ["a parent workspace", "workspace extends base.dsl {\n}\n"],
    ["an unclosed block", "workspace {\n    model {\n"],
    ["a second statement", "!const A b\nworkspace {\n}\n"],
  ])("leaves a workspace with %s alone", (_name, text) => {
    expect(withExampleInserted(text)).toBeUndefined();
  });

  it("is what the diagram editor answers the empty-file hint with", () => {
    expect(DIAGRAM_EDITOR_OPTIONS.insertExample).toBe(withExampleInserted);
  });
});
