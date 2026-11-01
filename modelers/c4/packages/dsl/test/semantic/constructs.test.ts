import { describe, expect, it } from "vitest";
import { codes, diagnostics, dsl, model, parse } from "./support/parse.js";

describe("the unsupported and partly supported constructs (SPEC 3.7)", () => {
  it("keeps !include, opens the world and turns unresolved references into warnings", () => {
    const text = model('!include people.dsl\na = softwareSystem "A"\nuser -> a "Uses"');
    const result = parse(text);
    expect(result.ok).toBe(true);
    expect(result.workspace.openWorld).toBe(true);
    expect(codes(text)).toEqual(["warning:include-not-read", "warning:unresolved-reference"]);
    expect(result.workspace.relationships).toEqual([]);
  });

  it("keeps workspace extends, opens the world and reads name and description statements", () => {
    const text = dsl`
      workspace extends base.dsl {
          name "Extended"
          description "Adds a system"
          model {
              a = softwareSystem "A"
          }
      }
    `;
    const result = parse(text);
    expect(codes(text)).toEqual(["warning:extends-not-read"]);
    expect(result.workspace).toMatchObject({
      name: "Extended",
      description: "Adds a system",
      openWorld: true,
    });
  });

  it("substitutes !const and !var per token, keeps an unknown name literal and makes the field read-only", () => {
    const text = dsl`
      !const NAME "Pay ments"
      workspace {
          model {
              !var TEAM "Blue"
              p = softwareSystem "\${NAME}" "Owned by \${TEAM} and \${NOBODY}"
          }
      }
    `;
    const result = parse(text);
    const [element] = result.workspace.elements;
    expect(element).toMatchObject({
      name: "Pay ments",
      description: "Owned by Blue and ${NOBODY}",
    });
    expect(element?.fields.name).toMatchObject({ editable: false, reason: "substitution" });
    expect(codes(text)).toEqual(["warning:unknown-constant"]);
  });

  it("never runs !script, !plugin or !components, opens the world and keeps their bodies as opaque text", () => {
    const text = dsl`
      workspace {
          !script groovy {
              workspace.model.addPerson("Script")
          }
          !plugin com.example.Plugin {
              key value
          }
          model {
              s = softwareSystem "S" {
                  c = container "C" {
                      !components {
                          classes app.jar
                      }
                  }
              }
          }
          !script external.kts
      }
    `;
    const result = parse(text);
    expect(result.ok).toBe(true);
    expect(result.workspace.openWorld).toBe(true);
    expect(codes(text)).toEqual([
      "warning:script-not-run",
      "warning:script-not-run",
      "warning:script-not-run",
      "warning:script-not-run",
    ]);
    expect(result.workspace.opaqueTexts.some((body) => body.includes('addPerson("Script")'))).toBe(
      true,
    );
    expect(result.workspace.elements.map((element) => element.id)).toEqual(["s", "c"]);
  });

  it("keeps !docs, !adrs and !decisions without a diagnostic", () => {
    const text = model('s = softwareSystem "S" {\n    !docs docs\n    !adrs decisions\n}').replace(
      "workspace {",
      "workspace {\n    !docs workspace-docs\n    !decisions adrs madr",
    );
    expect(codes(text)).toEqual([]);
  });

  it("reads groups as structure: members keep their kind and get the group's path", () => {
    const text = model('g = group "Team" {\n    a = person "A"\n    b = softwareSystem "B"\n}');
    const result = parse(text);
    expect(result.workspace.groups).toEqual([
      { name: "Team", identifier: "g", path: "Team", members: ["a", "b"] },
    ]);
    expect(result.workspace.elements.map((element) => [element.kind, element.group])).toEqual([
      ["person", "Team"],
      ["softwareSystem", "Team"],
    ]);
  });

  it("resolves archetypes to their base kind and defaults, a positional value overriding a default", () => {
    const text = model(dsl`
      archetypes {
          service = container {
              description "A service"
              technology "Java"
              tag "Service"
          }
      }
      s = softwareSystem "S" {
          a = service "A"
          b = service "B" "Its own" "Kotlin"
      }
    `);
    const [, a, b] = parse(text).workspace.elements;
    expect(a).toMatchObject({
      kind: "container",
      archetype: "service",
      description: "A service",
      technology: "Java",
      tags: ["Element", "Container", "Service"],
      ownTags: [],
    });
    expect(a?.fields.description).toMatchObject({
      form: "archetype",
      editable: true,
      token: undefined,
    });
    expect(b).toMatchObject({ description: "Its own", technology: "Kotlin" });
    expect(b?.fields.technology).toMatchObject({ form: "positional", token: 3 });
  });

  it("checks an archetype's statements as Structurizr's ArchetypeParser does", () => {
    const archetype = (line: string) =>
      codes(model(`archetypes {\n    service = container {\n        ${line}\n    }\n}`));
    expect(archetype('tag "Service"')).toEqual([]);
    expect(archetype('tags "A,B" "C"')).toEqual([]);
    for (const line of ["tag", 'tag "A" "B"', "tags", 'technology "Java" "Go"', "description"]) {
      expect(archetype(line)).toEqual(["error:invalid-statement"]);
    }
  });

  it("applies !element and !relationship re-opens to their targets", () => {
    const text = model(dsl`
      a = softwareSystem "A" "First"
      b = softwareSystem "B"
      r = a -> b "Uses"
      !element a {
          description "Second"
      }
      !relationship r {
          tags "Async"
      }
    `);
    const result = parse(text);
    expect(result.workspace.elements[0]).toMatchObject({ description: "Second" });
    expect(result.workspace.elements[0]?.fields.description).toMatchObject({
      form: "reopen",
      token: 1,
      editable: true,
    });
    expect(result.workspace.relationships[0]).toMatchObject({ tags: ["Relationship", "Async"] });
    expect(codes(text)).toEqual([]);
  });

  it("keeps !elements and !relationships unevaluated and makes the fields they could set read-only", () => {
    const text = model(dsl`
      a = softwareSystem "A"
      b = softwareSystem "B"
      a -> b "Uses"
      !elements "element.type==SoftwareSystem" {
          description "Bulk"
          tags "Bulk"
      }
      !relationships "*->*" {
          technology "HTTP"
      }
    `);
    const result = parse(text);
    expect(codes(text)).toEqual(["warning:bulk-not-evaluated", "warning:bulk-not-evaluated"]);
    const [a] = result.workspace.elements;
    expect(a).toMatchObject({ description: "" });
    expect(a?.fields.description).toMatchObject({ editable: false, reason: "bulk" });
    expect(a?.fields.tags).toMatchObject({ editable: false, reason: "bulk" });
    expect(a?.fields.url).toMatchObject({ editable: true });
    expect(result.workspace.relationships[0]?.fields.technology).toMatchObject({
      editable: false,
      reason: "bulk",
    });
    expect(result.workspace.relationships[0]?.fields.description).toMatchObject({ editable: true });
    expect(result.workspace.opaqueTexts).toHaveLength(2);
  });

  it("reads !impliedRelationships per position and warns about a class it doesn't know", () => {
    const text = model(dsl`
      u = person "U"
      s = softwareSystem "S" {
          c = container "C"
      }
      !impliedRelationships false
      u -> c "Uses"
      !impliedRelationships com.example.MyStrategy
      u -> s "Other"
    `);
    const result = parse(text);
    expect(codes(text)).toEqual(["warning:implied-strategy-unknown"]);
    expect(result.workspace.relationships.filter((relationship) => relationship.implied)).toEqual(
      [],
    );
  });

  it("keeps deployment as identifiers and references: instances per element, nothing drawn", () => {
    const text = model(dsl`
      s = softwareSystem "S" {
          api = container "API"
      }
      live = deploymentEnvironment "Live" {
          node = deploymentNode "Node" {
              apiInstance = containerInstance api
              softwareSystemInstance s
          }
      }
    `);
    const result = parse(text);
    expect(codes(text)).toEqual([]);
    expect(result.workspace.elements.map((element) => element.id)).toEqual(["s", "api"]);
    expect([...result.workspace.instances]).toEqual([
      ["api", ["apiInstance"]],
      ["s", [""]],
    ]);
  });

  it("lists the other view types read-only and says so once", () => {
    const text = model(
      'a = softwareSystem "A"\nb = softwareSystem "B"\na -> b "Uses"\nlive = deploymentEnvironment "Live" {\n    deploymentNode "N" {\n        softwareSystemInstance a\n    }\n}',
      'systemLandscape "L" {\n    include *\n}\ndynamic * "D" {\n    a -> b\n}\ndeployment * live "Dep" {\n    include *\n}\nfiltered "L" exclude "Element" "F"\ncustom "C" {\n    include *\n}\nimage * "I" {\n    plantuml "@startuml\\n@enduml"\n}',
    );
    const result = parse(text);
    expect(codes(text)).toEqual(["info:view-type-not-editable"]);
    expect(
      result.workspace.views.map((view) => [
        view.key,
        view.type,
        view.editable,
        view.readOnlyReason,
      ]),
    ).toEqual([
      ["L", "systemLandscape", true, undefined],
      ["D", "dynamic", false, "type"],
      ["Dep", "deployment", false, "type"],
      ["F", "filtered", false, "type"],
      ["C", "custom", false, "type"],
      ["I", "image", false, "type"],
    ]);
    expect(result.workspace.views.find((view) => view.key === "F")?.baseKey).toBe("L");
    expect([...result.workspace.dynamicReferences]).toEqual([
      ["D", { elements: ["a", "b"], relationships: [] }],
    ]);
  });

  it("draws a static view with an unsupported term with the rest, read-only", () => {
    const text = model(
      'a = softwareSystem "A"',
      'systemLandscape "L" {\n    include * "element.type==DeploymentNode"\n}',
    );
    const result = parse(text);
    expect(codes(text)).toEqual(["warning:unsupported-expression"]);
    expect(result.workspace.views[0]).toMatchObject({
      editable: false,
      readOnlyReason: "expression",
    });
    expect(diagnostics(text, "unsupported-expression")[0]?.range).toEqual({
      start: text.indexOf('"element.type'),
      end: text.indexOf('"element.type') + '"element.type==DeploymentNode"'.length,
    });
  });

  it("reads styles, keeps themes by name and says what it doesn't draw", () => {
    const text = dsl`
      workspace {
          views {
              styles {
                  element "Database" {
                      shape robot
                      fontSize 30
                  }
                  relationship "Async" {
                      routing curved
                  }
              }
              theme https://example.com/theme.json
          }
      }
    `;
    const result = parse(text);
    expect(codes(text)).toEqual([
      "info:shape-substituted",
      "info:style-property-ignored",
      "info:style-property-ignored",
      "info:theme-not-loaded",
    ]);
    expect(result.workspace.styles).toEqual({
      elements: [{ tag: "Database", shape: "Robot", fontSize: 30 }],
      relationships: [{ tag: "Async", routing: "curved" }],
      themes: ["https://example.com/theme.json"],
    });
  });

  it("keeps perspectives, configuration and other properties without a diagnostic", () => {
    const text = dsl`
      workspace {
          properties {
              "structurizr.dsl.source" "false"
          }
          model {
              a = softwareSystem "A" {
                  perspectives {
                      "Security" "Encrypted"
                      perspective "Cost" {
                          value "High"
                      }
                  }
              }
          }
          configuration {
              scope softwaresystem
              visibility private
              users {
                  someone write
              }
          }
      }
    `;
    expect(codes(text)).toEqual([]);
  });

  it("keeps an unknown keyword with a warning", () => {
    const text = model('a = softwareSystem "A"\nfrobnicate a');
    expect(codes(text)).toEqual(["warning:unknown-statement"]);
    expect(parse(text).ok).toBe(true);
  });

  it("reads a statement with a trailing comment without it, as a compatibility error", () => {
    const text = model('a = softwareSystem "A" // the main one');
    expect(codes(text)).toEqual(["error:structurizr-rejects"]);
    expect(parse(text).workspace.elements[0]).toMatchObject({ name: "A" });
  });

  it("parses a dynamic step ending in { and warns that Structurizr refuses it", () => {
    const text = model(
      'a = softwareSystem "A"\nb = softwareSystem "B"\na -> b "Uses"',
      'dynamic * "D" {\n    a -> b "Calls" {\n        url "https://example.com"\n    }\n}',
    );
    expect(codes(text)).toEqual(["info:view-type-not-editable", "warning:structurizr-rejects"]);
  });
});
