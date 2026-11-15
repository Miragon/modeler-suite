import { describe, expect, it } from "vitest";

import { imagesFrom } from "../src/index.js";
import { fakeFiles, settled } from "./support/fake-files.js";

const picture = (text: string): Blob => new Blob([text], { type: "image/png" });

describe("read", () => {
  it("answers nothing until the bytes are there, then the same Blob until a change", async () => {
    const files = fakeFiles(["assets/logo.png"]);
    const images = imagesFrom(files);
    let heard = 0;
    images.onChange(() => void (heard += 1));

    expect(images.read("assets/logo.png")).toBeUndefined();
    expect(images.read("assets/logo.png")).toBeUndefined();
    // a node that renders again does not ask the port again
    expect(files.reads).toEqual(["assets/logo.png"]);
    expect(heard).toBe(0);

    const logo = picture("logo");
    files.pending[0]?.answer(logo);
    await settled();
    expect(heard).toBe(1);
    expect(images.read("assets/logo.png")).toBe(logo);
    expect(images.read("assets/logo.png")).toBe(logo);
    expect(files.reads).toHaveLength(1);
  });

  it("asks once for a file that is not there and tells nobody", async () => {
    const files = fakeFiles([]);
    const images = imagesFrom(files);
    let heard = 0;
    images.onChange(() => void (heard += 1));

    images.read("assets/none.png");
    files.pending[0]?.answer(undefined);
    await settled();
    expect(images.read("assets/none.png")).toBeUndefined();
    expect(files.reads).toEqual(["assets/none.png"]);
    expect(heard).toBe(0);
  });

  it("takes a read that fails for a missing file", async () => {
    const files = fakeFiles([]);
    const images = imagesFrom(files);
    images.read("assets/broken.png");
    files.pending[0]?.fail(new Error("no such file"));
    await settled();

    expect(images.read("assets/broken.png")).toBeUndefined();
    expect(files.reads).toHaveLength(1);
  });

  it("never asks the port for an empty path", () => {
    const files = fakeFiles([]);
    expect(imagesFrom(files).read("")).toBeUndefined();
    expect(files.reads).toEqual([]);
  });
});

describe("a change of the bytes", () => {
  it("keeps the Blob it handed out until the new one is there", async () => {
    const files = fakeFiles(["assets/logo.png"]);
    const images = imagesFrom(files);
    let heard = 0;
    images.onChange(() => void (heard += 1));
    images.read("assets/logo.png");
    const first = picture("first");
    files.pending[0]?.answer(first);
    await settled();

    files.tellBytesChanged(["assets/logo.png", "assets/never-shown.png"]);
    // only what a node has asked for is loaded again
    expect(files.reads).toEqual(["assets/logo.png", "assets/logo.png"]);
    expect(images.read("assets/logo.png")).toBe(first);
    expect(heard).toBe(1);

    const second = picture("second");
    files.pending[1]?.answer(second);
    await settled();
    expect(images.read("assets/logo.png")).toBe(second);
    expect(heard).toBe(2);
  });

  it("tells when an image that was shown is gone", async () => {
    const files = fakeFiles(["assets/logo.png"]);
    const images = imagesFrom(files);
    let heard = 0;
    images.onChange(() => void (heard += 1));
    images.read("assets/logo.png");
    files.pending[0]?.answer(picture("logo"));
    await settled();

    files.tellBytesChanged(["assets/logo.png"]);
    files.pending[1]?.answer(undefined);
    await settled();
    expect(images.read("assets/logo.png")).toBeUndefined();
    expect(heard).toBe(2);
  });

  it("drops the answer of a load that a later one overtook", async () => {
    const files = fakeFiles(["assets/logo.png"]);
    const images = imagesFrom(files);
    images.read("assets/logo.png");
    files.tellBytesChanged(["assets/logo.png"]);
    const [early, late] = files.pending;

    const newest = picture("newest");
    late?.answer(newest);
    await settled();
    early?.answer(picture("stale"));
    await settled();
    expect(images.read("assets/logo.png")).toBe(newest);
  });
});

describe("taken", () => {
  it("answers from the port's list, loaded or not, and follows a new list", () => {
    const files = fakeFiles(["assets/logo.png", "maps/tea.owm"]);
    const images = imagesFrom(files);

    expect(images.taken?.("assets/logo.png")).toBe(true);
    expect(images.taken?.("maps/tea.owm")).toBe(true);
    expect(images.taken?.("assets/free.png")).toBe(false);
    // asking whether a name is free loads nothing
    expect(files.reads).toEqual([]);

    files.setPaths(["assets/free.png"]);
    expect(images.taken?.("assets/free.png")).toBe(true);
    expect(images.taken?.("assets/logo.png")).toBe(false);
  });
});

describe("store", () => {
  it("has the bytes at hand before it tells, so the new node draws at once", async () => {
    const files = fakeFiles([]);
    const images = imagesFrom(files);
    const stored = picture("new");
    const readWhenTold: Array<Blob | undefined> = [];
    images.onChange(() => readWhenTold.push(images.read("assets/new.png")));

    await images.store?.("assets/new.png", stored);

    expect(files.created).toEqual([{ path: "assets/new.png", bytes: stored }]);
    expect(readWhenTold).toEqual([stored]);
    expect(images.read("assets/new.png")).toBe(stored);
    // the port's list may lag behind: the name is in use all the same
    expect(images.taken?.("assets/new.png")).toBe(true);
    expect(files.reads).toEqual([]);
  });

  it("is not undone by an earlier question for that path that is answered later", async () => {
    const files = fakeFiles([]);
    const images = imagesFrom(files);
    // a node already shows the path, and the port has not said yet that there is no such file
    images.read("assets/new.png");
    const stored = picture("new");

    await images.store?.("assets/new.png", stored);
    files.pending[0]?.answer(undefined);
    await settled();

    expect(images.read("assets/new.png")).toBe(stored);
  });

  it("passes the port's refusal on and keeps nothing", async () => {
    const files = fakeFiles(["assets/logo.png"]);
    files.refusing.set("assets/logo.png", "assets/logo.png exists already");
    const images = imagesFrom(files);
    let heard = 0;
    images.onChange(() => void (heard += 1));

    await expect(images.store?.("assets/logo.png", picture("other"))).rejects.toThrow(
      "assets/logo.png exists already",
    );
    expect(heard).toBe(0);
    expect(files.created).toEqual([]);
  });

  it("is absent where the port stores no file, so the board offers no Image button", () => {
    const images = imagesFrom(fakeFiles([], { storing: false }));
    expect(images.store).toBeUndefined();
  });
});

describe("dispose", () => {
  it("stops listening to the port and tells nobody of a load that ends later", async () => {
    const files = fakeFiles(["assets/logo.png"]);
    const images = imagesFrom(files);
    let heard = 0;
    images.onChange(() => void (heard += 1));
    images.read("assets/logo.png");

    images.dispose();
    files.pending[0]?.answer(picture("late"));
    await settled();
    files.tellBytesChanged(["assets/logo.png"]);

    expect(heard).toBe(0);
    expect(files.reads).toEqual(["assets/logo.png"]);
    expect(files.listening()).toBe(0);
  });
});
