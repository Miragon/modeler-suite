import { describe, expect, it } from "vitest";
import { semanticSources } from "../../src/semantic/index.js";
import { dsl, model, parse } from "./support/parse.js";

function element(text: string, id: string) {
  const result = parse(text);
  const found = result.workspace.elements.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no element ${id}`);
  return { element: found, result };
}

describe("field sources: the last writer is the effective source (SPEC 3.5)", () => {
  it("reads the positional slots per kind", () => {
    const text = model(dsl`
      p = person "P" "Person description" "A,B"
      s = softwareSystem "S" "System description" {
          c = container "C" "Container description" "Java" "Web"
      }
      x = element "X" "Hardware" "Custom description" "Box"
    `);
    const p = element(text, "p").element;
    expect(p.fields.description).toMatchObject({ form: "positional", token: 2, editable: true });
    expect(p.fields.tags).toMatchObject({ form: "positional", token: 3 });
    expect(p.ownTags).toEqual(["A", "B"]);
    const c = element(text, "c").element;
    expect(c.fields.technology).toMatchObject({ form: "positional", token: 3 });
    expect(c.fields.tags).toMatchObject({ form: "positional", token: 4 });
    const x = element(text, "x").element;
    expect(x).toMatchObject({
      metadata: "Hardware",
      description: "Custom description",
      tags: ["Element", "Box"],
    });
    expect(x.fields.metadata).toMatchObject({ form: "positional", token: 2 });
    expect(x.fields.description).toMatchObject({ form: "positional", token: 3 });
  });

  it("points a field without a source at the definition, editable where the kind has it", () => {
    const text = model('p = person "P"');
    const { element: p, result } = element(text, "p");
    expect(p.fields.description).toEqual({
      form: "absent",
      statement: 2,
      token: undefined,
      editable: true,
      reason: undefined,
    });
    expect(p.fields.url).toMatchObject({ form: "absent", editable: true });
    expect(p.fields.technology).toMatchObject({ form: "absent", editable: false });
    expect(p.fields.metadata).toMatchObject({ form: "absent", editable: false });
    expect(semanticSources(result.sources)?.statements[p.fields.description.statement]).toBe(
      result.sources.element("p")?.definition,
    );
  });

  it("lets a child statement win over the positional token", () => {
    const text = model(
      's = softwareSystem "S" "Positional" {\n    description "Statement"\n    url "https://example.com"\n}',
    );
    const { element: s, result } = element(text, "s");
    expect(s).toMatchObject({ description: "Statement", url: "https://example.com" });
    expect(s.fields.description).toMatchObject({ form: "statement", token: 1 });
    expect(s.fields.url).toMatchObject({ form: "statement", token: 1 });
    const site = result.sources.field("s", "description");
    expect(site?.statement.tokens[0]?.value).toBe("description");
    expect(site?.token).toBe(1);
  });

  it("makes own tags written in more than one place read-only", () => {
    const text = model('s = softwareSystem "S" "" "A" {\n    tags "B" "C,D"\n}');
    const s = element(text, "s").element;
    expect(s.ownTags).toEqual(["A", "B", "C", "D"]);
    expect(s.tags).toEqual(["Element", "Software System", "A", "B", "C", "D"]);
    expect(s.fields.tags).toMatchObject({
      form: "statement",
      editable: false,
      reason: "several-statements",
    });
  });

  it("reads a group's block as the elements' group only: no description of the enclosing element inside it", () => {
    const text = model(
      's = softwareSystem "S" {\n    group "G" {\n        c = container "C"\n    }\n}',
    );
    expect(element(text, "c").element).toMatchObject({ group: "G", parentId: "s" });
    expect(parse(text).workspace.groups).toEqual([
      { name: "G", identifier: undefined, path: "G", parentId: "s", members: ["c"] },
    ]);
  });

  it("writes relationship fields to the positional slots, tags and url also to its block", () => {
    const text = model(dsl`
      a = softwareSystem "A"
      b = softwareSystem "B" {
          -> a "Calls" "HTTP" "Sync" {
              tags "Fast"
              url "https://example.com"
          }
      }
      a -> b "Answers"
    `);
    const [calls, answers] = parse(text).workspace.relationships;
    expect(calls).toMatchObject({
      key: "b->a",
      description: "Calls",
      technology: "HTTP",
      tags: ["Relationship", "Sync", "Fast"],
      url: "https://example.com",
    });
    expect(calls?.fields.description).toMatchObject({ form: "positional", token: 2 });
    expect(calls?.fields.tags).toMatchObject({
      form: "statement",
      editable: false,
      reason: "several-statements",
    });
    expect(answers?.fields.description).toMatchObject({ form: "positional", token: 3 });
    expect(answers?.fields.technology).toMatchObject({ form: "absent", editable: true });
  });

  it("reads relationship archetypes as defaults under the positional values", () => {
    const text = model(dsl`
      archetypes {
          https = -> {
              technology "HTTPS"
              tags "Secure"
          }
      }
      a = softwareSystem "A"
      b = softwareSystem "B"
      a --https-> b "Calls"
    `);
    const [relationship] = parse(text).workspace.relationships;
    expect(relationship).toMatchObject({ technology: "HTTPS", tags: ["Relationship", "Secure"] });
    expect(relationship?.fields.technology).toMatchObject({ form: "archetype", editable: true });
  });

  it("records relationship properties for relationship.properties expressions", () => {
    const text = model(
      'a = softwareSystem "A"\nb = softwareSystem "B" {\n    c = container "C"\n}\na -> c "Uses" {\n    properties {\n        "kind" "sync"\n    }\n}',
    );
    const relationships = parse(text).workspace.relationships;
    expect(
      relationships.map((relationship) => [relationship.canvasKey, relationship.properties]),
    ).toEqual([
      ["a->c", { kind: "sync" }],
      ["implied:a->b", { kind: "sync" }],
    ]);
  });
});
