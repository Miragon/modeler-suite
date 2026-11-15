/**
 * What the board reads of its host (src/host/defaults.ts): the answer of a host that offers
 * nothing, and the same object per host, which React needs of an external store.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { describeModel, imagesOf, modelListOf, referencesOf } from "../src/host/defaults.js";
import type {
  BoardHost,
  BoardImages,
  BoardModels,
  BoardReference,
  BoardReferences,
  ModelDescription,
} from "../src/host/types.js";
import { IMAGE_PATH, MODEL_PATH } from "./support/board-texts.js";
import { createTestHost } from "./support/test-host.js";

describe("the title of a model", () => {
  it("is the file name up to its first dot, with no kind, where the host says nothing", () => {
    expect(describeModel({}, "processes/order-to-cash.bpmn")).toEqual({ title: "order-to-cash" });
    expect(describeModel({}, "maps/teams.ttm.json")).toEqual({ title: "teams" });
    expect(describeModel({}, "README")).toEqual({ title: "README" });
    expect(describeModel({}, "")).toEqual({ title: "" });
    expect(Object.keys(describeModel({}, "processes/order-to-cash.bpmn"))).toEqual(["title"]);
  });

  it("keeps the dot a file name begins with", () => {
    expect(describeModel({}, "notes/.hidden.bpmn")).toEqual({ title: ".hidden" });
    expect(describeModel({}, ".hidden")).toEqual({ title: ".hidden" });
  });

  it("is the host's own answer, passed on as it is", () => {
    const order: ModelDescription = { title: "Order to cash", kind: "BPMN" };
    const host = createTestHost({ describe: { [MODEL_PATH]: order } });
    expect(describeModel(host, MODEL_PATH)).toBe(order);
  });

  it("falls back for a path the host does not describe, and for a host without describe", () => {
    const describing = createTestHost({ describe: {} });
    expect(describing.models?.describe).toBeTypeOf("function");
    expect(describeModel(describing, MODEL_PATH)).toEqual({ title: "order-to-cash" });
    const silent = createTestHost();
    expect(silent.models?.describe).toBeUndefined();
    expect(describeModel(silent, MODEL_PATH)).toEqual({ title: "order-to-cash" });
  });

  it("is the same object for the same host and path, and another one per host", () => {
    const host: BoardHost = {};
    expect(describeModel(host, MODEL_PATH)).toBe(describeModel(host, MODEL_PATH));
    expect(describeModel(host, MODEL_PATH)).not.toBe(describeModel(host, "other.bpmn"));
    expect(describeModel(host, MODEL_PATH)).not.toBe(describeModel({}, MODEL_PATH));
  });
});

describe("a host that offers nothing", () => {
  it("has a model list that is empty and never changes", () => {
    const models = modelListOf({});
    expect(models.list()).toEqual([]);
    expect(models.list()).toBe(models.list());
    expect(modelListOf({})).toBe(models);
    const unsubscribe = models.onChange(() => {
      throw new Error("an empty list reported a change");
    });
    expect(unsubscribe).toBeTypeOf("function");
    unsubscribe();
  });

  it("has no image and stores none", () => {
    const images = imagesOf({});
    expect(images.read(IMAGE_PATH)).toBeUndefined();
    expect(images.store).toBeUndefined();
    expect(imagesOf({})).toBe(images);
    images.onChange(() => undefined)();
  });

  it("lists no reference", () => {
    const references = referencesOf({});
    expect(references.list()).toEqual([]);
    expect(references.list()).toBe(references.list());
    expect(referencesOf({})).toBe(references);
    references.onChange(() => undefined)();
  });
});

describe("a host's own parts", () => {
  it("come back as the same object for as long as the host holds the same part", () => {
    const host = createTestHost();
    expect(modelListOf(host)).toBe(modelListOf(host));
    expect(imagesOf(host)).toBe(imagesOf(host));
    expect(referencesOf(host)).toBe(referencesOf(host));
    expect(modelListOf(createTestHost())).not.toBe(modelListOf(host));
  });

  it("are read through the host: the same list until a change, which the listener hears once", () => {
    const host = createTestHost();
    const models = modelListOf(host);
    const before = models.list();
    expect(before).toEqual([MODEL_PATH]);
    expect(models.list()).toBe(before);

    let changes = 0;
    const unsubscribe = models.onChange(() => changes++);
    host.setModels([MODEL_PATH, "processes/credit-limit-check.dmn"]);
    expect(changes).toBe(1);
    expect(models.list()).toEqual([MODEL_PATH, "processes/credit-limit-check.dmn"]);
    expect(models.list()).not.toBe(before);

    unsubscribe();
    host.setModels([]);
    expect(changes).toBe(1);
    expect(models.list()).toEqual([]);
  });

  it("answer for images and references as the host does", () => {
    const calls: BoardReference = { from: MODEL_PATH, to: "processes/sub.bpmn", relation: "calls" };
    const host = createTestHost({ references: [calls] });
    const images = imagesOf(host);
    const references = referencesOf(host);
    expect(images.read(IMAGE_PATH)).toBeInstanceOf(Blob);
    expect(images.read(IMAGE_PATH)).toBe(images.read(IMAGE_PATH));
    expect(images.read("assets/none.png")).toBeUndefined();
    expect(references.list()).toEqual([calls]);

    let imageChanges = 0;
    let referenceChanges = 0;
    images.onChange(() => imageChanges++);
    references.onChange(() => referenceChanges++);
    host.setImage(IMAGE_PATH, undefined);
    host.setReferences([]);
    expect([imageChanges, referenceChanges]).toEqual([1, 1]);
    expect(images.read(IMAGE_PATH)).toBeUndefined();
    expect(references.list()).toEqual([]);
  });

  it("offer to store an image only where the host stores", () => {
    expect(imagesOf(createTestHost()).store).toBeUndefined();
    const host = createTestHost({ canStore: true });
    const bytes = new Blob(["png"], { type: "image/png" });
    imagesOf(host).store?.("assets/new.png", bytes);
    expect(host.stored).toEqual([{ path: "assets/new.png", bytes }]);
    expect(imagesOf(host).read("assets/new.png")).toBe(bytes);
  });

  it("offer to ask whether a path is taken only where the host answers that", () => {
    expect(imagesOf(createTestHost({ canStore: true })).taken).toBeUndefined();
    const asked: string[] = [];
    const port: BoardImages = {
      read: () => undefined,
      onChange: () => () => undefined,
      taken(path) {
        asked.push(path);
        return path === "assets/plan.svg";
      },
    };
    const { taken } = imagesOf({ images: port });
    expect(taken?.("assets/plan.svg")).toBe(true);
    expect(taken?.("assets/new.svg")).toBe(false);
    expect(asked).toEqual(["assets/plan.svg", "assets/new.svg"]);
  });

  it("hand on what the host's store returns, a promise included", async () => {
    const stored = Promise.resolve();
    const port: BoardImages = {
      read: () => undefined,
      onChange: () => () => undefined,
      store: () => stored,
    };
    const answer = imagesOf({ images: port }).store?.("assets/new.png", new Blob());
    expect(answer).toBe(stored);
    await answer;
  });

  it("are never called unbound, so a host may be written as classes", () => {
    // a private field read on anything but the instance throws
    class Models implements BoardModels {
      readonly #paths: readonly string[] = [MODEL_PATH];
      readonly #listeners = new Set<() => void>();
      list(): readonly string[] {
        return this.#paths;
      }
      onChange(listener: () => void): () => void {
        this.#listeners.add(listener);
        return () => void this.#listeners.delete(listener);
      }
      open(): undefined {
        return undefined;
      }
    }
    class Images implements BoardImages {
      readonly #bytes = new Blob(["svg"]);
      readonly #listeners = new Set<() => void>();
      readonly stored: string[] = [];
      read(): Blob {
        return this.#bytes;
      }
      onChange(listener: () => void): () => void {
        this.#listeners.add(listener);
        return () => void this.#listeners.delete(listener);
      }
      store(path: string): void {
        this.stored.push(path);
      }
      taken(path: string): boolean {
        return this.stored.includes(path);
      }
    }
    class References implements BoardReferences {
      readonly #list: readonly BoardReference[] = [];
      readonly #listeners = new Set<() => void>();
      list(): readonly BoardReference[] {
        return this.#list;
      }
      onChange(listener: () => void): () => void {
        this.#listeners.add(listener);
        return () => void this.#listeners.delete(listener);
      }
    }
    const pictures = new Images();
    const host: BoardHost = {
      models: new Models(),
      images: pictures,
      references: new References(),
    };
    const nobody = (): void => undefined;

    const { list, onChange } = modelListOf(host);
    expect(list()).toEqual([MODEL_PATH]);
    onChange(nobody)();
    const { read, store, taken, onChange: onImages } = imagesOf(host);
    expect(read(IMAGE_PATH)).toBeInstanceOf(Blob);
    expect(taken?.(IMAGE_PATH)).toBe(false);
    void store?.(IMAGE_PATH, new Blob());
    expect(pictures.stored).toEqual([IMAGE_PATH]);
    expect(taken?.(IMAGE_PATH)).toBe(true);
    onImages(nobody)();
    const { list: listReferences, onChange: onReferences } = referencesOf(host);
    expect(listReferences()).toEqual([]);
    onReferences(nobody)();
  });
});

describe("a host whose calls go wrong", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** what the board said through console.error, as the lines a person reads */
  function reports(): () => string[] {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    return () => spy.mock.calls.map((call) => call.slice(0, 2).join(" "));
  }

  const never = (): (() => void) => () => undefined;
  const calls: BoardReference = { from: MODEL_PATH, to: "processes/sub.bpmn", relation: "calls" };

  it("hands out the list before while a new array of the model list holds the same entries", () => {
    let paths = [MODEL_PATH, "processes/other.bpmn"];
    const host: BoardHost = {
      models: { list: () => [...paths], onChange: never, open: () => undefined },
    };
    const { list } = modelListOf(host);
    const first = list();
    expect(first).toEqual(paths);
    expect(list()).toBe(first);

    paths = ["processes/other.bpmn", MODEL_PATH];
    const reordered = list();
    expect(reordered).toEqual(paths);
    expect(reordered).not.toBe(first);
    paths = [MODEL_PATH];
    expect(list()).toEqual([MODEL_PATH]);
    expect(list()).toBe(list());
  });

  it("hands out the list before while a new array of references says the same", () => {
    let listed: BoardReference[] = [calls];
    const host: BoardHost = {
      references: { list: () => listed.map((reference) => ({ ...reference })), onChange: never },
    };
    const { list } = referencesOf(host);
    const first = list();
    expect(first).toEqual([calls]);
    expect(list()).toBe(first);

    for (const changed of [
      { ...calls, from: "processes/other.bpmn" },
      { ...calls, to: "processes/other.bpmn" },
      { ...calls, relation: "decides" },
    ]) {
      listed = [changed];
      expect(list()).toEqual([changed]);
    }
    listed = [];
    expect(list()).toEqual([]);
    expect(list()).toBe(list());
  });

  it("answers a list() that throws with the list before it, and reports it once", () => {
    const said = reports();
    let answer: "throws" | readonly string[] = "throws";
    let listedReferences: "throws" | readonly BoardReference[] = "throws";
    const host: BoardHost = {
      models: {
        list() {
          if (answer === "throws") throw new Error("the repository is not read yet");
          return answer;
        },
        onChange: never,
        open: () => undefined,
      },
      references: {
        list() {
          if (listedReferences === "throws") throw new Error("the index is not loaded yet");
          return listedReferences;
        },
        onChange: never,
      },
    };
    const models = modelListOf(host);
    const references = referencesOf(host);

    // nothing good yet: the empty list, and the same one on every call
    expect(models.list()).toEqual([]);
    expect(models.list()).toBe(models.list());
    expect(references.list()).toEqual([]);
    expect(references.list()).toBe(references.list());

    answer = [MODEL_PATH];
    listedReferences = [calls];
    const paths = models.list();
    const listed = references.list();
    expect(paths).toBe(answer);
    expect(listed).toBe(listedReferences);

    answer = "throws";
    listedReferences = "throws";
    expect(models.list()).toBe(paths);
    expect(references.list()).toBe(listed);
    expect(said()).toEqual([
      "[board] host.models.list() failed: the repository is not read yet",
      "[board] host.references.list() failed: the index is not loaded yet",
    ]);
  });

  it("answers a list() that returns no array with the list before it", () => {
    const said = reports();
    const host: BoardHost = {
      models: {
        list: () => undefined as unknown as readonly string[],
        onChange: never,
        open: () => undefined,
      },
    };
    expect(modelListOf(host).list()).toEqual([]);
    expect(modelListOf(host).list()).toBe(modelListOf(host).list());
    expect(said()).toEqual(["[board] host.models.list() failed: it returned no array"]);
  });

  it("names a model by its file where describe() throws, and reports it once", () => {
    const said = reports();
    const order: ModelDescription = { title: "Order to cash", kind: "BPMN" };
    const host: BoardHost = {
      models: {
        list: () => [],
        onChange: never,
        open: () => undefined,
        describe(path) {
          if (path === MODEL_PATH) return order;
          throw new Error(`no title for ${path}`);
        },
      },
    };
    expect(describeModel(host, "processes/broken.bpmn")).toEqual({ title: "broken" });
    expect(describeModel(host, "decisions/discount.dmn")).toEqual({ title: "discount" });
    expect(describeModel(host, "processes/broken.bpmn")).toBe(
      describeModel(host, "processes/broken.bpmn"),
    );
    expect(describeModel(host, MODEL_PATH)).toBe(order);
    expect(said()).toEqual([
      "[board] host.models.describe() failed: no title for processes/broken.bpmn",
    ]);
  });

  it("never asks the host to describe an empty path", () => {
    const asked: string[] = [];
    const host: BoardHost = {
      models: {
        list: () => [],
        onChange: never,
        open: () => undefined,
        describe(path) {
          asked.push(path);
          return { title: `described ${path}` };
        },
      },
    };
    expect(describeModel(host, "")).toEqual({ title: "" });
    expect(asked).toEqual([]);
    expect(describeModel(host, MODEL_PATH)).toEqual({ title: `described ${MODEL_PATH}` });
    expect(asked).toEqual([MODEL_PATH]);
  });
});
