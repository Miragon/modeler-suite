import { parseWorkspace } from "@miragon/c4-dsl";
import type { MergeFixtures } from "@miragon/modeler-api/conformance";

const lines = (...text: string[]): string => `${text.join("\n")}\n`;

const workspace = (
  options: { title?: string; elements?: string[]; relationships?: string[]; view?: string[] } = {},
): string =>
  lines(
    `workspace "${options.title ?? "Shop"}" {`,
    "    model {",
    ...(options.elements ?? [
      '        customer = person "Customer"',
      '        shop = softwareSystem "Shop"',
      '        mail = softwareSystem "Mail"',
    ]),
    ...(options.relationships ?? ['        customer -> shop "Buys from"']),
    "    }",
    "    views {",
    "        systemContext shop {",
    ...(options.view ?? ["            include *"]),
    "        }",
    "    }",
    "}",
  );

const CUSTOMER = '        customer = person "Customer"';
const SHOP = '        shop = softwareSystem "Shop"';
const MAIL = '        mail = softwareSystem "Mail"';
const BUYS = '        customer -> shop "Buys from"';

/** The merge kit's fixtures for the Structurizr DSL: an agent writes the file while the user edits it. */
export const C4_MERGE_FIXTURES: MergeFixtures = {
  base: workspace(),
  disjoint: [
    {
      name: "the agent adds a system, the user lays out the view",
      external: workspace({
        elements: [CUSTOMER, SHOP, MAIL, '        stock = softwareSystem "Stock"'],
      }),
      draft: workspace({ view: ["            include *", "            autoLayout"] }),
      merged: workspace({
        elements: [CUSTOMER, SHOP, MAIL, '        stock = softwareSystem "Stock"'],
        view: ["            include *", "            autoLayout"],
      }),
    },
    {
      name: "the agent retitles the workspace, the user describes the relationship",
      external: workspace({ title: "Shop 2026" }),
      draft: workspace({ relationships: ['        customer -> shop "Buys books from"'] }),
      merged: workspace({
        title: "Shop 2026",
        relationships: ['        customer -> shop "Buys books from"'],
      }),
    },
  ],
  conflicting: [
    {
      name: "both describe the relationship",
      external: workspace({ relationships: ['        customer -> shop "Orders from"'] }),
      draft: workspace({ relationships: ['        customer -> shop "Buys books from"'] }),
    },
    {
      name: "the agent removes the system the user's new relationship leads to",
      external: workspace({ elements: [CUSTOMER, SHOP] }),
      draft: workspace({ relationships: [BUYS, '        shop -> mail "Sends e-mails with"'] }),
    },
  ],
  invalidTexts: ['workspace "Shop" {\n    model {\n        customer = person\n'],
  parse(text) {
    const parsed = parseWorkspace(text);
    if (!parsed.ok) throw new Error(parsed.diagnostics.map((d) => d.message).join("; "));
    return parsed.workspace;
  },
};
