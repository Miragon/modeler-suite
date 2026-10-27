import { describe, expect, it } from "vitest";
import {
  MAX_NESTING_DEPTH,
  isReservedId,
  parseDocument,
  parseDocumentText,
  reservedIdProblem,
  validateDocument,
} from "./schema";
import { serializeDocumentText } from "./serialize";
import { SAMPLE_DOCUMENT } from "./sample";
import { emptyDocument } from "./factory";
import type { CmDocument, Relationship } from "./types";

describe("parseDocument", () => {
  it("accepts the sample document", () => {
    const result = parseDocument(SAMPLE_DOCUMENT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.contexts).toHaveLength(6);
      expect(result.document.relationships).toHaveLength(6);
    }
  });

  it("fills in defaults for a sparse object (migration)", () => {
    const result = parseDocument({ contexts: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.version).toBe(1);
      expect(typeof result.document.title).toBe("string");
      expect(result.document.relationships).toEqual([]);
    }
  });

  it("rejects an invalid subdomain type", () => {
    const result = parseDocument({
      version: 1,
      title: "x",
      contexts: [
        {
          id: "a",
          label: "A",
          subdomainType: "not-a-subdomain",
          position: { x: 0, y: 0 },
          size: { width: 10, height: 10 },
        },
      ],
      relationships: [],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid relationship pattern", () => {
    const result = parseDocument({
      version: 1,
      title: "x",
      contexts: [],
      relationships: [{ id: "r", from: "a", to: "b", pattern: "bogus" }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(parseDocument(42).ok).toBe(false);
    expect(parseDocument(null).ok).toBe(false);
  });

  it("rejects an id the canvas keeps for itself, at that id", () => {
    const doc = structuredClone(SAMPLE_DOCUMENT) as CmDocument;
    doc.contexts[2]!.id = "cm-root";
    doc.relationships[1]!.id = "__implicitroot_1";
    const result = parseDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        {
          path: ["contexts", 2, "id"],
          message: 'the id "cm-root" is reserved for the diagram itself',
        },
        {
          path: ["relationships", 1, "id"],
          message: 'the id "__implicitroot_1" is reserved for the diagram itself',
        },
      ]);
    }
    expect(isReservedId("cm-root-billing")).toBe(false);
  });

  it("rejects an id that names a built-in object property, at that id", () => {
    for (const id of ["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"]) {
      const doc = structuredClone(SAMPLE_DOCUMENT) as CmDocument;
      doc.relationships[2]!.id = id;
      const result = parseDocument(doc);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toEqual([
          {
            path: ["relationships", 2, "id"],
            message: `the id "${id}" is reserved: it names a built-in property of JavaScript objects`,
          },
        ]);
      }
      expect(isReservedId(id)).toBe(true);
    }
    expect(reservedIdProblem("constructor_billing")).toBeUndefined();
    expect(reservedIdProblem("Constructor")).toBeUndefined();
  });

  it("rejects a repeated id at the path of the repeat, across contexts and relationships", () => {
    const doc = structuredClone(SAMPLE_DOCUMENT) as CmDocument;
    doc.contexts[3]!.id = "ctx_auth";
    doc.relationships[4]!.id = "ctx_cfp";
    const result = parseDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        {
          path: ["contexts", 3, "id"],
          message: 'duplicate id "ctx_auth"; ids must be unique across contexts and relationships',
        },
        {
          path: ["relationships", 4, "id"],
          message: 'duplicate id "ctx_cfp"; ids must be unique across contexts and relationships',
        },
      ]);
      expect(result.error).toMatch(/^contexts\.3\.id: duplicate id "ctx_auth"/);
    }
  });

  it("reports a repeated id in the same round as the other errors, in document order", () => {
    const doc = structuredClone(SAMPLE_DOCUMENT) as CmDocument;
    doc.contexts[0]!.position.x = Number.NaN;
    doc.contexts[2]!.id = "ctx_auth";
    doc.contexts[4]!.id = "cm-root";
    doc.relationships[0]!.pattern = "bogus" as Relationship["pattern"];
    doc.relationships[1]!.id = "ctx_auth";
    const result = parseDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues?.map((issue) => issue.path.join("."))).toEqual([
        "contexts.0.position.x",
        "contexts.2.id",
        "contexts.4.id",
        "relationships.0.pattern",
        "relationships.1.id",
      ]);
    }
  });

  it("follows the file's order when its relationships come before its contexts", () => {
    const { version, title, contexts, relationships } = structuredClone(SAMPLE_DOCUMENT);
    contexts[0]!.id = relationships[0]!.id;
    contexts[2]!.position.x = Number.NaN;
    relationships[1]!.pattern = "bogus" as Relationship["pattern"];
    const text = JSON.stringify({ version, title, relationships, contexts });
    const result = parseDocumentText(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues?.map((issue) => issue.path.join("."))).toEqual([
        "relationships.1.pattern",
        "contexts.0.id",
        "contexts.2.position.x",
      ]);
      expect(result.issues?.[1]?.message).toBe(
        `duplicate id "${relationships[0]!.id}"; ids must be unique across contexts and relationships`,
      );
    }
  });

  it("reports a reserved id that repeats as reserved only, and skips ids that are no string", () => {
    const result = parseDocument({
      title: "x",
      contexts: [
        { id: "valueOf", label: "A", position: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
        { id: "valueOf", label: "B", position: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
        { id: 7, label: "C", position: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
        { id: 7, label: "D", position: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues?.map((issue) => issue.path.join("."))).toEqual([
        "contexts.0.id",
        "contexts.1.id",
        "contexts.2.id",
        "contexts.3.id",
      ]);
      expect(result.issues?.some((issue) => issue.message.startsWith("duplicate"))).toBe(false);
    }
  });
});

describe("nesting depth", () => {
  const tooDeep = `objects and arrays may nest at most ${MAX_NESTING_DEPTH} levels deep`;

  const alternatingObjectsAndArrays = (levels: number): unknown => {
    let value: unknown = 0;
    for (let level = levels - 1; level >= 0; level--) value = level % 2 ? [value] : { a: value };
    return value;
  };

  const keysThroughOutermost = (levels: number): Array<string | number> =>
    Array.from({ length: levels }, (_, level) => (level % 2 ? 0 : "a"));

  const arraysAround = (levels: number, innermost: unknown[]): unknown[] => {
    let value = innermost;
    for (let level = 0; level < levels; level++) value = [value];
    return value;
  };

  it(`loads and saves a document of ${MAX_NESTING_DEPTH} levels`, () => {
    // The document is the first level, the foreign key's value the second.
    const result = parseDocument({
      ...SAMPLE_DOCUMENT,
      "x-deep": alternatingObjectsAndArrays(MAX_NESTING_DEPTH - 1),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = serializeDocumentText(result.document);
    const reread = parseDocumentText(text);
    expect(reread.ok).toBe(true);
    if (reread.ok) expect(serializeDocumentText(reread.document)).toBe(text);
  });

  it("rejects one level more, at the first level too deep", () => {
    const result = parseDocument({
      ...SAMPLE_DOCUMENT,
      "x-deep": alternatingObjectsAndArrays(MAX_NESTING_DEPTH),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        { path: ["x-deep", ...keysThroughOutermost(MAX_NESTING_DEPTH - 1)], message: tooDeep },
      ]);
    }
  });

  it("reports the first level too deep of a file instead of overflowing the stack", () => {
    const levels = 50_000;
    const value = '{"a":['.repeat(levels / 2) + "0" + "]}".repeat(levels / 2);
    const text = serializeDocumentText(SAMPLE_DOCUMENT).replace(/^\{/, `{"x-deep":${value},`);
    const result = parseDocumentText(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        { path: ["x-deep", ...keysThroughOutermost(MAX_NESTING_DEPTH - 1)], message: tooDeep },
      ]);
      expect(result.error).toBe(
        `x-deep.${keysThroughOutermost(MAX_NESTING_DEPTH - 1).join(".")}: ${tooDeep}`,
      );
    }
  });

  it("reports each branch too deep in the same round as the other errors, in document order", () => {
    const doc = structuredClone(SAMPLE_DOCUMENT) as CmDocument & Record<string, unknown>;
    doc.contexts[0]!.position.x = Number.NaN;
    Object.assign(doc.contexts[1]!, { "x-deep": alternatingObjectsAndArrays(5_000) });
    doc.contexts[2]!.id = "ctx_auth";
    Object.assign(doc.relationships[3]!, {
      "x-wide": [alternatingObjectsAndArrays(5_000), "flat", alternatingObjectsAndArrays(5_000)],
    });
    const result = parseDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues?.map(({ path, message }) => [path.slice(0, 5), message])).toEqual([
        [["contexts", 0, "position", "x"], "Invalid input: expected number, received NaN"],
        [["contexts", 1, "x-deep", "a", 0], tooDeep],
        [
          ["contexts", 2, "id"],
          'duplicate id "ctx_auth"; ids must be unique across contexts and relationships',
        ],
        [["relationships", 3, "x-wide", 0, "a"], tooDeep],
        [["relationships", 3, "x-wide", 2, "a"], tooDeep],
      ]);
      expect(
        result.issues?.every(
          ({ path, message }) => message !== tooDeep || path.length === MAX_NESTING_DEPTH,
        ),
      ).toBe(true);
    }
  });

  it("reports at most 100 containers too deep, the first ones in document order", () => {
    // The foreign key's value is the second level, the 98 arrays around the wide one end at the
    // 99th, so the wide array is the 100th level and each empty array in it one level too many.
    const wide = Array.from({ length: 100_000 }, (): unknown[] => []);
    const result = parseDocument({ ...SAMPLE_DOCUMENT, "x-wide": arraysAround(98, wide) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        Array.from({ length: 100 }, (_, index) => ({
          path: ["x-wide", ...Array<number>(98).fill(0), index],
          message: tooDeep,
        })),
      );
    }
  });

  it("loads a wide container at the last level, whose numbers and strings nest no deeper", () => {
    const wide: unknown[] = Array.from({ length: 1_000_000 }, (_, index) => index);
    const text = serializeDocumentText(SAMPLE_DOCUMENT).replace(
      /^\{/,
      `{"x-wide":${JSON.stringify(arraysAround(98, [...wide, "last"]))},`,
    );
    expect(parseDocumentText(text).ok).toBe(true);

    wide.push([]);
    const result = parseDocument({ ...SAMPLE_DOCUMENT, "x-wide": arraysAround(98, wide) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        { path: ["x-wide", ...Array<number>(98).fill(0), 1_000_000], message: tooDeep },
      ]);
    }
  });

  it("walks a container a caller shares or nests in itself without growing exponentially", () => {
    let shared: unknown = 0;
    for (let level = 0; level < 60; level++) shared = [shared, shared];
    expect(parseDocument({ ...SAMPLE_DOCUMENT, "x-shared": shared }).ok).toBe(true);

    const cycle: Record<string, unknown> = {};
    cycle.left = cycle;
    cycle.right = cycle;
    const result = parseDocument({ ...SAMPLE_DOCUMENT, "x-cycle": cycle });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues?.[0]).toEqual({
        path: ["x-cycle", ...Array<string>(MAX_NESTING_DEPTH - 1).fill("left")],
        message: tooDeep,
      });
      expect(result.issues?.every(({ path }) => path.length === MAX_NESTING_DEPTH)).toBe(true);
    }
  });
});

// Helper: a valid two-context map plus one relationship under test.
function mapWith(rel: Partial<Relationship>): CmDocument {
  const doc = emptyDocument("t");
  doc.contexts = [
    { id: "a", label: "A", position: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
    { id: "b", label: "B", position: { x: 50, y: 0 }, size: { width: 10, height: 10 } },
  ];
  doc.relationships = [{ id: "r", from: "a", to: "b", pattern: "upstream-downstream", ...rel }];
  return doc;
}

describe("validateDocument — the 13 semantic rules", () => {
  it("reports no findings for the (valid) sample map", () => {
    const report = validateDocument(SAMPLE_DOCUMENT);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("rule 1/2: valid upstream/downstream roles pass", () => {
    const report = validateDocument(mapWith({ upstreamRoles: ["OHS"], downstreamRoles: ["ACL"] }));
    expect(report.errors).toEqual([]);
  });

  it("rule 3: ACL and CF cannot be combined", () => {
    const report = validateDocument(mapWith({ downstreamRoles: ["ACL", "CF"] }));
    expect(report.errors.some((e) => e.rule === "protect-or-conform")).toBe(true);
  });

  it("rule 4: symmetric patterns must not carry roles", () => {
    const report = validateDocument(mapWith({ pattern: "shared-kernel", upstreamRoles: ["OHS"] }));
    expect(report.errors.some((e) => e.rule === "symmetric-integrity")).toBe(true);
  });

  it("rule 5: CF is invalid in a customer-supplier relationship", () => {
    const report = validateDocument(
      mapWith({ pattern: "customer-supplier", downstreamRoles: ["CF"] }),
    );
    expect(report.errors.some((e) => e.rule === "customer-vs-conformist")).toBe(true);
  });

  it("rule 6: OHS is invalid in a customer-supplier relationship", () => {
    const report = validateDocument(
      mapWith({ pattern: "customer-supplier", upstreamRoles: ["OHS"] }),
    );
    expect(report.errors.some((e) => e.rule === "generic-vs-custom-service")).toBe(true);
  });

  it("rule 7: ACL in customer-supplier is a warning, not an error", () => {
    const report = validateDocument(
      mapWith({ pattern: "customer-supplier", downstreamRoles: ["ACL"] }),
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings.some((w) => w.rule === "protect-or-cooperate")).toBe(true);
  });

  it("rule 8: endpoints must be contexts on the map", () => {
    const report = validateDocument(mapWith({ to: "ghost" }));
    expect(report.errors.some((e) => e.rule === "endpoints-on-map")).toBe(true);
  });

  it("rule 9: no self-relationship", () => {
    const report = validateDocument(mapWith({ from: "a", to: "a" }));
    expect(report.errors.some((e) => e.rule === "no-self-relationship")).toBe(true);
  });

  it("rule 10: ids must be unique across contexts and relationships", () => {
    const doc = mapWith({});
    doc.relationships[0].id = "a"; // collides with context "a"
    const report = validateDocument(doc);
    expect(report.errors.some((e) => e.rule === "unique-ids")).toBe(true);
  });

  it("rule 11: a core domain conforming (CF) to another context is warned", () => {
    const doc = mapWith({ downstreamRoles: ["CF"] });
    doc.contexts[1].subdomainType = "core";
    const report = validateDocument(doc);
    expect(report.errors).toEqual([]);
    expect(report.warnings.some((w) => w.rule === "protect-the-core")).toBe(true);
  });

  it("rule 11: CF on a non-core downstream context stays clean", () => {
    const doc = mapWith({ downstreamRoles: ["CF"] });
    doc.contexts[1].subdomainType = "generic";
    const report = validateDocument(doc);
    expect(report.warnings).toEqual([]);
  });

  it("rule 12: a shared kernel across two teams is warned", () => {
    const doc = mapWith({ pattern: "shared-kernel" });
    doc.contexts[0].team = "Team Red";
    doc.contexts[1].team = "Team Blue";
    const report = validateDocument(doc);
    expect(report.errors).toEqual([]);
    expect(report.warnings.some((w) => w.rule === "shared-kernel-team-coupling")).toBe(true);
  });

  it("rule 12: a shared kernel within one team (or without teams) stays clean", () => {
    const sameTeam = mapWith({ pattern: "shared-kernel" });
    sameTeam.contexts[0].team = "Team Red";
    sameTeam.contexts[1].team = "Team Red";
    expect(validateDocument(sameTeam).warnings).toEqual([]);

    const noTeams = mapWith({ pattern: "shared-kernel" });
    expect(validateDocument(noTeams).warnings).toEqual([]);
  });

  it("rule 13: two relationships between the same pair are an error (either direction)", () => {
    const doc = mapWith({});
    doc.relationships.push({ id: "r2", from: "b", to: "a", pattern: "partnership" });
    const report = validateDocument(doc);
    const finding = report.errors.find((e) => e.rule === "one-relationship-per-pair");
    expect(finding).toBeDefined();
    expect(finding?.relationshipId).toBe("r2");
  });

  it("rule 13: distinct pairs stay clean", () => {
    const doc = mapWith({});
    doc.contexts.push({
      id: "c",
      label: "C",
      position: { x: 100, y: 0 },
      size: { width: 10, height: 10 },
    });
    doc.relationships.push({ id: "r2", from: "b", to: "c", pattern: "upstream-downstream" });
    expect(validateDocument(doc).errors).toEqual([]);
  });
});

describe("texts a person reads carry no em dash", () => {
  it("keeps the 'not valid JSON' prefix and follows it with a colon", () => {
    const result = parseDocumentText("{ broken");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/^\(root\): not valid JSON: \S/);
    expect(result.error).not.toContain("—");
  });

  it("words every rule's finding without one", () => {
    const crossTeamKernel = mapWith({ pattern: "shared-kernel" });
    crossTeamKernel.contexts[0].team = "Team Red";
    crossTeamKernel.contexts[1].team = "Team Blue";
    const conformingCore = mapWith({ downstreamRoles: ["CF"] });
    conformingCore.contexts[1].subdomainType = "core";
    const duplicate = mapWith({});
    duplicate.relationships.push({ id: "r2", from: "b", to: "a", pattern: "partnership" });
    const maps = [
      mapWith({ downstreamRoles: ["ACL", "CF"] }),
      mapWith({ pattern: "shared-kernel", upstreamRoles: ["OHS"] }),
      mapWith({ pattern: "customer-supplier", downstreamRoles: ["CF"] }),
      mapWith({ pattern: "customer-supplier", upstreamRoles: ["OHS"] }),
      mapWith({ pattern: "customer-supplier", downstreamRoles: ["ACL"] }),
      crossTeamKernel,
      conformingCore,
      duplicate,
    ];
    const findings = maps.flatMap((doc) => {
      const report = validateDocument(doc);
      return [...report.errors, ...report.warnings];
    });
    expect(new Set(findings.map((finding) => finding.rule)).size).toBeGreaterThanOrEqual(8);
    expect(
      findings.find((finding) => finding.rule === "shared-kernel-team-coupling")?.message,
    ).toBe(
      "A shared kernel across two teams (Team Red, Team Blue) couples them tightly; consider a partnership or an upstream-downstream relationship.",
    );
    for (const finding of findings) expect(finding.message, finding.rule).not.toContain("—");
  });

  it("titles the sample map without one", () => {
    expect(SAMPLE_DOCUMENT.title).toBe("Conference event planner: context map");
  });
});
