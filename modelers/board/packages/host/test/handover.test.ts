import { describe, expect, it } from "vitest";

import { createEditorHandover } from "../src/index.js";
import type { MountedEditor } from "../src/facade/handover.js";
import { settled } from "./support/fake-files.js";

/** a mounted editor as the hand-over sees it: what it is of, and whether it was ended */
function mounted(notation = "stand-in"): MountedEditor & { destroyed: number } {
  const editor = {
    notation,
    destroyed: 0,
    inner: { destroy: () => void (editor.destroyed += 1) },
    binding: {},
    voice: { state: { kind: "ok" }, onState: undefined, onNotice: undefined },
  };
  return editor as unknown as MountedEditor & { destroyed: number };
}

describe("the hand-over of a moved file's editor", () => {
  it("gives the editor to whoever opens the same node at the path it was sent to, once", async () => {
    const handover = createEditorHandover();
    const editor = mounted();

    handover.leave("n_1", "archive/plan.items", editor);

    expect(handover.take("n_1", "archive/plan.items", "stand-in")).toBe(editor);
    expect(handover.take("n_1", "archive/plan.items", "stand-in")).toBeUndefined();
    await settled();
    // taken: it is its new editor's to end
    expect(editor.destroyed).toBe(0);
  });

  it.each<[string, string, string, string]>([
    ["another node", "n_2", "archive/plan.items", "stand-in"],
    ["another path", "n_1", "archive/other.items", "stand-in"],
    ["another notation", "n_1", "archive/plan.items", "another"],
  ])(
    "keeps it from an editor of %s, and ends it a microtask later",
    async (_what, node, path, notation) => {
      const handover = createEditorHandover();
      const editor = mounted();
      handover.leave("n_1", "archive/plan.items", editor);

      expect(handover.take(node, path, notation)).toBeUndefined();
      // still there for the editor it was left for, until the commit is over
      expect(editor.destroyed).toBe(0);
      await Promise.resolve();

      expect(editor.destroyed).toBe(1);
      expect(handover.take("n_1", "archive/plan.items", "stand-in")).toBeUndefined();
    },
  );

  it("keeps the editors of two nodes apart", () => {
    const handover = createEditorHandover();
    const [first, second] = [mounted(), mounted()];
    handover.leave("n_1", "archive/plan.items", first);
    handover.leave("n_2", "archive/plan.items", second);

    expect(handover.take("n_2", "archive/plan.items", "stand-in")).toBe(second);
    expect(handover.take("n_1", "archive/plan.items", "stand-in")).toBe(first);
  });

  it("ends an editor that still waits when the next one of its node is left, and ends neither twice", async () => {
    const handover = createEditorHandover();
    const [first, second] = [mounted(), mounted()];
    handover.leave("n_1", "archive/plan.items", first);
    handover.leave("n_1", "archive/again.items", second);

    expect([first.destroyed, second.destroyed]).toEqual([1, 0]);
    expect(handover.take("n_1", "archive/plan.items", "stand-in")).toBeUndefined();
    await settled();
    expect([first.destroyed, second.destroyed]).toEqual([1, 1]);
  });
});
