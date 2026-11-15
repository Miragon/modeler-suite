/**
 * A board on a repository in memory, with the suite's editors in its model nodes: the stack an
 * app builds (`createMemoryBackend`, `connectBackend`, `createFilesHost`, the board's factory),
 * and the registry as it is, each entry wrapped only to count its loads and to hand a test the
 * modelers it made.
 */
import {
  connectBackend,
  createMemoryBackend,
  PICTURE_SUFFIXES,
  suffixRule,
  type MemoryBackend,
} from "@miragon/board-files";
import {
  createFilesHost,
  embedModeler,
  type EditorEntry,
  type EmbeddableModeler,
} from "@miragon/board-host";
import {
  createCollaborativeModeler,
  type BoardModelerOptions,
  type CollaborativeBoard,
} from "@miragon/board-renderer";
import { encodeBoard } from "@miragon/board-schema-model";
import { vi } from "vitest";
import { SUITE_EDITORS } from "../../../src/registry.js";

/** A model node of a test board: its box in board px, and the file it shows. */
export interface ModelNode {
  readonly id: string;
  readonly path: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const NODE_WIDTH = 800;
export const NODE_HEIGHT = 540;
const COLUMNS = 4;
const PITCH = { x: 880, y: 640 };

/** Model nodes of one size in rows of four, in the order of the paths. */
export function gridOf(paths: readonly string[]): ModelNode[] {
  return paths.map((path, index) => ({
    id: `model_${index}`,
    path,
    x: (index % COLUMNS) * PITCH.x,
    y: Math.floor(index / COLUMNS) * PITCH.y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }));
}

export function boardTextOf(nodes: readonly ModelNode[]): string {
  const elements = Object.fromEntries(
    nodes.map((node, index) => [
      node.id,
      {
        kind: "node",
        type: "model",
        file: node.path,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        z: `a${index}`,
      },
    ]),
  );
  return encodeBoard({ elements, meta: { title: "Real editors" } });
}

export interface MountedBoard {
  readonly board: CollaborativeBoard;
  readonly backend: MemoryBackend;
  /** the element the board is attached to: the whole window */
  readonly element: HTMLElement;
  readonly nodes: readonly ModelNode[];
  /** the text the board was given, which no edit of a model may change */
  readonly text: string;
  /** how often the board said that its own content changed */
  boardChanges(): number;
  /** how often a notation's module was loaded */
  loads(notation: string): number;
  /** the element the board made for a node's editor, wherever it stands now */
  engine(nodeId: string): HTMLElement;
  /** the modeler mounted in a node */
  modeler(nodeId: string): EmbeddableModeler;
  /** the board's zoom at the moment a node's modeler was made, so before its first fit */
  openedAt(nodeId: string): number;
  destroy(): Promise<void>;
}

export interface MountOptions {
  readonly nodes: readonly ModelNode[];
  readonly files: Readonly<Record<string, string>>;
  /** the board's view before any node mounts; absent: the board fits its content */
  readonly view?: { x: number; y: number; zoom: number } | undefined;
}

const TIMEOUT = { timeout: 30_000, interval: 25 };

/**
 * The limit of a test or a hook that may be the first of its page to load the seven renderers
 * from their sources: a few seconds on a free machine and many times that on a busy one, where
 * Vitest's own limits (15 s for a test, 30 s for a hook) are not enough.
 */
export const LOAD_MS = 90_000;

export const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Two frames: long enough for a commit of React and the listeners behind it, never a wait for an answer. */
export async function settle(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

interface DiagramCanvas {
  getContainer(): HTMLElement;
}

interface Made {
  readonly modeler: EmbeddableModeler;
  /** the board's zoom at the moment the modeler was made */
  readonly boardZoom: number;
}

function counted(loads: Map<string, number>, made: Made[], boardZoom: () => number): EditorEntry[] {
  return SUITE_EDITORS.map((entry) => ({
    ...entry,
    async load() {
      loads.set(entry.notation, (loads.get(entry.notation) ?? 0) + 1);
      const module = await entry.load();
      return {
        ...module,
        create(options) {
          const modeler = module.create(options);
          made.push({ modeler, boardZoom: boardZoom() });
          return modeler;
        },
      };
    },
  }));
}

function attachPoint(): HTMLElement {
  const element = document.createElement("div");
  // No transform and nothing else that contains fixed descendants, as the board asks of its page.
  element.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh";
  document.body.append(element);
  return element;
}

/** Resolves once every model node's editor says that it is ready. */
export async function mountBoard(options: MountOptions): Promise<MountedBoard> {
  const loads = new Map<string, number>();
  const made: Made[] = [];
  const backend = createMemoryBackend({ ...options.files });
  // the rule an app passes: the suffixes of the registry's editors, and the board's pictures
  const rule = suffixRule({
    models: SUITE_EDITORS.flatMap((entry) => entry.suffixes),
    pictures: PICTURE_SUFFIXES,
  });
  const files = connectBackend(backend, rule);
  const zoomOf = (): number => (board.getViewState() as { zoom: number }).zoom;
  const host = createFilesHost({ files, editors: counted(loads, made, zoomOf) });
  const boardOptions: BoardModelerOptions = options.view ? { host, fitOnImport: false } : { host };
  const board = createCollaborativeModeler(boardOptions);
  const element = attachPoint();
  let changes = 0;
  const stopCounting = board.onContentChanged(() => void (changes += 1));
  board.attachTo(element);
  await board.board.mounted;
  if (options.view) board.setViewState(options.view);
  const text = boardTextOf(options.nodes);
  await board.importText(text);

  const engines = new Map<string, HTMLElement>();
  const engineIn = (nodeId: string): HTMLElement | null =>
    element.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${CSS.escape(nodeId)}"] .board-engine`,
    );
  for (const node of options.nodes) {
    // vi.waitFor and not expect.poll, which a hook may not call: a board is mounted in beforeAll.
    const engine = await vi.waitFor(() => {
      const found = engineIn(node.id);
      if (found?.dataset.embedState !== "ready") {
        throw new Error(`${node.path} is not ready: ${found?.dataset.embedState ?? "no editor"}`);
      }
      return found;
    }, TIMEOUT);
    engines.set(node.id, engine);
  }

  const engine = (nodeId: string): HTMLElement => {
    const found = engines.get(nodeId);
    if (!found) throw new Error(`the board has no model node ${nodeId}`);
    return found;
  };
  const madeIn = (nodeId: string): Made => {
    const container = engine(nodeId);
    const found = made.find(({ modeler }) =>
      container.contains(modeler.diagram?.get<DiagramCanvas>("canvas").getContainer() ?? null),
    );
    if (!found) throw new Error(`no modeler was made for ${nodeId}`);
    return found;
  };
  return {
    board,
    backend,
    element,
    nodes: options.nodes,
    text,
    boardChanges: () => changes,
    loads: (notation) => loads.get(notation) ?? 0,
    engine,
    modeler: (nodeId) => madeIn(nodeId).modeler,
    openedAt: (nodeId) => madeIn(nodeId).boardZoom,
    async destroy() {
      stopCounting();
      board.destroy();
      // The board unmounts its canvas, and with it the editors, a microtask after destroy().
      await vi.waitFor(() => {
        if (element.querySelector(".board-engine")) throw new Error("an editor is still mounted");
      }, TIMEOUT);
      host.dispose();
      files.dispose();
      element.remove();
    },
  };
}

/** What a modeler shows of its model: the contract's view state, and the transform it draws with. */
export interface ShownView {
  readonly state: unknown;
  readonly drawn: string | null;
}

export function shownView(modeler: EmbeddableModeler, within: HTMLElement): ShownView {
  return {
    state: modeler.getViewState(),
    drawn:
      within.querySelector(".djs-container > svg .viewport")?.getAttribute("transform") ?? null,
  };
}

/**
 * The same adapter with the same module and insets, alone in a plain box of the given layout
 * size that nothing scales: what a node's editor is compared with.
 */
export async function mountAlone(
  notation: string,
  text: string,
  size: { width: number; height: number },
): Promise<{ modeler: EmbeddableModeler; element: HTMLElement; destroy(): void }> {
  const entry = SUITE_EDITORS.find((one) => one.notation === notation);
  if (!entry) throw new Error(`no editor for the notation '${notation}'`);
  const module = await entry.load();
  const element = document.createElement("div");
  element.className = "board-engine";
  element.style.cssText = `position:fixed;left:0;top:0;width:${size.width}px;height:${size.height}px;overflow:hidden`;
  document.body.append(element);
  const editor = embedModeler(
    {
      nodeId: "alone",
      path: `alone/${notation}`,
      element,
      armed: () => true,
      onArmedChange: () => () => undefined,
      relocate: () => undefined,
    },
    {
      module,
      notation,
      insets: entry.insets,
      bind: (modeler, report) => ({
        ready: modeler.importText(text).then(() => report({ kind: "ok" })),
        unbind: () => undefined,
      }),
    },
  );
  await editor.ready;
  return {
    modeler: editor.modeler,
    element,
    destroy() {
      editor.destroy();
      element.remove();
    },
  };
}

/**
 * The HTML an editor lays over or beside its canvas and that a person can see right now: every
 * element below the editor's root that is neither the canvas (the svg and what holds it) nor in
 * diagram-js's overlay layer, by its first class name.
 */
export function shownChrome(engine: HTMLElement): string[] {
  const root = engine.querySelector<HTMLElement>(".board-host-editor");
  const canvas = root?.querySelector(".djs-container > svg");
  if (!root || !canvas) throw new Error("the element holds no diagram-js editor");
  const shown: string[] = [];
  const walk = (parent: Element): void => {
    for (const child of parent.children) {
      if (child === canvas || child.classList.contains("djs-overlay-container")) continue;
      if (child.contains(canvas)) {
        walk(child);
        continue;
      }
      if (!(child instanceof HTMLElement) || !child.checkVisibility()) continue;
      const box = child.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) shown.push(child.classList[0] ?? child.localName);
    }
  };
  walk(root);
  return shown.sort();
}
