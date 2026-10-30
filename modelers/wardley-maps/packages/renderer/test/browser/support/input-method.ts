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
  /**
   * Safari's Enter or Escape that confirms or cancels a candidate: after `compositionend`, with
   * `isComposing` false and the `keyCode` 229 of a key the input method took.
   */
  async keyAfterComposition(key: "Enter" | "Escape"): Promise<void> {
    await typeKey(key, 229);
  },
};

/** A key as the browser types it: Enter with the keypress that submits a form. */
export async function typeKey(
  key: "Enter" | "Escape",
  keyCode = key === "Enter" ? 13 : 27,
): Promise<void> {
  await cdp().send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    ...(key === "Enter" ? { text: "\r" } : {}),
  });
  await cdp().send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
  });
}

export function pressKey(target: EventTarget, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}
