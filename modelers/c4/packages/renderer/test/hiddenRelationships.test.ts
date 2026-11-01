import { readFileSync } from "node:fs";
import { parseWorkspace } from "@miragon/c4-dsl";
import { hiddenScopeRelationships, viewCatalog, type Workspace } from "@miragon/c4-schema-model";
import { describe, expect, it } from "vitest";
import { relationshipLevelNotice } from "../src/modeling/levelNotice.js";

/**
 * Which relationships the hint of a container or component view counts, on the example both apps
 * ship, and the words of the notice after drawing one a level up (SPEC 4.1: Structurizr implies a
 * relationship upward, never downward).
 */
const EXAMPLE = readFileSync(new URL("../../../example/bookshop.c4", import.meta.url), "utf8");

const CRM_LINE = '        crm = softwareSystem "CRM" "Keeps the customer records."\n';
const LAST_RELATIONSHIP = '        mail -> customer "Delivers order confirmations to"\n';

function withLines(...lines: string[]): Workspace {
  const text = EXAMPLE.replace(
    '        mail = softwareSystem "E-mail System"',
    `${CRM_LINE}        mail = softwareSystem "E-mail System"`,
  ).replace(LAST_RELATIONSHIP, `${LAST_RELATIONSHIP}${lines.join("")}`);
  const parse = parseWorkspace(text);
  expect(parse.ok).toBe(true);
  expect(parse.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  return parse.workspace;
}

function hidden(workspace: Workspace, key: string): string[] {
  const view = viewCatalog(workspace).resolve(key);
  if (view === undefined) throw new Error(`no view ${key}`);
  return hiddenScopeRelationships(workspace, view).map(
    ({ relationship }) => relationship.canvasKey,
  );
}

describe("the hint of hidden relationships on the example", () => {
  it("counts none in the container and the component view as the example stands", () => {
    const parse = parseWorkspace(EXAMPLE);
    expect(hidden(parse.workspace, "Containers-bookshop")).toEqual([]);
    expect(hidden(parse.workspace, "Components-api")).toEqual([]);
  });

  it("counts Bookshop → CRM in the container view once it is drawn on the system", () => {
    const workspace = withLines('        bookshop -> crm "Syncs customers with" "HTTPS"\n');
    expect(hidden(workspace, "Containers-bookshop")).toEqual(["bookshop->crm"]);
    expect(hidden(workspace, "Components-api")).toEqual([]);
    expect(hidden(workspace, "SystemLandscape")).toEqual([]);
    expect(hidden(workspace, "SystemContext-bookshop")).toEqual([]);
  });

  it("counts none once a container already connects to CRM", () => {
    const workspace = withLines(
      '        bookshop -> crm "Syncs customers with" "HTTPS"\n',
      '        webApp -> crm "Reads customers from" "HTTPS"\n',
    );
    expect(hidden(workspace, "Containers-bookshop")).toEqual([]);
  });

  it("counts the API's own relationship in its component view", () => {
    const workspace = withLines('        api -> crm "Syncs customers with"\n');
    expect(hidden(workspace, "Components-api")).toEqual(["api->crm"]);
    expect(hidden(workspace, "Containers-bookshop")).toEqual([]);
  });
});

describe("the notice after drawing a relationship on a system with containers", () => {
  it("names the ends and the view that won't show it, from the system", () => {
    const workspace = withLines('        bookshop -> crm "Syncs customers with"\n');
    expect(relationshipLevelNotice(workspace, "SystemLandscape", ["bookshop->crm"])).toBe(
      "Bookshop → CRM connects the systems themselves, so Bookshop's container view won't show it. Draw it from a container, or use Move to a container…",
    );
  });

  it("says to draw it to a container when the system is the destination", () => {
    const workspace = withLines('        customer -> bookshop "Asks"\n');
    expect(
      relationshipLevelNotice(workspace, "SystemContext-bookshop", ["customer->bookshop"]),
    ).toBe(
      "Customer → Bookshop connects to Bookshop itself, so Bookshop's container view won't show it. Draw it to a container, or use Move to a container…",
    );
  });

  it("says nothing for systems without containers, in a container view, or for nothing new", () => {
    const workspace = withLines(
      '        crm -> mail "Sends with"\n',
      '        bookshop -> crm "Syncs customers with"\n',
    );
    expect(relationshipLevelNotice(workspace, "SystemLandscape", ["crm->mail"])).toBeUndefined();
    expect(
      relationshipLevelNotice(workspace, "Containers-bookshop", ["bookshop->crm"]),
    ).toBeUndefined();
    expect(relationshipLevelNotice(workspace, "SystemLandscape", [])).toBeUndefined();
  });
});
