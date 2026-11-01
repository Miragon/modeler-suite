import { describe, expect, it } from "vitest";
import { codes, diagnostics, dsl, model, parse } from "./support/parse.js";

const keys = (text: string) =>
  parse(text).workspace.relationships.map((relationship) => relationship.canvasKey);

describe("relationships, implied relationships and their keys (SPEC 3.6, 4.1)", () => {
  it("keys a relationship by its identifier, else by its ends", () => {
    const text = model(
      'a = person "A"\nb = softwareSystem "B"\nuses = a -> b "Uses"\nb -> a "Notifies"',
    );
    expect(keys(text)).toEqual(["uses", "b->a"]);
  });

  it("leaves duplicated unnamed pairs without a key, numbers their canvas keys and says so", () => {
    const text = model(
      'a = person "A"\nb = softwareSystem "B"\na -> b "Buys"\na -> b "Returns"\nnamed = a -> b "Asks"',
    );
    const result = parse(text);
    expect(
      result.workspace.relationships.map((relationship) => [
        relationship.key,
        relationship.canvasKey,
      ]),
    ).toEqual([
      [undefined, "a->b#1"],
      [undefined, "a->b#2"],
      ["named", "named"],
    ]);
    expect(codes(text)).toEqual(["info:relationship-ambiguous", "info:relationship-ambiguous"]);
  });

  it("implies relationships between the ancestors, unless any relationship exists (the default)", () => {
    const text = model(dsl`
      u = person "U"
      s = softwareSystem "S" {
          c = container "C" {
              k = component "K"
          }
      }
      u -> s "Direct"
      u -> k "Uses"
    `);
    const result = parse(text);
    expect(keys(text)).toEqual(["u->s", "u->k", "implied:u->c"]);
    const implied = result.workspace.relationships[2];
    expect(implied).toMatchObject({ implied: true, impliedBy: "u->k", description: "Uses" });
  });

  it("switches the implied strategy per position", () => {
    const text = model(dsl`
      u = person "U"
      s = softwareSystem "S" {
          c = container "C"
          d = container "D"
      }
      !impliedRelationships false
      u -> c "One"
      !impliedRelationships com.structurizr.model.CreateImpliedRelationshipsUnlessSameRelationshipExistsStrategy
      u -> d "Two"
      u -> d "Three"
      !impliedRelationships true
      d -> u "Back"
    `);
    expect(keys(text)).toEqual([
      "u->c",
      "u->d#1",
      "u->d#2",
      "d->u",
      "implied:u->s",
      "implied:u->s#2",
      "implied:s->u",
    ]);
    expect(codes(text).filter((code) => !code.includes("ambiguous"))).toEqual([]);
  });

  it("refuses a relationship whose source already has one to the destination with that description, implied ones included", () => {
    const text = model(
      'customer = person "Customer"\nshop = softwareSystem "Shop" {\n    web = container "Web"\n}\ncustomer -> web\ncustomer -> shop',
    );
    const result = parse(text);
    expect(codes(text)).toEqual(["error:relationship-exists"]);
    expect(keys(text)).toEqual(["customer->web", "implied:customer->shop"]);
    expect(result.ok).toBe(true);
    expect(diagnostics(text, "relationship-exists")[0]?.message).toContain("implied relationship");
  });

  it("doesn't draw a relationship between an element and its ancestor", () => {
    const text = model('s = softwareSystem "S" {\n    c = container "C"\n}\ns -> c "Has"');
    expect(codes(text)).toEqual(["error:relationship-to-ancestor"]);
    expect(keys(text)).toEqual([]);
  });

  it("doesn't draw a relationship to a group or a deployment item", () => {
    const text = model(
      'a = person "A"\ng = group "G" {\n}\nlive = deploymentEnvironment "Live" {\n    n = deploymentNode "N"\n}\na -> g "Joins"\na -> n "Logs in"',
    );
    expect(codes(text)).toEqual([
      "error:relationship-not-permitted",
      "error:relationship-not-permitted",
    ]);
  });

  it("resolves the ends backwards only: a forward reference is an error in a closed world", () => {
    const text = model('a = person "A"\na -> b "Uses"\nb = softwareSystem "B"');
    expect(codes(text)).toEqual(["error:unresolved-reference"]);
    expect(keys(text)).toEqual([]);
    expect(diagnostics(text)[0]?.range.start).toBe(text.indexOf('b "Uses"'));
  });

  it("reads this, the implicit source and incoming relationships in an element block", () => {
    const text = model(
      'u = person "U"\ns = softwareSystem "S" {\n    this -> u "Notifies"\n    -> u "Emails"\n    u -> this "Uses"\n}',
    );
    expect(keys(text)).toEqual(["s->u#1", "s->u#2", "u->s"]);
  });

  it("reports duplicate names per kind at the top level, per system and per container", () => {
    const text = model(dsl`
      a = person "Same"
      b = softwareSystem "Same"
      c = softwareSystem "Same"
      d = softwareSystem "D" {
          e = container "Box"
          f = container "Box"
      }
      g = softwareSystem "G" {
          h = container "Box"
      }
    `);
    expect(diagnostics(text, "duplicate-name").map((diagnostic) => diagnostic.elementId)).toEqual([
      "c",
      "f",
    ]);
  });

  it("reports what a static view can't show, and the view's own system being excluded", () => {
    const text = model(
      's = softwareSystem "S" {\n    c = container "C"\n}',
      'systemLandscape "L" {\n    include c\n}\nsystemContext s "Ctx" {\n    include *\n    exclude s\n}',
    );
    const found = diagnostics(text).filter((diagnostic) => diagnostic.severity === "error");
    expect(found.map((diagnostic) => [diagnostic.code, diagnostic.anchor])).toEqual([
      ["view-element-not-permitted", "L include c"],
      ["structurizr-rejects", "Ctx exclude s"],
    ]);
    expect(found[0]?.range.start).toBe(text.indexOf("include c") + "include ".length);
  });

  it("makes a static view on a missing or wrongly typed scope read-only", () => {
    const text = model(
      's = softwareSystem "S" {\n    c = container "C"\n}',
      'systemContext missing "A" {\n    include *\n}\ncontainer c "B" {\n    include *\n}',
    );
    const result = parse(text);
    expect(codes(text)).toEqual(["error:view-scope-invalid", "error:view-scope-invalid"]);
    expect(
      result.workspace.views.map((view) => [
        view.key,
        view.scopeId,
        view.editable,
        view.readOnlyReason,
      ]),
    ).toEqual([
      ["A", "missing", false, "scope"],
      ["B", "c", false, "scope"],
    ]);
  });

  it("refuses a dynamic step between elements nothing connects", () => {
    const text = model(
      'a = softwareSystem "A"\nb = softwareSystem "B"',
      'dynamic * "D" {\n    a -> b "Calls"\n}',
    );
    expect(codes(text)).toEqual(["info:view-type-not-editable", "error:unresolved-reference"]);
  });

  it("adds dynamic steps as DynamicView.add does: technology, replies, scope and levels", () => {
    const steps = (lines: string, scope = "shop") =>
      codes(
        model(
          dsl`
            user = person "User"
            shop = softwareSystem "Shop" {
                web = container "Web"
                api = container "API"
            }
            payments = softwareSystem "Payments" {
                gateway = container "Gateway"
            }
            user -> web "Browses" "HTTPS"
            web -> api "Calls" "JSON"
            web -> api "Streams" "gRPC"
            api -> gateway "Charges"
          `,
          `dynamic ${scope} "D" {\n${lines}\n}`,
        ),
      ).filter((code) => code.startsWith("error:"));
    expect(steps('user -> web "Opens" "HTTPS"\nweb -> api\napi -> web "Returns"')).toEqual([]);
    expect(steps('user -> web "Opens" "gRPC"')).toEqual(["error:unresolved-reference"]);
    expect(steps('api -> web "Returns"')).toEqual(["error:unresolved-reference"]);
    expect(steps('web -> api "x" "gRPC"\napi -> web "Returns"')).toEqual([
      "error:unresolved-reference",
    ]);
    expect(steps("user -> shop")).toEqual(["error:unresolved-reference"]);
    expect(steps("user -> web", "*")).toEqual(["error:unresolved-reference"]);
    expect(steps("api -> payments\napi -> gateway")).toEqual(["error:unresolved-reference"]);
  });
});
