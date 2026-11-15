/**
 * What the board reads of its host (src/host/defaults.ts): the answer of a host that offers
 * nothing, and the same object per host, which React needs of an external store.
 */
import { describe, expect, it } from "vitest";

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
    const { read, store, onChange: onImages } = imagesOf(host);
    expect(read(IMAGE_PATH)).toBeInstanceOf(Blob);
    store?.(IMAGE_PATH, new Blob());
    expect(pictures.stored).toEqual([IMAGE_PATH]);
    onImages(nobody)();
    const { list: listReferences, onChange: onReferences } = referencesOf(host);
    expect(listReferences()).toEqual([]);
    onReferences(nobody)();
  });
});
