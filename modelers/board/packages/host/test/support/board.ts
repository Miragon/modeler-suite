/**
 * The real board on a host this package builds: a board through the renderer's entry, on
 * `createFilesHost` over a memory backend behind the protocol's own channel, with the stand-in
 * modeler as the one registered editor. The wait is the one of the renderer's `mountBoard`.
 */
import {
  connectBackend,
  createMemoryBackend,
  PICTURE_SUFFIXES,
  suffixRule,
  type BoardFiles,
  type FilesRule,
  type MemoryBackend,
  type MemoryFile,
} from "@miragon/board-files";
import {
  createCollaborativeModeler,
  type BoardHost,
  type CollaborativeBoard,
} from "@miragon/board-renderer";
import { attachedHost } from "@miragon/modeler-api/conformance";

import "../../src/assets/embed.css";
// The runtime behind a board, by path: the renderer exports it to no host, and the path loads
// the module the entry loaded.
import { boardRuntimeOf } from "../../../renderer/src/collaborative/internals.js";
import type { BoardRuntime } from "../../../renderer/src/runtime/board-context.js";
import { createFilesHost } from "../../src/index.js";
import {
  standInEditors,
  type StandInEditors,
  type StandInEditorsOptions,
  type StandInModeler,
} from "./stand-in-modeler.js";

export interface HostBoard {
  readonly modeler: CollaborativeBoard;
  /** the element the board was attached to */
  readonly element: HTMLElement;
  readonly runtime: BoardRuntime;
  readonly backend: MemoryBackend;
  readonly files: BoardFiles;
  readonly host: BoardHost & { dispose(): void };
  readonly editors: StandInEditors;
  /** every text session the host opened on the port, with how often it was closed */
  readonly sessions: Array<{ path: string; closes: number }>;
  /** every path the host asked the port to open as a text, in order, opened or refused */
  readonly opens: string[];
  /** how often the board reported a change of its own file */
  boardChanges(): number;
  /** the React Flow wrapper of a node; throws when there is none */
  node(id: string): HTMLElement;
  /** the element the board made for a model node's editor, in the node or in the layer */
  engine(id: string): HTMLElement;
  /** the stand-in modeler that shows `path` in the engine of node `id` */
  editorOf(id: string): StandInModeler;
  /** two animation frames and 30 ms */
  settle(): Promise<void>;
  /** destroys the board, waits until its editors are gone, then ends the host and the port */
  destroy(): Promise<void>;
}

export interface HostBoardOptions extends StandInEditorsOptions {
  /** the board's box in the window of 1280 x 800 */
  size?: { width: number; height: number } | undefined;
  containHistoryKeys?: boolean | undefined;
  /** the host gets a text session only once this settles; the port has opened it by then */
  sessionGate?: Promise<void> | undefined;
  /** the line of a file its modeler refuses, where the host has one of its own */
  invalidText?: string | undefined;
  /** what the host lets a board reach; absent: the suffixes of its editors and the board's pictures */
  rule?: FilesRule | undefined;
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

export const MODEL_NODE = { width: 480, height: 360 };

/** a model node of a board file, in the canonical form */
export const modelNode = (id: string, file: string, x: number, y: number): string =>
  JSON.stringify({ file, ...MODEL_NODE, id, kind: "node", type: "model", x, y, z: "a0" });

/** a board file from the lines of its elements, sorted as the canonical form has them */
export const boardText = (...elements: string[]): string =>
  [
    String.raw`{"format":"structured-model","meta":{"title":"Host board","version":1},"version":1}`,
    ...[...elements].sort((a, b) => (idOf(a) < idOf(b) ? -1 : 1)),
    "",
  ].join("\n");
const idOf = (line: string): string => (JSON.parse(line) as { id: string }).id;

async function drawn(modeler: CollaborativeBoard, element: HTMLElement): Promise<void> {
  const started = performance.now();
  for (;;) {
    const missing = missingOnCanvas(modeler, element);
    if (missing === undefined) return;
    if (performance.now() - started > DRAWN_TIMEOUT_MS) {
      throw new Error(`the canvas does not show ${missing}`);
    }
    await sleep(POLL_MS);
  }
}

/**
 * Resolves once the canvas shows the text: the toolbar, a wrapper per node and every lazily
 * loaded part in place. It does not wait for an editor: poll `data-embed-state` or
 * `runtime.mounted(id)`.
 */
export async function mountHostBoard(
  files: Record<string, MemoryFile>,
  text: string,
  options: HostBoardOptions = {},
): Promise<HostBoard> {
  const backend = createMemoryBackend(files);
  const editors = standInEditors(options);
  // what a host passes: the suffixes of the editors it shows, and the pictures a board draws
  const rule =
    options.rule ?? suffixRule({ models: editors.entry.suffixes, pictures: PICTURE_SUFFIXES });
  const port = connectBackend(backend, rule);
  const sessions: HostBoard["sessions"] = [];
  const opens: string[] = [];
  const counted: BoardFiles = {
    ...port,
    async openText(path) {
      opens.push(path);
      const session = await port.openText(path);
      await options.sessionGate;
      const entry = { path, closes: 0 };
      sessions.push(entry);
      const close = session.close.bind(session);
      session.close = () => {
        entry.closes += 1;
        close();
      };
      return session;
    },
  };
  const host = createFilesHost({
    files: counted,
    editors: [editors.entry],
    containHistoryKeys: options.containHistoryKeys,
    invalidText: options.invalidText,
  });
  const size = options.size ?? { width: 1200, height: 720 };
  const element = attachedHost(size.width, size.height);
  const modeler = createCollaborativeModeler({ host });
  let changes = 0;
  modeler.onContentChanged(() => void (changes += 1));
  const engines = new Map<string, HTMLElement>();
  const board: HostBoard = {
    modeler,
    element,
    runtime: boardRuntimeOf(modeler),
    backend,
    files: port,
    host,
    editors,
    sessions,
    opens,
    boardChanges: () => changes,
    node(id) {
      const wrapper = element.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${CSS.escape(id)}"]`,
      );
      if (!wrapper) throw new Error(`the board shows no node ${id}`);
      return wrapper;
    },
    engine(id) {
      // an armed engine is in the layer, outside its node: it is known from when it was inside
      const inNode = board.node(id).querySelector<HTMLElement>(".board-engine");
      if (inNode) engines.set(id, inNode);
      const engine = inNode ?? engines.get(id);
      if (!engine?.isConnected) throw new Error(`the node ${id} has no engine`);
      return engine;
    },
    editorOf(id) {
      const engine = board.engine(id);
      const found = editors.made.find(
        (made) => made.record.destroyed === 0 && engine.contains(made.container() ?? null),
      );
      if (!found) throw new Error(`no stand-in modeler is mounted in the node ${id}`);
      return found;
    },
    async settle() {
      await nextFrame();
      await nextFrame();
      await sleep(30);
    },
    async destroy() {
      modeler.destroy();
      // the board unmounts its canvas a microtask later; the editors end their sessions then
      const started = performance.now();
      while (element.querySelector(".board-engine") && performance.now() - started < 2000) {
        await sleep(POLL_MS);
      }
      host.dispose();
      port.dispose();
      element.parentElement?.remove();
    },
  };
  try {
    modeler.attachTo(element);
    await modeler.board.mounted;
    await modeler.importText(text);
    await drawn(modeler, element);
  } catch (error) {
    await board.destroy();
    throw error;
  }
  return board;
}
