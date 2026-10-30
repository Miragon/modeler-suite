/// <reference types="@vitest/browser-playwright" />
import { cdp } from "vitest/browser";

/** An input method composing in the focused field, driven through Chromium's own IME input. */
export const inputMethod = {
  async compose(text: string): Promise<void> {
    await cdp().send("Input.imeSetComposition", {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
  },
  async press(key: "Enter" | "Escape"): Promise<void> {
    const keyCode = key === "Enter" ? 13 : 27;
    for (const type of ["rawKeyDown", "keyUp"] as const) {
      await cdp().send("Input.dispatchKeyEvent", {
        type,
        key,
        code: key,
        windowsVirtualKeyCode: keyCode,
      });
    }
  },
  async confirm(text: string): Promise<void> {
    await cdp().send("Input.insertText", { text });
  },
};

export function pressKey(target: EventTarget, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}
