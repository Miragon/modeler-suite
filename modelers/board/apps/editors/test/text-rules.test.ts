import { readFileSync } from "node:fs";
import type { EditorModule, EmbeddableModeler, TextRules } from "@miragon/board-host";
import { readText, serializeText } from "@miragon/business-model-canvas-dsl";
import {
  parseDocumentText as parseContextMap,
  serializeDocumentText as serializeContextMap,
} from "@miragon/context-maps-schema-model";
import { parseDocument as parseTeamTopology } from "@miragon/team-topologies-schema-model";
import { serializeDocument as serializeTeamTopology } from "@miragon/team-topologies-schema-model";
import {
  parseDocumentJSON as parseValueChain,
  serializeDocument as serializeValueChain,
} from "@miragon/value-chain-schema-model";
import { parseDSL, serializeDSL } from "@miragon/wardley-dsl";
import type { WardleyMap } from "@miragon/wardley-schema-model";
import { describe, expect, it } from "vitest";
import * as businessModelCanvas from "../src/notations/business-model-canvas.js";
import * as c4 from "../src/notations/c4.js";
import * as contextMaps from "../src/notations/context-maps.js";
import * as eventStorming from "../src/notations/event-storming.js";
import * as teamTopologies from "../src/notations/team-topologies.js";
import * as valueChain from "../src/notations/value-chain.js";
import * as wardley from "../src/notations/wardley.js";

/**
 * What each notation writes into its file and which text it takes for the canvas it shows. The
 * rules read a mounted modeler through a few calls only, so a stand-in answers them here with
 * the notation's real parser and serialiser; `test/browser/real-editors.browser.test.ts` runs
 * the same rules on the real renderers.
 */

const example = (path: string): string =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8");

/** A modeler as the rules see it: the text of its canvas, and what a notation asks beside it. */
function standIn(canvas: { text: string }, extras: object = {}): EmbeddableModeler {
  return { exportText: () => canvas.text, ...extras } as unknown as EmbeddableModeler;
}

function rulesOf(module: EditorModule, modeler: EmbeddableModeler): TextRules {
  if (!module.text) throw new Error("the notation has no text rules");
  return module.text(modeler);
}

const reindented = (json: string): string => JSON.stringify(JSON.parse(json), null, 4);

describe("Wardley Maps", () => {
  const COMMENT = "// what the shop buys in";
  const lines = example("wardley-maps/example/tea.owm").trimEnd().split("\n");
  const kettle = lines.indexOf("component Kettle [0.43, 0.35]");
  const text = [...lines.slice(0, kettle), COMMENT, ...lines.slice(kettle)].join("\n") + "\n";

  function mounted(): { map: WardleyMap; rules: TextRules; exportText(): string } {
    const state = { map: parseDSL(text) };
    const exportText = (): string => serializeDSL(state.map);
    const modeler = {
      exportText,
      diagram: { exportMap: () => state.map },
    } as unknown as EmbeddableModeler;
    return {
      get map() {
        return state.map;
      },
      set map(next: WardleyMap) {
        state.map = next;
      },
      rules: rulesOf(wardley, modeler),
      exportText,
    };
  }

  const moved = (map: WardleyMap, label: string): WardleyMap => ({
    ...map,
    elements: map.elements.map((element) =>
      element.label === label
        ? { ...element, position: { visibility: 0.5, evolution: 0.25 } }
        : element,
    ),
  });

  it("has the example with a comment line in it", () => {
    expect(kettle).toBeGreaterThan(0);
    expect(text.split("\n")[kettle]).toBe(COMMENT);
  });

  it("keeps the comment line and the order of the lines when one component moves", () => {
    const canvas = mounted();
    canvas.rules.imported?.();
    canvas.map = moved(canvas.map, "Kettle");

    const written = canvas.rules.exported(text).split("\n");
    const before = text.split("\n");
    const changed = written.flatMap((line, index) => (line === before[index] ? [] : [index]));
    expect(written).toHaveLength(before.length);
    expect(changed).toEqual([kettle + 1]);
    expect(written[kettle]).toBe(COMMENT);
    expect(written[kettle + 1]).toBe("component Kettle [0.5, 0.25]");
    // What the modeler itself exports is another text: it takes the comment out of its place.
    expect(canvas.exportText().split("\n")[kettle]).not.toBe(COMMENT);
  });

  it("patches the text it wrote last, edit after edit", () => {
    const canvas = mounted();
    canvas.rules.imported?.();
    canvas.map = moved(canvas.map, "Kettle");
    const first = canvas.rules.exported(text);
    canvas.map = moved(canvas.map, "Power");
    const second = canvas.rules.exported(first).split("\n");
    expect(second[kettle]).toBe(COMMENT);
    expect(second[kettle + 1]).toBe("component Kettle [0.5, 0.25]");
    expect(second).toContain("component Power [0.5, 0.25] (outsource)");
  });

  it("writes the file's own text back for a canvas that did not change", () => {
    const canvas = mounted();
    canvas.rules.imported?.();
    expect(canvas.rules.exported(text)).toBe(text);
  });

  it("takes a text for the canvas when only line endings or the outer whitespace differ", () => {
    const { rules, exportText } = mounted();
    expect(rules.same(text.replace(/\n/g, "\r\n"), text)).toBe(true);
    expect(rules.same(`\n${text}\n\n`, text)).toBe(true);
    expect(rules.same(`${exportText()}\n`, text)).toBe(true);
    expect(rules.same(text.replace("Kettle [0.43", "Kettle [0.44"), text)).toBe(false);
    expect(rules.same(text.replace(COMMENT, "// another comment"), text)).toBe(false);
  });
});

describe("Value Chain", () => {
  const canonical = serializeValueChain(
    parseValueChain(example("value-chain/example/porter.vc.json")),
  );
  const own = reindented(canonical);

  it("hands back the file's own text while the canvas shows the same diagram", () => {
    const canvas = { text: canonical };
    const rules = rulesOf(valueChain, standIn(canvas));
    expect(own).not.toBe(canonical);
    expect(rules.exported(own)).toBe(own);
  });

  it("writes the canvas once it differs from the file", () => {
    const canvas = { text: canonical };
    const rules = rulesOf(valueChain, standIn(canvas));
    canvas.text = canonical.replace("Porter", "Porter's");
    expect(canvas.text).not.toBe(canonical);
    expect(rules.exported(own)).toBe(canvas.text);
  });

  it("takes a text for the canvas when its canonical form is what the canvas exports", () => {
    const rules = rulesOf(valueChain, standIn({ text: canonical }));
    expect(rules.same(own, canonical)).toBe(true);
    expect(rules.same(own.replace("Porter", "Porter's"), canonical)).toBe(false);
    expect(rules.same("{ not json", canonical)).toBe(false);
  });
});

describe("Business Model Canvas", () => {
  const canonical = serializeText(
    readText(example("business-model-canvas/example/miragon.bmc")).document,
  );
  const own = canonical.replace("version: 1\n", "version: 1\n\n# the canvas of the suite\n");
  const saved = canonical.replace(/\n/g, "  \r\n");

  it("hands back the file's own text while the canvas shows the same canvas", () => {
    const rules = rulesOf(businessModelCanvas, standIn({ text: canonical }));
    expect(own).not.toBe(canonical);
    expect(rules.exported(own)).toBe(own);
    expect(rules.exported(saved)).toBe(saved);
  });

  it("writes the canvas once it differs from the file", () => {
    const canvas = { text: canonical };
    const rules = rulesOf(businessModelCanvas, standIn(canvas));
    canvas.text = canonical.replace("Process consultants", "Consultants");
    expect(canvas.text).not.toBe(canonical);
    expect(rules.exported(own)).toBe(canvas.text);
  });

  it("takes a text for the canvas by its canonical form, or by its lines without their ends", () => {
    const rules = rulesOf(businessModelCanvas, standIn({ text: canonical }));
    expect(rules.same(own, canonical)).toBe(true);
    expect(rules.same(saved, canonical)).toBe(true);
    expect(rules.same(own.replace("Process consultants", "Consultants"), canonical)).toBe(false);
    expect(rules.same("canvas: [", canonical)).toBe(false);
  });
});

describe("Team Topologies", () => {
  const parsed = parseTeamTopology(JSON.parse(example("team-topologies/example/sample.tt")));
  if (!parsed.ok) throw new Error(parsed.error);
  const canonical = serializeTeamTopology(parsed.document);
  const own = reindented(canonical);

  it("writes what the modeler exports", () => {
    const rules = rulesOf(teamTopologies, standIn({ text: canonical }));
    expect(rules.exported(own)).toBe(canonical);
  });

  it("takes a text for the canvas when its canonical form is what the canvas exports", () => {
    const rules = rulesOf(teamTopologies, standIn({ text: canonical }));
    expect(own).not.toBe(canonical);
    expect(rules.same(own, canonical)).toBe(true);
    expect(rules.same(own.replace("Checkout & Payments", "Checkout"), canonical)).toBe(false);
    expect(rules.same("{ not json", canonical)).toBe(false);
  });
});

describe("Context Maps", () => {
  const parsed = parseContextMap(example("context-maps/example/sample.cm"));
  if (!parsed.ok) throw new Error("the example is no context map");
  const canonical = serializeContextMap(parsed.document);
  const own = reindented(canonical);

  it("writes what the modeler exports", () => {
    const rules = rulesOf(contextMaps, standIn({ text: canonical }));
    expect(rules.exported(own)).toBe(canonical);
  });

  it("takes a text for the canvas when its canonical form is what the canvas exports", () => {
    const rules = rulesOf(contextMaps, standIn({ text: canonical }));
    expect(own).not.toBe(canonical);
    expect(rules.same(own, canonical)).toBe(true);
    expect(rules.same(own.replace("User Access", "Access"), canonical)).toBe(false);
    expect(rules.same("{ not json", canonical)).toBe(false);
  });
});

describe("Event Storming", () => {
  const board = example("event-storming/example/order-checkout.storm");

  it("writes what the modeler exports", () => {
    const rules = rulesOf(eventStorming, standIn({ text: board }));
    expect(rules.exported("title Another board\n")).toBe(board);
  });

  it("takes a text for the canvas when only line endings or the outer whitespace differ", () => {
    const rules = rulesOf(eventStorming, standIn({ text: board }));
    expect(rules.same(board.replace(/\n/g, "\r\n"), board)).toBe(true);
    expect(rules.same(`${board}\n\n`, board)).toBe(true);
    expect(rules.same(board.replace("Place Order", "Place an Order"), board)).toBe(false);
  });
});

describe("C4", () => {
  const workspace = example("c4/example/bookshop.c4");

  it("writes the modeler's text byte for byte", () => {
    const rules = rulesOf(c4, standIn({ text: workspace }));
    expect(rules.exported("workspace {}\n")).toBe(workspace);
  });

  it("asks the modeler to rebase a text, and takes its answer", () => {
    const asked: string[] = [];
    const answers = [true, false];
    const rules = rulesOf(
      c4,
      standIn(
        { text: workspace },
        {
          rebaseText(text: string) {
            asked.push(text);
            return answers.shift();
          },
        },
      ),
    );
    expect(rules.same("a formatted text", workspace)).toBe(true);
    expect(rules.same("another model", workspace)).toBe(false);
    expect(asked).toEqual(["a formatted text", "another model"]);
  });

  function withBreadcrumbs(connected: boolean): { modeler: EmbeddableModeler; calls: string[] } {
    const calls: string[] = [];
    const services: Record<string, unknown> = {
      c4Breadcrumbs: { relayout: () => calls.push("relayout") },
      canvas: { getContainer: () => ({ isConnected: connected }) },
    };
    const modeler = standIn(
      { text: workspace },
      { diagram: { get: (name: string) => services[name] } },
    );
    return { modeler, calls };
  }

  it("lays the breadcrumb bar out again, once the call that asked for it has returned", async () => {
    const { modeler, calls } = withBreadcrumbs(true);
    c4.relayout(modeler);
    // Not inside the call: the board gives the element its box only after focus() returned.
    expect(calls).toEqual([]);
    await Promise.resolve();
    expect(calls).toEqual(["relayout"]);
  });

  it("leaves a modeler alone that was destroyed in between", async () => {
    const { modeler, calls } = withBreadcrumbs(false);
    c4.relayout(modeler);
    await Promise.resolve();
    expect(calls).toEqual([]);
  });
});

describe("every notation module", () => {
  const modules: Record<string, EditorModule> = {
    wardley,
    eventStorming,
    teamTopologies,
    contextMaps,
    valueChain,
    c4,
    businessModelCanvas,
  };

  it.each(Object.keys(modules))("%s has a factory and text rules", (name) => {
    const module = modules[name]!;
    expect(typeof module.create).toBe("function");
    expect(typeof module.text).toBe("function");
  });

  it("only C4 lays chrome out again", () => {
    const withRelayout = Object.keys(modules).filter((name) => modules[name]!.relayout);
    expect(withRelayout).toEqual(["c4"]);
  });
});
