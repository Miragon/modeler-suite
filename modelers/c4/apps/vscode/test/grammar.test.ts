import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWorkspace } from "@miragon/c4-dsl";
import { isKeyword } from "@miragon/c4-schema-model";
import { EXAMPLE_DIAGRAM } from "../src/examples.js";
import { allRules, compile, createTokenizer, type Grammar, type Token } from "./textMate.js";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const grammar = JSON.parse(read("syntaxes/structurizr-dsl.tmLanguage.json")) as Grammar;
const manifest = JSON.parse(read("package.json")) as {
  contributes: {
    languages: Array<{
      id: string;
      extensions: string[];
      filenames: string[];
      configuration: string;
    }>;
    grammars: Array<{ language: string; scopeName: string; path: string }>;
  };
};
const tokenizer = createTokenizer(grammar);
const S = ".structurizr-dsl";

/** The token at the first `needle` of `source` after `after`, with the scopes it carries. */
function tokenAt(source: string, needle: string, after = ""): Token {
  const from = after === "" ? 0 : source.indexOf(after);
  if (from < 0) throw new Error(`No ${after} in the source`);
  const offset = source.indexOf(needle, from);
  if (offset < 0) throw new Error(`No ${needle} after ${after}`);
  const before = source.slice(0, offset).split("\n");
  const line = before.length - 1;
  const column = before.at(-1)!.length;
  const token = tokenizer
    .tokenize(source)
    .find(
      (candidate) =>
        candidate.line === line &&
        candidate.start <= column &&
        column < candidate.start + candidate.text.length,
    );
  if (!token) throw new Error(`No token at ${needle}`);
  return token;
}

function scopesOf(source: string, needle: string, after = ""): readonly string[] {
  return tokenAt(source, needle, after).scopes;
}

const WORKSPACE = `/*
 * The shop. person "commented out" is no element.
 */
!const ORG "Miragon"
workspace "Shop" "The \${ORG} shop" {
    !identifiers hierarchical

    model {
        // People first
        # and then systems
        customer = person "Customer" "Buys \\"books\\"."
        shop = softwareSystem "Shop" {
            api = container "API" "" "Kotlin" {
                -> db "Reads from" "SQL"
            }
            db = container "Database" {
                tags "Database"
            }
        }
        SOFTWARESYSTEM "Legacy"
        customer -> shop.api "Uses"
        rel = customer --https-> shop "Calls"
        live = deploymentEnvironment "Live" {
            shop.api -/> shop.db {
                url https://example.com
            }
        }
        !element shop {
            properties {
                owner "Team A"
            }
        }
    }

    views {
        systemContext shop "ShopContext" {
            include *?
            exclude element.tag==Internal
            include element.type==Person
            autoLayout lr 300 160
            properties {
                "c4modeler.element.customer" "40,60"
            }
        }
        container shop {
            include *
        }
        dynamic shop "Orders" {
            1: customer -> shop.api "Orders"
        }
        image * "Picture" {
            plantuml """
                workspace person {
                Shop -> \${ORG}
            """
        }
        styles {
            element "Person" {
                shape Person
                background #08427b
            }
            relationship "Relationship" {
                routing Orthogonal
                dashed false
            }
        }
        terminology {
            person "Actor"
        }
    }
    configuration {
        scope softwaresystem
    }
} // done
`;

describe("the Structurizr DSL language", () => {
  // LikeC4 claims .c4 for its `likec4` and another extension `c4`: the id stays one of its own.
  it("claims .c4 and .dsl files and workspace.dsl, under an id of its own", () => {
    expect(manifest.contributes.languages).toEqual([
      expect.objectContaining({
        id: "structurizr-dsl",
        extensions: [".c4", ".dsl"],
        filenames: ["workspace.dsl"],
        configuration: "./language-configuration.json",
      }),
    ]);
    expect(manifest.contributes.grammars).toEqual([
      {
        language: "structurizr-dsl",
        scopeName: "source.structurizr-dsl",
        path: "./syntaxes/structurizr-dsl.tmLanguage.json",
      },
    ]);
    expect(grammar.scopeName).toBe("source.structurizr-dsl");
  });

  it("comments with // and /* */, closes braces and quotes and folds on braces", () => {
    const configuration = JSON.parse(read("language-configuration.json")) as {
      comments: unknown;
      brackets: unknown;
      autoClosingPairs: Array<{ open: string; close: string }>;
      folding: { markers: { start: string; end: string } };
    };
    expect(configuration.comments).toEqual({ lineComment: "//", blockComment: ["/*", "*/"] });
    expect(configuration.brackets).toEqual([["{", "}"]]);
    expect(configuration.autoClosingPairs.map((pair) => pair.open + pair.close)).toEqual([
      "{}",
      '""',
    ]);
    const start = new RegExp(configuration.folding.markers.start);
    const end = new RegExp(configuration.folding.markers.end);
    expect(start.test("    model {")).toBe(true);
    expect(end.test("    } // done")).toBe(true);
    expect(start.test('    a = person "A"')).toBe(false);
  });
});

describe("the TextMate grammar", () => {
  it("compiles every regex, and every include names a rule", () => {
    const rules = allRules(grammar);
    expect(rules.length).toBeGreaterThan(50);
    for (const rule of rules) {
      for (const source of [rule.match, rule.begin, rule.end]) {
        if (source !== undefined) expect(() => compile(source), source).not.toThrow();
      }
      if (rule.include !== undefined) {
        expect(grammar.repository, rule.include).toHaveProperty(rule.include.slice(1));
      }
    }
    expect(() => tokenizer.tokenize(EXAMPLE_DIAGRAM)).not.toThrow();
  });

  it("reads whole-line comments and block comments, and nothing inside them", () => {
    expect(scopesOf(WORKSPACE, "person", "The shop.")).toContain(`comment.block${S}`);
    expect(scopesOf(WORKSPACE, "People")).toContain(`comment.line.double-slash${S}`);
    expect(scopesOf(WORKSPACE, "and then")).toContain(`comment.line.number-sign${S}`);
    expect(scopesOf(WORKSPACE, "#08427b")).toContain(`constant.other.color.rgb-value.hex${S}`);
  });

  // The reference parser's rules, as the canvas's parser follows them (R-DSL §2.3).
  it.each([
    ["/*/ alone", "workspace {\n    /*/\n    model {\n    }\n}\n"],
    [
      "nested",
      "workspace {\n    /*\n    /* nested\n    */\n    still\n    */\n    model {\n    }\n}\n",
    ],
    [
      "a // line ending in */",
      "workspace {\n    /*\n    // end */\n    still\n    */\n    model {\n    }\n}\n",
    ],
    [
      "one-line comments inside",
      "workspace {\n    /*\n    /* one */\n    still\n    */\n    model {\n    }\n}\n",
    ],
  ])("ends a block comment where Structurizr does (%s)", (_name, text) => {
    // A line `still` outside a comment would be a statement the parser reports.
    expect(parseWorkspace(text).diagnostics).toEqual([]);
    if (text.includes("still")) expect(scopesOf(text, "still")).toContain(`comment.block${S}`);
    expect(scopesOf(text, "model")).toContain(`keyword.other.block${S}`);
    expect(scopesOf(text, "model")).not.toContain(`comment.block${S}`);
  });

  it("reads a rank direction only in lower case, as the reference parser does", () => {
    const text = (direction: string) =>
      `workspace {\n    views {\n        systemLandscape {\n            AUTOLAYOUT ${direction}\n        }\n    }\n}\n`;
    expect(scopesOf(text("lr"), "AUTOLAYOUT")).toContain(`keyword.other.statement${S}`);
    expect(scopesOf(text("lr"), "lr")).toContain(`constant.language.rank-direction${S}`);
    expect(scopesOf(text("LR"), "LR")).not.toContain(`constant.language.rank-direction${S}`);
  });

  it("marks enterprise, which Structurizr 6 removed, and still reads its block", () => {
    const text =
      'workspace {\n    model {\n        enterprise "E" {\n            a = person "A"\n        }\n    }\n}\n';
    expect(scopesOf(text, "enterprise")).toContain(`invalid.deprecated.keyword${S}`);
    expect(scopesOf(text, "person")).toContain(`storage.type.element${S}`);
  });

  it("reads directives, constants and substitutions", () => {
    expect(scopesOf(WORKSPACE, "!const")).toContain(`keyword.control.directive${S}`);
    expect(scopesOf(WORKSPACE, "ORG")).toContain(`variable.other.constant${S}`);
    expect(scopesOf(WORKSPACE, "${ORG}")).toEqual(
      expect.arrayContaining([`string.quoted.double${S}`, `variable.other.substitution${S}`]),
    );
    expect(scopesOf(WORKSPACE, "!identifiers")).toContain(`keyword.control.directive${S}`);
    expect(scopesOf(WORKSPACE, "hierarchical")).toContain(`constant.language.identifier-mode${S}`);
    expect(scopesOf(WORKSPACE, "!element")).toContain(`keyword.control.directive${S}`);
  });

  it("reads strings with escaped quotes, and text blocks without reading their content", () => {
    expect(scopesOf(WORKSPACE, '\\"books')).toContain(`constant.character.escape${S}`);
    expect(scopesOf(WORKSPACE, "books\\")).toContain(`string.quoted.double${S}`);
    const content = scopesOf(WORKSPACE, "workspace person");
    expect(content).toContain(`string.quoted.triple${S}`);
    expect(content).not.toContain(`keyword.other.block${S}`);
    expect(scopesOf(WORKSPACE, "${ORG}", "Shop ->")).toContain(`variable.other.substitution${S}`);
  });

  it("reads the blocks of the workspace by their keywords", () => {
    const workspace = scopesOf(WORKSPACE, "workspace");
    expect(workspace).toContain(`keyword.other.block${S}`);
    for (const keyword of ["model", "views", "styles", "terminology", "configuration"]) {
      expect(scopesOf(WORKSPACE, keyword, "    "), keyword).toContain(`keyword.other.block${S}`);
    }
    expect(scopesOf(WORKSPACE, "}", "} //")).toContain(`punctuation.section.block.end${S}`);
    expect(scopesOf(WORKSPACE, " done")).toContain(`comment.line.ignored${S}`);
  });

  it("reads elements, identifiers and relationships in the model", () => {
    expect(scopesOf(WORKSPACE, "customer =")).toContain(`variable.other.identifier${S}`);
    expect(scopesOf(WORKSPACE, "person", "customer =")).toEqual(
      expect.arrayContaining([`meta.block.model${S}`, `storage.type.element${S}`]),
    );
    expect(scopesOf(WORKSPACE, "container", "api =")).toEqual(
      expect.arrayContaining([`meta.block.element${S}`, `storage.type.element${S}`]),
    );
    expect(scopesOf(WORKSPACE, "SOFTWARESYSTEM")).toContain(`storage.type.element${S}`);
    expect(scopesOf(WORKSPACE, "tags")).toContain(`keyword.other.statement${S}`);
    expect(scopesOf(WORKSPACE, "->", "customer ->")).toContain(`keyword.operator.relationship${S}`);
    expect(scopesOf(WORKSPACE, "shop.api", "customer ->")).toContain(
      `variable.other.reference${S}`,
    );
    expect(scopesOf(WORKSPACE, "->", "{\n                ")).toContain(
      `keyword.operator.relationship${S}`,
    );
    expect(scopesOf(WORKSPACE, "--https->")).toContain(`keyword.operator.relationship${S}`);
    expect(scopesOf(WORKSPACE, "-/>")).toContain(`keyword.operator.relationship${S}`);
    expect(scopesOf(WORKSPACE, "https://example.com")).toContain(`markup.underline.link${S}`);
    expect(scopesOf(WORKSPACE, "owner")).toContain(`variable.other.property${S}`);
  });

  it("reads views by their own keywords, where container is a view type", () => {
    expect(scopesOf(WORKSPACE, "systemContext")).toContain(`storage.type.view${S}`);
    const container = scopesOf(WORKSPACE, "container", "views {");
    expect(container).toContain(`storage.type.view${S}`);
    expect(container).not.toContain(`storage.type.element${S}`);
    expect(scopesOf(WORKSPACE, "include", "views {")).toContain(`keyword.other.statement${S}`);
    expect(scopesOf(WORKSPACE, "*?")).toContain(`keyword.operator.wildcard${S}`);
    expect(scopesOf(WORKSPACE, "element.tag")).toContain(`support.variable.expression${S}`);
    expect(scopesOf(WORKSPACE, "==", "element.tag")).toContain(`keyword.operator.comparison${S}`);
    expect(scopesOf(WORKSPACE, "Person", "element.type==")).toContain(
      `support.constant.element-type${S}`,
    );
    expect(scopesOf(WORKSPACE, "autoLayout")).toContain(`keyword.other.statement${S}`);
    expect(scopesOf(WORKSPACE, "lr")).toContain(`constant.language.rank-direction${S}`);
    expect(scopesOf(WORKSPACE, "300")).toContain(`constant.numeric${S}`);
    expect(scopesOf(WORKSPACE, "c4modeler.element.customer")).toContain(`string.quoted.double${S}`);
    expect(scopesOf(WORKSPACE, "1:")).toContain(`constant.other.order${S}`);
    expect(scopesOf(WORKSPACE, "plantuml")).toContain(`keyword.other.statement${S}`);
  });

  it("reads styles, terminology and configuration by their own keywords", () => {
    expect(scopesOf(WORKSPACE, "element", "styles {")).toContain(`keyword.other.style${S}`);
    expect(scopesOf(WORKSPACE, "shape")).toContain(`support.type.property-name.style${S}`);
    expect(scopesOf(WORKSPACE, "Person", "shape ")).toContain(`constant.language.style${S}`);
    expect(scopesOf(WORKSPACE, "routing")).toContain(`support.type.property-name.style${S}`);
    expect(scopesOf(WORKSPACE, "Orthogonal")).toContain(`constant.language.style${S}`);
    expect(scopesOf(WORKSPACE, "false")).toContain(`constant.language.boolean${S}`);
    expect(scopesOf(WORKSPACE, "person", "terminology {")).toContain(
      `keyword.other.terminology${S}`,
    );
    expect(scopesOf(WORKSPACE, "scope")).toContain(`keyword.other.statement${S}`);
    expect(scopesOf(WORKSPACE, "softwaresystem")).toContain(`constant.language.configuration${S}`);
  });

  it("reads extends case-sensitively, as the reference parser does", () => {
    const text = "workspace extends base.dsl {\n}\n";
    expect(scopesOf(text, "extends")).toContain(`keyword.other.extends${S}`);
    expect(scopesOf("workspace EXTENDS base.dsl {\n}\n", "EXTENDS")).not.toContain(
      `keyword.other.extends${S}`,
    );
  });

  it("opens a quote only where a token starts", () => {
    const text = 'workspace {\n    model {\n        a = person foo"bar" "x""y"\n    }\n}\n';
    expect(scopesOf(text, 'foo"bar"')).not.toContain(`string.quoted.double${S}`);
    expect(scopesOf(text, "x", 'bar" "')).toContain(`string.quoted.double${S}`);
    expect(scopesOf(text, "y", 'x"')).toContain(`string.quoted.double${S}`);
  });

  it("keeps an inline script verbatim", () => {
    const text =
      "workspace {\n    !script groovy {\n        workspace.views.each { }\n    }\n    model {\n    }\n}\n";
    const inside = scopesOf(text, "workspace.views");
    expect(inside).toContain(`meta.embedded.block.script${S}`);
    expect(inside).not.toContain(`keyword.other.block${S}`);
    expect(scopesOf(text, "model")).toContain(`keyword.other.block${S}`);
  });

  // The reference parser's own test files: every block the grammar opens, it closes again.
  it("closes the workspace block on the last brace of every fixture Structurizr reads", () => {
    const folder = new URL("../../../packages/dsl/test/fixtures/structurizr/", import.meta.url);
    const fixtures = readdirSync(folder).filter((name) => name.endsWith(".dsl"));
    const unbalanced: string[] = [];
    let checked = 0;
    for (const name of fixtures) {
      const text = readFileSync(new URL(name, folder), "utf8").replace(/\r\n/g, "\n");
      if (!parseWorkspace(text).ok || !/^\s*workspace\b/im.test(text)) continue;
      checked += 1;
      const closing = tokenizer
        .tokenize(text)
        .filter((token) => token.text === "}")
        .at(-1);
      if (
        closing?.scopes.join(" ") !==
        `source${S} meta.block.workspace${S} punctuation.section.block.end${S}`
      ) {
        unbalanced.push(name);
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(unbalanced).toEqual([]);
  });

  it("highlights a file !include brings in, which has no workspace block", () => {
    const text = 'customer = person "Customer"\ncustomer -> shop "Uses"\n';
    expect(scopesOf(text, "person")).toContain(`storage.type.element${S}`);
    expect(scopesOf(text, "->")).toContain(`keyword.operator.relationship${S}`);
  });
});

/**
 * Every word of a group such as `(workspace)`, `(person|softwareSystem)` or `(?:include|docs)`; a
 * word spelled case-insensitively in a case-sensitive regex, `([Aa][Uu]…)`, counts as well.
 */
function grammarWords(): Set<string> {
  const words = new Set<string>();
  for (const rule of allRules(grammar)) {
    for (const source of [rule.match, rule.begin]) {
      const spelled = (source ?? "").replace(/\[([A-Z])([a-z])\]/g, (pair, upper: string, lower) =>
        upper.toLowerCase() === lower ? lower : pair,
      );
      for (const [, alternation] of spelled.matchAll(
        /\((?:\?:)?([A-Za-z][A-Za-z-]*(?:\|[A-Za-z][A-Za-z-]*)*)\)/g,
      )) {
        for (const word of alternation!.split("|")) words.add(word.toLowerCase());
      }
    }
  }
  return words;
}

/** Words of the grammar that are no keyword of Structurizr's token table: values and directives. */
const VALUES = [
  // directives (after `!`) and the identifier modes
  ...["const", "var", "identifiers", "impliedrelationships", "docs", "adrs", "decisions"],
  ...["script", "plugin", "components", "elements", "relationships", "extend", "ref", "constant"],
  ...["flat", "hierarchical"],
  // rank directions, booleans, user roles, configuration values, metadata symbols
  ...["tb", "bt", "lr", "rl", "true", "false", "read", "write"],
  ...["landscape", "softwaresystem", "none", "private", "public"],
  ...["square", "round", "curly", "angle", "double-angle"],
  // shapes, borders, line styles, routings, icon positions
  ...["box", "roundedbox", "circle", "ellipse", "hexagon", "diamond", "cylinder", "bucket", "pipe"],
  ...["robot", "folder", "webbrowser", "window", "terminal", "shell", "mobiledeviceportrait"],
  ...["mobiledevicelandscape", "solid", "dotted", "direct", "orthogonal", "curved"],
  ...["top", "bottom", "left"],
  // expressions: the properties after `element.` and the element types after `element.type==`
  ...["type", "parent", "destination", "softwaresysteminstance"],
];

describe("the grammar's keywords against the reference parser's", () => {
  const keywordsSource = read("../../packages/schema-model/src/keywords.ts");
  const structurizrKeywords = [
    ...keywordsSource.slice(0, keywordsSource.indexOf("].map")).matchAll(/^\s+"([A-Za-z]+)",$/gm),
  ].map(([, keyword]) => keyword!.toLowerCase());

  it("highlights every keyword of Structurizr's token table", () => {
    const words = grammarWords();
    expect(structurizrKeywords.length).toBeGreaterThan(80);
    expect(structurizrKeywords.filter((keyword) => !words.has(keyword))).toEqual([]);
  });

  it("highlights no word that is neither a keyword nor a value of the language", () => {
    const allowed = new Set(VALUES);
    expect([...grammarWords()].filter((word) => !isKeyword(word) && !allowed.has(word))).toEqual(
      [],
    );
  });
});
