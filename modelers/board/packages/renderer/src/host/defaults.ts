/**
 * What the board reads of its host, with the answer of a host that offers nothing in its place.
 * Each port comes back as the SAME object for as long as the host holds the same part, with
 * functions that need no `this`: React reads them as an external store, where a new subscribe
 * function would subscribe anew on every render and a host's method would be called unbound.
 *
 * `list()` and `describe()` are host code that runs while React renders. Neither takes the board
 * down: a call that fails is reported once and answered with what the board had before it.
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

const reported = new WeakMap<object, Set<string>>();

/** says once per part of a host and call that the call failed: a render asks again and again */
function reportOnce(part: object, call: string, error: unknown): void {
  let calls = reported.get(part);
  if (calls === undefined) {
    calls = new Set();
    reported.set(part, calls);
  }
  if (calls.has(call)) return;
  calls.add(call);
  const message = error instanceof Error ? error.message : String(error);
  console.error("[board]", `${call} failed: ${message}`, error);
}

/**
 * A host's `list()` as the snapshot of an external store. React compares snapshots by identity,
 * so a host that builds its list anew on every call would render for ever: an answer with the
 * same entries is the array handed out before. A call that fails is answered with that array too.
 */
function steadyList<Entry>(
  part: object,
  call: string,
  read: () => readonly Entry[],
  same: (entry: Entry, before: Entry) => boolean,
  nothing: readonly Entry[],
): () => readonly Entry[] {
  let last = nothing;
  return () => {
    try {
      const next = read();
      if (!Array.isArray(next)) throw new TypeError("it returned no array");
      const unchanged =
        next === last ||
        (next.length === last.length &&
          next.every((entry, index) => same(entry, last[index] as Entry)));
      if (!unchanged) last = next;
    } catch (error) {
      reportOnce(part, call, error);
    }
    return last;
  };
}

const sameReference = (reference: BoardReference, before: BoardReference): boolean =>
  reference === before ||
  (reference.from === before.from &&
    reference.to === before.to &&
    reference.relation === before.relation);

const modelList = oncePer<NonNullable<BoardHost["models"]>, ModelList>((models) => ({
  list: steadyList(models, "host.models.list()", () => models.list(), Object.is, NO_PATHS),
  onChange: (listener) => models.onChange(listener),
}));

const images = oncePer<BoardImages, BoardImages>((port) => ({
  read: (path) => port.read(path),
  onChange: (listener) => port.onChange(listener),
  ...(port.taken === undefined ? {} : { taken: (path) => Boolean(port.taken?.(path)) }),
  ...(port.store === undefined ? {} : { store: (path, bytes) => port.store?.(path, bytes) }),
}));

const references = oncePer<BoardReferences, BoardReferences>((port) => ({
  list: steadyList(
    port,
    "host.references.list()",
    () => port.list(),
    sameReference,
    NO_REFERENCE_LIST,
  ),
  onChange: (listener) => port.onChange(listener),
}));

const fallbackDescriptions = oncePer<BoardHost, Map<string, ModelDescription>>(() => new Map());

/** the file name up to its first dot; a name that begins with a dot keeps that dot */
function fallbackTitle(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.indexOf(".", 1);
  return dot === -1 ? name : name.slice(0, dot);
}

/** what the host calls a file; undefined where it says nothing, is not asked or fails */
function describedByHost(host: BoardHost, path: string): ModelDescription | undefined {
  const { models } = host;
  // a node that names no file has nothing a host could describe
  if (path === "" || models?.describe === undefined) return undefined;
  try {
    return models.describe(path);
  } catch (error) {
    reportOnce(models, "host.models.describe()", error);
    return undefined;
  }
}

/** the host's answer, else the file name up to its first dot and no kind */
export function describeModel(host: BoardHost, path: string): ModelDescription {
  const described = describedByHost(host, path);
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
