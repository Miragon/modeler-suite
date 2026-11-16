import type { Page } from "@playwright/test";

/** A point of the window, in px. */
export interface Point {
  x: number;
  y: number;
}

/** A point that shows the board's bare pane: beside every node and under no chrome. */
export function panePoint(page: Page): Promise<Point> {
  return page.evaluate(() => {
    for (let y = window.innerHeight - 120; y > 80; y -= 40) {
      for (let x = 120; x < window.innerWidth - 240; x += 40) {
        if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) {
          return { x, y };
        }
      }
    }
    throw new Error("no point of the board shows its pane");
  });
}

/** CDP's bit for a held Shift key. */
export const SHIFT = 8;

export interface FileDrag {
  enter(at: Point, modifiers?: number): Promise<void>;
  over(at: Point, modifiers?: number): Promise<void>;
  drop(at: Point, modifiers?: number): Promise<void>;
}

/**
 * A file dragged in from outside the browser, as real input: Chromium's own drag events through
 * the DevTools protocol, which are trusted, are aimed by hit testing as a pointer's are, carry
 * the keys that are held and hand the page the file itself at the drop and not before. This is
 * as far as Playwright reaches a drop; `locator.drop()` dispatches events of its own making.
 */
export async function dragFile(page: Page, file: string): Promise<FileDrag> {
  const client = await page.context().newCDPSession(page);
  // 1: the source offers a copy
  const data = { items: [], files: [file], dragOperationsMask: 1 };
  const send =
    (type: "dragEnter" | "dragOver" | "drop") =>
    async (at: Point, modifiers = 0): Promise<void> => {
      await client.send("Input.dispatchDragEvent", { type, x: at.x, y: at.y, data, modifiers });
    };
  return { enter: send("dragEnter"), over: send("dragOver"), drop: send("drop") };
}
