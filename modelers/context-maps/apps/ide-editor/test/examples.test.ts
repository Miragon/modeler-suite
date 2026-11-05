import { describe, expect, it } from "vitest";
import { parseDocumentText } from "@miragon/context-maps-schema-model";
import { EMPTY_MAP, EXAMPLE_MAP, withExampleInserted } from "../src/examples.js";

describe("examples", () => {
  it("are canonical map texts ending in one line break", () => {
    for (const text of [EMPTY_MAP, EXAMPLE_MAP]) {
      expect(parseDocumentText(text).ok).toBe(true);
      expect(text.endsWith("}\n")).toBe(true);
    }
  });

  it("Insert example keeps the file's title and its unknown keys", () => {
    const text = JSON.stringify({
      version: 1,
      title: "Our landscape",
      "x-owner": "platform",
      contexts: [],
      relationships: [],
    });
    const inserted = withExampleInserted(text);
    const parsed = parseDocumentText(inserted!);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.document.title).toBe("Our landscape");
    expect(parsed.document.contexts).toHaveLength(6);
    expect(inserted).toContain('"x-owner": "platform"');
  });

  it("fills an empty file and keeps a CRLF file's line breaks", () => {
    expect(withExampleInserted("")).toBeDefined();
    const crlf = withExampleInserted(EMPTY_MAP.replace(/\n/g, "\r\n"))!;
    expect(crlf.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(crlf)).toBe(false);
  });

  it("never replaces content or broken text", () => {
    expect(withExampleInserted(EXAMPLE_MAP)).toBeUndefined();
    expect(withExampleInserted("{ broken")).toBeUndefined();
  });
});
