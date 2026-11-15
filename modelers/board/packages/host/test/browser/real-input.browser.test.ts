import { afterEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";

/**
 * `commands.realInput` (test-support/real-input.ts), the command every browser test with a real
 * editor drives its input through. Held here because this package's tests are its first callers:
 * if the command's pointer math is off, every test above it clicks beside its target.
 */

interface Seen {
  type: string;
  trusted: boolean;
  x: number;
  y: number;
  target: EventTarget | null;
  detail: number;
  shift: boolean;
  buttons: number;
  deltaY: number;
}

const made: HTMLElement[] = [];

function box(left: number, top: number, width: number, height: number): HTMLDivElement {
  const element = document.createElement("div");
  Object.assign(element.style, {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  document.body.append(element);
  made.push(element);
  return element;
}

function record(element: HTMLElement, types: readonly string[]): Seen[] {
  const seen: Seen[] = [];
  for (const type of types) {
    element.addEventListener(type, (event) => {
      const mouse = event as MouseEvent;
      seen.push({
        type,
        trusted: event.isTrusted,
        x: mouse.clientX,
        y: mouse.clientY,
        target: event.target,
        detail: mouse.detail,
        shift: mouse.shiftKey,
        buttons: mouse.buttons,
        deltaY: (event as WheelEvent).deltaY,
      });
    });
  }
  return seen;
}

const typesOf = (seen: readonly Seen[]): string[] => seen.map((event) => event.type);

afterEach(async () => {
  for (const element of made.splice(0)) element.remove();
  // no test leaves a button or a key held, or the pointer over the next test's element
  await commands.realInput([{ type: "move", x: 1, y: 1 }]);
});

describe("commands.realInput", () => {
  it("clicks the client point it is given, as trusted input", async () => {
    const target = box(300, 200, 40, 30);
    const seen = record(target, ["pointerdown", "pointerup", "click"]);

    await commands.realInput([{ type: "click", x: 317, y: 211 }]);

    await expect.poll(() => typesOf(seen)).toEqual(["pointerdown", "pointerup", "click"]);
    for (const event of seen) {
      expect(event).toMatchObject({ trusted: true, x: 317, y: 211, target });
    }
  });

  it("misses an element one px beside the point", async () => {
    const target = box(300, 200, 40, 30);
    const beside = box(340, 200, 40, 30);
    const onTarget = record(target, ["click"]);
    const onBeside = record(beside, ["click"]);

    await commands.realInput([{ type: "click", x: 340, y: 211 }]);

    await expect.poll(() => onBeside.length).toBe(1);
    expect(onTarget).toEqual([]);
  });

  // What a synthetic event cannot tell: `inert` stops real input and no dispatched event.
  it("does not reach an inert element, which a dispatched click does", async () => {
    const ground = box(100, 100, 200, 200);
    const preview = box(150, 150, 60, 60);
    preview.inert = true;
    const onPreview = record(preview, ["click"]);
    const onGround = record(ground, ["click"]);

    await commands.realInput([{ type: "click", x: 180, y: 180 }]);

    await expect.poll(() => onGround.length).toBe(1);
    expect(onPreview).toEqual([]);

    preview.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onPreview.map((event) => event.trusted)).toEqual([false]);
  });

  it("double-clicks", async () => {
    const target = box(300, 200, 40, 30);
    const seen = record(target, ["dblclick"]);

    await commands.realInput([{ type: "dblclick", x: 320, y: 215 }]);

    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]).toMatchObject({ trusted: true, detail: 2, x: 320, y: 215 });
  });

  it("drags: a press, moves in steps with the button held, a release", async () => {
    const ground = box(100, 100, 400, 300);
    const seen = record(ground, ["pointerdown", "pointermove", "pointerup"]);

    await commands.realInput([
      { type: "move", x: 150, y: 150 },
      { type: "down" },
      { type: "move", x: 250, y: 190, steps: 5 },
      { type: "up" },
    ]);

    await expect.poll(() => typesOf(seen).at(-1)).toBe("pointerup");
    const held = seen.filter((event) => event.type === "pointermove" && event.buttons === 1);
    expect(held).toHaveLength(5);
    expect(held.at(-1)).toMatchObject({ x: 250, y: 190, trusted: true });
    expect(seen.at(-1)).toMatchObject({ type: "pointerup", x: 250, y: 190 });
  });

  it("turns the wheel where the pointer is", async () => {
    const target = box(300, 200, 100, 100);
    const seen = record(target, ["wheel"]);

    await commands.realInput([
      { type: "move", x: 350, y: 250 },
      { type: "wheel", dy: 120 },
    ]);

    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]).toMatchObject({ trusted: true, deltaY: 120, x: 350, y: 250 });
  });

  it("types into the focused element, and presses a key by its name", async () => {
    const field = document.createElement("input");
    box(300, 200, 200, 30).append(field);
    field.focus();

    await commands.realInput([{ type: "text", text: "board" }]);
    await expect.poll(() => field.value).toBe("board");

    await commands.realInput([{ type: "press", key: "Backspace" }]);
    await expect.poll(() => field.value).toBe("boar");
  });

  it("holds a key across other input until it is released", async () => {
    const target = box(300, 200, 40, 30);
    const seen = record(target, ["click"]);

    await commands.realInput([
      { type: "keydown", key: "Shift" },
      { type: "click", x: 320, y: 215 },
      { type: "keyup", key: "Shift" },
      { type: "click", x: 320, y: 215 },
    ]);

    await expect.poll(() => seen.length).toBe(2);
    expect(seen.map((event) => event.shift)).toEqual([true, false]);
  });
});
