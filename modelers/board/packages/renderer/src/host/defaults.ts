/**
 * What the board reads of its host, with the answer of a host that offers nothing in its place.
 * Each port comes back as the SAME object for as long as the host holds the same part, with
 * functions that need no `this`: React reads them as an external store, where a new subscribe
 * function would subscribe anew on every render and a host's method would be called unbound.
 */
import type {
  BoardHost,
  BoardImages,
  BoardReference,
  BoardReferences,
  ModelDescription,
} from "./types.js";

/** what the model picker reads of `host.models` */
type ModelList = ReturnType<typeof modelListOf>;

const NOTHING_TO_UNSUBSCRIBE = (): void => {};
const NEVER_CHANGES = (): (() => void) => NOTHING_TO_UNSUBSCRIBE;

const NO_PATHS: readonly string[] = Object.freeze([]);
const NO_MODELS: ModelList = { list: () => NO_PATHS, onChange: NEVER_CHANGES };
const NO_IMAGES: BoardImages = { read: () => undefined, onChange: NEVER_CHANGES };
const NO_REFERENCE_LIST: readonly BoardReference[] = Object.freeze([]);
const NO_REFERENCES: BoardReferences = { list: () => NO_REFERENCE_LIST, onChange: NEVER_CHANGES };

/** one answer per part of a host, made when the part is first asked for */
function oncePer<Part extends object, Port>(make: (part: Part) => Port): (part: Part) => Port {
  const made = new WeakMap<Part, Port>();
  return (part) => {
    const known = made.get(part);
    if (known !== undefined) return known;
    const port = make(part);
    made.set(part, port);
    return port;
  };
}

const modelList = oncePer<NonNullable<BoardHost["models"]>, ModelList>((models) => ({
  list: () => models.list(),
  onChange: (listener) => models.onChange(listener),
}));

const images = oncePer<BoardImages, BoardImages>((port) => ({
  read: (path) => port.read(path),
  onChange: (listener) => port.onChange(listener),
  ...(port.store === undefined ? {} : { store: (path, bytes) => port.store?.(path, bytes) }),
}));

const references = oncePer<BoardReferences, BoardReferences>((port) => ({
  list: () => port.list(),
  onChange: (listener) => port.onChange(listener),
}));

const fallbackDescriptions = oncePer<BoardHost, Map<string, ModelDescription>>(() => new Map());

/** the file name up to its first dot; a name that begins with a dot keeps that dot */
function fallbackTitle(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.indexOf(".", 1);
  return dot === -1 ? name : name.slice(0, dot);
}

/** the host's answer, else the file name up to its first dot and no kind */
export function describeModel(host: BoardHost, path: string): ModelDescription {
  const described = host.models?.describe?.(path);
  if (described !== undefined) return described;
  const known = fallbackDescriptions(host);
  let fallback = known.get(path);
  if (fallback === undefined) {
    fallback = { title: fallbackTitle(path) };
    known.set(path, fallback);
  }
  return fallback;
}

/** the host's model list, or one that is empty and never changes */
export function modelListOf(host: BoardHost): {
  list(): readonly string[];
  onChange(listener: () => void): () => void;
} {
  return host.models === undefined ? NO_MODELS : modelList(host.models);
}

/** the host's images, or a port that has none and stores none (`store` undefined) */
export function imagesOf(host: BoardHost): BoardImages {
  return host.images === undefined ? NO_IMAGES : images(host.images);
}

/** the host's references, or a port that lists none */
export function referencesOf(host: BoardHost): BoardReferences {
  return host.references === undefined ? NO_REFERENCES : references(host.references);
}
