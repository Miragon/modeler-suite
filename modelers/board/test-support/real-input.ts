/**
 * `commands.realInput(ops)`: real mouse and keyboard input for a browser test, sent by Playwright
 * to the page and not dispatched by a script. A synthetic event ignores `inert`, hit testing and
 * the focus, so only real input can tell whether a preview takes input or whether the pointer
 * math of an armed editor is off.
 *
 * The file is the command's two sides: `realInput` runs in Node (`vitest.config.ts` registers
 * it), and the declaration at the end types the call for every test whose tsconfig includes this
 * folder.
 */
import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";

/**
 * One step of real input. Every `x` and `y` is in client px of the test's own window, as
 * `getBoundingClientRect()` answers there.
 */
export type RealInputOp =
  | { type: "move"; x: number; y: number; steps?: number | undefined }
  | { type: "down" }
  | { type: "up" }
  | { type: "click"; x: number; y: number }
  | { type: "dblclick"; x: number; y: number }
  | { type: "wheel"; dx?: number | undefined; dy?: number | undefined }
  | { type: "press"; key: string }
  | { type: "keydown"; key: string }
  | { type: "keyup"; key: string }
  | { type: "text"; text: string };

export const realInput: BrowserCommand<[ops: readonly RealInputOp[]]> = async (context, ops) => {
  // client coordinates of the test iframe -> page coordinates, then Playwright's mouse/keyboard
  const frame = await context.frame();
  const handle = await frame.frameElement();
  const box = await handle.boundingBox();
  if (!box) throw new Error("realInput: the test's iframe has no box");
  const inner = await frame.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const sx = box.width / inner.w;
  const sy = box.height / inner.h;
  const px = (x: number) => box.x + x * sx;
  const py = (y: number) => box.y + y * sy;
  const { mouse, keyboard } = context.page;
  for (const op of ops) {
    if (op.type === "move") await mouse.move(px(op.x), py(op.y), { steps: op.steps ?? 1 });
    else if (op.type === "down") await mouse.down();
    else if (op.type === "up") await mouse.up();
    else if (op.type === "click") await mouse.click(px(op.x), py(op.y));
    else if (op.type === "dblclick") await mouse.dblclick(px(op.x), py(op.y));
    else if (op.type === "wheel") await mouse.wheel(op.dx ?? 0, op.dy ?? 0);
    else if (op.type === "press") await keyboard.press(op.key);
    else if (op.type === "keydown") await keyboard.down(op.key);
    else if (op.type === "keyup") await keyboard.up(op.key);
    else await keyboard.type(op.text);
  }
};

declare module "vitest/browser" {
  interface BrowserCommands {
    realInput(ops: readonly RealInputOp[]): Promise<void>;
  }
}
