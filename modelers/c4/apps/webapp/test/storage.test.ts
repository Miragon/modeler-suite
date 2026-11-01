import { afterEach, describe, expect, it, vi } from "vitest";
import {
  forgetStoredDocument,
  readLegendOpen,
  readStoredDocument,
  storeDocument,
  writeLegendOpen,
} from "../src/storage.js";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, String(value)),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("the autosave", () => {
  it("keeps the workspace and its view under the app's keys", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    expect(readStoredDocument()).toBeUndefined();
    storeDocument("workspace {\n}\n", "Containers-shop");
    expect(storage.getItem("c4-modeler.document")).toBe("workspace {\n}\n");
    expect(storage.getItem("c4-modeler.view")).toBe("Containers-shop");
    storeDocument("workspace {\n}\n", "SystemLandscape");
    expect(readStoredDocument()).toEqual({ text: "workspace {\n}\n", view: "SystemLandscape" });
    forgetStoredDocument();
    expect(readStoredDocument()).toBeUndefined();
    expect(storage.length).toBe(0);
  });

  it("remembers whether the legend was open, and nothing before the first toggle", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(readLegendOpen()).toBeUndefined();
    writeLegendOpen(true);
    expect(readLegendOpen()).toBe(true);
    writeLegendOpen(false);
    expect(readLegendOpen()).toBe(false);
  });

  it("keeps nothing and throws nothing where the browser refuses the storage", () => {
    const refusing = memoryStorage();
    const refuse = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Object.assign(refusing, { getItem: refuse, setItem: refuse, removeItem: refuse });
    vi.stubGlobal("localStorage", refusing);
    expect(() => storeDocument("workspace {\n}\n", "SystemLandscape")).not.toThrow();
    expect(readStoredDocument()).toBeUndefined();
    expect(() => forgetStoredDocument()).not.toThrow();
    expect(() => writeLegendOpen(true)).not.toThrow();
    expect(readLegendOpen()).toBeUndefined();
  });
});
