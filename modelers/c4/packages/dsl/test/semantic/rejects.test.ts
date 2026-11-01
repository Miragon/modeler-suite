import { describe, expect, it } from "vitest";
import { codes, model, parse, rejections } from "./support/parse.js";

/** SPEC 3.8: the kit's `invalidTexts`, each rejecting for exactly one reason. */
const UNCLOSED = 'workspace {\n    model {\n        a = person "A"\n';
const DUPLICATE_IDENTIFIER =
  'workspace {\n    model {\n        a = person "A"\n        a = person "B"\n    }\n}\n';
const WRONG_CONTEXT = 'workspace {\n    model {\n        c = container "Orphan"\n    }\n}\n';
const DUPLICATE_VIEW_KEY =
  'workspace {\n    model {\n        a = softwareSystem "A"\n    }\n    views {\n        systemLandscape "L" {\n            include *\n        }\n        systemContext a "L" {\n            include *\n        }\n    }\n}\n';

describe("the reject rules (SPEC 3.8)", () => {
  it.each([
    ["an unclosed block", UNCLOSED, ["unclosed-block", "unclosed-block"]],
    ["a duplicate identifier", DUPLICATE_IDENTIFIER, ["duplicate-identifier"]],
    ["a container at model level", WRONG_CONTEXT, ["element-not-permitted"]],
    ["a duplicate view key", DUPLICATE_VIEW_KEY, ["duplicate-view-key"]],
  ])("the kit's invalid text with %s rejects for that reason only", (_, text, expected) => {
    expect(rejections(text)).toEqual(expected);
    expect(parse(text).ok).toBe(false);
  });

  describe("rule 1: unbalanced blocks", () => {
    it("rejects a closing brace without a block", () => {
      expect(rejections("workspace {\n}\n}\n")).toEqual(["unexpected-close"]);
    });

    it("rejects an unterminated block comment and text block", () => {
      expect(rejections("workspace {\n}\n/* open\n")).toEqual(["unterminated-comment"]);
      expect(rejections('workspace {\n    model {\n        a = person "A" """\n')).toContain(
        "unterminated-text-block",
      );
    });
  });

  describe("rule 2: one workspace, directives outside it", () => {
    it("imports whitespace-only text as the empty workspace", () => {
      for (const text of ["", "   \n\t\n", "﻿"]) {
        const result = parse(text);
        expect(result.ok).toBe(true);
        expect(result.diagnostics).toEqual([]);
        expect(result.workspace.elements).toEqual([]);
      }
    });

    it("rejects a text without a workspace once, not per line", () => {
      expect(rejections('a = person "A"\nb = person "B"\n')).toEqual(["workspace-count"]);
      expect(rejections("// only a comment\n")).toEqual(["workspace-count"]);
    });

    it("rejects a second workspace", () => {
      expect(rejections("workspace {\n}\nworkspace {\n}\n")).toEqual(["workspace-count"]);
    });

    it("accepts the directives outside the workspace and rejects anything else there", () => {
      const directives = '!const A "a"\n!var B "b"\n!include other.dsl\nworkspace {\n}\n';
      expect(rejections(directives)).toEqual([]);
      expect(rejections("workspace {\n}\nhello world\n")).toEqual(["statement-outside-workspace"]);
      expect(rejections("hello world\nworkspace {\n}\n")).toEqual(["statement-outside-workspace"]);
    });

    it("rejects a line of control characters outside the workspace, as Structurizr fails on it (SPEC 1.10 probes)", () => {
      const workspace = 'workspace {\n    model {\n        a = person "A"\n    }\n}\n';
      expect(rejections(`${workspace}\u0000`)).toEqual(["statement-outside-workspace"]);
      expect(rejections(`${workspace}\u0000\n`)).toEqual(["statement-outside-workspace"]);
      expect(rejections(`\u0000\n${workspace}`)).toEqual(["statement-outside-workspace"]);
      expect(rejections(`${workspace}${String.fromCharCode(0xa0)}\n`)).toEqual([
        "statement-outside-workspace",
      ]);
      expect(parse(`${workspace}\u0000`).ok).toBe(false);
    });

    it("keeps a control character the closing line's trim drops, and one inside the workspace, importable", () => {
      expect(parse('workspace {\n    model {\n        a = person "A"\n    }\n}\u0000').ok).toBe(
        true,
      );
      expect(parse("workspace {\n}\n\u000b\n").ok).toBe(true);
      const inside = "workspace {\n    \u0000\n}\n";
      expect(parse(inside).ok).toBe(true);
      expect(codes(inside)).toEqual(["error:structurizr-rejects"]);
    });

    it("reads a line outside the workspace as Structurizr does: after its byte order mark, with its continuations joined", () => {
      const workspace = 'workspace {\n    model {\n        a = person "A"\n    }\n}\n';
      const bom = String.fromCharCode(0xfeff);
      for (const after of [`${bom}\n`, `${bom}  \n`, "\\\n\n", "  \\\n   \n"]) {
        expect(parse(`${workspace}${after}`).ok).toBe(true);
        expect(codes(`${workspace}${after}`)).toEqual([]);
      }
      expect(rejections(`${workspace}${bom}\u0000\n`)).toEqual(["statement-outside-workspace"]);
      expect(rejections(`${workspace}\\\n\u0000\n`)).toEqual(["statement-outside-workspace"]);
      expect(rejections(`${workspace}/*\n\u0000\n*/\n`)).toEqual(["statement-outside-workspace"]);
    });

    it("accepts a top-level !identifiers but reports it as Structurizr refuses it, and still sets the mode", () => {
      const text =
        '!identifiers hierarchical\nworkspace {\n    model {\n        s = softwareSystem "S" {\n            c = container "C"\n        }\n    }\n}\n';
      const result = parse(text);
      expect(result.ok).toBe(true);
      expect(codes(text)).toEqual(["error:structurizr-rejects"]);
      expect(result.workspace.elements.map((element) => element.id)).toEqual(["s", "s.c"]);
    });

    it("rejects a second model or views block", () => {
      expect(rejections("workspace {\n    model {\n    }\n    model {\n    }\n}\n")).toEqual([
        "duplicate-block",
      ]);
      expect(rejections("workspace {\n    views {\n    }\n    views {\n    }\n}\n")).toEqual([
        "duplicate-block",
      ]);
    });
  });

  describe("rule 3: duplicate identifiers, case-insensitive, in one register", () => {
    it.each([
      ["two elements in different case", 'a = person "A"\nA = person "B"'],
      [
        "an element and a relationship",
        'a = person "A"\nb = person "B"\na2 = a -> b\nA2 = softwareSystem "C"',
      ],
      ["an element and a group", 'g = group "G" {\n}\nG = person "P"'],
      [
        "an element and a deployment environment",
        'live = deploymentEnvironment "Live" {\n}\nlive = softwareSystem "S"',
      ],
    ])("rejects %s", (_, body) => {
      expect(rejections(model(body))).toEqual(["duplicate-identifier"]);
    });

    it("keys hierarchical identifiers under their parent, so siblings in two systems don't clash", () => {
      const text = `workspace {\n    !identifiers hierarchical\n${model('a = softwareSystem "A" {\n    api = container "API"\n}\nb = softwareSystem "B" {\n    api = container "API"\n}').slice("workspace {\n".length)}`;
      expect(rejections(text)).toEqual([]);
      expect(parse(text).workspace.elements.map((element) => element.id)).toEqual([
        "a",
        "a.api",
        "b",
        "b.api",
      ]);
    });
  });

  describe("rule 4: duplicate view keys, case-sensitive", () => {
    it("rejects a key a generated key already holds", () => {
      const text = model(
        'a = softwareSystem "A"',
        'systemLandscape {\n    include *\n}\nsystemLandscape "SystemLandscape-001" {\n    include *\n}',
      );
      expect(rejections(text)).toEqual(["duplicate-view-key"]);
    });

    it("lets a keyless view skip every key taken before it", () => {
      const text = model(
        'a = softwareSystem "A"',
        'systemLandscape "SystemLandscape-001" {\n    include *\n}\nsystemLandscape {\n    include *\n}',
      );
      expect(rejections(text)).toEqual([]);
      expect(parse(text).workspace.views.map((view) => view.key)).toEqual([
        "SystemLandscape-001",
        "SystemLandscape-002",
      ]);
    });

    it("compares keys case-sensitively", () => {
      const text = model(
        'a = softwareSystem "A"',
        'systemLandscape "L" {\n    include *\n}\nsystemLandscape "l" {\n    include *\n}',
      );
      expect(rejections(text)).toEqual([]);
    });
  });

  describe("rule 5: element keywords out of place, invalid assignments", () => {
    it.each([
      ["a container at model level", 'container "C"'],
      ["a component in a system", 's = softwareSystem "S" {\n    component "K"\n}'],
      ["a person in a system", 's = softwareSystem "S" {\n    person "P"\n}'],
      [
        "a software system in a container",
        's = softwareSystem "S" {\n    c = container "C" {\n        softwareSystem "X"\n    }\n}',
      ],
    ])("rejects %s", (_, body) => {
      expect(rejections(model(body))).toEqual(["element-not-permitted"]);
    });

    it("rejects an element keyword in the workspace block or in a views block", () => {
      expect(rejections('workspace {\n    softwareSystem "S"\n}\n')).toEqual([
        "element-not-permitted",
      ]);
      expect(rejections('workspace {\n    views {\n        person "P"\n    }\n}\n')).toEqual([
        "element-not-permitted",
      ]);
    });

    it("rejects an archetype keyword out of place too", () => {
      const body = 'archetypes {\n    application = container\n}\napplication "App"';
      expect(rejections(model(body))).toEqual(["element-not-permitted"]);
    });

    it("rejects an assignment to an invalid identifier", () => {
      expect(rejections(model('-a = person "A"'))).toEqual(["invalid-identifier"]);
      expect(rejections(model('a.b = person "A"'))).toEqual(["invalid-identifier"]);
    });

    it("rejects an invalid assignment on any statement, as Structurizr checks it before reading the line", () => {
      expect(rejections(model('s = softwareSystem "S" {\n    -x = description "D"\n}'))).toEqual([
        "invalid-identifier",
      ]);
    });

    it("accepts a leading digit and inner hyphens, as the reference does", () => {
      expect(rejections(model('1x = person "A"\nmy-system = softwareSystem "S"'))).toEqual([]);
    });
  });

  it("imports everything else, with compatibility errors that don't reject", () => {
    const text = model('a = softwareSystem "A"\na -> missing "Uses"\nb = softwareSystem "A"');
    const result = parse(text);
    expect(result.ok).toBe(true);
    expect(codes(text)).toEqual(["error:unresolved-reference", "error:duplicate-name"]);
  });
});
