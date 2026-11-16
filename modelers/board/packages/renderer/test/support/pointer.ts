/**
 * Synthetic input as React Flow needs it. Every MouseEvent carries `view: window`: d3-drag and
 * d3-zoom put their move and release listeners on `event.view` and throw without one. A click
 * comes with its press, since the board asks where a click began before it takes it for its own.
 */

/** the middle of an element, in client px */
export function centreOf(target: Element): { clientX: number; clientY: number } {
  const box = target.getBoundingClientRect();
  return { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
}

function mouseInit(target: Element, init: MouseEventInit | undefined): MouseEventInit {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    ...centreOf(target),
    ...init,
  };
}

function pressAndClick(target: Element, init: MouseEventInit): void {
  const pointer: PointerEventInit = {
    ...init,
    detail: 0,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  };
  target.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
  target.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
  target.dispatchEvent(new PointerEvent("pointerup", pointer));
  target.dispatchEvent(new MouseEvent("mouseup", init));
  target.dispatchEvent(new MouseEvent("click", init));
}

/** press, release and click of the primary button, in the middle of the target unless `init` says where */
export function click(target: Element, init?: MouseEventInit): void {
  pressAndClick(target, { detail: 1, ...mouseInit(target, init) });
}

/** two clicks and the double-click a browser sends after them */
export function doubleClick(target: Element, init?: MouseEventInit): void {
  const base = mouseInit(target, init);
  pressAndClick(target, { ...base, detail: 1 });
  pressAndClick(target, { ...base, detail: 2 });
  target.dispatchEvent(new MouseEvent("dblclick", { ...base, detail: 2 }));
}

/** a key pressed and released on the target; returns the keydown, which says whether it was prevented */
export function key(target: Element, key: string, init?: KeyboardEventInit): KeyboardEvent {
  const keyInit: KeyboardEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    key,
    ...init,
  };
  const down = new KeyboardEvent("keydown", keyInit);
  target.dispatchEvent(down);
  target.dispatchEvent(new KeyboardEvent("keyup", keyInit));
  return down;
}
