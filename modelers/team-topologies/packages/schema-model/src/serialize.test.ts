import { describe, expect, it } from "vitest";
import { foreignFields, TEAM_NODE_FIELDS } from "./foreign";
import { canonicalize, serializeDocument } from "./serialize";
import { SAMPLE_DOCUMENT } from "./sample";
import { parseDocument } from "./schema";
import { DOCUMENT_VERSION } from "./types";
import type { TtDocument } from "./types";

describe("serialize", () => {
  it("rounds coordinates and sizes to 2 decimals", () => {
    const doc: TtDocument = {
      version: DOCUMENT_VERSION,
      title: "t",
      nodes: [
        {
          id: "a",
          type: "stream-aligned",
          label: "A",
          position: { x: 10.123456, y: -3.98765 },
          size: { width: 100.005, height: 50.004 },
        },
      ],
      interactions: [],
      flows: [],
      annotations: [],
    };
    const c = canonicalize(doc);
    expect(c.nodes[0].position).toEqual({ x: 10.12, y: -3.99 });
    expect(c.nodes[0].size).toEqual({ width: 100.01, height: 50 });
  });

  it("sorts nodes by id deterministically", () => {
    const doc: TtDocument = {
      version: DOCUMENT_VERSION,
      title: "t",
      nodes: [
        {
          id: "z",
          type: "platform",
          label: "Z",
          position: { x: 0, y: 0 },
          size: { width: 1, height: 1 },
        },
        {
          id: "a",
          type: "enabling",
          label: "A",
          position: { x: 0, y: 0 },
          size: { width: 1, height: 1 },
        },
      ],
      interactions: [],
      flows: [],
      annotations: [],
    };
    expect(canonicalize(doc).nodes.map((n) => n.id)).toEqual(["a", "z"]);
  });

  it("produces byte-identical output across runs", () => {
    expect(serializeDocument(SAMPLE_DOCUMENT)).toBe(serializeDocument(SAMPLE_DOCUMENT));
  });

  it("omits undefined optional fields", () => {
    const json = serializeDocument(SAMPLE_DOCUMENT);
    const parsed = JSON.parse(json) as TtDocument;
    // sample's platform node has no fill override
    const platform = parsed.nodes.find((n) => n.id === "team_platform");
    expect(platform && "fill" in platform).toBe(false);
  });

  it("normalises annotations: sorted, rounded, attachedTo only when set", () => {
    const doc: TtDocument = {
      version: DOCUMENT_VERSION,
      title: "t",
      nodes: [],
      interactions: [],
      flows: [],
      annotations: [
        {
          id: "b",
          text: "Second",
          position: { x: 1.005, y: 2 },
          size: { width: 100, height: 40 },
          attachedTo: undefined,
        },
        {
          id: "a",
          text: "First",
          position: { x: 0, y: 0 },
          size: { width: 100, height: 40 },
          attachedTo: "team_x",
        },
      ],
    };
    const json = JSON.parse(serializeDocument(doc)) as TtDocument;
    expect(json.annotations.map((a) => a.id)).toEqual(["a", "b"]);
    expect(json.annotations[0].attachedTo).toBe("team_x");
    expect("attachedTo" in json.annotations[1]).toBe(false);
  });

  it("leaves out an empty annotations list", () => {
    const json = serializeDocument({ ...SAMPLE_DOCUMENT, annotations: [] });
    expect(json).not.toContain('"annotations"');
  });

  it("ends the file form with a line break and the compact form without one", () => {
    expect(serializeDocument(SAMPLE_DOCUMENT).endsWith("}\n")).toBe(true);
    expect(serializeDocument(SAMPLE_DOCUMENT, false).endsWith("}")).toBe(true);
  });

  it("writes unknown fields after the known ones, sorted, nested keys too", () => {
    const doc = {
      ...SAMPLE_DOCUMENT,
      annotations: [],
      "x-zeta": 1,
      "x-alpha": { b: 2, a: [{ d: 1, c: 2 }] },
      nodes: [{ ...SAMPLE_DOCUMENT.nodes[0]!, "x-owner": "a", description: undefined }],
    } as unknown as TtDocument;
    const text = serializeDocument(doc);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      "version",
      "title",
      "nodes",
      "interactions",
      "flows",
      "x-alpha",
      "x-zeta",
    ]);
    expect(JSON.stringify(parsed["x-alpha"])).toBe('{"a":[{"c":2,"d":1}],"b":2}');
    const node = (parsed.nodes as Record<string, unknown>[])[0]!;
    expect(Object.keys(node)).toEqual(["id", "type", "label", "position", "size", "x-owner"]);
  });

  it("is a fixpoint of its own output, unknown fields included", () => {
    const doc = { ...SAMPLE_DOCUMENT, "x-vendor": { keep: "me" } } as TtDocument;
    const once = serializeDocument(doc);
    const reparsed = parseDocument(JSON.parse(once));
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) expect(serializeDocument(reparsed.document)).toBe(once);
  });

  it("keeps a field named __proto__ a field", () => {
    const doc = JSON.parse(
      `{"version":3,"title":"t","nodes":[],"interactions":[],"flows":[],"annotations":[],"__proto__":{"polluted":true}}`,
    ) as TtDocument;
    const text = serializeDocument(doc, false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(text).toContain('"__proto__":{"polluted":true}');
  });

  it("re-saves a v2 document with only its version stamp changed", () => {
    const v2 = `${JSON.stringify(
      {
        ...canonicalize({ ...SAMPLE_DOCUMENT, annotations: [] }),
        version: 2,
        annotations: undefined,
      },
      null,
      2,
    )}\n`;
    const parsed = parseDocument(JSON.parse(v2));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const changed = serializeDocument(parsed.document)
      .split("\n")
      .filter((line, idx) => line !== v2.split("\n")[idx]);
    expect(changed).toEqual([`  "version": ${DOCUMENT_VERSION},`]);
  });
});

describe("serialize a value a JavaScript caller puts in several places", () => {
  /** The document as `parseDocument` accepts it: it keeps the values of unknown fields as they are. */
  const parsed = (input: unknown): TtDocument => {
    const result = parseDocument(input);
    if (!result.ok) throw new Error(result.error);
    return result.document;
  };
  /** The same document with every shared object and array copied, as a parsed file holds it. */
  const unshared = (document: unknown): unknown => JSON.parse(JSON.stringify(document));

  const expectWrittenAtEachPlace = (input: unknown): void => {
    const text = serializeDocument(parsed(input));
    expect(text).toBe(serializeDocument(parsed(unshared(input))));
    expect(serializeDocument(parsed(JSON.parse(text)))).toBe(text);
  };

  const [firstNode, ...otherNodes] = SAMPLE_DOCUMENT.nodes;
  const [firstInteraction, ...otherInteractions] = SAMPLE_DOCUMENT.interactions;
  const [firstFlow, ...otherFlows] = SAMPLE_DOCUMENT.flows;
  const [firstAnnotation, ...otherAnnotations] = SAMPLE_DOCUMENT.annotations;

  it("writes an object shared by the document and each kind of element at each place", () => {
    const shared = { owner: "ops", tags: [{ b: 1, a: 2 }] };
    expectWrittenAtEachPlace({
      ...SAMPLE_DOCUMENT,
      "x-tag": shared,
      nodes: [{ ...firstNode, "x-tag": shared }, ...otherNodes],
      interactions: [{ ...firstInteraction, "x-tag": shared }, ...otherInteractions],
      flows: [{ ...firstFlow, "x-tag": shared }, ...otherFlows],
      annotations: [{ ...firstAnnotation, "x-tag": shared }, ...otherAnnotations],
    });
  });

  it("writes a chain that holds each level twice at each of its places", () => {
    const leaf = { value: 1 };
    let chain: unknown = { leaf };
    for (let level = 0; level < 10; level++) {
      chain = { left: chain, right: [chain] };
    }
    const text = serializeDocument(parsed({ ...SAMPLE_DOCUMENT, "x-chain": chain }));
    expect(text.match(/"leaf"/g)).toHaveLength(2 ** 10);
    expectWrittenAtEachPlace({ ...SAMPLE_DOCUMENT, "x-chain": chain });
  });

  const repeatLimit =
    "Cannot serialize a document whose shared objects and arrays would repeat more than 1000000 entries.";
  const numbers = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

  it("refuses a chain that holds each level twice before it exhausts the memory", () => {
    let chain: unknown = { leaf: 1 };
    for (let level = 0; level < 40; level++) {
      chain = { left: chain, right: chain };
    }
    const sharing = parsed({ ...SAMPLE_DOCUMENT, "x-chain": chain });
    expect(() => serializeDocument(sharing)).toThrow(repeatLimit);
    expect(() => serializeDocument(sharing, false)).toThrow(repeatLimit);
    expect(() => canonicalize(sharing)).toThrow(repeatLimit);
  });

  it("refuses a wide array at the end of such a chain before it exhausts the memory", () => {
    let chain: unknown = numbers(1_000);
    for (let level = 0; level < 14; level++) {
      chain = { left: chain, right: chain };
    }
    const sharing = parsed({ ...SAMPLE_DOCUMENT, "x-chain": chain });
    expect(() => serializeDocument(sharing)).toThrow(repeatLimit);
  });

  it("refuses one wide object held a thousand times before it exhausts the memory", () => {
    const wide = Object.fromEntries(numbers(2_000).map((index) => [`key-${index}`, index]));
    const sharing = parsed({ ...SAMPLE_DOCUMENT, "x-many": Array<unknown>(1_000).fill(wide) });
    expect(() => serializeDocument(sharing)).toThrow(repeatLimit);
  });

  it("counts the entries of a shared value at every place after its first, all over the document", () => {
    const wide = numbers(1_000);
    const holdingAt = (placesOnTheDocument: number): TtDocument =>
      parsed({
        ...SAMPLE_DOCUMENT,
        "x-many": Array<unknown>(placesOnTheDocument).fill(wide),
        nodes: [{ ...firstNode, "x-value": wide }, ...otherNodes],
      });
    const atTheLimit = holdingAt(1_000);
    expect(serializeDocument(atTheLimit)).toBe(serializeDocument(parsed(unshared(atTheLimit))));
    expect(() => serializeDocument(holdingAt(1_001))).toThrow(repeatLimit);
  });

  it("writes a document that shares nothing, even with more than a million objects", () => {
    const log = numbers(1_000_000).map((index) => ({ entry: index }));
    const text = serializeDocument(parsed({ ...SAMPLE_DOCUMENT, "x-log": log }));
    expect(serializeDocument(parsed(JSON.parse(text)))).toBe(text);
  }, 30_000);

  it("bounds the unknown fields of one element the same way", () => {
    let chain: unknown = { leaf: 1 };
    for (let level = 0; level < 40; level++) {
      chain = { left: chain, right: chain };
    }
    expect(() => foreignFields({ ...firstNode, "x-chain": chain }, TEAM_NODE_FIELDS)).toThrow(
      repeatLimit,
    );
  });

  it("still refuses an object or an array that contains itself", () => {
    const cyclicObject: Record<string, unknown> = { name: "loop" };
    cyclicObject["self"] = { back: [cyclicObject] };
    const cyclicArray: unknown[] = [];
    cyclicArray.push([cyclicArray]);
    for (const cycle of [cyclicObject, cyclicArray]) {
      const cyclic = { ...SAMPLE_DOCUMENT, "x-cycle": cycle };
      expect(parseDocument(cyclic).ok).toBe(false);
      expect(() => serializeDocument(cyclic as TtDocument)).toThrow(
        "Cannot serialize a cyclic document.",
      );
    }
  });
});
