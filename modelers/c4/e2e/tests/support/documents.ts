import { readFileSync } from "node:fs";

/**
 * The workspaces the specs open. Both apps import `example/bookshop.c4` through a raw loader,
 * which Playwright's loader does not have, so the suite reads the same file itself.
 */
export const EXAMPLE = readFileSync(
  new URL("../../../example/bookshop.c4", import.meta.url),
  "utf8",
);

/** The example's default view: its first view, the landscape. */
export const EXAMPLE_DEFAULT_VIEW = "SystemLandscape";

/** The example's container view of the Bookshop, where every element is pinned. */
export const EXAMPLE_CONTAINER_VIEW = "Containers-bookshop";

/** A text the renderer refuses (SPEC 3.8 rule 3): one identifier defined twice. */
export const DUPLICATE_IDENTIFIER =
  'workspace {\n    model {\n        a = person "A"\n        a = person "B"\n    }\n}\n';

/**
 * The example with three findings of the parser that import all the same (SPEC 3.8): a second
 * software system named "Bookshop", which Structurizr refuses and which names its element, a
 * relationship from a container to its own system, and a keyword the model does not know.
 */
export const EXAMPLE_WITH_PROBLEMS = EXAMPLE.replace(
  "        mail = softwareSystem",
  [
    '        shopTwin = softwareSystem "Bookshop" "A second shop of the same name."',
    '        webApp -> bookshop "Belongs to"',
    '        frobnicate "A keyword the model does not know"',
    "        mail = softwareSystem",
  ].join("\n"),
);

const LANDSCAPE_LAYOUT = [
  "            properties {",
  '                "c4modeler.element.bookshop" "480,456"',
  '                "c4modeler.element.customer" "492,0"',
  '                "c4modeler.element.mail" "960,456"',
  '                "c4modeler.element.payments" "0,456"',
  "            }",
  "",
].join("\n");

/** The example with no layout in its landscape: that view is laid out automatically, unpinned. */
export const EXAMPLE_UNPINNED_LANDSCAPE = (() => {
  const at = EXAMPLE.indexOf(LANDSCAPE_LAYOUT);
  if (at === -1) throw new Error("the example's landscape has another layout block");
  return EXAMPLE.slice(0, at) + EXAMPLE.slice(at + LANDSCAPE_LAYOUT.length);
})();

/**
 * A workspace whose script may use `shop` (SPEC 3.7): the modeler never runs a script, so it
 * refuses to delete what one could name.
 */
export const SCRIPTED = [
  'workspace "Scripted" {',
  "    model {",
  '        customer = person "Customer"',
  '        shop = softwareSystem "Shop"',
  '        customer -> shop "Buys from"',
  "        !script groovy {",
  '            shop.addTags("Scripted")',
  "        }",
  "    }",
  "    views {",
  '        systemLandscape "SystemLandscape" {',
  "            include *",
  "            autoLayout tb 300 160",
  "        }",
  "    }",
  "}",
  "",
].join("\n");

/** One line of `text`, by its exact content; the line number counts from 0, as VS Code's do. */
export function lineOf(text: string, line: string): number {
  const index = text.split("\n").indexOf(line);
  if (index === -1) throw new Error(`the text has no line ${JSON.stringify(line)}`);
  return index;
}
