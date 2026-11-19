import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APPEARANCE_STORAGE_KEY, type Theme } from "../../core/index.js";
import type { StorageLike } from "../types.js";
import {
  NO_TRANSITION_CLASS,
  connectWebAppearance,
  type WebAppearanceController,
} from "./appearance.js";

const themeColors = { light: "#335DE5", dark: "#1D1D1D" };
const DARK_CAPABLE: readonly Theme[] = ["light", "dark"];
const LIGHT_ONLY: readonly Theme[] = ["light"];

const controllers: WebAppearanceController[] = [];
let frames: FrameRequestCallback[] = [];
let contrastQuery: FakeMediaQuery;

class FakeMediaQuery {
  readonly listeners = new Set<() => void>();
  constructor(
    readonly media: string,
    public matches: boolean,
  ) {}
  addEventListener(_type: "change", listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: "change", listener: () => void) {
    this.listeners.delete(listener);
  }
  change(matches: boolean) {
    this.matches = matches;
    for (const listener of this.listeners) listener();
  }
}

class MemoryStorage implements StorageLike {
  readonly entries = new Map<string, string>();
  readonly calls: string[] = [];
  getItem(key: string) {
    this.calls.push(`get ${key}`);
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.calls.push(`set ${key}=${value}`);
    this.entries.set(key, value);
  }
  removeItem(key: string) {
    this.calls.push(`remove ${key}`);
    this.entries.delete(key);
  }
}

const throwingStorage: StorageLike = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
  removeItem() {
    throw new Error("SecurityError");
  },
};

/** The head markup of a dark-capable web app, as `webHeadMarkup` writes it. */
function writeDarkCapableHead(): void {
  document.head.innerHTML = [
    '<meta name="color-scheme" content="light dark">',
    '<meta name="theme-color" content="#335DE5" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#1D1D1D" media="(prefers-color-scheme: dark)">',
  ].join("");
  document.documentElement.setAttribute("data-cd-theme", "system");
}

function headState() {
  const html = document.documentElement;
  const metas = [...document.querySelectorAll("meta")].map(
    (meta) =>
      `${meta.getAttribute("name")}${meta.hasAttribute("media") ? ` ${meta.getAttribute("media")}` : ""}=${meta.getAttribute("content")}`,
  );
  return { theme: html.getAttribute("data-cd-theme"), metas };
}

function connect(themes: readonly Theme[], storage?: StorageLike) {
  const controller = connectWebAppearance({
    ownerDocument: document,
    themes,
    options: { themeColors, ...(storage ? { storage } : {}) },
  });
  controllers.push(controller);
  return controller;
}

function runFrame(): void {
  const due = frames.splice(0);
  for (const callback of due) callback(0);
}

beforeEach(() => {
  frames = [];
  contrastQuery = new FakeMediaQuery("(prefers-contrast: more)", false);
  vi.spyOn(window, "matchMedia").mockImplementation((query) =>
    query === contrastQuery.media
      ? (contrastQuery as unknown as MediaQueryList)
      : (new FakeMediaQuery(query, false) as unknown as MediaQueryList),
  );
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames[id - 1] = () => {};
  });
});

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
  document.head.replaceChildren();
  const html = document.documentElement;
  for (const name of ["data-cd-theme", "data-cd-kontrast", "class"]) html.removeAttribute(name);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("connectWebAppearance: a dark-capable modeler (guide §13.3)", () => {
  it("throws without options", () => {
    expect(() =>
      connectWebAppearance({ ownerDocument: document, themes: DARK_CAPABLE, options: undefined }),
    ).toThrow(/appearance/);
  });

  it("reads the stored choice; system without one or for a foreign value", () => {
    const storage = new MemoryStorage();
    expect(connect(DARK_CAPABLE, storage).choice()).toBe("system");
    storage.entries.set(APPEARANCE_STORAGE_KEY, "dark");
    expect(connect(DARK_CAPABLE, storage).choice()).toBe("dark");
    storage.entries.set(APPEARANCE_STORAGE_KEY, "sepia");
    expect(connect(DARK_CAPABLE, storage).choice()).toBe("system");
  });

  it("leaves <html> and the metas to the head script until a choice is made", () => {
    writeDarkCapableHead();
    const before = headState();
    const storage = new MemoryStorage();
    storage.entries.set(APPEARANCE_STORAGE_KEY, "dark");
    connect(DARK_CAPABLE, storage);
    expect(headState()).toEqual(before);
  });

  it("stores the choice and applies it on <html> and every meta", () => {
    writeDarkCapableHead();
    const storage = new MemoryStorage();
    const controller = connect(DARK_CAPABLE, storage);

    controller.setChoice("dark");
    expect(storage.entries.get(APPEARANCE_STORAGE_KEY)).toBe("dark");
    expect(controller.choice()).toBe("dark");
    expect(headState()).toEqual({
      theme: "dark",
      metas: [
        "color-scheme=dark",
        "theme-color (prefers-color-scheme: light)=#1D1D1D",
        "theme-color (prefers-color-scheme: dark)=#1D1D1D",
      ],
    });

    controller.setChoice("light");
    expect(storage.entries.get(APPEARANCE_STORAGE_KEY)).toBe("light");
    expect(headState()).toEqual({
      theme: "light",
      metas: [
        "color-scheme=light",
        "theme-color (prefers-color-scheme: light)=#335DE5",
        "theme-color (prefers-color-scheme: dark)=#335DE5",
      ],
    });

    controller.setChoice("system");
    expect(storage.entries.has(APPEARANCE_STORAGE_KEY)).toBe(false);
    expect(storage.calls.at(-1)).toBe(`remove ${APPEARANCE_STORAGE_KEY}`);
    expect(controller.choice()).toBe("system");
    expect(headState()).toEqual({
      theme: "system",
      metas: [
        "color-scheme=light dark",
        "theme-color (prefers-color-scheme: light)=#335DE5",
        "theme-color (prefers-color-scheme: dark)=#1D1D1D",
      ],
    });
  });

  it("creates the metas a page lacks, once", () => {
    const controller = connect(DARK_CAPABLE, new MemoryStorage());
    controller.setChoice("dark");
    controller.setChoice("system");
    expect(headState()).toEqual({
      theme: "system",
      metas: [
        "color-scheme=light dark",
        "theme-color (prefers-color-scheme: light)=#335DE5",
        "theme-color (prefers-color-scheme: dark)=#1D1D1D",
      ],
    });
    expect([...document.head.children].every((child) => child.localName === "meta")).toBe(true);
  });

  it("finds a theme-color meta whatever the spacing of its media", () => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#335DE5" media="(prefers-color-scheme:light)">';
    connect(DARK_CAPABLE, new MemoryStorage()).setChoice("dark");
    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(2);
    expect(
      document.querySelector('meta[media="(prefers-color-scheme:light)"]')?.getAttribute("content"),
    ).toBe("#1D1D1D");
  });

  it("turns transitions off until a nested animation frame", () => {
    const controller = connect(DARK_CAPABLE, new MemoryStorage());
    const html = document.documentElement;
    controller.setChoice("dark");
    expect(html.classList.contains(NO_TRANSITION_CLASS)).toBe(true);
    runFrame();
    expect(html.classList.contains(NO_TRANSITION_CLASS)).toBe(true);
    runFrame();
    expect(html.classList.contains(NO_TRANSITION_CLASS)).toBe(false);
  });

  it("restarts the frame for a second switch within it", () => {
    const controller = connect(DARK_CAPABLE, new MemoryStorage());
    const html = document.documentElement;
    controller.setChoice("dark");
    runFrame();
    controller.setChoice("light");
    runFrame();
    expect(html.classList.contains(NO_TRANSITION_CLASS)).toBe(true);
    runFrame();
    expect(html.classList.contains(NO_TRANSITION_CLASS)).toBe(false);
  });

  it("keeps the choice for the page when the storage throws", () => {
    writeDarkCapableHead();
    const controller = connect(DARK_CAPABLE, throwingStorage);
    expect(controller.choice()).toBe("system");
    expect(() => controller.setChoice("dark")).not.toThrow();
    expect(controller.choice()).toBe("dark");
    expect(headState().theme).toBe("dark");
    expect(() => controller.setChoice("system")).not.toThrow();
    expect(headState().theme).toBe("system");
  });

  it("falls back to globalThis.localStorage", () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, "light");
    const controller = connect(DARK_CAPABLE);
    expect(controller.choice()).toBe("light");
    controller.setChoice("dark");
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("dark");
    controller.setChoice("system");
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull();
  });

  it("applies another tab's choice from its storage event", () => {
    writeDarkCapableHead();
    const controller = connect(DARK_CAPABLE, new MemoryStorage());
    window.dispatchEvent(
      new StorageEvent("storage", { key: APPEARANCE_STORAGE_KEY, newValue: "dark" }),
    );
    expect(controller.choice()).toBe("dark");
    expect(headState().theme).toBe("dark");
    expect(document.documentElement.classList.contains(NO_TRANSITION_CLASS)).toBe(true);

    window.dispatchEvent(new StorageEvent("storage", { key: "other", newValue: "light" }));
    expect(controller.choice()).toBe("dark");

    window.dispatchEvent(
      new StorageEvent("storage", { key: APPEARANCE_STORAGE_KEY, newValue: null }),
    );
    expect(controller.choice()).toBe("system");
    expect(headState().metas).toContain("color-scheme=light dark");

    controller.setChoice("light");
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(controller.choice()).toBe("system");
  });
});

describe("connectWebAppearance: a light-only modeler (guide §13.3)", () => {
  it("needs no options, offers system and changes nothing", () => {
    writeDarkCapableHead();
    const before = headState();
    const storage = new MemoryStorage();
    storage.entries.set(APPEARANCE_STORAGE_KEY, "dark");
    const controller = connectWebAppearance({
      ownerDocument: document,
      themes: LIGHT_ONLY,
      options: { themeColors, storage },
    });
    controllers.push(controller);
    expect(controller.choice()).toBe("system");
    controller.setChoice("dark");
    expect(controller.choice()).toBe("system");
    expect(storage.calls).toEqual([]);
    expect(headState()).toEqual(before);
    expect(document.documentElement.classList.contains(NO_TRANSITION_CLASS)).toBe(false);
    expect(() =>
      connectWebAppearance({
        ownerDocument: document,
        themes: LIGHT_ONLY,
        options: undefined,
      }).destroy(),
    ).not.toThrow();
  });

  it("ignores other tabs' storage events", () => {
    writeDarkCapableHead();
    const controller = connect(LIGHT_ONLY, new MemoryStorage());
    window.dispatchEvent(
      new StorageEvent("storage", { key: APPEARANCE_STORAGE_KEY, newValue: "dark" }),
    );
    expect(controller.choice()).toBe("system");
    expect(headState().theme).toBe("system");
  });
});

describe("connectWebAppearance: contrast, for every web modeler", () => {
  it.each([
    ["light-only", LIGHT_ONLY],
    ["dark-capable", DARK_CAPABLE],
  ])("%s: mirrors prefers-contrast: more at once and on every change", (_label, themes) => {
    const html = document.documentElement;
    contrastQuery.matches = true;
    connect(themes, new MemoryStorage());
    expect(html.getAttribute("data-cd-kontrast")).toBe("hoch");
    contrastQuery.change(false);
    expect(html.hasAttribute("data-cd-kontrast")).toBe(false);
    contrastQuery.change(true);
    expect(html.getAttribute("data-cd-kontrast")).toBe("hoch");
  });

  it("uses addListener where a media query list has no addEventListener", () => {
    const legacy = {
      matches: false,
      listener: undefined as (() => void) | undefined,
      addListener(listener: () => void) {
        this.listener = listener;
      },
      removeListener() {
        this.listener = undefined;
      },
    };
    vi.mocked(window.matchMedia).mockImplementation(() => legacy as unknown as MediaQueryList);
    const controller = connect(LIGHT_ONLY);
    legacy.matches = true;
    legacy.listener?.();
    expect(document.documentElement.getAttribute("data-cd-kontrast")).toBe("hoch");
    controller.destroy();
    expect(legacy.listener).toBeUndefined();
  });
});

describe("connectWebAppearance: destroy", () => {
  it("stops following contrast and storage events and leaves <html> as it is", () => {
    writeDarkCapableHead();
    const html = document.documentElement;
    const controller = connect(DARK_CAPABLE, new MemoryStorage());
    controller.setChoice("dark");
    runFrame();
    runFrame();
    controller.destroy();
    contrastQuery.change(true);
    expect(html.hasAttribute("data-cd-kontrast")).toBe(false);
    window.dispatchEvent(
      new StorageEvent("storage", { key: APPEARANCE_STORAGE_KEY, newValue: "light" }),
    );
    expect(headState().theme).toBe("dark");
    expect(contrastQuery.listeners.size).toBe(0);
  });

  it("cancels a pending frame and lets transitions run again", () => {
    const html = document.documentElement;
    const controller = connect(DARK_CAPABLE, new MemoryStorage());
    controller.setChoice("dark");
    controller.destroy();
    expect(html.classList.contains(NO_TRANSITION_CLASS)).toBe(false);
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    runFrame();
    expect(html.classList.contains(NO_TRANSITION_CLASS)).toBe(false);
  });
});
