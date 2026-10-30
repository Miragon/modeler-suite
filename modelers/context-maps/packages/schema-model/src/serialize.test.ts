import { describe, expect, it } from "vitest";
import { canonicalize, serializeDocument, serializeDocumentText } from "./serialize";
import { SAMPLE_DOCUMENT } from "./sample";
import { parseDocument } from "./schema";
import type { CmDocument } from "./types";

describe("serialize", () => {
  it("rounds coordinates and sizes to 2 decimals", () => {
    const doc: CmDocument = {
      version: 1,
      title: "t",
      contexts: [
        {
          id: "a",
          label: "A",
          position: { x: 10.123456, y: -3.98765 },
          size: { width: 100.005, height: 50.004 },
        },
      ],
      relationships: [],
    };
    const c = canonicalize(doc);
    expect(c.contexts[0].position).toEqual({ x: 10.12, y: -3.99 });
    expect(c.contexts[0].size).toEqual({ width: 100.01, height: 50 });
  });

  it("sorts contexts and relationships by id deterministically", () => {
    const doc: CmDocument = {
      version: 1,
      title: "t",
      contexts: [
        { id: "z", label: "Z", position: { x: 0, y: 0 }, size: { width: 1, height: 1 } },
        { id: "a", label: "A", position: { x: 0, y: 0 }, size: { width: 1, height: 1 } },
      ],
      relationships: [
        { id: "r2", from: "a", to: "z", pattern: "partnership" },
        { id: "r1", from: "z", to: "a", pattern: "separate-ways" },
      ],
    };
    const c = canonicalize(doc);
    expect(c.contexts.map((n) => n.id)).toEqual(["a", "z"]);
    expect(c.relationships.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("produces byte-identical output across runs", () => {
    expect(serializeDocument(SAMPLE_DOCUMENT)).toBe(serializeDocument(SAMPLE_DOCUMENT));
  });

  it("omits undefined optional fields", () => {
    const json = serializeDocument(SAMPLE_DOCUMENT);
    const parsed = JSON.parse(json) as CmDocument;
    const cfp = parsed.contexts.find((c) => c.id === "ctx_cfp");
    expect(cfp && "fill" in cfp).toBe(false);
  });
});

describe("serialize a value a JavaScript caller puts in several places", () => {
  /** The document as `parseDocument` accepts it: it keeps the values of unknown keys as they are. */
  const parsed = (input: unknown): CmDocument => {
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

  const [firstContext, ...otherContexts] = SAMPLE_DOCUMENT.contexts;
  const [firstRelationship, ...otherRelationships] = SAMPLE_DOCUMENT.relationships;

  it("writes an object shared by the document, a context and a relationship at each place", () => {
    const shared = { owner: "ops", tags: ["b", "a"] };
    expectWrittenAtEachPlace({
      ...SAMPLE_DOCUMENT,
      "x-tag": shared,
      contexts: [{ ...firstContext, "x-tag": shared }, ...otherContexts],
      relationships: [{ ...firstRelationship, "x-tag": shared }, ...otherRelationships],
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
    expect(() => serializeDocumentText(sharing)).toThrow(repeatLimit);
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
    const holdingAt = (placesOnTheDocument: number): CmDocument =>
      parsed({
        ...SAMPLE_DOCUMENT,
        "x-many": Array<unknown>(placesOnTheDocument).fill(wide),
        contexts: [{ ...firstContext, "x-value": wide }, ...otherContexts],
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

  it("still leaves an object or an array that contains itself to JSON.stringify", () => {
    const cyclicObject: Record<string, unknown> = { name: "loop" };
    cyclicObject["self"] = { back: [cyclicObject] };
    const cyclicArray: unknown[] = [];
    cyclicArray.push([cyclicArray]);
    for (const cycle of [cyclicObject, cyclicArray]) {
      const cyclic = { ...SAMPLE_DOCUMENT, "x-cycle": cycle } as CmDocument;
      expect(() => serializeDocument(cyclic)).toThrow(TypeError);
      expect(() => serializeDocument(cyclic)).toThrow(/circular/i);
    }
  });
});
