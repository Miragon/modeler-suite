import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REDUCED_MOTION_CLASS, defaultMessages, type ToastRequest } from "../../core/index.js";
import {
  TOAST_ANNOUNCE_DELAY_MS,
  TOAST_LEAVE_FALLBACK_MS,
  createToaster,
  type Toaster,
  type ToasterContext,
} from "./toasts.js";

let toasters: Toaster[] = [];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const toaster of toasters.splice(0)) toaster.destroy();
  document.body.replaceChildren();
  document.documentElement.className = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

interface PopoverCalls {
  calls: string[];
}

/** happy-dom has no popover API: records show/hide like a browser's top layer would see them. */
function stubPopover(element: HTMLElement, onHide?: () => void): PopoverCalls {
  const record: PopoverCalls = { calls: [] };
  let open = false;
  const matches = element.matches.bind(element);
  Object.assign(element, {
    showPopover: () => {
      open = true;
      record.calls.push("show");
    },
    hidePopover: () => {
      open = false;
      record.calls.push("hide");
      onHide?.();
    },
    matches: (selector: string) => (selector === ":popover-open" ? open : matches(selector)),
  });
  return record;
}

/** A shown modal dialog, as `:modal` finds it. */
function openModal(): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  document.body.append(dialog);
  const querySelector = document.querySelector.bind(document);
  vi.spyOn(document, "querySelector").mockImplementation((selector: string) =>
    selector === ":modal" ? dialog : querySelector(selector),
  );
  return dialog;
}

function setup(overrides: Partial<ToasterContext> = {}) {
  const focusFallback = vi.fn();
  const toaster = createToaster({
    ownerDocument: document,
    host: "web",
    messages: defaultMessages,
    idPrefix: "cd-shell-toast-1",
    focusFallback,
    ...overrides,
  });
  toasters.push(toaster);
  const popover = stubPopover(toaster.element);
  document.body.append(toaster.announcer, toaster.element);
  return { toaster, stack: toaster.element, focusFallback, popover };
}

function cards(stack: HTMLElement): HTMLElement[] {
  return [...stack.querySelectorAll<HTMLElement>(".cd-shell-toast:not([data-leaving])")];
}

function texts(stack: HTMLElement): string[] {
  return cards(stack).map((card) => card.querySelector(".cd-shell-toast-text")?.textContent ?? "");
}

function closeButton(card: HTMLElement | undefined): HTMLButtonElement {
  const button = card?.querySelector<HTMLButtonElement>(".cd-shell-toast-close");
  if (!button) throw new Error("no Close button");
  return button;
}

const success = (text = "Link copied"): ToastRequest => ({ status: "success", text });

describe("toaster: markup (guide §8)", () => {
  it("renders the stack and a card with dot, text and Close", () => {
    const { toaster, stack } = setup();
    expect(stack.className).toBe("cd-shell-toasts");
    expect(stack.dataset.chrome).toBe("toasts");
    expect(stack.children).toHaveLength(0);

    toaster.show(success());
    const [card] = cards(stack);
    // The live regions speak for it; a live card would be read twice.
    expect(card?.hasAttribute("role")).toBe(false);
    expect(card?.dataset.status).toBe("success");
    const dot = card?.querySelector(".cd-shell-toast-dot");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(texts(stack)).toEqual(["Link copied"]);
    const close = closeButton(card);
    expect(close.type).toBe("button");
    expect(close.getAttribute("aria-label")).toBe("Close");
    expect(close.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(card?.lastElementChild).toBe(close);
  });

  it("describes each Close button by its toast's text", () => {
    const { toaster, stack } = setup();
    toaster.show(success("one"));
    toaster.show(success("two"));
    const [first, second] = cards(stack).map((card) => {
      const describedBy = closeButton(card).getAttribute("aria-describedby") ?? "";
      return document.getElementById(describedBy)?.textContent;
    });
    expect([first, second]).toEqual(["one", "two"]);
  });
});

describe("toaster: live regions (guide §8, §12)", () => {
  function regions(toaster: Toaster) {
    const [polite, assertive] = [...toaster.announcer.children] as HTMLElement[];
    return { polite: polite!, assertive: assertive! };
  }

  it("keeps a polite status region and an alert region rendered before any toast", () => {
    const { toaster } = setup();
    const { polite, assertive } = regions(toaster);
    expect(toaster.announcer.isConnected).toBe(true);
    expect(toaster.announcer.className).toBe("cd-shell-live");
    expect([polite.getAttribute("role"), polite.getAttribute("aria-live")]).toEqual([
      "status",
      "polite",
    ]);
    expect([assertive.getAttribute("role"), assertive.getAttribute("aria-live")]).toEqual([
      "alert",
      "assertive",
    ]);
    expect(polite.textContent).toBe("");
    expect(assertive.textContent).toBe("");
  });

  it("writes the text into the region of its status after a short delay", () => {
    const { toaster } = setup();
    const { polite, assertive } = regions(toaster);
    toaster.show(success());
    expect(polite.textContent).toBe("");
    vi.advanceTimersByTime(TOAST_ANNOUNCE_DELAY_MS);
    expect(polite.textContent).toBe("Link copied");
    toaster.show({ status: "danger", text: "Couldn't open it." });
    vi.advanceTimersByTime(TOAST_ANNOUNCE_DELAY_MS);
    expect(assertive.textContent).toBe("Couldn't open it.");
    expect(polite.textContent).toBe("Link copied");
    for (const status of ["info", "warning"] as const) {
      toaster.show({ status, text: status });
      vi.advanceTimersByTime(TOAST_ANNOUNCE_DELAY_MS);
      expect(polite.textContent).toBe(status);
    }
  });

  it("announces a repeated toast again: emptied, then written", () => {
    const { toaster } = setup();
    const { polite } = regions(toaster);
    toaster.show(success());
    vi.advanceTimersByTime(TOAST_ANNOUNCE_DELAY_MS);
    toaster.show(success());
    expect(polite.textContent).toBe("");
    vi.advanceTimersByTime(TOAST_ANNOUNCE_DELAY_MS);
    expect(polite.textContent).toBe("Link copied");
  });

  it("empties the region when its toast closes", () => {
    const { toaster } = setup();
    const { polite } = regions(toaster);
    const handle = toaster.show(success());
    vi.advanceTimersByTime(TOAST_ANNOUNCE_DELAY_MS);
    handle.dismiss();
    expect(polite.textContent).toBe("");
  });

  it("leaves a newer toast's text when an older one closes", () => {
    const { toaster } = setup();
    const { polite } = regions(toaster);
    const older = toaster.show(success("one"));
    toaster.show(success("two"));
    vi.advanceTimersByTime(TOAST_ANNOUNCE_DELAY_MS);
    older.dismiss();
    expect(polite.textContent).toBe("two");
  });

  it("removes the regions and writes nothing after destroy", () => {
    const { toaster } = setup();
    const { polite } = regions(toaster);
    toaster.show(success());
    toaster.destroy();
    vi.advanceTimersByTime(TOAST_ANNOUNCE_DELAY_MS);
    expect(toaster.announcer.isConnected).toBe(false);
    expect(polite.textContent).toBe("");
  });

  it("reports every change of the stack", () => {
    const onChange = vi.fn();
    const { toaster } = setup({ onChange });
    const handle = toaster.show(success());
    expect(onChange).toHaveBeenCalledTimes(1);
    toaster.show(success());
    expect(onChange).toHaveBeenCalledTimes(2);
    handle.dismiss();
    vi.advanceTimersByTime(TOAST_LEAVE_FALLBACK_MS);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("puts the action as a ghost button before Close", () => {
    const { toaster, stack } = setup();
    toaster.show({
      status: "info",
      text: "Board replaced",
      action: { label: "Undo", onSelect() {} },
    });
    const [card] = cards(stack);
    const action = card?.querySelector<HTMLButtonElement>(".cd-shell-toast-action");
    expect(action?.classList.contains("cd-shell-button")).toBe(true);
    expect(action?.dataset.variant).toBe("ghost");
    expect(action?.type).toBe("button");
    expect(action?.textContent).toBe("Undo");
    expect(action?.nextElementSibling).toBe(closeButton(card));
  });

  it("names Close from the messages table", () => {
    const { toaster, stack } = setup({ messages: { ...defaultMessages, close: "Schließen" } });
    toaster.show(success());
    expect(closeButton(cards(stack)[0]).getAttribute("aria-label")).toBe("Schließen");
  });

  it("puts the newest at the bottom", () => {
    const { toaster, stack } = setup();
    toaster.show(success("one"));
    toaster.show(success("two"));
    expect(texts(stack)).toEqual(["one", "two"]);
  });

  it("sets the stack's bottom", () => {
    const { toaster, stack } = setup();
    toaster.setBottom(88);
    expect(stack.style.bottom).toBe("88px");
  });
});

describe("toaster: hosts", () => {
  it("web: a manual popover, shown once and kept open while no modal dialog opens", () => {
    const { toaster, stack, popover } = setup();
    expect(stack.getAttribute("popover")).toBe("manual");
    const first = toaster.show(success("one"));
    toaster.show(success("two"));
    toaster.show(success("two"));
    expect(popover.calls).toEqual(["hide", "show"]);
    popover.calls.length = 0;
    first.dismiss();
    vi.advanceTimersByTime(TOAST_LEAVE_FALLBACK_MS);
    expect(popover.calls).toEqual([]);
    toaster.destroy();
    expect(stack.isConnected).toBe(false);
  });

  it("web: shown again with every toast while a modal dialog is open, so it stays above it", () => {
    const { toaster, popover } = setup();
    toaster.show(success("one"));
    popover.calls.length = 0;
    openModal();
    toaster.show(success("two"));
    toaster.show(success("two"));
    expect(popover.calls).toEqual(["hide", "show", "hide", "show"]);
  });

  it("web: hides the popover when the last toast is gone", () => {
    const { toaster, popover } = setup();
    toaster.show(success()).dismiss();
    popover.calls.length = 0;
    vi.advanceTimersByTime(TOAST_LEAVE_FALLBACK_MS);
    expect(popover.calls).toEqual(["hide"]);
  });

  it("web: keeps the focus on a toast while the stack is raised", () => {
    const { toaster, stack } = setup();
    // A browser may move the focus out of a popover it hides.
    stubPopover(stack, () => (document.activeElement as HTMLElement | null)?.blur());
    toaster.show(success("one"));
    const close = closeButton(cards(stack)[0]);
    close.focus();
    toaster.show(success("two"));
    expect(document.activeElement).toBe(close);
  });

  it("web: still shows toasts where the popover API is missing", () => {
    const toaster = createToaster({
      ownerDocument: document,
      host: "web",
      messages: defaultMessages,
      idPrefix: "cd-shell-toast-2",
      focusFallback() {},
    });
    toasters.push(toaster);
    document.body.append(toaster.element);
    expect(() => toaster.show(success())).not.toThrow();
    expect(texts(toaster.element)).toEqual(["Link copied"]);
  });

  it("embedded: absolute in the root, no popover", () => {
    const { toaster, stack, popover } = setup({ host: "embedded" });
    expect(stack.hasAttribute("popover")).toBe(false);
    toaster.show(success());
    expect(popover.calls).toEqual([]);
    expect(texts(stack)).toEqual(["Link copied"]);
  });
});

describe("toaster: lifetime (guide §8)", () => {
  it("closes success and info after 2.8s, warning and danger after 5s", () => {
    const { toaster, stack } = setup();
    toaster.show({ status: "success", text: "s" });
    toaster.show({ status: "info", text: "i" });
    toaster.show({ status: "warning", text: "w" });
    vi.advanceTimersByTime(2799);
    expect(texts(stack)).toEqual(["s", "i", "w"]);
    vi.advanceTimersByTime(1);
    expect(texts(stack)).toEqual(["w"]);
    toaster.show({ status: "danger", text: "d" });
    vi.advanceTimersByTime(5000 - 2800 - 1);
    expect(texts(stack)).toEqual(["w", "d"]);
    vi.advanceTimersByTime(1);
    expect(texts(stack)).toEqual(["d"]);
    vi.advanceTimersByTime(2800);
    expect(texts(stack)).toEqual([]);
  });

  it("gives a long text the longer durationMs", () => {
    const { toaster, stack } = setup();
    toaster.show({ status: "info", text: "long", durationMs: 8000 });
    vi.advanceTimersByTime(7999);
    expect(texts(stack)).toEqual(["long"]);
    vi.advanceTimersByTime(1);
    expect(texts(stack)).toEqual([]);
  });

  it("never closes a toast with an action by itself", () => {
    const { toaster, stack } = setup();
    toaster.show({
      status: "info",
      text: "Board replaced",
      action: { label: "Undo", onSelect() {} },
    });
    vi.advanceTimersByTime(10 * 60_000);
    expect(texts(stack)).toEqual(["Board replaced"]);
  });

  it("slides out, then leaves the DOM on animationend or after the fallback", () => {
    const { toaster, stack } = setup();
    toaster.show(success("one")).dismiss();
    toaster.show(success("two")).dismiss();
    const [one, two] = [...stack.children] as HTMLElement[];
    expect(one?.hasAttribute("data-leaving")).toBe(true);
    expect(one?.inert).toBe(true);
    one?.dispatchEvent(new AnimationEvent("animationend", { animationName: "cd-shell-toast-in" }));
    expect(one?.isConnected).toBe(true);
    one?.dispatchEvent(new AnimationEvent("animationend", { animationName: "cd-shell-toast-out" }));
    expect(one?.isConnected).toBe(false);
    expect(two?.isConnected).toBe(true);
    vi.advanceTimersByTime(TOAST_LEAVE_FALLBACK_MS);
    expect(two?.isConnected).toBe(false);
    expect(stack.children).toHaveLength(0);
  });

  it("leaves at once under reduced motion", () => {
    const { toaster, stack } = setup();
    document.documentElement.classList.add(REDUCED_MOTION_CLASS);
    toaster.show(success()).dismiss();
    expect(stack.children).toHaveLength(0);

    document.documentElement.classList.remove(REDUCED_MOTION_CLASS);
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) => ({ matches: query === "(prefers-reduced-motion: reduce)" }) as MediaQueryList,
    );
    toaster.show(success()).dismiss();
    expect(stack.children).toHaveLength(0);
  });

  it("dismiss is idempotent", () => {
    const { toaster, stack } = setup();
    const handle = toaster.show(success());
    handle.dismiss();
    handle.dismiss();
    vi.advanceTimersByTime(TOAST_LEAVE_FALLBACK_MS);
    expect(stack.children).toHaveLength(0);
    expect(() => handle.dismiss()).not.toThrow();
  });
});

describe("toaster: pause and resume", () => {
  it("pauses while hovered and resumes with what was left", () => {
    const { toaster, stack } = setup();
    toaster.show(success());
    const [card] = cards(stack);
    vi.advanceTimersByTime(800);
    card?.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(60_000);
    expect(texts(stack)).toEqual(["Link copied"]);
    card?.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(1999);
    expect(texts(stack)).toEqual(["Link copied"]);
    vi.advanceTimersByTime(1);
    expect(texts(stack)).toEqual([]);
  });

  it("resumes with at least 1.5s", () => {
    const { toaster, stack } = setup();
    toaster.show(success());
    const [card] = cards(stack);
    vi.advanceTimersByTime(2700);
    card?.dispatchEvent(new MouseEvent("mouseenter"));
    card?.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(1499);
    expect(texts(stack)).toEqual(["Link copied"]);
    vi.advanceTimersByTime(1);
    expect(texts(stack)).toEqual([]);
  });

  it("pauses while the focus is inside", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    const { toaster, stack } = setup();
    toaster.show({ status: "danger", text: "Couldn't save." });
    closeButton(cards(stack)[0]).focus();
    vi.advanceTimersByTime(60_000);
    expect(texts(stack)).toEqual(["Couldn't save."]);
    outside.focus();
    vi.advanceTimersByTime(4999);
    expect(texts(stack)).toEqual(["Couldn't save."]);
    vi.advanceTimersByTime(1);
    expect(texts(stack)).toEqual([]);
  });

  it("stays paused until neither hover nor focus holds it", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    const { toaster, stack } = setup();
    toaster.show(success());
    const [card] = cards(stack);
    card?.dispatchEvent(new MouseEvent("mouseenter"));
    closeButton(card).focus();
    card?.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(60_000);
    expect(texts(stack)).toEqual(["Link copied"]);
    outside.focus();
    vi.advanceTimersByTime(2800);
    expect(texts(stack)).toEqual([]);
  });

  it("stays engaged while the focus moves from the action to Close", () => {
    const { toaster, stack } = setup();
    const undo = { label: "Undo", onSelect() {} };
    for (const text of ["a", "b", "c"]) toaster.show({ status: "info", text, action: undo });
    const [a] = cards(stack);
    a?.querySelector<HTMLButtonElement>(".cd-shell-toast-action")?.focus();
    closeButton(a).focus();
    toaster.show(success("d"));
    // Every toast has an action: the oldest that is not engaged leaves, not the focused one.
    expect(texts(stack)).toEqual(["a", "c", "d"]);
  });
});

describe("toaster: stack of three", () => {
  it("evicts the oldest for a fourth", () => {
    const { toaster, stack } = setup();
    for (const text of ["a", "b", "c", "d"]) toaster.show(success(text));
    expect(texts(stack)).toEqual(["b", "c", "d"]);
    expect(stack.querySelector("[data-leaving] .cd-shell-toast-text")?.textContent).toBe("a");
  });

  it("prefers a toast without action that is not engaged", () => {
    const { toaster, stack } = setup();
    toaster.show({ status: "info", text: "a", action: { label: "Undo", onSelect() {} } });
    toaster.show(success("b"));
    toaster.show(success("c"));
    cards(stack)[1]?.dispatchEvent(new MouseEvent("mouseenter"));
    toaster.show(success("d"));
    expect(texts(stack)).toEqual(["a", "b", "d"]);
  });

  it("then an action toast that is not engaged", () => {
    const { toaster, stack } = setup();
    const undo = { label: "Undo", onSelect() {} };
    toaster.show({ status: "info", text: "a", action: undo });
    toaster.show({ status: "info", text: "b", action: undo });
    toaster.show(success("c"));
    cards(stack)[2]?.dispatchEvent(new MouseEvent("mouseenter"));
    toaster.show(success("d"));
    expect(texts(stack)).toEqual(["b", "c", "d"]);
  });
});

describe("toaster: identical toasts", () => {
  it("restarts the shown toast's time instead of stacking a second", () => {
    const { toaster, stack } = setup();
    const first = toaster.show(success());
    vi.advanceTimersByTime(2000);
    const second = toaster.show(success());
    expect(texts(stack)).toEqual(["Link copied"]);
    vi.advanceTimersByTime(2799);
    expect(texts(stack)).toEqual(["Link copied"]);
    vi.advanceTimersByTime(1);
    expect(texts(stack)).toEqual([]);
    expect(second).toBe(first);
  });

  it("stacks a second for another status or text", () => {
    const { toaster, stack } = setup();
    toaster.show(success());
    toaster.show({ status: "info", text: "Link copied" });
    toaster.show(success("Link copied again"));
    expect(texts(stack)).toHaveLength(3);
  });

  it("takes the newest request's action, so it acts on the latest change", () => {
    const { toaster, stack } = setup();
    const selected: string[] = [];
    toaster.show({
      status: "info",
      text: "Board replaced",
      action: { label: "Undo", onSelect: () => selected.push("first") },
    });
    toaster.show({
      status: "info",
      text: "Board replaced",
      action: { label: "Undo", onSelect: () => selected.push("second") },
    });
    const actions = stack.querySelectorAll<HTMLButtonElement>(".cd-shell-toast-action");
    expect(actions).toHaveLength(1);
    actions[0]?.click();
    expect(selected).toEqual(["second"]);
  });

  it("closes by itself again once the newest request has no action", () => {
    const { toaster, stack } = setup();
    toaster.show({ status: "info", text: "Opened", action: { label: "Undo", onSelect() {} } });
    toaster.show({ status: "info", text: "Opened" });
    expect(stack.querySelector(".cd-shell-toast-action")).toBeNull();
    vi.advanceTimersByTime(2800);
    expect(texts(stack)).toEqual([]);
  });
});

describe("toaster: action and Close", () => {
  it("an action click closes the toast, then runs onSelect", () => {
    const { toaster, stack } = setup();
    const seen: boolean[] = [];
    toaster.show({
      status: "info",
      text: "Board replaced",
      action: {
        label: "Undo",
        onSelect: () =>
          seen.push(stack.querySelector(".cd-shell-toast")?.hasAttribute("data-leaving") ?? true),
      },
    });
    stack.querySelector<HTMLButtonElement>(".cd-shell-toast-action")?.click();
    expect(seen).toEqual([true]);
    expect(texts(stack)).toEqual([]);
  });

  it("Close closes it", () => {
    const { toaster, stack } = setup();
    toaster.show(success());
    closeButton(cards(stack)[0]).click();
    expect(texts(stack)).toEqual([]);
  });
});

describe("toaster: focus handoff", () => {
  it("hands the focus to the next toast's Close, else the previous one's, else the fallback", () => {
    const { toaster, stack, focusFallback } = setup();
    for (const text of ["a", "b", "c"]) toaster.show(success(text));
    const [a, b, c] = cards(stack);
    closeButton(b).focus();
    closeButton(b).click();
    expect(document.activeElement).toBe(closeButton(c));
    closeButton(c).click();
    expect(document.activeElement).toBe(closeButton(a));
    expect(focusFallback).not.toHaveBeenCalled();
    closeButton(a).click();
    expect(focusFallback).toHaveBeenCalledTimes(1);
  });

  it("leaves the focus alone when the closing toast did not hold it", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    const { toaster, focusFallback } = setup();
    toaster.show(success()).dismiss();
    expect(document.activeElement).toBe(outside);
    expect(focusFallback).not.toHaveBeenCalled();
  });

  it("hands the focus on when an action closes its toast", () => {
    const { toaster, stack, focusFallback } = setup();
    toaster.show({ status: "info", text: "Replaced", action: { label: "Undo", onSelect() {} } });
    const action = stack.querySelector<HTMLButtonElement>(".cd-shell-toast-action");
    action?.focus();
    action?.click();
    expect(focusFallback).toHaveBeenCalledTimes(1);
  });

  // WebKit and Firefox on macOS leave a clicked button unfocused: the click finds `<body>` focused.
  it("hands the focus to the fallback after a pointer click on the action or Close, focused or not", () => {
    const { toaster, stack, focusFallback } = setup();
    const calls: string[] = [];
    focusFallback.mockImplementation(() => calls.push("focus"));
    toaster.show({
      status: "info",
      text: "Replaced",
      action: { label: "Undo", onSelect: () => calls.push("undo") },
    });
    toaster.show(success("a"));
    toaster.show(success("b"));
    const [replaced, a, b] = cards(stack);
    expect(document.activeElement).toBe(document.body);

    pointerClick(replaced?.querySelector(".cd-shell-toast-action"));
    expect(calls).toEqual(["focus", "undo"]);

    // Not to the next toast's Close, as Enter on a focused Close does: a pointer user is done here.
    closeButton(a).focus();
    pointerClick(closeButton(a));
    expect(focusFallback).toHaveBeenCalledTimes(2);
    expect(document.activeElement).not.toBe(closeButton(b));

    (document.activeElement as HTMLElement | null)?.blur();
    pointerClick(closeButton(b));
    expect(focusFallback).toHaveBeenCalledTimes(3);
    expect(texts(stack)).toEqual([]);
  });
});

/** A click as a mouse, pen or finger gives it (`detail` 1), without moving the focus. */
function pointerClick(target: Element | null | undefined): void {
  target?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
}

describe("toaster: destroy", () => {
  it("clears every timer and removes the stack; later toasts are inert", () => {
    const { toaster, stack } = setup();
    toaster.show(success("a"));
    toaster.show(success("b")).dismiss();
    toaster.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(stack.isConnected).toBe(false);
    const late = toaster.show(success("late"));
    expect(stack.children).toHaveLength(2);
    expect(() => late.dismiss()).not.toThrow();
    expect(() => toaster.destroy()).not.toThrow();
  });
});
