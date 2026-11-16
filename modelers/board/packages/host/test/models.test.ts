import type { EmbeddedEditorContext } from "@miragon/board-renderer";
import { describe, expect, it } from "vitest";

import { modelsFrom, type EditorEntry } from "../src/index.js";
import { fakeFiles } from "./support/fake-files.js";

const entry = (kind: string, suffixes: string[]): EditorEntry => ({
  notation: kind.toLowerCase(),
  kind,
  suffixes,
  load: () => Promise.reject(new Error("no test here loads an editor")),
});
const EDITORS = [
  entry("Map", [".owm", ".wmap"]),
  entry("Topology", [".tt", ".ttm.json"]),
  entry("Json", [".json"]),
];

/** a context whose element no call may touch */
const contextFor = (path: string): EmbeddedEditorContext => ({
  nodeId: "n_0",
  path,
  get element(): HTMLElement {
    throw new Error("the element was read");
  },
  armed: () => false,
  onArmedChange: () => () => undefined,
  relocate: () => undefined,
});

describe("the model list", () => {
  it("offers the files an editor is registered for, in the order of the port", () => {
    const files = fakeFiles([
      "assets/logo.png",
      "boards/main.board",
      "maps/tea.owm",
      "notes/readme.md",
      "teams/sample.ttm.json",
      "wmap",
    ]);
    const models = modelsFrom({ files, editors: EDITORS });

    expect(models.list()).toEqual(["maps/tea.owm", "teams/sample.ttm.json"]);
  });

  it("is the same array until the port has a new list", () => {
    const files = fakeFiles(["a.owm"]);
    const models = modelsFrom({ files, editors: EDITORS });
    const first = models.list();

    expect(models.list()).toBe(first);
    files.setPaths(["a.owm", "b.owm"]);
    expect(models.list()).toEqual(["a.owm", "b.owm"]);
    expect(models.list()).not.toBe(first);
  });

  it("tells its listener of a change of the port, until it is unsubscribed", () => {
    const files = fakeFiles([]);
    const models = modelsFrom({ files, editors: EDITORS });
    let heard = 0;
    const off = models.onChange(() => void (heard += 1));

    files.setPaths(["a.owm"]);
    expect(heard).toBe(1);
    off();
    files.setPaths([]);
    expect(heard).toBe(1);
  });
});

describe("describe", () => {
  it("names a file by its name without the suffix its editor is registered for", () => {
    const files = fakeFiles(["maps/tea.owm", "teams/sample.ttm.json", "data/plain.json"]);
    const models = modelsFrom({ files, editors: EDITORS });

    expect(models.describe?.("maps/tea.owm")).toEqual({ title: "tea", kind: "Map" });
    // the longest suffix that fits decides, for the kind and for the name
    expect(models.describe?.("teams/sample.ttm.json")).toEqual({
      title: "sample",
      kind: "Topology",
    });
    expect(models.describe?.("data/plain.json")).toEqual({ title: "plain", kind: "Json" });
    expect(models.describe?.("Maps/Tea.OWM")).toEqual({ title: "Tea", kind: "Map" });
  });

  it("tells two files of one name apart by their folder", () => {
    const files = fakeFiles(["canvas/miragon.owm", "other/deep/miragon.owm", "miragon.tt"]);
    const models = modelsFrom({ files, editors: EDITORS });

    expect(models.describe?.("canvas/miragon.owm")?.title).toBe("miragon in canvas");
    expect(models.describe?.("other/deep/miragon.owm")?.title).toBe("miragon in other/deep");
    // the one at the root has no folder to name
    expect(models.describe?.("miragon.tt")?.title).toBe("miragon");
  });

  it("tells two files of one name in one folder apart by their suffix", () => {
    const files = fakeFiles(["maps/tea.owm", "maps/tea.wmap", "tea.tt"]);
    const models = modelsFrom({ files, editors: EDITORS });

    expect(models.describe?.("maps/tea.owm")?.title).toBe("tea.owm in maps");
    expect(models.describe?.("maps/tea.wmap")?.title).toBe("tea.wmap in maps");
    expect(models.describe?.("tea.tt")?.title).toBe("tea");
  });

  it("follows the list: a name that is shared only later gets its folder then", () => {
    const files = fakeFiles(["maps/tea.owm"]);
    const models = modelsFrom({ files, editors: EDITORS });
    const alone = models.describe?.("maps/tea.owm");
    expect(alone?.title).toBe("tea");
    // the same answer for the same list, as a header that renders again asks for it
    expect(models.describe?.("maps/tea.owm")).toBe(alone);

    files.setPaths(["maps/tea.owm", "old/tea.owm"]);
    expect(models.describe?.("maps/tea.owm")?.title).toBe("tea in maps");
    files.setPaths(["maps/tea.owm"]);
    expect(models.describe?.("maps/tea.owm")?.title).toBe("tea");
  });

  it("describes a file that is not listed, against the listed ones", () => {
    const files = fakeFiles(["maps/tea.owm"]);
    const models = modelsFrom({ files, editors: EDITORS });

    expect(models.describe?.("gone/coffee.owm")).toEqual({ title: "coffee", kind: "Map" });
    expect(models.describe?.("gone/tea.owm")?.title).toBe("tea in gone");
    expect(models.list()).toEqual(["maps/tea.owm"]);
  });

  it("leaves a file without an editor to the board's own naming", () => {
    const models = modelsFrom({ files: fakeFiles(["notes/readme.md"]), editors: EDITORS });

    expect(models.describe?.("notes/readme.md")).toBeUndefined();
    expect(models.describe?.("boards/main.board")).toBeUndefined();
    // a file named only the suffix is no model
    expect(models.describe?.("maps/.owm")).toBeUndefined();
  });
});

describe("open", () => {
  it("makes something in the element for a file no editor is registered for, a board among them", () => {
    const models = modelsFrom({ files: fakeFiles(["boards/main.board"]), editors: EDITORS });

    // a card, which the browser tests hold: here only that the board is not left with nothing
    expect(() => models.open(contextFor("boards/main.board"))).toThrow("the element was read");
    expect(() => models.open(contextFor("notes/readme.md"))).toThrow("the element was read");
  });
});
