import type { Injector } from "didi";
import type { ModuleDeclaration } from "didi";
import WardleyReadOnly, { type WardleyLockReason } from "./WardleyReadOnly.js";

/** The edit lock of a canvas that shows a map the host cannot save (guide §13.5) or explore mode. */
export const readOnlyModule: ModuleDeclaration = {
  __init__: ["wardleyReadOnly"],
  wardleyReadOnly: ["type", WardleyReadOnly],
};

/** Whether the canvas is locked, for any reason; false where the editor has no lock. */
export function isReadOnly(injector: Injector): boolean {
  return injector.get<WardleyReadOnly | null>("wardleyReadOnly", false)?.isReadOnly() === true;
}

/** Whether `reason` locks the canvas; false where the editor has no lock. */
export function isLockedBy(injector: Injector, reason: WardleyLockReason): boolean {
  return (
    injector.get<WardleyReadOnly | null>("wardleyReadOnly", false)?.isLockedBy(reason) === true
  );
}

/** Whether the palette marks the document lock, at once or after its `delayMs`; false without one. */
export function isReadOnlyShown(injector: Injector): boolean {
  return injector.get<WardleyReadOnly | null>("wardleyReadOnly", false)?.isReadOnlyShown() === true;
}

export { default as WardleyReadOnly, READ_ONLY_CHANGED } from "./WardleyReadOnly.js";
export type {
  WardleyLockReason,
  WardleyReadOnlyChangedEvent,
  WardleyReadOnlyOptions,
} from "./WardleyReadOnly.js";
