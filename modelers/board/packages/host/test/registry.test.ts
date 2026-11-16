import { describe, expect, it } from "vitest";

import { loadEditor } from "../src/registry.js";
import { standInEditors } from "./support/stand-in-modeler.js";

describe("the load of an entry's code", () => {
  it("runs once, however many nodes ask for it", async () => {
    const editors = standInEditors();

    const [first, second] = await Promise.all([
      loadEditor(editors.entry),
      loadEditor(editors.entry),
    ]);
    const third = await loadEditor(editors.entry);

    expect(editors.loads()).toBe(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("is tried again after it failed", async () => {
    const editors = standInEditors({ failingLoads: 1 });

    await expect(loadEditor(editors.entry)).rejects.toThrow("the code did not load");
    const module = await loadEditor(editors.entry);

    expect(editors.loads()).toBe(2);
    expect(module.create({}).meta.notation).toBe("stand-in");
  });

  it("is one load per entry: two entries of one notation load their own code", async () => {
    const one = standInEditors();
    const other = standInEditors();

    await loadEditor(one.entry);
    await loadEditor(other.entry);

    expect([one.loads(), other.loads()]).toEqual([1, 1]);
  });
});
