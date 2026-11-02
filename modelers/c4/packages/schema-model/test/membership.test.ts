import { describe, expect, it } from "vitest";
import { viewCatalog } from "../src/views/catalog.js";
import { groupKey, viewMembers } from "../src/views/membership.js";
import type { ViewMembers, Workspace } from "../src/types.js";
import { bank } from "./support/bank.js";
import {
  component,
  container,
  custom,
  person,
  relationship,
  system,
  view,
  workspace,
  type StatementSpec,
} from "./support/model.js";

function membersOf(model: Workspace, key: string): ViewMembers {
  const entry = viewCatalog(model).resolve(key);
  if (entry === undefined) throw new Error(`no view ${key}`);
  return viewMembers(model, entry);
}

function landscape(...statements: StatementSpec[]): ViewMembers {
  return membersOf(bank([view("L", "systemLandscape", { statements })]), "L");
}

function scoped(
  type: "systemContext" | "container" | "component",
  scope: string,
  ...statements: StatementSpec[]
): ViewMembers {
  return membersOf(bank([view("V", type, { scope, statements })]), "V");
}

describe("include * per view type (SPEC 4.1, Structurizr's addDefaultElements)", () => {
  it("landscape: every person and system, and custom elements connected to them", () => {
    const members = landscape("include *");
    expect(members.elements).toEqual([
      "customer",
      "staff",
      "banking",
      "mainframe",
      "email",
      "loner",
      "printer",
    ]);
    expect(members.relationships).toEqual([
      "email->customer",
      "printer->staff",
      "implied:customer->banking",
      "implied:banking->mainframe",
      "implied:banking->email",
      "implied:staff->mainframe",
    ]);
    expect(members.boundaries).toEqual([]);
    expect(members.diagnostics).toEqual([]);
  });

  it("context: the system and every person, system and custom element connected to it, implied ones counting", () => {
    const members = scoped("systemContext", "banking", "include *");
    expect(members.elements).toEqual(["customer", "banking", "mainframe", "email"]);
    expect(members.relationships).toEqual([
      "email->customer",
      "implied:customer->banking",
      "implied:banking->mainframe",
      "implied:banking->email",
    ]);
  });

  it("context *?: only the relationships of the system in scope", () => {
    expect(scoped("systemContext", "banking", "include *?").relationships).toEqual([
      "implied:customer->banking",
      "implied:banking->mainframe",
      "implied:banking->email",
    ]);
  });

  it("context: the system in scope is shown without any statement", () => {
    expect(scoped("systemContext", "loner", "include customer").elements).toEqual([
      "customer",
      "loner",
    ]);
    expect(
      membersOf(bank([view("V", "systemContext", { scope: "loner", statements: [] })]), "V")
        .elements,
    ).toEqual(["loner"]);
  });

  it("container: the system's containers and what connects to them, other containers through their system", () => {
    const members = scoped("container", "banking", "include *");
    expect(members.elements).toEqual([
      "customer",
      "banking.web",
      "banking.api",
      "banking.db",
      "mainframe",
      "email",
    ]);
    expect(members.relationships).toEqual([
      "uses",
      "email->customer",
      "implied:banking.web->banking.api",
      "implied:banking.api->mainframe",
      "implied:banking.api->banking.db",
      "implied:banking.api->email",
    ]);
    expect(members.boundaries).toEqual([
      { elementId: "banking", members: ["banking.web", "banking.api", "banking.db"], depth: 0 },
    ]);
  });

  it("container *?: only relationships of the system's containers", () => {
    expect(scoped("container", "banking", "include *?").relationships).not.toContain(
      "email->customer",
    );
  });

  it("container: the boundary is drawn also when the system has no containers", () => {
    const members = scoped("container", "loner", "include *");
    expect(members.elements).toEqual([]);
    expect(members.boundaries).toEqual([{ elementId: "loner", members: [], depth: 0 }]);
  });

  it("component: the container's components, the system's containers and the systems connected to them", () => {
    const members = scoped("component", "banking.api", "include *");
    expect(members.elements).toEqual([
      "banking.web",
      "banking.api.signin",
      "banking.api.accounts",
      "banking.db",
      "mainframe",
      "email",
    ]);
    expect(members.relationships).toEqual([
      "banking.web->banking.api.signin",
      "banking.api.accounts->mainframe",
      "banking.api.signin->banking.db",
      "banking.api.accounts->email",
    ]);
    expect(members.boundaries).toEqual([
      { elementId: "banking", members: ["banking.web", "banking.db"], depth: 0 },
      {
        elementId: "banking.api",
        members: ["banking.api.signin", "banking.api.accounts"],
        parentId: "banking",
        depth: 1,
      },
    ]);
  });

  it("component *?: drops every shown relationship not touching the container's components", () => {
    const componentView = (...statements: StatementSpec[]) =>
      membersOf(
        workspace({
          elements: [
            system("s"),
            container("s.a", "s"),
            container("s.b", "s"),
            component("s.a.x", "s.a"),
            person("p"),
          ],
          relationships: [relationship("s.a.x", "s.b"), relationship("p", "s.b")],
          views: [view("V", "component", { scope: "s.a", statements })],
        }),
        "V",
      );
    expect(componentView("include *?", "include p").relationships).toEqual([
      "s.a.x->s.b",
      "p->s.b",
    ]);
    expect(componentView("include p", "include *?").relationships).toEqual(["s.a.x->s.b"]);
  });

  it("a draft or implicit view is include *", () => {
    const model = bank();
    const draft = viewCatalog(model).draftFor("container", "banking");
    expect(draft.state).toBe("implicit");
    expect(viewMembers(model, draft).elements).toEqual(
      scoped("container", "banking", "include *").elements,
    );
  });
});

describe("identifier terms", () => {
  it("adds the named elements and every relationship between shown elements", () => {
    const members = landscape("include customer email");
    expect(members.elements).toEqual(["customer", "email"]);
    expect(members.relationships).toEqual(["email->customer"]);
  });

  it("looks identifiers up case-insensitively", () => {
    expect(landscape("include CUSTOMER Email").elements).toEqual(["customer", "email"]);
  });

  it("a relationship identifier brings its implied relatives, but only between shown elements", () => {
    expect(landscape("include customer banking").relationships).toEqual([
      "implied:customer->banking",
    ]);
    expect(landscape("include customer banking", "exclude uses").relationships).toEqual([]);
    expect(
      landscape("include customer banking", "exclude uses", "include uses").relationships,
    ).toEqual(["implied:customer->banking"]);
  });

  it("a group identifier names the group's elements", () => {
    expect(landscape("include bankGroup").elements).toEqual(["staff", "banking", "mainframe"]);
  });

  it("an element of a kind the view can't show, named explicitly, is a compatibility error", () => {
    const members = landscape("include customer banking.web");
    expect(members.elements).toEqual(["customer"]);
    expect(members.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "view-element-not-permitted",
        rejects: false,
        elementId: "banking.web",
        anchor: "L include banking.web",
      }),
    ]);
  });

  it("an element of the wrong kind reached through an expression is skipped silently", () => {
    const members = landscape("include element.type==Container");
    expect(members.elements).toEqual([]);
    expect(members.diagnostics).toEqual([]);
  });

  it("an unknown identifier is an error, a warning in an open world", () => {
    const closed = landscape("include nobody");
    expect(closed.diagnostics).toEqual([
      expect.objectContaining({ code: "unresolved-reference", severity: "error" }),
    ]);
    const open = membersOf(
      bank([view("L", "systemLandscape", { statements: ["include nobody"] })], { openWorld: true }),
      "L",
    );
    expect(open.diagnostics).toEqual([
      expect.objectContaining({ code: "unresolved-reference", severity: "warning" }),
    ]);
  });

  it("an implicit identifier is not a reference Structurizr could resolve", () => {
    const model = workspace({
      elements: [system("payments", { implicit: true, name: "Payments" })],
      views: [view("L", "systemLandscape", { statements: ["include payments"] })],
    });
    expect(membersOf(model, "L").diagnostics).toEqual([
      expect.objectContaining({ code: "unresolved-reference" }),
    ]);
  });
});

describe("include and exclude run in order (imperative, R-DSL §11.2)", () => {
  it("an element excluded and included again comes back with its relationships", () => {
    const members = landscape("include *", "exclude email", "include email");
    expect(members.elements).toContain("email");
    expect(members.relationships).toContain("email->customer");
  });

  it("including a shown element again re-adds its excluded relationships", () => {
    expect(landscape("include *", "exclude email->customer").relationships).not.toContain(
      "email->customer",
    );
    expect(
      landscape("include *", "exclude email->customer", "include customer").relationships,
    ).toContain("email->customer");
  });

  it("`a->b` hides only relationships with exactly those ends, not implied relatives", () => {
    const members = scoped(
      "container",
      "banking",
      "include *",
      "include customer",
      "exclude customer->banking.web",
    );
    expect(members.relationships).not.toContain("uses");
    const landscapeView = landscape("include *", "exclude customer->banking.web");
    expect(landscapeView.relationships).toContain("implied:customer->banking");
  });

  it("an implied relationship is excluded by its ends", () => {
    expect(landscape("include *", "exclude customer->banking").relationships).not.toContain(
      "implied:customer->banking",
    );
  });

  it("excluding the context view's own system is refused, the system stays", () => {
    const members = scoped("systemContext", "banking", "include *", "exclude banking");
    expect(members.elements).toContain("banking");
    expect(members.diagnostics).toEqual([
      expect.objectContaining({ code: "structurizr-rejects", elementId: "banking" }),
    ]);
  });

  it("`exclude *` is refused", () => {
    expect(landscape("include *", "exclude *").diagnostics).toEqual([
      expect.objectContaining({ code: "structurizr-rejects" }),
    ]);
  });

  it("a term without a supported expression is skipped for drawing", () => {
    const model = bank([
      view("L", "systemLandscape", {
        statements: [
          ["include", "customer"],
          ["include", "element.type==DeploymentNode"],
        ],
      }),
    ]);
    expect(membersOf(model, "L").elements).toEqual(["customer"]);
  });
});

describe("parents and children in container and component views", () => {
  it("a system whose container is shown is not permitted, and the other way round", () => {
    expect(scoped("container", "banking", "include mainframe mainframe.core").elements).toEqual([
      "mainframe",
    ]);
    expect(scoped("container", "banking", "include mainframe.core mainframe").elements).toEqual([
      "mainframe.core",
    ]);
  });

  it("the system in scope can't be shown in its own container view", () => {
    const members = scoped("container", "banking", "include banking");
    expect(members.elements).toEqual([]);
    expect(members.diagnostics).toEqual([]);
  });

  it("another system's container gets its system's boundary", () => {
    const members = scoped("container", "banking", "include banking.web mainframe.core");
    expect(members.boundaries).toEqual([
      { elementId: "banking", members: ["banking.web"], depth: 0 },
      { elementId: "mainframe", members: ["mainframe.core"], depth: 0 },
    ]);
  });

  it("an empty component view still frames its container inside its system", () => {
    const members = scoped("component", "mainframe.core", "include *");
    expect(members.elements).toEqual([]);
    expect(members.boundaries).toEqual([
      { elementId: "mainframe", members: [], depth: 0 },
      { elementId: "mainframe.core", members: [], parentId: "mainframe", depth: 1 },
    ]);
  });
});

describe("every supported expression (SPEC 4.1)", () => {
  it.each<[string, readonly string[]]>([
    ["->banking", ["customer", "banking"]],
    ["banking->", ["banking", "mainframe", "email"]],
    ["->email->", ["customer", "banking", "email"]],
    ["element==->email->", ["customer", "banking", "email"]],
    ["element.type==Person", ["customer", "staff"]],
    ["element.type==SoftwareSystem", ["banking", "mainframe", "email", "loner"]],
    ["element.type==Custom", ["printer", "orphan"]],
    ["element.tag==Existing System", ["mainframe", "email"]],
    ["element.tag==Element,Person", ["customer", "staff"]],
    ["element.group==Bank", ["staff", "banking", "mainframe"]],
    ["element==customer", ["customer"]],
    ["element.parent==banking", []],
  ])("landscape include %j", (term, expected) => {
    expect(landscape(["include", term]).elements).toEqual(expected);
  });

  it("`element.tag==` with no tag selects nothing, `element.tag!=` everything", () => {
    expect(landscape(["include", "element.tag=="]).elements).toEqual([]);
    expect(landscape(["include", "element.tag!="]).elements).toEqual([
      "customer",
      "staff",
      "banking",
      "mainframe",
      "email",
      "loner",
      "printer",
      "orphan",
    ]);
  });

  it("element.parent== naming a group selects nothing and is no error, as there", () => {
    const members = scoped("container", "banking", ["include", "element.parent==bankGroup"]);
    expect(members.elements).toEqual([]);
    expect(members.diagnostics).toEqual([]);
    expect(
      scoped("container", "banking", ["include", "element.parent==nobody"]).diagnostics,
    ).toEqual([expect.objectContaining({ code: "unresolved-reference" })]);
  });

  it("element!= takes every other element the view can show", () => {
    expect(landscape(["include", "element!=element.type==SoftwareSystem"]).elements).toEqual([
      "customer",
      "staff",
      "printer",
      "orphan",
    ]);
    expect(landscape("include *", ["exclude", "element!=customer"]).elements).toEqual(["customer"]);
  });

  it.each<[string, readonly string[]]>([
    ["element.parent==banking", ["banking.web", "banking.api", "banking.db"]],
    ["element.technology==Java", ["banking.web", "banking.api"]],
    ["element.technology!=Java", ["banking.db", "mainframe.core"]],
    ["element.tag==Api", ["banking.api"]],
    [
      "element.tag!=Api",
      [
        "customer",
        "staff",
        "banking.web",
        "banking.db",
        "mainframe",
        "email",
        "loner",
        "printer",
        "orphan",
      ],
    ],
    [
      "element.type==Container && element.parent==banking",
      ["banking.web", "banking.api", "banking.db"],
    ],
    ["element.tag==Api || element.tag==Database", ["banking.api", "banking.db"]],
  ])("container view include %j", (term, expected) => {
    expect(scoped("container", "banking", ["include", term]).elements).toEqual(expected);
  });

  it("element.properties[k]==v and element.technology in a component view", () => {
    expect(
      scoped("component", "banking.api", ["include", "element.properties[team]==blue"]).elements,
    ).toEqual(["banking.api.accounts"]);
    expect(
      scoped("component", "banking.api", ["include", "element.technology==Spring"]).elements,
    ).toEqual(["banking.api.signin"]);
  });

  it.each<[string, readonly string[]]>([
    [
      "*->*",
      [
        "email->customer",
        "printer->staff",
        "implied:customer->banking",
        "implied:banking->mainframe",
        "implied:banking->email",
        "implied:staff->mainframe",
      ],
    ],
    ["banking->*", ["implied:banking->mainframe", "implied:banking->email"]],
    ["*->customer", ["email->customer"]],
    ["customer->banking", ["implied:customer->banking"]],
    [
      "relationship==*",
      [
        "email->customer",
        "printer->staff",
        "implied:customer->banking",
        "implied:banking->mainframe",
        "implied:banking->email",
        "implied:staff->mainframe",
      ],
    ],
    ["relationship.tag==Async", ["email->customer", "implied:banking->email"]],
    [
      "relationship.tag!=Async",
      [
        "printer->staff",
        "implied:customer->banking",
        "implied:banking->mainframe",
        "implied:staff->mainframe",
      ],
    ],
    ["relationship.source==banking", ["implied:banking->mainframe", "implied:banking->email"]],
    [
      "relationship.destination==mainframe",
      ["implied:banking->mainframe", "implied:staff->mainframe"],
    ],
    [
      "relationship.source==element.type==Person",
      ["implied:customer->banking", "implied:staff->mainframe"],
    ],
    ["element.tag==Existing System->*", ["email->customer"]],
  ])("relationship term %j keeps only its relationships", (term, expected) => {
    const members = landscape("include *", "exclude *->*", ["include", term]);
    expect(members.relationships).toEqual(expected);
  });

  it("a relationship term adds only relationships whose ends are shown", () => {
    expect(landscape("include customer", "include *->*").relationships).toEqual([]);
  });

  it("relationship.tag reads the origin's tags on implied relationships", () => {
    expect(
      landscape("include *", ["exclude", "relationship.tag==Sync"]).relationships,
    ).not.toContain("implied:banking->mainframe");
  });

  it("relationship.properties[k]==v reads the properties the parser records on a relationship", () => {
    const withProperties = { ...relationship("a", "b"), properties: { kind: "sync" } };
    const model = workspace({
      elements: [system("a"), system("b"), system("c")],
      relationships: [withProperties, relationship("b", "c")],
      views: [
        view("L", "systemLandscape", {
          statements: [
            "include *",
            "exclude *->*",
            ["include", "relationship.properties[kind]==sync"],
          ],
        }),
      ],
    });
    expect(membersOf(model, "L").relationships).toEqual(["a->b"]);
  });
});

describe("groups", () => {
  it("frames groups that hold a shown element, nested by path", () => {
    const model = workspace({
      elements: [
        person("a", { group: "Org" }),
        system("b", { group: "Org/Team" }),
        system("c", { group: "Org/Team" }),
        system("d", { group: "Other" }),
        system("e", { group: "Empty" }),
        system("s"),
        container("s.x", "s", { group: "Internal" }),
      ],
      groups: [
        { name: "Org", identifier: undefined, path: "Org", members: ["a"] },
        { name: "Team", identifier: "team", path: "Org/Team", members: ["b", "c"] },
        { name: "Other", identifier: undefined, path: "Other", members: ["d"] },
        { name: "Empty", identifier: undefined, path: "Empty", members: ["e"] },
        {
          name: "Internal",
          identifier: undefined,
          path: "Internal",
          parentId: "s",
          members: ["s.x"],
        },
      ],
      views: [
        view("L", "systemLandscape", { statements: ["include a b c d s"] }),
        view("C", "container", { scope: "s", statements: ["include *"] }),
      ],
    });
    expect(membersOf(model, "L").groups).toEqual([
      { path: "Org", name: "Org", members: ["a", "b", "c"], depth: 0 },
      { path: "Org/Team", name: "Team", members: ["b", "c"], depth: 1 },
      { path: "Other", name: "Other", members: ["d"], depth: 0 },
    ]);
    expect(membersOf(model, "C").groups).toEqual([
      { path: "Internal", name: "Internal", scopeId: "s", members: ["s.x"], depth: 0 },
    ]);
  });

  it("keeps a model-level group and a system's container group of one name apart", () => {
    const model = workspace({
      elements: [
        person("customer", { group: "Core" }),
        system("s"),
        container("s.web", "s", { group: "Core" }),
        container("s.api", "s", { group: "Core/Inner" }),
      ],
      relationships: [relationship("customer", "s.web")],
      groups: [
        { name: "Core", identifier: undefined, path: "Core", members: ["customer"] },
        { name: "Core", identifier: undefined, path: "Core", parentId: "s", members: ["s.web"] },
        {
          name: "Inner",
          identifier: undefined,
          path: "Core/Inner",
          parentId: "s",
          members: ["s.api"],
        },
      ],
      views: [view("C", "container", { scope: "s", statements: ["include *"] })],
    });
    const groups = membersOf(model, "C").groups;
    expect(groups).toEqual([
      { path: "Core", name: "Core", members: ["customer"], depth: 0 },
      { path: "Core", name: "Core", scopeId: "s", members: ["s.web", "s.api"], depth: 0 },
      { path: "Core/Inner", name: "Inner", scopeId: "s", members: ["s.api"], depth: 1 },
    ]);
    expect(groups.map((group) => groupKey(group.scopeId, group.path))).toEqual([
      "/Core",
      "s/Core",
      "s/Core/Inner",
    ]);
  });

  it("a group term takes the group's members only, as ElementGroup.getElements", () => {
    const model = workspace({
      elements: [
        person("a", { group: "Team" }),
        system("moved", { group: "Team" }),
        custom("partner", { group: "Team" }),
        system("b"),
      ],
      groups: [{ name: "Team", identifier: "team", path: "Team", members: ["a"] }],
      views: [view("L", "systemLandscape", { statements: ["include team"] })],
    });
    const members = membersOf(model, "L");
    expect(members.elements).toEqual(["a"]);
    expect(members.groups).toEqual([{ path: "Team", name: "Team", members: ["a"], depth: 0 }]);
  });

  it("a group that holds only custom or moved elements names nothing, so the term fails", () => {
    const model = workspace({
      elements: [custom("partner", { group: "Team" }), system("moved", { group: "Team" })],
      groups: [{ name: "Team", identifier: "team", path: "Team", members: [] }],
      views: [view("L", "systemLandscape", { statements: ["include team"] })],
    });
    const members = membersOf(model, "L");
    expect(members.elements).toEqual([]);
    expect(members.diagnostics).toEqual([
      expect.objectContaining({ code: "unresolved-reference", anchor: "L include team" }),
    ]);
  });
});

describe("views that are not projected", () => {
  it("returns nothing for the other view types and for a missing or wrong scope", () => {
    const model = bank([
      view("D", "dynamic", { scope: "banking" }),
      view("X", "container", { scope: "nobody" }),
      view("Y", "component", { scope: "banking" }),
    ]);
    for (const key of ["D", "X", "Y"]) {
      expect(membersOf(model, key)).toEqual({
        elements: [],
        relationships: [],
        boundaries: [],
        groups: [],
        diagnostics: [],
      });
    }
  });
});

describe("the inputs planSmartDelete reads (SPEC 5.4)", () => {
  const model = bank([
    view("Landscape", "systemLandscape", { statements: ["include *", "exclude loner"] }),
    view("Context", "systemContext", { scope: "banking" }),
    view("Containers", "container", { scope: "banking" }),
  ]);
  const showing = (id: string) =>
    viewCatalog(model)
      .list()
      .filter(
        (entry) => entry.state === "written" && viewMembers(model, entry).elements.includes(id),
      )
      .map((entry) => entry.key);

  it("tells which written views show an element", () => {
    expect(showing("customer")).toEqual(["Landscape", "Context", "Containers"]);
    expect(showing("banking.web")).toEqual(["Containers"]);
    expect(showing("loner")).toEqual([]);
    expect(showing("staff")).toEqual(["Landscape"]);
  });

  it("tells which written views show a relationship", () => {
    const relationshipShown = (key: string) =>
      viewCatalog(model)
        .list()
        .filter(
          (entry) =>
            entry.state === "written" && viewMembers(model, entry).relationships.includes(key),
        )
        .map((entry) => entry.key);
    expect(relationshipShown("uses")).toEqual(["Containers"]);
    expect(relationshipShown("email->customer")).toEqual(["Landscape", "Context", "Containers"]);
  });
});
