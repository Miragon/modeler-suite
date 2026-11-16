/**
 * A board through the public factory, in the host element of the contract's conformance kit
 * (800 x 600 px, attached to the document). The entry is imported, not the factory's own module,
 * so the board's sheet is loaded as an app that bundles the package loads it.
 */
import { attachedHost } from "@miragon/modeler-api/conformance";

import { boardRuntimeOf } from "../../src/collaborative/internals.js";
import {
  type BoardModelerOptions,
  type CollaborativeBoard,
  createCollaborativeModeler,
} from "../../src/index.js";
import type { BoardRuntime } from "../../src/runtime/board-context.js";

export interface MountedBoard {
  readonly modeler: CollaborativeBoard;
  /** the element the board was attached to */
  readonly element: HTMLElement;
  readonly runtime: BoardRuntime;
  pane(): HTMLElement;
  /** the React Flow wrapper of a node; throws when there is none */
  node(id: string): HTMLElement;
  /** two animation frames and 30 ms */
  settle(): Promise<void>;
  /** destroys the modeler and removes the attached wrapper */
  destroy(): void;
}

/** the first run of a file loads every lazy part of the board from the dev server */
const DRAWN_TIMEOUT_MS = 10_000;
const POLL_MS = 20;

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** what the canvas still lacks of the document; undefined once it shows all of it */
function missingOnCanvas(modeler: CollaborativeBoard, element: HTMLElement): string | undefined {
  if (!element.querySelector(".board-toolbar")) return "the toolbar";
  const loading = element.querySelector(".board-slot:not(.board-slot--error)");
  if (loading) return `the part "${loading.textContent}", which is still loading`;
  const wrappers = new Set(
    [...element.querySelectorAll(".react-flow__node")].map((node) => node.getAttribute("data-id")),
  );
  const absent = modeler.board.store.getSnapshot().nodes.find((node) => !wrappers.has(node.id));
  return absent ? `the node ${absent.id}` : undefined;
}

/**
 * Resolves once the canvas shows the text: the toolbar, a wrapper per node and every lazily
 * loaded part in place. It does not wait for what answers later than the canvas: an editor's
 * `ready` (`runtime.mounted(id)`) and a note's rendered Markdown.
 */
export async function mountBoard(
  text: string,
  options: BoardModelerOptions = {},
): Promise<MountedBoard> {
  const element = attachedHost();
  const modeler = createCollaborativeModeler(options);
  const destroy = (): void => {
    modeler.destroy();
    element.parentElement?.remove();
  };
  try {
    modeler.attachTo(element);
    await modeler.board.mounted;
    await modeler.importText(text);
    const started = performance.now();
    for (;;) {
      const missing = missingOnCanvas(modeler, element);
      if (missing === undefined) break;
      if (performance.now() - started > DRAWN_TIMEOUT_MS) {
        throw new Error(`mountBoard: the canvas does not show ${missing}`);
      }
      await sleep(POLL_MS);
    }
  } catch (error) {
    destroy();
    throw error;
  }
  return {
    modeler,
    element,
    runtime: boardRuntimeOf(modeler),
    pane() {
      const pane = element.querySelector<HTMLElement>(".react-flow__pane");
      if (!pane) throw new Error("the board has no pane");
      return pane;
    },
    node(id) {
      const wrapper = element.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${CSS.escape(id)}"]`,
      );
      if (!wrapper) throw new Error(`the board shows no node ${id}`);
      return wrapper;
    },
    async settle() {
      await nextFrame();
      await nextFrame();
      await sleep(30);
    },
    destroy,
  };
}
