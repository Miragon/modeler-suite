import { describe, expect, it } from "vitest";
import { viewCatalog } from "../src/views/catalog.js";
import type { ViewEntry } from "../src/types.js";
import { bank } from "./support/bank.js";
import { container, person, system, view, workspace } from "./support/model.js";

const keys = (entries: readonly (ViewEntry | undefined)[]) => entries.map((entry) => entry?.key);
const summary = (entry: ViewEntry | undefined) =>
  entry && { key: entry.key, state: entry.state, type: entry.type, scopeId: entry.scopeId };

describe("implicit views (SPEC 4.2, createDefaultViews)", () => {
  it("lists Structurizr's default views while the workspace has no view: by name, containers and components", () => {
    const catalog = viewCatalog(bank());
    expect(keys(catalog.list())).toEqual([
      "SystemLandscape",
      "SystemContext-email",
      "SystemContext-banking",
      "Containers-banking",
      "Components-banking-api",
      "SystemContext-loner",
      "SystemContext-mainframe",
      "Containers-mainframe",
    ]);
    expect(catalog.list().every((entry) => entry.state === "implicit" && entry.editable)).toBe(
      true,
    );
  });

  it("a blank workspace has one: the landscape", () => {
    const catalog = viewCatalog(workspace());
    expect(catalog.list().map(summary)).toEqual([
      { key: "SystemLandscape", state: "implicit", type: "systemLandscape", scopeId: undefined },
    ]);
    expect(summary(catalog.defaultView())).toEqual(summary(catalog.list()[0]));
  });

  it("sorts by name as Java compares strings, upper case first", () => {
    const catalog = viewCatalog(
      workspace({ elements: [system("b", { name: "beta" }), system("a", { name: "Zulu" })] }),
    );
    expect(keys(catalog.list())).toEqual(["SystemLandscape", "SystemContext-a", "SystemContext-b"]);
  });

  it("are gone as soon as any view is written, also a view of another type", () => {
    const catalog = viewCatalog(bank([view("Steps", "dynamic", { scope: "banking" })]));
    expect(catalog.list().filter((entry) => entry.state === "implicit")).toEqual([]);
  });
});

describe("written views and missing default drafts", () => {
  const model = bank([
    view("Landscape", "systemLandscape"),
    view("BankingContext", "systemContext", { scope: "banking" }),
    view("Steps", "dynamic", { scope: "banking" }),
  ]);
  const catalog = viewCatalog(model);

  it("lists written views in document order, then the missing defaults marked as drafts", () => {
    expect(catalog.list().map((entry) => [entry.key, entry.state])).toEqual([
      ["Landscape", "written"],
      ["BankingContext", "written"],
      ["Steps", "written"],
      ["SystemContext-email", "draft"],
      ["Containers-banking", "draft"],
      ["Components-banking-api", "draft"],
      ["SystemContext-loner", "draft"],
      ["SystemContext-mainframe", "draft"],
      ["Containers-mainframe", "draft"],
    ]);
  });

  it("lists a view type the canvas doesn't edit as not editable", () => {
    expect(catalog.resolve("Steps")?.editable).toBe(false);
  });

  it("resolves written keys and every derivable draft, nothing else", () => {
    expect(catalog.resolve("Landscape")?.state).toBe("written");
    expect(summary(catalog.resolve("Containers-email"))).toEqual({
      key: "Containers-email",
      state: "draft",
      type: "container",
      scopeId: "email",
    });
    expect(catalog.resolve("Components-mainframe-core")?.state).toBe("draft");
    expect(catalog.resolve("SystemLandscape")?.state).toBe("draft");
    expect(catalog.resolve("Containers-customer")).toBeUndefined();
    expect(catalog.resolve("landscape")).toBeUndefined();
  });

  it("finds the written view for a type and scope before the draft", () => {
    expect(catalog.draftFor("systemContext", "banking").key).toBe("BankingContext");
    expect(summary(catalog.draftFor("container", "banking"))).toEqual({
      key: "Containers-banking",
      state: "draft",
      type: "container",
      scopeId: "banking",
    });
    expect(catalog.draftFor("systemLandscape").key).toBe("Landscape");
  });

  it("writing a draft under its key keeps the key", () => {
    const written = viewCatalog(
      bank([...model.views, view("Containers-banking", "container", { scope: "banking" })]),
    );
    expect(summary(written.draftFor("container", "banking"))).toEqual({
      key: "Containers-banking",
      state: "written",
      type: "container",
      scopeId: "banking",
    });
  });
});

describe("the default view (SPEC 4.2)", () => {
  it("is the editable view marked default, the last mark winning", () => {
    const catalog = viewCatalog(
      bank([
        view("A", "systemLandscape", { isDefault: true }),
        view("B", "systemContext", { scope: "banking" }),
        view("C", "systemContext", { scope: "email", isDefault: true }),
      ]),
    );
    expect(catalog.defaultView().key).toBe("C");
  });

  it("ignores a mark on a view the canvas can't edit and takes the first editable view", () => {
    const catalog = viewCatalog(
      bank([
        view("Steps", "dynamic", { scope: "banking", isDefault: true }),
        view("Odd", "systemLandscape", { editable: false }),
        view("B", "systemContext", { scope: "banking" }),
      ]),
    );
    expect(catalog.defaultView().key).toBe("B");
  });

  it("keeps an earlier mark on an editable view when the last mark is on one it can't edit", () => {
    const catalog = viewCatalog(
      bank([
        view("A", "systemLandscape"),
        view("B", "systemContext", { scope: "banking", isDefault: true }),
        view("Steps", "dynamic", { scope: "banking", isDefault: true }),
      ]),
    );
    expect(catalog.defaultView().key).toBe("B");
  });

  it("falls back to the landscape draft when nothing written is editable", () => {
    const catalog = viewCatalog(
      bank([
        view("SystemLandscape", "systemLandscape", { editable: false }),
        view("Steps", "dynamic"),
      ]),
    );
    expect(summary(catalog.defaultView())).toEqual({
      key: "SystemLandscape-2",
      state: "draft",
      type: "systemLandscape",
      scopeId: undefined,
    });
  });
});

describe("drill-down and parent (SPEC 4.5)", () => {
  it("drills from a system to its container view and from a container to its component view", () => {
    const catalog = viewCatalog(
      bank([
        view("Landscape", "systemLandscape"),
        view("BankingContainers", "container", { scope: "banking" }),
      ]),
    );
    expect(catalog.childOf("banking")?.key).toBe("BankingContainers");
    expect(summary(catalog.childOf("mainframe"))).toMatchObject({
      key: "Containers-mainframe",
      state: "draft",
    });
    expect(summary(catalog.childOf("banking.api"))).toMatchObject({
      key: "Components-banking-api",
      state: "draft",
    });
    expect(catalog.childOf("customer")).toBeUndefined();
    expect(catalog.childOf("banking.api.signin")).toBeUndefined();
    expect(catalog.childOf("printer")).toBeUndefined();
    expect(catalog.childOf("nobody")).toBeUndefined();
  });

  it("drills into implicit views while the workspace has none", () => {
    expect(viewCatalog(bank()).childOf("banking")?.state).toBe("implicit");
    expect(viewCatalog(bank()).childOf("email")?.state).toBe("draft");
  });

  it("goes up from a component view to the container view of its system", () => {
    const catalog = viewCatalog(
      bank([
        view("Api", "component", { scope: "banking.api" }),
        view("Web", "container", { scope: "banking" }),
      ]),
    );
    expect(catalog.parentOf("Api")?.key).toBe("Web");
    expect(catalog.parentOf("Components-mainframe-core")?.key).toBe("Containers-mainframe");
  });

  it("goes up from a container view to its context view, written or a draft, never past it", () => {
    const withContext = viewCatalog(
      bank([
        view("Landscape", "systemLandscape"),
        view("Ctx", "systemContext", { scope: "banking" }),
        view("Web", "container", { scope: "banking" }),
      ]),
    );
    expect(withContext.parentOf("Web")?.key).toBe("Ctx");
    expect(summary(withContext.parentOf("Containers-mainframe"))).toMatchObject({
      key: "SystemContext-mainframe",
      state: "draft",
    });
    expect(withContext.parentOf("SystemContext-mainframe")?.key).toBe("Landscape");
    const bare = viewCatalog(bank([view("Web", "container", { scope: "banking" })]));
    expect(summary(bare.parentOf("Web"))).toMatchObject({
      key: "SystemContext-banking",
      state: "draft",
    });
  });

  it("goes up from a container view whose scope is missing to the landscape", () => {
    const catalog = viewCatalog(
      bank([view("Landscape", "systemLandscape"), view("Lost", "container", { scope: "nowhere" })]),
    );
    expect(catalog.parentOf("Lost")?.key).toBe("Landscape");
  });

  it("goes up from a context view to the landscape and stops there", () => {
    const catalog = viewCatalog(bank([view("Ctx", "systemContext", { scope: "banking" })]));
    expect(summary(catalog.parentOf("Ctx"))).toMatchObject({
      key: "SystemLandscape",
      state: "draft",
    });
    expect(catalog.parentOf("SystemLandscape")).toBeUndefined();
    expect(catalog.parentOf("nothing")).toBeUndefined();
  });
});

describe("titles (SPEC 4.6)", () => {
  it("names the diagram type and its scope unless a title is written", () => {
    const catalog = viewCatalog(
      bank([
        view("L", "systemLandscape"),
        view("T", "systemContext", { scope: "banking", title: "  Banking in context " }),
        view("Blank", "systemContext", { scope: "email", title: "  " }),
        view("D", "dynamic", { scope: "banking.api" }),
        view("F", "filtered", { baseKey: "T" }),
      ]),
    );
    const title = (key: string) => catalog.resolve(key)?.title;
    expect(title("L")).toBe("System Landscape diagram");
    expect(title("T")).toBe("Banking in context");
    expect(title("Blank")).toBe("System Context diagram for E-mail");
    expect(title("Containers-banking")).toBe("Container diagram for Internet Banking");
    expect(title("Components-banking-api")).toBe("Component diagram for Internet Banking - API");
    expect(title("D")).toBe("Dynamic diagram for Internet Banking - API");
    expect(title("F")).toBe("Banking in context");
  });
});

describe("drafts on a scope the view type can't take", () => {
  it("are not editable", () => {
    const catalog = viewCatalog(
      workspace({ elements: [person("p"), system("s"), container("s.c", "s")] }),
    );
    expect(catalog.draftFor("container", "p").editable).toBe(false);
    expect(catalog.draftFor("component", "nobody").editable).toBe(false);
    expect(catalog.draftFor("component", "s.c").editable).toBe(true);
  });
});
