import { describe, expect, it } from "vitest";
import type { MapElement, WardleyMap } from "@miragon/wardley-schema-model";
import {
  mapFromJSON,
  mapToJSON,
  parseDSL,
  parseDSLWithDiagnostics,
  patchDSL,
  readBackIds,
  serializeDSL,
} from "../src/index.js";
import { addElements, component, rename } from "./support/map-edits.js";
import { meaningOf } from "./support/meaning.js";

const PORTAL = "Customer\nPortal";
const GATEWAY = "Payment\nGateway";

function labels(map: WardleyMap, elementType: MapElement["elementType"]): string[] {
  return map.elements.filter((el) => el.elementType === elementType).map((el) => el.label);
}

function expectFixedPoint(text: string): void {
  const first = parseDSL(text);
  const once = serializeDSL(first);
  const second = parseDSL(once);
  expect(serializeDSL(second)).toBe(once);
  expect(mapToJSON(second)).toBe(mapToJSON(first));
}

describe("a line break in a name", () => {
  it.each([
    ["anchor", "anchor Customer\\nPortal [0.9, 0.5]", "anchor"],
    ["component", "component Customer\\nPortal [0.5, 0.5]", "component"],
    ["market", "component Customer\\nPortal [0.5, 0.5] (market)", "component"],
    ["ecosystem", "component Customer\\nPortal [0.5, 0.5] (ecosystem)", "component"],
    ["accelerator", "accelerator Customer\\nPortal [0.5, 0.5]", "accelerator"],
    ["deaccelerator", "deaccelerator Customer\\nPortal [0.5, 0.5]", "accelerator"],
    ["submap", "submap Customer\\nPortal [0.5, 0.5]", "submap"],
    ["pipeline", "pipeline Customer\\nPortal [0.2, 0.8]", "pipeline"],
  ] as const)(
    "is a literal \\n in the %s line and a real break in the name",
    (_kind, line, type) => {
      const text = `title T\n${line}\n`;
      const { map, diagnostics } = parseDSLWithDiagnostics(text);
      expect(diagnostics).toEqual([]);
      expect(labels(map, type)).toEqual([PORTAL]);
      expect(serializeDSL(map)).toBe(text);
      expectFixedPoint(text);
    },
  );

  it("is a literal \\n in the name of a pipeline block and of its children", () => {
    const text = [
      "title T",
      "component Customer\\nPortal [0.6, 0.5]",
      "pipeline Customer\\nPortal",
      "{",
      "  component Basic\\nPlan [0.3]",
      "  component Pro\\nPlan [0.7]",
      "}",
      "",
    ].join("\n");
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    expect(diagnostics).toEqual([]);
    expect(labels(map, "pipeline")).toEqual([PORTAL]);
    expect(labels(map, "component")).toEqual([PORTAL, "Basic\nPlan", "Pro\nPlan"]);
    const pipeline = map.elements.find((el) => el.elementType === "pipeline");
    const anchorComponent = map.elements.find(
      (el) => el.elementType === "component" && el.pipelineId === undefined,
    );
    expect(pipeline?.position.visibility).toBe(anchorComponent?.position.visibility);
    expect(serializeDSL(map)).toBe(
      text.replace("pipeline Customer\\nPortal\n", "pipeline Customer\\nPortal [0.3, 0.7]\n"),
    );
    expectFixedPoint(text);
  });

  it("keeps the ids readable without the break", () => {
    const map = parseDSL("title T\ncomponent Customer\\nPortal [0.5, 0.5]");
    expect(map.elements[0]?.id).toBe("cmp_customer_portal");
  });

  it("trims leading and trailing line breaks and falls back to the default for an empty name", () => {
    const map = parseDSL("title T\ncomponent Foo [0.5, 0.5]");
    const edited = {
      ...map,
      elements: [
        { ...map.elements[0]!, label: "\n\nFoo\nBar\n\n" },
        { ...component("cmp_b", "\n  \n", 0.4, 0.4) },
      ],
    } as WardleyMap;
    const text = serializeDSL(edited);
    expect(text).toContain("component Foo\\nBar [0.5, 0.5]");
    expect(text).toContain("component Component [0.4, 0.4]");
    expect(labels(parseDSL(text), "component")).toEqual(["Foo\nBar", "Component"]);
  });

  it("drops the line breaks around a name when read, without a diagnostic, as it drops spaces", () => {
    const text = [
      "title T",
      "anchor \\nCustomer [0.9, 0.5]",
      "component Foo\\n [0.5, 0.3]",
      "component \\n\\nBar\\n [0.5, 0.6]",
      "component Baz \\n [0.4, 0.4]",
      "pipeline Bar\\n [0.2, 0.8]",
      "pipeline Qux\\n [0.1, 0.4] (y 0.2)",
      "{",
      "  component Child\\n [0.3]",
      "}",
      "Customer -> Foo\\n",
      "Foo -> Bar",
      "",
    ].join("\n");
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    expect(diagnostics).toEqual([]);
    expect(labels(map, "anchor")).toEqual(["Customer"]);
    expect(labels(map, "component")).toEqual(["Foo", "Bar", "Baz", "Child"]);
    expect(labels(map, "pipeline")).toEqual(["Bar", "Qux"]);
    expect(map.edges).toHaveLength(2);
    const once = serializeDSL(map);
    expect(once).toContain("component Foo [0.5, 0.3]");
    expect(once).toContain("Customer -> Foo\n");
    expect(parseDSLWithDiagnostics(once).diagnostics).toEqual([]);
    expectFixedPoint(text);
  });

  it("names a name of nothing but line breaks with the default and says so", () => {
    const { map, diagnostics } = parseDSLWithDiagnostics(
      [
        "title T",
        "anchor \\n [0.9, 0.5]",
        "component \\n\\n [0.5, 0.5]",
        "component \\n [0.5, 0.3]",
        "pipeline \\n [0.2, 0.8] (y 0.2)",
      ].join("\n"),
    );
    expect(labels(map, "anchor")).toEqual(["User"]);
    expect(labels(map, "component")).toEqual(["Component", "Component 2"]);
    expect(labels(map, "pipeline")).toEqual(["Pipeline"]);
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Name "\\n" has only line breaks: renamed to "User"',
      'Name "\\n\\n" has only line breaks: renamed to "Component"',
      'Name "\\n" has only line breaks: renamed to "Component 2"',
      'Name "\\n" has only line breaks: renamed to "Pipeline"',
    ]);
  });

  it("gives the real cause when a name with a break around it is also escaped", () => {
    const { map, diagnostics } = parseDSLWithDiagnostics(
      "title T\ncomponent a->b\\n [0.5, 0.5]\npipeline \\n{x [0.2, 0.8] (y 0.2)",
    );
    expect(labels(map, "component")).toEqual(["a→b"]);
    expect(labels(map, "pipeline")).toEqual(["｛x"]);
    expect(diagnostics.map((d) => d.message)).toEqual([
      expect.stringContaining('Name "a->b\\n" renamed to "a→b", because a name cannot hold link'),
      expect.stringContaining('Name "\\n{x" renamed to "｛x", because a name cannot hold link'),
    ]);
  });

  it("keeps an empty line inside a name", () => {
    const text = "title T\ncomponent One\\n\\nThree [0.5, 0.5]\n";
    const map = parseDSL(text);
    expect(labels(map, "component")).toEqual(["One\n\nThree"]);
    expect(serializeDSL(map)).toBe(text);
  });

  it("reads Windows line endings in an edited name as one break", () => {
    const map = parseDSL("title T\ncomponent Foo [0.5, 0.5]");
    const text = serializeDSL(rename(map, "Foo", "One\r\nTwo"));
    expect(text).toContain("component One\\nTwo [0.5, 0.5]");
    expect(text).not.toContain("\r");
  });

  it("round-trips through JSON with the break as a real line break", () => {
    const map = parseDSL(
      "title T\nanchor Customer\\nPortal [0.9, 0.5]\ncomponent Payment\\nGateway [0.5, 0.5]\nCustomer\\nPortal -> Payment\\nGateway",
    );
    const json = mapToJSON(map);
    expect(json).toContain("Customer\\nPortal");
    const back = mapFromJSON(json);
    expect(labels(back, "component")).toEqual([GATEWAY]);
    expect(mapToJSON(back)).toBe(json);
    expect(serializeDSL(back)).toBe(serializeDSL(map));
  });
});

describe("a line break in a name that another line refers to", () => {
  const TEXT = [
    "title T",
    "anchor Customer\\nPortal [0.9, 0.5]",
    "component Payment\\nGateway [0.6, 0.4]",
    "component Ledger [0.3, 0.6]",
    "evolve Payment\\nGateway 0.8",
    "Customer\\nPortal -> Payment\\nGateway",
    "Payment\\nGateway +'100 €'> Ledger",
    "Ledger +<> Customer\\nPortal",
    "",
  ].join("\n");

  it("binds links and flows to the names with their breaks", () => {
    const { map, diagnostics } = parseDSLWithDiagnostics(TEXT);
    expect(diagnostics).toEqual([]);
    const idOf = (label: string) => map.elements.find((el) => el.label === label)?.id;
    expect(map.edges).toMatchObject([
      { edgeType: "dependency", from: idOf(PORTAL), to: idOf(GATEWAY) },
      { edgeType: "flow", from: idOf(GATEWAY), to: idOf("Ledger"), flowValue: "100 €" },
      { edgeType: "flow", from: idOf("Ledger"), to: idOf(PORTAL), bidirectional: true },
    ]);
    expect(serializeDSL(map)).toBe(TEXT);
    expectFixedPoint(TEXT);
  });

  it("applies an evolve line to the component with that name", () => {
    const { map } = parseDSLWithDiagnostics(TEXT);
    const gateway = map.elements.find((el) => el.label === GATEWAY);
    expect(gateway?.elementType === "component" && gateway.movement).toEqual({
      targetEvolution: 0.8,
    });
  });

  it("keeps an evolve line with a new label and a method", () => {
    const text = [
      "title T",
      "component Payment\\nGateway [0.6, 0.4]",
      "evolve Payment\\nGateway->Payment Hub 0.8 (buy)",
      "",
    ].join("\n");
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    expect(diagnostics).toEqual([]);
    const gateway = map.elements[0];
    expect(gateway?.elementType === "component" && gateway.movement).toEqual({
      targetEvolution: 0.8,
      newLabel: "Payment Hub",
      method: "buy",
    });
    expect(serializeDSL(map)).toBe(text);
  });

  it("keeps the line breaks of an evolve line's new label", () => {
    const text = [
      "title T",
      "component Payment\\nGateway [0.6, 0.4]",
      "evolve Payment\\nGateway->Payment\\nHub 0.8 (buy)",
      "",
    ].join("\n");
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    expect(diagnostics).toEqual([]);
    const gateway = map.elements[0];
    expect(gateway?.elementType === "component" && gateway.movement).toEqual({
      targetEvolution: 0.8,
      newLabel: "Payment\nHub",
      method: "buy",
    });
    expect(serializeDSL(map)).toBe(text);
    expectFixedPoint(text);
  });

  it("binds a legacy sourcing line to the component with that name", () => {
    const text = "title T\ncomponent Payment\\nGateway [0.6, 0.4]\nbuy Payment\\nGateway\n";
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    expect(diagnostics).toEqual([]);
    const gateway = map.elements[0];
    expect(gateway?.elementType === "component" && gateway.decorators).toEqual({ method: "buy" });
  });

  it("writes the references of an element renamed in memory with its break", () => {
    const base = parseDSL(TEXT);
    const renamed = rename(base, "Ledger", "General\nLedger");
    const text = serializeDSL(renamed);
    expect(text).toContain("Payment\\nGateway +'100 €'> General\\nLedger");
    expect(text).toContain("General\\nLedger +<> Customer\\nPortal");
    expect(parseDSL(text).edges).toHaveLength(3);
  });

  it("binds a link whose side names a duplicate with the suffix the serializer gave it", () => {
    const text = [
      "title T",
      "component Foo\\nBar [0.5, 0.2]",
      "component Foo\\nBar [0.5, 0.6]",
      "Foo\\nBar 2 -> Foo\\nBar",
      "",
    ].join("\n");
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Duplicate name "Foo\\nBar": renamed to "Foo\\nBar 2"; links bind to the first "Foo\\nBar"',
    ]);
    expect(labels(map, "component")).toEqual(["Foo\nBar", "Foo\nBar 2"]);
    expect(map.edges).toMatchObject([{ from: map.elements[1]?.id, to: map.elements[0]?.id }]);
  });

  it("names the url definition of an element without the break", () => {
    const text =
      "title T\ncomponent Customer\\nPortal [0.5, 0.5] url(https://example.org/portal)\n";
    const once = serializeDSL(parseDSL(text));
    expect(once).toContain("url Customer Portal URL [https://example.org/portal]");
    expect(once).toContain("component Customer\\nPortal [0.5, 0.5] url(Customer Portal URL)");
    const reparsed = parseDSLWithDiagnostics(once);
    expect(reparsed.diagnostics).toEqual([]);
    expect(reparsed.map.elements[0]).toMatchObject({
      label: PORTAL,
      url: "https://example.org/portal",
    });
  });
});

describe("unique names with line breaks", () => {
  it("compares names with their breaks", () => {
    const text = [
      "title T",
      "component Customer Portal [0.5, 0.2]",
      "component Customer\\nPortal [0.5, 0.4]",
      "component Customer\\nPortal [0.5, 0.6]",
      "",
    ].join("\n");
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    expect(labels(map, "component")).toEqual([
      "Customer Portal",
      "Customer\nPortal",
      "Customer\nPortal 2",
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(serializeDSL(map)).toContain("component Customer\\nPortal 2 [0.5, 0.6]");
  });

  it("gives a repeated name in memory the suffix when it is written", () => {
    const base = parseDSL("title T\ncomponent A [0.5, 0.2]\ncomponent B [0.5, 0.6]");
    const text = serializeDSL(rename(rename(base, "A", PORTAL), "B", PORTAL));
    expect(text).toContain("component Customer\\nPortal [0.5, 0.2]");
    expect(text).toContain("component Customer\\nPortal 2 [0.5, 0.6]");
    expect(labels(parseDSL(text), "component")).toEqual([PORTAL, "Customer\nPortal 2"]);
  });

  it("lets a note repeat a name", () => {
    const text = "title T\nnote Same\\nText [0.2, 0.2]\nnote Same\\nText [0.4, 0.4]\n";
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    expect(diagnostics).toEqual([]);
    expect(labels(map, "note")).toEqual(["Same\nText", "Same\nText"]);
  });
});

describe("escaping in a name with line breaks", () => {
  function written(label: string): string {
    const base = parseDSL("title T\ncomponent A [0.5, 0.5]");
    return serializeDSL(rename(base, "A", label)).split("\n")[1]!;
  }

  it("escapes link operators on every line", () => {
    expect(written("a ->\nb -> c")).toBe("component a →\\nb → c [0.5, 0.5]");
    expect(written("a\n+> b\n+< c\n+'d'")).toBe("component a\\n＋> b\\n＋< c\\n＋'d' [0.5, 0.5]");
  });

  it("escapes comment markers on every line", () => {
    expect(written("a // b\nc /* d\n*/ e")).toBe("component a ∕∕ b\\nc ∕* d\\n*/ e [0.5, 0.5]");
    expect(written("see http:\n//x")).toBe("component see http:\\n∕∕x [0.5, 0.5]");
  });

  it("escapes a leading brace, and a brace after a break is no block", () => {
    expect(written("{open\nclose}")).toBe("component ｛open\\nclose} [0.5, 0.5]");
    expect(written("a\n{b")).toBe("component a\\n{b [0.5, 0.5]");
  });

  it("reads back what it writes", () => {
    const base = parseDSL("title T\ncomponent A [0.5, 0.5]\ncomponent B [0.5, 0.6]\nA -> B");
    const label = "x ->\ny +> z\n// not a comment\n{brace";
    const text = serializeDSL(rename(base, "A", label));
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    expect(diagnostics).toEqual([]);
    expect(map.rawPassthrough).toBeUndefined();
    expect(map.edges).toHaveLength(1);
    expect(map.elements[0]?.label).toBe("x →\ny ＋> z\n∕∕ not a comment\n{brace");
    expectFixedPoint(text);
  });

  it("reports a name the parser had to change, with its breaks as written", () => {
    const { map, diagnostics } = parseDSLWithDiagnostics(
      "title T\ncomponent a ->\\nb [0.5, 0.5]\ncomponent {x\\ny [0.5, 0.6]",
    );
    expect(labels(map, "component")).toEqual(["a →\nb", "｛x\ny"]);
    expect(diagnostics.map((d) => d.message)).toEqual([
      expect.stringContaining('Name "a ->\\nb" renamed to "a →\\nb"'),
      expect.stringContaining('Name "{x\\ny" renamed to "｛x\\ny"'),
    ]);
  });
});

describe("a real backslash followed by n", () => {
  it("reads back as a line break, as it does in a note", () => {
    const base = parseDSL("title T\ncomponent A [0.5, 0.5]\nnote N [0.2, 0.2]");
    const edited = rename(rename(base, "A", "C:\\new"), "N", "C:\\new");
    const text = serializeDSL(edited);
    expect(text).toContain("component C:\\new [0.5, 0.5]");
    expect(text).toContain("note C:\\new [0.2, 0.2]");
    const reread = parseDSL(text);
    expect(labels(reread, "component")).toEqual(["C:\new"]);
    expect(labels(reread, "note")).toEqual(["C:\new"]);
    expect(serializeDSL(reread)).toBe(text);
  });
});

describe("a line break in an annotation text", () => {
  it("is a literal \\n and reads back", () => {
    const text = "title T\nannotation 1 [0.3, 0.3] Check\\nthe supplier\n";
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    expect(diagnostics).toEqual([]);
    expect(map.elements[0]).toMatchObject({
      elementType: "annotation",
      label: "Check\nthe supplier",
      text: "Check\nthe supplier",
    });
    expect(serializeDSL(map)).toBe(text);
  });
});

describe("editing a document with multi-line names in place", () => {
  const SOURCE = [
    "// kept as written",
    "title T",
    "",
    "anchor Customer [0.9, 0.5]",
    "component Payment [0.6, 0.4] // the gateway",
    "component Ledger [0.3, 0.6]",
    "Customer -> Payment",
    "Payment -> Ledger",
    "",
  ].join("\n");

  it("rewrites only the lines of a renamed element and the links that name it", () => {
    const edited = rename(parseDSL(SOURCE), "Payment", GATEWAY);
    const patched = patchDSL(SOURCE, edited);
    expect(patched).toBe(
      [
        "// kept as written",
        "title T",
        "",
        "anchor Customer [0.9, 0.5]",
        "component Payment\\nGateway [0.6, 0.4] // the gateway",
        "component Ledger [0.3, 0.6]",
        "Customer -> Payment\\nGateway",
        "Payment\\nGateway -> Ledger",
        "",
      ].join("\n"),
    );
    expect(meaningOf(patched)).toEqual(meaningOf(serializeDSL(edited)));
  });

  it("keeps a multi-line name when another element changes", () => {
    const withBreak = parseDSL(
      SOURCE.replace("component Payment [0.6, 0.4]", "component Payment\\nGateway [0.6, 0.4]")
        .replace("Customer -> Payment", "Customer -> Payment\\nGateway")
        .replace("Payment -> Ledger", "Payment\\nGateway -> Ledger"),
    );
    const text = serializeDSL(withBreak);
    const moved = {
      ...withBreak,
      elements: withBreak.elements.map((el) =>
        el.label === "Ledger" ? { ...el, position: { visibility: 0.2, evolution: 0.6 } } : el,
      ),
    };
    const patched = patchDSL(text, moved);
    expect(patched).toBe(
      text.replace("component Ledger [0.3, 0.6]", "component Ledger [0.2, 0.6]"),
    );
  });

  it("places a new multi-line element after the last one of its kind", () => {
    const base = parseDSL(SOURCE);
    const added = addElements(base, component("cmp_new", GATEWAY, 0.5, 0.5));
    const patched = patchDSL(SOURCE, added);
    expect(patched).toContain("component Payment\\nGateway [0.5, 0.5]");
    expect(parseDSL(patched).elements).toHaveLength(4);
  });

  it("gives an element renamed in memory the id the document gives it", () => {
    const edited = rename(parseDSL(SOURCE), "Payment", GATEWAY);
    const ids = readBackIds(edited);
    const paymentId = edited.elements.find((el) => el.label === GATEWAY)!.id;
    const reread = parseDSL(serializeDSL(edited));
    expect(ids.get(paymentId)).toBe(reread.elements.find((el) => el.label === GATEWAY)?.id);
    expect(ids.get(paymentId)).toBe("cmp_payment_gateway");
  });
});
