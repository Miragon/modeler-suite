import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShellHandle, ShellOptions } from "../../dom/index.js";
import { appearanceMessage, mountVsCodeShell, type VsCodeShellOptions } from "./index.js";

const dom = vi.hoisted(() => ({ mountShell: vi.fn() }));
vi.mock("../../dom/index.js", () => dom);

function fakeShell(root: HTMLElement, options: ShellOptions): ShellHandle {
  return {
    root,
    canvas: document.createElement("div"),
    host: options.host,
    lang: "en",
    platform: "mac",
    messages: {} as ShellHandle["messages"],
    menu: {} as ShellHandle["menu"],
    tooltip: {} as ShellHandle["tooltip"],
    legend: undefined,
    inspector: undefined,
    primary: undefined,
    appearance: undefined,
    setZoomTarget: vi.fn(),
    fitInsets: vi.fn(() => ({ top: 64, right: 12, bottom: 64, left: 12 })),
    registerPalette: vi.fn(() => () => undefined),
    setProblems: vi.fn(),
    setStatus: vi.fn(),
    setEmptyHint: vi.fn(),
    setReadOnly: vi.fn(),
    isReadOnly: vi.fn(() => true),
    setEmptyState: vi.fn(),
    isEmptyStateShown: vi.fn(() => false),
    toast: vi.fn(() => ({ dismiss: () => undefined })),
    showShortcutsDialog: vi.fn(() => ({ isOpen: () => true, close: () => undefined })),
    destroy: vi.fn(),
  };
}

function post(data: unknown): void {
  window.dispatchEvent(new MessageEvent("message", { data }));
}

let root: HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  dom.mountShell.mockImplementation(fakeShell);
  root = document.createElement("div");
  document.body.append(root);
  document.documentElement.setAttribute("data-cd-theme", "light");
});

afterEach(() => {
  vi.unstubAllGlobals();
  dom.mountShell.mockReset();
  root.remove();
  document.documentElement.removeAttribute("data-cd-theme");
  document.documentElement.removeAttribute("data-cd-kontrast");
  document.documentElement.classList.remove("cd-shell-no-transition");
});

describe("mountVsCodeShell", () => {
  it("mounts the shell for the ide host with the key listener on document", () => {
    const options: VsCodeShellOptions = {
      themes: ["light"],
      lang: "en",
      problems: { onActivate: () => undefined },
    };
    const shell = mountVsCodeShell(root, options);

    expect(dom.mountShell).toHaveBeenCalledTimes(1);
    const [mountedRoot, mountedOptions] = dom.mountShell.mock.calls[0] as [
      HTMLElement,
      ShellOptions,
    ];
    expect(mountedRoot).toBe(root);
    expect(mountedOptions).toEqual({
      themes: ["light"],
      lang: "en",
      problems: options.problems,
      host: "ide",
      keyScope: "document",
    });
    expect(shell.host).toBe("ide");
    shell.destroy();
  });

  it("wins over a host or keyScope smuggled in at runtime", () => {
    const smuggled = {
      themes: ["light"],
      host: "web",
      keyScope: "root",
    } as unknown as VsCodeShellOptions;
    mountVsCodeShell(root, smuggled).destroy();

    expect(dom.mountShell.mock.calls[0]?.[1]).toMatchObject({ host: "ide", keyScope: "document" });
  });

  it("applies appearance messages resolved against the themes while mounted", () => {
    const shell = mountVsCodeShell(root, { themes: ["light"] });

    post(appearanceMessage({ theme: "dark", kontrast: "hoch" }));

    expect(document.documentElement.getAttribute("data-cd-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-cd-kontrast")).toBe("hoch");
    shell.destroy();
  });

  it("disconnects the appearance listener on destroy and destroys the shell", () => {
    const shell = mountVsCodeShell(root, { themes: ["light", "dark"] });
    const inner = dom.mountShell.mock.results[0]?.value as ShellHandle;

    shell.destroy();
    post(appearanceMessage({ theme: "dark" }));

    expect(inner.destroy).toHaveBeenCalledTimes(1);
    expect(document.documentElement.getAttribute("data-cd-theme")).toBe("light");
  });

  it("delegates every other member to the mounted shell", () => {
    const shell = mountVsCodeShell(root, { themes: ["light"] });
    const inner = dom.mountShell.mock.results[0]?.value as ShellHandle;
    const status = { severity: "danger" as const, text: "Invalid" };

    expect(shell.root).toBe(inner.root);
    expect(shell.canvas).toBe(inner.canvas);
    expect(shell.lang).toBe("en");
    expect(shell.platform).toBe("mac");
    expect(shell.messages).toBe(inner.messages);
    expect(shell.menu).toBe(inner.menu);
    expect(shell.tooltip).toBe(inner.tooltip);
    expect(shell.legend).toBeUndefined();
    expect(shell.inspector).toBeUndefined();
    expect(shell.fitInsets()).toEqual({ top: 64, right: 12, bottom: 64, left: 12 });
    expect(shell.isReadOnly()).toBe(true);

    shell.setZoomTarget(null);
    shell.setProblems({ count: 2, errors: 1 });
    shell.setStatus(status, { delayMs: 800 });
    shell.setEmptyHint(true);
    shell.setReadOnly(true, { delayMs: 800 });
    const palette = { element: root, entryTooltip: () => null, setReadOnly: () => undefined };
    shell.registerPalette(palette);
    const groups = [{ title: "Edit", rows: [{ action: "Undo", keys: ["⌘Z"] }] }];
    expect(shell.showShortcutsDialog(groups).isOpen()).toBe(true);

    expect(inner.showShortcutsDialog).toHaveBeenCalledWith(groups);
    expect(inner.setZoomTarget).toHaveBeenCalledWith(null);
    expect(inner.setProblems).toHaveBeenCalledWith({ count: 2, errors: 1 });
    expect(inner.setStatus).toHaveBeenCalledWith(status, { delayMs: 800 });
    expect(inner.setEmptyHint).toHaveBeenCalledWith(true);
    expect(inner.setReadOnly).toHaveBeenCalledWith(true, { delayMs: 800 });
    expect(inner.registerPalette).toHaveBeenCalledWith(palette);
    shell.destroy();
  });

  it("disconnects the appearance listener when mounting fails", () => {
    dom.mountShell.mockImplementation(() => {
      throw new Error("mount failed");
    });
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");

    expect(() => mountVsCodeShell(root, { themes: ["light", "dark"] })).toThrow("mount failed");

    const listener = addEventListener.mock.calls.find(([type]) => type === "message")?.[1];
    expect(listener).toBeDefined();
    expect(removeEventListener).toHaveBeenCalledWith("message", listener);
    post(appearanceMessage({ theme: "dark" }));
    expect(document.documentElement.getAttribute("data-cd-theme")).toBe("light");
    vi.restoreAllMocks();
  });

  it("mounts nothing without themes", () => {
    expect(() => mountVsCodeShell(root, { themes: [] })).toThrow(/at least one theme/);
    expect(dom.mountShell).not.toHaveBeenCalled();
  });
});
