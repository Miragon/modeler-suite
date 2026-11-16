import { NEW_FILE_LIMIT_BYTES, PICTURE_SUFFIXES } from "@miragon/board-files";
import { describe, expect, it } from "vitest";

import { IMAGE_LIMIT_BYTES, IMAGE_TYPES } from "../../renderer/src/store/actions.js";
import { createFilesHost } from "../src/index.js";
import { fakeFiles } from "./support/fake-files.js";
import { standInEditors } from "./support/stand-in-modeler.js";

describe("createFilesHost", () => {
  it("offers the models and the images of the port, and no part it has nothing for", () => {
    const files = fakeFiles(["plans/plan.items", "assets/logo.png"]);
    const host = createFilesHost({ files, editors: [standInEditors().entry] });

    expect(host.models?.list()).toEqual(["plans/plan.items"]);
    expect(host.images?.taken?.("assets/logo.png")).toBe(true);
    expect(host.references).toBeUndefined();
    expect(host.presence).toBeUndefined();
  });

  it("keeps its parts the same objects, as the board asks of a host", () => {
    const host = createFilesHost({ files: fakeFiles(), editors: [] });
    const { models, images } = host;

    expect(host.models).toBe(models);
    expect(host.images).toBe(images);
  });

  it("ends on dispose what it listens to on the port, and leaves the port to its owner", () => {
    const files = fakeFiles();
    const host = createFilesHost({ files, editors: [] });
    expect(files.listening()).toBe(1);

    host.dispose();

    expect(files.listening()).toBe(0);
    expect(files.disposed).toBe(0);
  });
});

describe("the two limits for a new picture", () => {
  // The files package cannot import the board, so it has the number a second time. A server
  // with a lower limit would refuse a picture the board had just taken.
  it("are one: the files server takes what the board takes", () => {
    expect(NEW_FILE_LIMIT_BYTES).toBe(IMAGE_LIMIT_BYTES);
  });
});

describe("the pictures a host's rule lets a board read", () => {
  // The same reason: the files package names the suffixes a second time. A rule with fewer
  // would refuse the bytes of a picture the board had just stored.
  it("are the ones the board draws", () => {
    expect([...PICTURE_SUFFIXES].sort()).toEqual(Object.keys(IMAGE_TYPES).sort());
  });
});
