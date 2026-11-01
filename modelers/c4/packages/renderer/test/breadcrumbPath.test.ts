import { describe, expect, it } from "vitest";
import { parseWorkspace } from "@miragon/c4-dsl";
import { viewCatalog } from "@miragon/c4-schema-model";
import { breadcrumbPath, crumbText } from "../src/navigation/breadcrumbPath.js";

const MODEL = `    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            api = container "Ordering API" {
                orders = component "Orders"
            }
        }
        mail = softwareSystem "Mail" {
            relay = container "Relay"
        }
        customer -> api "Orders"
    }`;

function workspaceWith(views: string): string {
  return `workspace {\n${MODEL}\n    views {\n${views}\n    }\n}\n`;
}

const ALL_LEVELS = workspaceWith(
  [
    '        systemLandscape "Landscape" {\n            include *\n        }',
    '        systemContext shop "ShopContext" {\n            include *\n        }',
    '        container shop "ShopContainers" {\n            include *\n        }',
  ].join("\n"),
);

/** The texts of the path to `key`, the current one marked. */
function pathTo(text: string, key: string): string[] {
  const { workspace } = parseWorkspace(text);
  const catalog = viewCatalog(workspace);
  const active = catalog.resolve(key);
  if (!active) throw new Error(`no view ${key}`);
  return breadcrumbPath(catalog, active, workspace).map(
    (crumb) => `${crumbText(crumb)}${crumb.current ? " (current)" : ""} [${crumb.key}]`,
  );
}

describe("breadcrumbPath: the views from the landscape down (SPEC 4.5)", () => {
  it("a landscape is the root: its path is itself", () => {
    expect(pathTo(ALL_LEVELS, "Landscape")).toEqual(["System landscape (current) [Landscape]"]);
  });

  it("names each level by its scope element and what the view shows of it", () => {
    expect(pathTo(ALL_LEVELS, "ShopContainers")).toEqual([
      "System landscape [Landscape]",
      "Shop context [ShopContext]",
      "Shop containers (current) [ShopContainers]",
    ]);
  });

  it("goes through drafts like written views: a component view not in the file yet", () => {
    expect(pathTo(ALL_LEVELS, "Components-api")).toEqual([
      "System landscape [Landscape]",
      "Shop context [ShopContext]",
      "Shop containers [ShopContainers]",
      "Ordering API components (current) [Components-api]",
    ]);
  });

  it("a container view of a system without a context view goes up to the landscape, as U does", () => {
    expect(pathTo(ALL_LEVELS, "Containers-mail")).toEqual([
      "System landscape [Landscape]",
      "Mail containers (current) [Containers-mail]",
    ]);
  });

  it("without a written landscape, the context view's parent is the landscape's draft", () => {
    const text = workspaceWith(
      '        systemContext shop "ShopContext" {\n            include *\n        }',
    );
    expect(pathTo(text, "ShopContext")).toEqual([
      "System landscape [SystemLandscape]",
      "Shop context (current) [ShopContext]",
    ]);
  });

  it("a workspace without views walks its implicit views", () => {
    expect(pathTo(workspaceWith(""), "Components-api")).toEqual([
      "System landscape [SystemLandscape]",
      "Shop context [SystemContext-shop]",
      "Shop containers [Containers-shop]",
      "Ordering API components (current) [Components-api]",
    ]);
  });

  it("keeps the name and the level apart, so the level can stay when the name is cut", () => {
    const { workspace } = parseWorkspace(ALL_LEVELS);
    const catalog = viewCatalog(workspace);
    const crumbs = breadcrumbPath(catalog, catalog.resolve("Components-api")!, workspace);
    expect(crumbs.map(({ name, level }) => [name, level])).toEqual([
      ["System landscape", undefined],
      ["Shop", "context"],
      ["Shop", "containers"],
      ["Ordering API", "components"],
    ]);
  });
});
