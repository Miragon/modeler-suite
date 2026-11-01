import { describe, expect, it } from "vitest";
import { legendPreview, legendRows } from "../src/legend/legendContent.js";
import { ROLE_LIGHT } from "../src/draw/styles.js";
import {
  boundary,
  c4Colours,
  element,
  group,
  relationship,
  scene,
} from "./support/handBuiltScenes.js";

const customer = element("customer", { kind: "person", at: { x: 0, y: 0 } });
const shop = element("shop", { at: { x: 400, y: 0 } });
const payments = element("payments", { at: { x: 800, y: 0 } });
const api = element("api", { kind: "container", technology: "Java", at: { x: 0, y: 400 } });
const database = element("database", {
  kind: "container",
  shape: "Cylinder",
  technology: "PostgreSQL",
  at: { x: 400, y: 400 },
  style: { tags: ["Element", "Container", "Database"] },
});

describe("legendRows (SPEC 6.6)", () => {
  it("has one row per element look, by first use, labelled by kind where no style contributed", () => {
    const rows = legendRows(scene({ elements: [customer, shop, payments, api] }));
    expect(rows.map((row) => [row.kind, row.label])).toEqual([
      ["element", "Person"],
      ["element", "Software System, Container"],
    ]);
  });

  it("labels a styled look by its contributing tags without Element", () => {
    const rows = legendRows(scene({ elements: [api, database] }));
    expect(rows.map((row) => row.label)).toEqual(["Container", "Container, Database"]);
    expect(rows[1]).toMatchObject({ kind: "element", shape: "Cylinder" });
  });

  it("tells looks apart by their colours: the C4 palette makes one row per tag", () => {
    const coloured = [
      element("customer", { kind: "person", style: c4Colours("Person") }),
      element("shop", { style: c4Colours("Software System") }),
      element("legacy", { style: c4Colours("Software System") }),
      element("old", { style: c4Colours("Existing System") }),
    ];
    const rows = legendRows(scene({ elements: coloured }));
    expect(rows.map((row) => row.label)).toEqual(["Person", "Software System", "Existing System"]);
  });

  it("follows with one row per boundary kind, one for the groups and one per relationship look", () => {
    const rows = legendRows(
      scene({
        elements: [api, database],
        boundaries: [
          boundary("shop", { x: -40, y: 360, width: 800, height: 300 }),
          boundary(
            "backend",
            { x: -20, y: 380, width: 300, height: 200 },
            {
              typeLine: "[Container: Java]",
              depth: 1,
            },
          ),
          boundary("other", { x: 900, y: 0, width: 300, height: 200 }),
        ],
        groups: [group("Payments", { x: 0, y: 0, width: 100, height: 100 })],
        relationships: [
          relationship(api, database, { description: "Reads from" }),
          relationship(database, api, { description: "Notifies" }),
          relationship(api, database, {
            style: { line: "solid", tags: ["Relationship", "Async"] },
          }),
        ],
      }),
    );
    expect(rows.slice(2).map((row) => [row.kind, row.label])).toEqual([
      ["boundary", "Software System boundary"],
      ["boundary", "Container boundary"],
      ["group", "Group"],
      ["relationship", "Relationship"],
      ["relationship", "Relationship, Async"],
    ]);
  });

  it("is empty for an empty view", () => {
    expect(legendRows(scene({}))).toEqual([]);
  });
});

describe("legendPreview", () => {
  const rows = legendRows(
    scene({
      elements: [customer, shop, database, element("old", { style: c4Colours("Existing System") })],
      boundaries: [boundary("shop", { x: 0, y: 0, width: 300, height: 200 })],
      groups: [group("Team", { x: 0, y: 0, width: 100, height: 100 })],
      relationships: [relationship(customer, shop)],
    }),
  );

  it("is a 24 px SVG for every row", () => {
    for (const row of rows) {
      const markup = legendPreview(row);
      expect(markup, row.label).toMatch(
        /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="24" height="24" viewBox="[^"]+"/,
      );
      expect(markup).not.toContain("undefined");
      expect(markup).not.toContain("NaN");
    }
  });

  it("gives every role class its light value as the attribute next to it", () => {
    for (const row of rows) {
      for (const [, attributes] of legendPreview(row).matchAll(/<path([^>]*)\/>/g)) {
        const classes = /class="([^"]*)"/.exec(attributes!)?.[1]?.split(" ") ?? [];
        for (const role of classes) {
          const light = ROLE_LIGHT[role as keyof typeof ROLE_LIGHT];
          expect(light, role).toBeDefined();
          expect(attributes).toContain(`${light.attribute}="${light.value}"`);
        }
      }
    }
  });

  it("draws a self-set look in its own colours, without a role class", () => {
    const existing = rows.find((row) => row.label === "Existing System")!;
    const markup = legendPreview(existing);
    expect(markup).toContain('fill="#6B6B6B"');
    expect(markup).toContain('stroke="#4D4D4D"');
    expect(markup).not.toContain("cd-c-fill-plot");
  });

  it("escapes what a document hands in", () => {
    const hostile = element("x", { style: { fill: '"><script>' } });
    const [row] = legendRows(scene({ elements: [hostile] }));
    expect(legendPreview(row!)).not.toContain("<script>");
  });
});
