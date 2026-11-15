/**
 * The runtime behind a board this package made. Not exported from the entry: the package's own
 * tests read a mounted board's runtime here, and no host can.
 */
import type { CollaborativeModeler } from "@miragon/modeler-api";
import type { BoardRuntime } from "../runtime/board-context.js";

const runtimes = new WeakMap<CollaborativeModeler, BoardRuntime>();

/** called once by createCollaborativeModeler, before it returns */
export function registerBoardRuntime(modeler: CollaborativeModeler, runtime: BoardRuntime): void {
  runtimes.set(modeler, runtime);
}

/** the runtime behind a modeler this package made; throws for any other object */
export function boardRuntimeOf(modeler: CollaborativeModeler): BoardRuntime {
  const runtime = runtimes.get(modeler);
  if (runtime === undefined) throw new Error("boardRuntimeOf: not a board this package made");
  return runtime;
}
