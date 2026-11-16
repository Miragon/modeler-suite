import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bindTextSession,
  type EditorNotice,
  type EditorState,
  type TextBinding,
} from "../src/index.js";
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
  /** what the binding said once, in order */
  notices: EditorNotice[];
  binding: TextBinding;
  ready: Promise<void>;
  unbind(): void;
}

function bind(text = TEXT, options: { rules?: boolean; readOnly?: boolean } = {}): Bound {
  const modeler = createStandInModeler({ fitOnImport: false });
  const session = fakeSession("plans/plan.items", text, options.readOnly);
  const states: EditorState[] = [];
  const notices: EditorNotice[] = [];
  const binding = bindTextSession(session, options.rules === false ? undefined : standInRules)(
    modeler,
    (state) => states.push(state),
    (notice) => notices.push(notice),
  );
  return {
    modeler,
    session,
    states,
    notices,
    binding,
    ready: binding.ready,
    unbind: () => binding.unbind(),
  };
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

  it("says with every write which text of the file it was made from", async () => {
    const modeler = createStandInModeler({ fitOnImport: false });
    const session = fakeSession("plans/plan.items", TEXT);
    const bases: Array<string | undefined> = [];
    const write = session.write.bind(session);
    session.write = (text, base) => {
      bases.push(base);
      write(text, base);
    };
    await bindTextSession(session, standInRules)(modeler, () => undefined).ready;

    modeler.commands.move("b", 40, 10);
    modeler.commands.remove("a");

    // the first from the file's text, the second from what the first wrote
    expect(bases).toEqual([TEXT, "# the plan\na 0 0 Alpha\n\n# later\nb 240 10 Beta\n"]);
    expect(session.dropped).toEqual([]);
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

describe("a change on the canvas that crosses one from outside", () => {
  it("made while the outside's text waits behind an import is dropped, and the canvas ends on the file's text", async () => {
    const { modeler, session, ready } = bind();
    await ready;
    const first = TEXT.replace("Alpha", "First");
    const second = TEXT.replace("Alpha", "Second");
    modeler.holdImports();
    session.replace(first);
    await settled();
    // the import of the first text runs; the second waits behind it, and the person edits
    session.replace(second);
    modeler.commands.move("b", 40, 10);
    modeler.releaseImports();
    await settled();

    expect(session.writes).toEqual([]);
    expect(session.dropped).toHaveLength(1);
    expect(session.text()).toBe(second);
    expect(modeler.exportText()).toBe("a 0 0 Second\nb 200 0 Beta\n");
  });

  it("is written where the file still has the text the canvas was reconciled with", async () => {
    const { modeler, session, ready } = bind();
    await ready;
    const outside = TEXT.replace("Alpha", "Outside");
    session.replace(outside);
    await settled();

    modeler.commands.move("b", 40, 10);

    expect(session.dropped).toEqual([]);
    expect(session.writes).toEqual(["# the plan\na 0 0 Outside\n\n# later\nb 240 10 Beta\n"]);
  });

  it("that the session dropped twice in a row still ends on the file's text", async () => {
    const { modeler, session, ready } = bind();
    await ready;
    const outside = TEXT.replace("Alpha", "Outside");

    modeler.gesture.start();
    session.replace(outside);
    // two changes of the canvas before the import of the outside's text had its turn
    modeler.gesture.drop("b", 40, 10);
    modeler.commands.move("a", 5, 5);
    await settled();

    expect(session.writes).toEqual([]);
    expect(session.dropped).toHaveLength(2);
    expect(modeler.exportText()).toBe("a 0 0 Outside\nb 200 0 Beta\n");
    expect(session.text()).toBe(outside);
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
  it("keeps a change from outside off the canvas while it is held, and its drop does not replace that change", async () => {
    const { modeler, session, ready } = bind();
    await ready;
    const outside = TEXT.replace("Alpha", "Outside");

    modeler.gesture.start();
    session.replace(outside);
    await settled();
    expect(modeler.record.imports).toEqual([TEXT]);

    modeler.gesture.drop("b", 40, 10);
    await settled();

    // The drop was made from the text before the outside's change. The session dropped it, the
    // file keeps the outside's text, and the canvas shows that text: the person sees the drop go.
    expect(session.writes).toEqual([]);
    expect(session.dropped).toEqual([
      { text: "# the plan\na 0 0 Alpha\n\n# later\nb 240 10 Beta\n", base: TEXT },
    ]);
    expect(session.text()).toBe(outside);
    expect(modeler.record.imports).toEqual([TEXT, outside]);
    expect(modeler.exportText()).toBe("a 0 0 Outside\nb 200 0 Beta\n");

    // and the next change on the canvas is made from the outside's text, and written
    modeler.commands.move("b", 40, 10);
    expect(session.writes).toEqual(["# the plan\na 0 0 Outside\n\n# later\nb 240 10 Beta\n"]);
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

describe("what the binding says once", () => {
  it("says before every write that the person changed the canvas, and nothing for a change that writes nothing", async () => {
    const { modeler, session, notices, ready } = bind();
    await ready;

    modeler.commands.move("b", 40, 10);
    modeler.commands.touch();
    modeler.commands.move("a", 5, 5);

    expect(session.writes).toHaveLength(2);
    expect(notices).toEqual([{ kind: "edited" }, { kind: "edited" }]);
  });

  it("says that a change was dropped, with the reason the session gives", async () => {
    const { modeler, session, notices, ready } = bind();
    await ready;
    modeler.commands.move("b", 40, 10);
    notices.length = 0;

    // the host's word of the edit that was posted last
    session.drop("too-large");
    session.drop("refused");

    expect(notices).toEqual([
      { kind: "dropped", reason: "too-large" },
      { kind: "dropped", reason: "refused" },
    ]);
  });

  it("says a drop the session makes itself after the change it is about, so that the word stays", async () => {
    const { modeler, session, notices, ready } = bind();
    await ready;
    modeler.gesture.start();
    session.replace(TEXT.replace("Alpha", "Outside"));
    await settled();

    // the drop is made on the text before the outside's change: the session drops it at once
    modeler.gesture.drop("b", 40, 10);

    expect(session.dropped).toHaveLength(1);
    expect(notices).toEqual([{ kind: "edited" }, { kind: "dropped", reason: "crossed" }]);
  });

  it("says nothing where no one listens, and binds a session that has no word for a drop", async () => {
    const modeler = createStandInModeler({ fitOnImport: false });
    const session = fakeSession("plans/plan.items", TEXT);
    const silent = { ...session, onDropped: undefined };
    const binding = bindTextSession(silent, standInRules)(modeler, () => undefined);
    await binding.ready;

    modeler.commands.move("b", 40, 10);
    session.drop("crossed");

    expect(session.writes).toHaveLength(1);
    binding.unbind();
  });

  it("says nothing more once it is unbound", async () => {
    const { session, notices, ready, unbind } = bind();
    await ready;
    unbind();

    session.drop("crossed");

    expect(notices).toEqual([]);
    expect(session.listening()).toBe(0);
  });
});

describe("a file that moves", () => {
  const MOVED = "archive/plan.items";

  it("goes on with the session of its new path: nothing is imported, and the next change is written there", async () => {
    const { modeler, session, states, binding, ready } = bind();
    await ready;
    modeler.commands.move("b", 40, 10);
    const written = session.writes[0] as string;
    const next = fakeSession(MOVED, written);

    binding.follow(undefined);
    binding.follow(next);
    await settled();

    // the same text under another path draws what the canvas shows: the editor keeps its history
    expect(modeler.record.imports).toEqual([TEXT]);
    expect(states).toEqual([{ kind: "ok" }]);
    expect(session.listening()).toBe(0);

    modeler.commands.undo();
    expect(next.writes).toEqual([TEXT]);
    expect(session.writes).toEqual([written]);
    // every write still says which text it was made from
    expect(next.dropped).toEqual([]);
  });

  it("hears nothing of the path it left, and writes nothing while it is between two paths", async () => {
    const { modeler, session, states, notices, binding, ready } = bind();
    await ready;

    binding.follow(undefined);
    // what the old path says once its file is gone
    session.setAvailable(false);
    session.replace("c 0 0 Gamma\n");
    session.drop("crossed");
    modeler.commands.move("b", 40, 10);
    await settled();

    expect(states).toEqual([{ kind: "ok" }]);
    expect(notices).toEqual([]);
    expect(modeler.record.imports).toEqual([TEXT]);
    expect(session.writes).toEqual([]);
  });

  it("writes what the person changed between the two paths into the file once it has its new path", async () => {
    const { modeler, notices, binding, ready } = bind();
    await ready;
    binding.follow(undefined);
    modeler.commands.move("b", 40, 10);
    expect(notices).toEqual([]);
    const next = fakeSession(MOVED, TEXT);

    binding.follow(next);
    await settled();

    // nothing is imported over the change, and it is in the file, written on the file's text
    expect(modeler.record.imports).toEqual([TEXT]);
    expect(next.writes).toEqual(["# the plan\na 0 0 Alpha\n\n# later\nb 240 10 Beta\n"]);
    expect(next.dropped).toEqual([]);
    expect(notices).toEqual([{ kind: "edited" }]);
    // once: the next text of the file is not answered with another write
    next.replace(next.text());
    await settled();
    expect(next.writes).toHaveLength(1);
    // and a later change from outside is a change from outside, with no word of a dropped edit
    next.replace(TEXT.replace("Alpha", "Later"));
    await settled();
    expect(modeler.record.imports).toHaveLength(2);
    expect(notices).toEqual([{ kind: "edited" }]);
  });

  it("drops what the person changed between the two paths where the new path has another text, and says so", async () => {
    const { modeler, notices, binding, ready } = bind();
    await ready;
    binding.follow(undefined);
    modeler.commands.move("b", 40, 10);
    const other = TEXT.replace("Alpha", "Elsewhere");
    const next = fakeSession(MOVED, other);

    binding.follow(next);
    await settled();

    // the change has no text to be written on: the canvas shows the file, with the view kept
    expect(modeler.record.imports).toEqual([TEXT, other]);
    expect(modeler.exportText()).toBe("a 0 0 Elsewhere\nb 200 0 Beta\n");
    expect(next.writes).toEqual([]);
    expect(notices).toEqual([{ kind: "dropped", reason: "crossed" }]);
    expect(modeler.record.viewStates).toHaveLength(1);
  });

  it("says that a write was dropped which was on its way to the old path when the file left it", async () => {
    const { modeler, session, notices, binding, ready } = bind();
    await ready;
    // handed to the session of the old path; the place never took it, and the old path says so to nobody
    modeler.commands.move("b", 40, 10);
    expect(session.writes).toHaveLength(1);
    const next = fakeSession(MOVED, TEXT);

    binding.follow(undefined);
    binding.follow(next);
    await settled();

    // the canvas ends on the file's text, and the person is told that their change went
    expect(modeler.record.imports).toEqual([TEXT, TEXT]);
    expect(modeler.exportText()).toBe(CANONICAL);
    expect(notices).toEqual([{ kind: "edited" }, { kind: "dropped", reason: "crossed" }]);
    expect(next.writes).toEqual([]);
    // once: a later change from outside is a change from outside
    next.replace(TEXT.replace("Alpha", "Later"));
    await settled();
    expect(notices).toHaveLength(2);
  });

  it("says the same where the binding goes from one session to the next in one step", async () => {
    const { modeler, notices, binding, ready } = bind();
    await ready;
    modeler.commands.move("b", 40, 10);

    binding.follow(fakeSession(MOVED, TEXT));
    await settled();

    expect(notices).toEqual([{ kind: "edited" }, { kind: "dropped", reason: "crossed" }]);
    expect(modeler.exportText()).toBe(CANONICAL);
  });

  it("says nothing of a write the new path has: the text there draws what the canvas shows", async () => {
    const { modeler, session, notices, binding, ready } = bind();
    await ready;
    modeler.commands.move("b", 40, 10);
    const next = fakeSession(MOVED, session.writes[0] as string);

    binding.follow(undefined);
    binding.follow(next);
    await settled();

    expect(notices).toEqual([{ kind: "edited" }]);
    expect(modeler.record.imports).toEqual([TEXT]);
    // and nothing is written for it a second time
    expect(next.writes).toEqual([]);
  });

  it("says nothing of a write the file answered with a text of its own before it moved", async () => {
    const { modeler, session, notices, binding, ready } = bind();
    await ready;
    modeler.commands.move("b", 40, 10);
    // the old path told a text after the write: what it dropped of the write, it said itself
    const told = TEXT.replace("Alpha", "Told");
    session.replace(told);
    await settled();
    const other = TEXT.replace("Beta", "Better");

    binding.follow(undefined);
    binding.follow(fakeSession(MOVED, other));
    await settled();

    expect(modeler.record.imports).toEqual([TEXT, told, other]);
    expect(notices).toEqual([{ kind: "edited" }]);
  });

  it("imports a text that is another one under the new path, as a change from outside", async () => {
    const { modeler, binding, states, ready } = bind();
    await ready;
    const other = TEXT.replace("Beta", "Better");
    const next = fakeSession(MOVED, other);

    binding.follow(next);
    await settled();

    expect(modeler.record.imports).toEqual([TEXT, other]);
    expect(states).toEqual([{ kind: "ok" }, { kind: "ok" }]);
    // and it listens to the new path from now on
    next.replace(TEXT);
    await settled();
    expect(modeler.record.imports).toEqual([TEXT, other, TEXT]);
    next.setAvailable(false);
    expect(states.at(-1)).toEqual({ kind: "gone" });
    next.drop("crossed");
  });

  it("is shown again where its old path had said that it is gone", async () => {
    const { session, binding, states, ready } = bind();
    await ready;
    session.setAvailable(false);
    expect(states.at(-1)).toEqual({ kind: "gone" });

    binding.follow(fakeSession(MOVED, TEXT));

    expect(states.at(-1)).toEqual({ kind: "ok" });
  });

  it("waits with another text of the new path for the end of a gesture the person holds", async () => {
    const { modeler, binding, ready } = bind();
    await ready;
    const other = TEXT.replace("Alpha", "Moved");
    const next = fakeSession(MOVED, other);

    modeler.gesture.start();
    binding.follow(next);
    await settled();
    expect(modeler.record.imports).toEqual([TEXT]);

    modeler.gesture.cancel();
    await settled();
    expect(modeler.record.imports).toEqual([TEXT, other]);
  });

  it("says a drop of the new path, and none of the old one", async () => {
    const { session, notices, binding, ready } = bind();
    await ready;
    const next = fakeSession(MOVED, TEXT);
    binding.follow(next);

    session.drop("refused");
    next.drop("too-large");

    expect(notices).toEqual([{ kind: "dropped", reason: "too-large" }]);
  });

  it("closes no session: that is whoever opened it", async () => {
    const { session, binding, ready, unbind } = bind();
    await ready;
    const next = fakeSession(MOVED, TEXT);

    binding.follow(next);
    unbind();

    expect([session.closed, next.closed]).toEqual([0, 0]);
    expect(next.listening()).toBe(0);
  });

  it("does not follow once it is unbound", async () => {
    const { modeler, binding, ready, unbind } = bind();
    await ready;
    unbind();
    const next = fakeSession(MOVED, TEXT.replace("Beta", "Better"));

    binding.follow(next);
    await settled();

    expect(next.listening()).toBe(0);
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
