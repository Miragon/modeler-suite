/**
 * A host in memory for the board's own tests: the model files, images, references and peers a
 * test sets by hand, and editors that record what the board does with them. The parts stay the
 * same objects for the life of a host and a list stays the same array until its change was
 * reported, as the board reads them as external stores.
 */
import type {
  BoardCanvasPresence,
  BoardHost,
  BoardImages,
  BoardModels,
  BoardPeer,
  BoardPresence,
  BoardReference,
  BoardReferences,
  EmbeddedEditor,
  EmbeddedEditorContext,
  ModelDescription,
} from "../../src/host/types.js";
import { IMAGE_PATH, MODEL_PATH } from "./board-texts.js";

export interface EditorEvent {
  event: "open" | "armed" | "release" | "focus" | "destroy";
  nodeId: string;
  path: string;
  /** for "armed": the new value; for "release": what armed() answered inside the call */
  armed?: boolean | undefined;
}

export interface TestHostSeed {
  /** default [MODEL_PATH] */
  models?: readonly string[] | undefined;
  /** absent: the host has no `describe` at all, and the board names a file by its stem */
  describe?: Readonly<Record<string, ModelDescription>> | undefined;
  /** default: IMAGE_PATH as a small SVG */
  images?: Readonly<Record<string, Blob>> | undefined;
  /** default false: host.images.store is absent */
  canStore?: boolean | undefined;
  /**
   * How images.store answers where canStore is true. Default "sync": the image is there when
   * store() returns. "manual": a promise that settleStore() decides, and the image is there once
   * it resolved. "throw" and "reject": a throw, or a rejected promise, with the message
   * "<path> was refused by the test host", and no image.
   */
  storing?: "sync" | "manual" | "throw" | "reject" | undefined;
  /**
   * Paths that are in use although read() has no bytes for them, as the files a host has not
   * loaded. Present: the host has images.taken(), which answers true for these and for every
   * image it holds. Absent: the host has no `taken`.
   */
  taken?: readonly string[] | undefined;
  references?: readonly BoardReference[] | undefined;
  /**
   * How open() answers. Default "sync"; "async" a promise that resolves one macrotask later, as
   * an editor that loads its code does; "none" returns undefined; "reject" a rejected promise
   * whose message is "<path> was refused by the test host".
   */
  editors?: "sync" | "async" | "none" | "reject" | undefined;
  /** default "resolved"; "manual": settleReady() decides */
  ready?: "resolved" | "manual" | undefined;
}

export interface TestHost extends BoardHost {
  readonly events: EditorEvent[];
  /** the context of the editor opened last for a node */
  readonly contexts: Map<string, EmbeddedEditorContext>;
  readonly stored: Array<{ path: string; bytes: Blob }>;
  /** every path images.store was called with, in call order, stored or not */
  readonly storeCalls: string[];
  /** every question about a path, in call order: which of images.read and images.taken was asked */
  readonly asked: Array<{ via: "read" | "taken"; path: string }>;
  readonly published: Array<BoardCanvasPresence | null>;
  setModels(paths: readonly string[]): void;
  setReferences(references: readonly BoardReference[]): void;
  setImage(path: string, bytes: Blob | undefined): void;
  setPeers(peers: BoardPeer[]): void;
  settleReady(nodeId: string, error?: Error): void;
  /** seed storing "manual": the store of `path` that waits longest resolves, or rejects with `error` */
  settleStore(path: string, error?: Error): void;
}

const SKETCH =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 24"><path d="M2 22 12 8l6 8 4-5 8 11z"/></svg>';

interface ChangeSignal {
  onChange(listener: () => void): () => void;
  report(): void;
}

function createChangeSignal(): ChangeSignal {
  const listeners = new Set<() => void>();
  return {
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    report() {
      for (const listener of [...listeners]) listener();
    },
  };
}

interface PendingReady {
  resolve(): void;
  reject(error: Error): void;
}

export function createTestHost(seed: TestHostSeed = {}): TestHost {
  const events: EditorEvent[] = [];
  const contexts = new Map<string, EmbeddedEditorContext>();
  const stored: Array<{ path: string; bytes: Blob }> = [];
  const storeCalls: string[] = [];
  const asked: Array<{ via: "read" | "taken"; path: string }> = [];
  const pendingStores: Array<{ path: string; settle: PendingReady }> = [];
  const published: Array<BoardCanvasPresence | null> = [];
  const pendingReady = new Map<string, PendingReady>();

  const createEditor = (context: EmbeddedEditorContext): EmbeddedEditor => {
    const { nodeId, path, element } = context;
    const content = document.createElement("div");
    content.dataset.testEditor = nodeId;
    content.tabIndex = -1;
    content.style.cssText = "width:100%;height:100%";
    content.textContent = path;
    element.appendChild(content);
    const stopListening = context.onArmedChange((armed) => {
      events.push({ event: "armed", nodeId, path, armed });
    });
    const ready =
      seed.ready === "manual"
        ? new Promise<void>((resolve, reject) => pendingReady.set(nodeId, { resolve, reject }))
        : Promise.resolve();
    return {
      ready,
      release() {
        events.push({ event: "release", nodeId, path, armed: context.armed() });
        if (document.activeElement === content) content.blur();
      },
      focus() {
        events.push({ event: "focus", nodeId, path });
        content.focus({ preventScroll: true });
      },
      destroy() {
        events.push({ event: "destroy", nodeId, path });
        stopListening();
        content.remove();
      },
    };
  };

  const answers = seed.editors ?? "sync";
  const open: BoardModels["open"] = (context) => {
    const { nodeId, path } = context;
    events.push({ event: "open", nodeId, path });
    contexts.set(nodeId, context);
    if (answers === "none") return undefined;
    if (answers === "reject") {
      return Promise.reject(new Error(`${path} was refused by the test host`));
    }
    if (answers === "async") {
      return new Promise((resolve) => setTimeout(() => resolve(createEditor(context)), 0));
    }
    return createEditor(context);
  };

  let modelPaths: readonly string[] = Object.freeze([...(seed.models ?? [MODEL_PATH])]);
  const modelsChanged = createChangeSignal();
  const { describe } = seed;
  const models: BoardModels = {
    list: () => modelPaths,
    onChange: modelsChanged.onChange,
    ...(describe === undefined ? {} : { describe: (path: string) => describe[path] }),
    open,
  };

  const pictures = new Map<string, Blob>(
    Object.entries(seed.images ?? { [IMAGE_PATH]: new Blob([SKETCH], { type: "image/svg+xml" }) }),
  );
  const imagesChanged = createChangeSignal();
  const setImage = (path: string, bytes: Blob | undefined): void => {
    if (bytes === undefined) pictures.delete(path);
    else pictures.set(path, bytes);
    imagesChanged.report();
  };
  const keep = (path: string, bytes: Blob): void => {
    stored.push({ path, bytes });
    setImage(path, bytes);
  };
  const storing = seed.storing ?? "sync";
  const store: NonNullable<BoardImages["store"]> = (path, bytes) => {
    storeCalls.push(path);
    if (storing === "sync") return keep(path, bytes);
    const refusal = new Error(`${path} was refused by the test host`);
    if (storing === "throw") throw refusal;
    if (storing === "reject") return Promise.reject(refusal);
    return new Promise<void>((resolve, reject) => {
      pendingStores.push({ path, settle: { resolve, reject } });
    }).then(() => keep(path, bytes));
  };
  const inUse = seed.taken === undefined ? undefined : new Set(seed.taken);
  const images: BoardImages = {
    read(path) {
      asked.push({ via: "read", path });
      return pictures.get(path);
    },
    onChange: imagesChanged.onChange,
    ...(inUse === undefined
      ? {}
      : {
          taken(path: string) {
            asked.push({ via: "taken", path });
            return inUse.has(path) || pictures.has(path);
          },
        }),
    ...(seed.canStore === true ? { store } : {}),
  };

  let referenceList: readonly BoardReference[] = Object.freeze([...(seed.references ?? [])]);
  const referencesChanged = createChangeSignal();
  const references: BoardReferences = {
    list: () => referenceList,
    onChange: referencesChanged.onChange,
  };

  let peers: BoardPeer[] = [];
  const peerListeners = new Set<(peers: BoardPeer[]) => void>();
  const presence: BoardPresence = {
    setLocal: (local) => void published.push(local),
    onRemote(listener) {
      peerListeners.add(listener);
      listener(peers);
      return () => void peerListeners.delete(listener);
    },
  };

  return {
    models,
    images,
    references,
    presence,
    events,
    contexts,
    stored,
    storeCalls,
    asked,
    published,
    setModels(paths) {
      modelPaths = Object.freeze([...paths]);
      modelsChanged.report();
    },
    setReferences(next) {
      referenceList = Object.freeze([...next]);
      referencesChanged.report();
    },
    setImage,
    setPeers(next) {
      peers = next;
      for (const listener of [...peerListeners]) listener(peers);
    },
    settleReady(nodeId, error) {
      const pending = pendingReady.get(nodeId);
      if (pending === undefined) {
        throw new Error(`settleReady: no editor of ${nodeId} waits (seed ready: "manual")`);
      }
      pendingReady.delete(nodeId);
      if (error === undefined) pending.resolve();
      else pending.reject(error);
    },
    settleStore(path, error) {
      const index = pendingStores.findIndex((pending) => pending.path === path);
      const [pending] = index < 0 ? [] : pendingStores.splice(index, 1);
      if (pending === undefined) {
        throw new Error(`settleStore: no store of ${path} waits (seed storing: "manual")`);
      }
      if (error === undefined) pending.settle.resolve();
      else pending.settle.reject(error);
    },
  };
}
