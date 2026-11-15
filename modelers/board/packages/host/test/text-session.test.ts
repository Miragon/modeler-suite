import { afterEach, describe, expect, it, vi } from "vitest";

import { bindTextSession, type EditorState } from "../src/index.js";
import { fakeSession, settled, type FakeSession } from "./support/fake-files.js";
import {
  createStandInModeler,
  standInRules,
  type StandInModeler,
} from "./support/stand-in-modeler.js";

const TEXT = "# the plan\na 0 0 Alpha\n\n# later\nb 200 0 Beta\n";
const CANONICAL = "a 0 0 Alpha\nb 200 0 Beta\n";

interface Bound {
  modeler: StandInModeler;
  session: FakeSession;
  states: EditorState[];
  ready: Promise<void>;
  unbind(): void;
}

function bind(text = TEXT, options: { rules?: boolean; readOnly?: boolean } = {}): Bound {
  const modeler = createStandInModeler({ fitOnImport: false });
  const session = fakeSession("plans/plan.items", text, options.readOnly);
  const states: EditorState[] = [];
  const binding = bindTextSession(session, options.rules === false ? undefined : standInRules)(
    modeler,
    (state) => states.push(state),
  );
  return { modeler, session, states, ready: binding.ready, unbind: () => binding.unbind() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the first text", () => {
  it("is imported, reported once and never written back", async () => {
    const { modeler, session, states, ready } = bind();
    await ready;

    expect(modeler.record.imports).toEqual([TEXT]);
    expect(modeler.exportText()).toBe(CANONICAL);
    expect(states).toEqual([{ kind: "ok" }]);
    expect(modeler.record.ruleImports).toBe(1);
    // the editor fits itself: no view of an empty canvas is put back over that fit
    expect(modeler.record.viewStates).toEqual([]);
    expect(session.writes).toEqual([]);
  });

  it("that the modeler refuses is reported with its reason, and ready still settles", async () => {
    const { modeler, session, states, ready } = bind("this is no item\n");
    await ready;

    expect(states).toEqual([
      { kind: "invalid", message: 'line 1: expected "<id> <x> <y> <name>"' },
    ]);
    expect(modeler.record.imports).toEqual([]);

    // a change on the canvas of a text nobody could read is not written over that text
    modeler.commands.add("Gamma");
    expect(session.writes).toEqual([]);

    session.replace(TEXT);
    await settled();
    expect(states.at(-1)).toEqual({ kind: "ok" });
    expect(modeler.exportText()).toBe(CANONICAL);
    // still the first text the canvas shows: no view is put back
    expect(modeler.record.viewStates).toEqual([]);
  });
});

describe("a change on the canvas", () => {
  it("writes once what the notation's rules make of the file's text", async () => {
    const { modeler, session, ready } = bind();
    await ready;

    modeler.commands.move("b", 40, 10);

    // the comments and the empty line of the file survive, which the modeler's own export drops
    expect(session.writes).toEqual(["# the plan\na 0 0 Alpha\n\n# later\nb 240 10 Beta\n"]);
    expect(modeler.exportText()).toBe("a 0 0 Alpha\nb 240 10 Beta\n");
  });

  it("is patched against what was written last, not against the first text", async () => {
    const { modeler, session, ready } = bind();
    await ready;

    modeler.commands.remove("a");
    modeler.commands.add("Gamma");

    expect(session.writes).toEqual([
      "# the plan\n\n# later\nb 200 0 Beta\n",
      "# the plan\n\n# later\nb 200 0 Beta\nitem_2 0 80 Gamma\n",
    ]);
  });

  it("writes the modeler's own export where the notation has no rules", async () => {
    const { modeler, session, ready } = bind(TEXT, { rules: false });
    await ready;

    modeler.commands.move("b", 40, 10);

    expect(session.writes).toEqual(["a 0 0 Alpha\nb 240 10 Beta\n"]);
  });

  it("that leaves the text as the file has it writes nothing", async () => {
    const { modeler, session, ready } = bind();
    await ready;

    modeler.commands.touch();
    expect(session.writes).toEqual([]);

    modeler.commands.move("b", 40, 10);
    modeler.commands.touch();
    modeler.commands.undo();
    modeler.commands.touch();

    // the move and its undo are a write each; a change event that changes no text is none
    expect(modeler.record.changes).toBe(5);
    expect(session.writes).toHaveLength(2);
    expect(session.writes.at(-1)).toBe(TEXT);
  });

  it("writes nothing before the first text was imported", async () => {
    const { modeler, session, ready } = bind();
    modeler.commands.add("Early");
    expect(session.writes).toEqual([]);
    await ready;
  });

  it("writes nothing into a file that is read only", async () => {
    const { modeler, session, ready } = bind(TEXT, { readOnly: true });
    await ready;

    modeler.commands.move("b", 40, 10);
    expect(session.writes).toEqual([]);
  });
});

describe("a change from outside", () => {
  it("is imported with the view kept and nothing written back", async () => {
    const { modeler, session, states, ready } = bind();
    await ready;
    modeler.setViewState({ x: 30, y: -20, scale: 0.75 });
    modeler.record.viewStates.length = 0;

    const renamed = TEXT.replace("Beta", "Better");
    session.replace(renamed);
    await settled();

    expect(modeler.record.imports).toEqual([TEXT, renamed]);
    expect(modeler.record.viewStates).toEqual([{ x: 30, y: -20, scale: 0.75 }]);
    expect(modeler.record.ruleImports).toBe(2);
    expect(session.writes).toEqual([]);
    expect(states).toEqual([{ kind: "ok" }, { kind: "ok" }]);
  });

  it("that the rules call the same is not imported, and is the text the next write starts from", async () => {
    const { modeler, session, ready } = bind();
    await ready;

    const reformatted = "# another comment\na 0 0 Alpha\nb 200 0 Beta\n";
    session.replace(reformatted);
    await settled();
    expect(modeler.record.imports).toEqual([TEXT]);
    expect(modeler.record.ruleImports).toBe(1);

    modeler.commands.move("a", 5, 5);
    expect(session.writes).toEqual(["# another comment\na 5 5 Alpha\nb 200 0 Beta\n"]);
  });

  it("that is byte for byte what the file had asks no rule and imports nothing", async () => {
    const modeler = createStandInModeler();
    const session = fakeSession("plans/plan.items", TEXT);
    let asked = 0;
    const binding = bindTextSession(session, (bound) => ({
      ...standInRules(bound),
      same: () => {
        asked += 1;
        return false;
      },
    }))(modeler, () => undefined);
    await binding.ready;

    session.replace(TEXT);
    await settled();

    expect(asked).toBe(0);
    expect(modeler.record.imports).toEqual([TEXT]);
  });

  it("without rules is the same only byte for byte", async () => {
    const { modeler, session, ready } = bind(CANONICAL, { rules: false });
    await ready;

    session.replace(CANONICAL);
    await settled();
    expect(modeler.record.imports).toEqual([CANONICAL]);

    session.replace(`# a comment\n${CANONICAL}`);
    await settled();
    expect(modeler.record.imports).toEqual([CANONICAL, `# a comment\n${CANONICAL}`]);
  });

  it("that no rule can read counts as another text: the import says what is wrong", async () => {
    const { modeler, session, states, ready } = bind();
    await ready;

    session.replace("a 0 0 Alpha\nbroken\n");
    await settled();

    expect(states.at(-1)).toEqual({
      kind: "invalid",
      message: 'line 2: expected "<id> <x> <y> <name>"',
    });
    // L7: the last good canvas stays
    expect(modeler.exportText()).toBe(CANONICAL);
    expect(modeler.record.refused).toEqual(["a 0 0 Alpha\nbroken\n"]);
  });

  it("that is invalid stops every write until a valid text arrives", async () => {
    const { modeler, session, states, ready } = bind();
    await ready;
    session.replace("broken\n");
    await settled();

    modeler.commands.move("a", 5, 5);
    expect(session.writes).toEqual([]);

    // the text as it was before: imported again, since the canvas has moved on meanwhile
    session.replace(TEXT);
    await settled();
    expect(states.at(-1)).toEqual({ kind: "ok" });
    expect(modeler.exportText()).toBe(CANONICAL);
    expect(session.writes).toEqual([]);

    modeler.commands.move("a", 5, 5);
    expect(session.writes).toHaveLength(1);
  });

  it("reads the file's text when its import starts, not when it was asked for", async () => {
    const { modeler, session, ready } = bind();
    await ready;
    modeler.holdImports();
    session.replace(TEXT.replace("Alpha", "First"));
    await settled();
    session.replace(TEXT.replace("Alpha", "Second"));
    session.replace(TEXT.replace("Alpha", "Third"));
    modeler.releaseImports();
    await settled();

    // the first import had started; the two behind it show what the file has by then
    expect(modeler.record.imports).toEqual([
      TEXT,
      TEXT.replace("Alpha", "First"),
      TEXT.replace("Alpha", "Third"),
    ]);
    expect(session.writes).toEqual([]);
  });

  it("that changes three times in one task is one import, of the last text", async () => {
    const { modeler, session, ready } = bind();
    await ready;

    session.replace(TEXT.replace("Alpha", "First"));
    session.replace(TEXT.replace("Alpha", "Second"));
    session.replace(TEXT.replace("Alpha", "Third"));
    await settled();

    expect(modeler.record.imports).toEqual([TEXT, TEXT.replace("Alpha", "Third")]);
  });
});

describe("a file that goes and comes back", () => {
  it("is reported as gone, and as shown again when it is back with the same text", async () => {
    const { modeler, session, states, ready } = bind();
    await ready;

    session.setAvailable(false);
    expect(states.at(-1)).toEqual({ kind: "gone" });

    session.setAvailable(true);
    session.replace(TEXT);
    await settled();
    expect(states.at(-1)).toEqual({ kind: "ok" });
    expect(modeler.record.imports).toEqual([TEXT]);
  });

  it("comes back as invalid when the canvas still shows the text before a refused one", async () => {
    const { session, states, ready } = bind();
    await ready;
    session.replace("broken\n");
    await settled();
    const refused = states.at(-1);
    expect(refused?.kind).toBe("invalid");

    session.setAvailable(false);
    session.setAvailable(true);
    expect(states.at(-1)).toEqual(refused);
  });

  it("stays gone when an import that was on its way ends after the file went", async () => {
    const { modeler, session, states, ready } = bind();
    await ready;
    modeler.holdImports();
    session.replace(TEXT.replace("Beta", "Better"));
    await settled();
    session.setAvailable(false);
    modeler.releaseImports();
    await settled();

    expect(states.at(-1)).toEqual({ kind: "gone" });
  });
});

describe("a gesture the person holds", () => {
  it("keeps a change from outside off the canvas, and its drop is the one write", async () => {
    const { modeler, session, ready } = bind();
    await ready;

    modeler.gesture.start();
    session.replace(TEXT.replace("Alpha", "Outside"));
    await settled();
    expect(modeler.record.imports).toEqual([TEXT]);

    modeler.gesture.drop("b", 40, 10);
    await settled();

    // The drop was written over the text from outside: the canvas and the file say the same,
    // and the text that waited is not imported over the drop.
    expect(session.writes).toEqual(["# the plan\na 0 0 Alpha\n\n# later\nb 240 10 Beta\n"]);
    expect(modeler.record.imports).toEqual([TEXT]);
    expect(standInRules(modeler).same(session.text(), "")).toBe(true);
  });

  it("that is cancelled lets the change from outside in", async () => {
    const { modeler, session, ready } = bind();
    await ready;
    const outside = TEXT.replace("Alpha", "Outside");

    modeler.gesture.start();
    session.replace(outside);
    modeler.gesture.cancel();
    await settled();

    expect(modeler.record.imports).toEqual([TEXT, outside]);
    expect(session.writes).toEqual([]);
  });

  it("that ends with nothing waiting imports nothing", async () => {
    const { modeler, ready } = bind();
    await ready;

    modeler.gesture.start();
    modeler.gesture.cancel();
    await settled();

    expect(modeler.record.imports).toEqual([TEXT]);
  });
});

describe("unbind", () => {
  it("ends every write and every import", async () => {
    const { modeler, session, states, ready, unbind } = bind();
    await ready;
    unbind();

    modeler.commands.move("a", 5, 5);
    session.replace(TEXT.replace("Beta", "Better"));
    session.setAvailable(false);
    await settled();

    expect(session.writes).toEqual([]);
    expect(modeler.record.imports).toEqual([TEXT]);
    expect(states).toEqual([{ kind: "ok" }]);
  });

  it("keeps an import that waits in the queue from running, and one that runs from reporting", async () => {
    const { modeler, session, states, ready, unbind } = bind();
    await ready;
    modeler.holdImports();
    session.replace(TEXT.replace("Alpha", "First"));
    await settled();
    session.replace(TEXT.replace("Alpha", "Second"));
    unbind();
    modeler.releaseImports();
    await settled();

    expect(modeler.record.imports).toEqual([TEXT, TEXT.replace("Alpha", "First")]);
    // the import that had started ends in a modeler its host is done with: nothing follows it
    expect(states).toEqual([{ kind: "ok" }]);
    expect(modeler.record.viewStates).toEqual([]);
    expect(modeler.record.ruleImports).toBe(1);
  });

  it("keeps a text that is refused after it from being reported", async () => {
    const { modeler, session, states, ready, unbind } = bind();
    await ready;
    modeler.holdImports();
    session.replace("broken\n");
    await settled();
    unbind();
    modeler.releaseImports();
    await settled();

    expect(modeler.record.refused).toEqual(["broken\n"]);
    expect(states).toEqual([{ kind: "ok" }]);
  });
});

describe("a report that throws", () => {
  it("rejects ready for the first text and leaves the queue running", async () => {
    const modeler = createStandInModeler();
    const session = fakeSession("plans/plan.items", TEXT);
    let fail = true;
    const states: EditorState[] = [];
    const binding = bindTextSession(session, standInRules)(modeler, (state) => {
      if (fail) throw new Error("the host's listener failed");
      states.push(state);
    });
    await expect(binding.ready).rejects.toThrow("the host's listener failed");

    fail = false;
    session.replace(TEXT.replace("Beta", "Better"));
    await settled();
    expect(states).toEqual([{ kind: "ok" }]);
  });

  it("of a later text is logged with the file's path", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const modeler = createStandInModeler();
    const session = fakeSession("plans/plan.items", TEXT);
    let fail = false;
    const binding = bindTextSession(session, standInRules)(modeler, () => {
      if (fail) throw new Error("the host's listener failed");
    });
    await binding.ready;

    fail = true;
    session.replace(TEXT.replace("Beta", "Better"));
    await settled();

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.slice(0, 2)).toEqual(["[board-host]", "plans/plan.items"]);
  });
});
