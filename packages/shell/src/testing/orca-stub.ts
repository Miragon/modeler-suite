import type {
  OrcaDisposable,
  OrcaDocumentSession,
  OrcaEditorApi,
  OrcaSaveAsRequest,
  OrcaSaveAsResult,
  OrcaSessionOptions,
  OrcaTextMerge,
} from "../orca/webview/index.js";
import { recordFailures, type CspViolation } from "./failures.js";

/*
 * Runs in the page, in front of a modeler's Orca editor bundle: a stand-in for Orca's editor tab
 * and frame shell, so a modeler's e2e suite runs the shell's kit and its document sync without Orca.
 * The session follows the rules of Orca's own `orca.document.session()` (plugin-authoring.md,
 * "Custom editors"): one edit in flight, a baseline that moves only when Orca accepts an edit,
 * `merge` on a refused edit and on a disk write under unsaved edits, and the outside text winning
 * without `merge`.
 */

export type OrcaColorScheme = "light" | "dark";

export interface OrcaEditorStubOptions {
  /** The file's text when the tab opens. */
  text: string;
  /** Orca's mode; default `"light"`. */
  colorScheme?: OrcaColorScheme | undefined;
  /** An agent transcript or a remote file the person may not change. */
  readOnly?: boolean | undefined;
  /** The desktop app's `orca.files`; default `true`. Browser clients have none. */
  files?: boolean | undefined;
}

/** One `applyEdit` the session sent, with the refusal's code when Orca refused it. */
export interface OrcaStubEdit {
  baseVersion: number;
  text: string;
  refused?: "conflict" | "not_permitted" | undefined;
}

export interface OrcaEditorStub {
  /** The tab's buffer: what a save writes. */
  readonly text: string;
  /** The file on disk. */
  readonly disk: string;
  /** Whether the tab has unsaved edits. */
  readonly dirty: boolean;
  /** Whether Orca shows its Reload/Overwrite banner over the tab. */
  readonly banner: boolean;
  /** Every edit the session sent, refused ones included. */
  readonly edits: readonly OrcaStubEdit[];
  /** Every `orca.files.saveAs` request. */
  readonly saved: readonly OrcaSaveAsRequest[];
  /** Whether the editor passed `merge` to its session. */
  readonly merges: boolean;
  /** An outside change Orca hands a clean tab: an agent's write, Git, the Source view. */
  replace(text: string): void;
  /** The next `applyEdit` is refused with `conflict`, as when the file changed during the edit. */
  conflictNext(): void;
  /**
   * An agent writes the file on disk while the tab has unsaved edits. With `merge` the session
   * merges it into the draft and the tab stays dirty; without it, or when `merge` throws, Orca shows
   * its banner. A clean tab takes the text as `replace` does.
   */
  diskWriteWhileDirty(text: string): void;
  /** The banner's Reload: the tab takes the disk's text and the draft is gone. */
  reload(): void;
  /** The banner's Overwrite, or a plain save: Orca asks the editor to flush, then writes the buffer. */
  save(): Promise<void>;
  setColorScheme(colorScheme: OrcaColorScheme): void;
  /** Sends what the session holds back and settles once Orca answered, as before a save. */
  idle(): Promise<void>;
  cspViolations(): readonly CspViolation[];
  errors(): readonly string[];
}

export type OrcaStubWindow = Window & {
  __modelerShellOrcaStub?: OrcaEditorStub;
  orca?: OrcaEditorApi;
};

interface OrcaDocument {
  version: number;
  readOnly: boolean;
  text: string;
  /** The disk's text the tab's unsaved edits started from, on a disk write under them. */
  ancestor?: string | undefined;
}

class RefusedEdit extends Error {
  constructor(readonly code: "conflict" | "not_permitted") {
    super(code);
  }
}

interface SessionHost {
  current(): OrcaDocument;
  applyEdit(baseVersion: number, text: string): Promise<void>;
  onDocument(listener: (document: OrcaDocument) => void): OrcaDisposable;
  onFlush(listener: () => Promise<void> | undefined): OrcaDisposable;
  announceMerges(): void;
}

function openSession(host: SessionHost, options: OrcaSessionOptions): OrcaDocumentSession {
  const merge: OrcaTextMerge | null = typeof options.merge === "function" ? options.merge : null;
  const debounceMs = options.debounceMs ?? 250;
  let document = host.current();
  let base = document.text;
  let baseVersion = document.version;
  let value = base;
  let dirty = false;
  let generation = 0;
  let sentGeneration = 0;
  let discards = 0;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const replaced = new Set<(value: string) => void>();

  const emitReplace = (next: string): void => {
    for (const listener of [...replaced]) {
      try {
        listener(next);
      } catch (error) {
        console.error(error);
      }
    }
  };
  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const rebase = (next: OrcaDocument): string => {
    document = next;
    base = next.text;
    baseVersion = next.version;
    return base;
  };

  function refused(error: unknown): Promise<void> {
    if (
      disposed ||
      !(error instanceof RefusedEdit) ||
      error.code !== "conflict" ||
      document.version === baseVersion
    ) {
      throw error;
    }
    const previous = base;
    const mine = value;
    const outside = rebase(document);
    if (!merge) {
      value = outside;
      dirty = false;
      discards += 1;
      emitReplace(outside);
      throw error;
    }
    value = merge(previous, outside, mine);
    emitReplace(value);
    return send();
  }

  function send(): Promise<void> {
    clearTimer();
    if (disposed) return Promise.resolve();
    const sent = value;
    sentGeneration = generation;
    const mine = sentGeneration;
    const attempt = host.applyEdit(baseVersion, sent).then(() => {
      base = sent;
      if (generation === mine) dirty = false;
    }, refused);
    inFlight = attempt;
    const settled = (): void => {
      if (inFlight === attempt) inFlight = null;
      if (!disposed && dirty && generation !== sentGeneration && timer === null && !inFlight) {
        send().catch(() => undefined);
      }
    };
    attempt.then(settled, settled);
    return attempt;
  }

  function flush(): Promise<void> {
    clearTimer();
    if (disposed) return Promise.resolve();
    const current = inFlight ?? (dirty && !document.readOnly ? send() : null);
    if (!current) return Promise.resolve();
    const waited = sentGeneration;
    const discarded = discards;
    return current.then(
      () => (generation !== waited ? flush() : undefined),
      (error: unknown) => {
        if (!disposed && generation !== waited && discards === discarded) return flush();
        throw error;
      },
    );
  }

  const documents = host.onDocument((next) => {
    if (disposed || next.version === document.version) return;
    if (next.ancestor !== undefined && merge) {
      let merged: string;
      try {
        merged = merge(next.ancestor, next.text, value);
      } catch (error) {
        console.error(error);
        return;
      }
      rebase(next);
      value = merged;
      dirty = true;
      generation += 1;
      emitReplace(value);
      if (!inFlight) send().catch(() => undefined);
      return;
    }
    document = next;
    if (dirty || inFlight) return;
    if (next.text === base) {
      baseVersion = next.version;
      return;
    }
    value = rebase(next);
    emitReplace(value);
  });
  const flushes = host.onFlush(() => (disposed || document.readOnly ? undefined : flush()));
  if (merge) host.announceMerges();

  return Object.freeze({
    get value() {
      return value;
    },
    get readOnly() {
      return document.readOnly;
    },
    change(next: string) {
      if (disposed || document.readOnly) return;
      value = next;
      generation += 1;
      dirty = true;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        if (!inFlight) send().catch(() => undefined);
      }, debounceMs);
    },
    flush: () => flush().then(() => undefined),
    onReplace(listener: (value: string) => void) {
      const entry = (next: string): void => listener(next);
      replaced.add(entry);
      return Object.freeze({ dispose: () => void replaced.delete(entry) });
    },
    dispose() {
      disposed = true;
      clearTimer();
      documents.dispose();
      flushes.dispose();
      replaced.clear();
    },
  });
}

/** A task later, as a message from Orca's window arrives. */
const later = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Stands in for Orca around an editor frame: `<html>` with Orca's `light`/`dark` class,
 * `window.orca` with `document.session()`, `files.saveAs` and `on("theme")`, and an editor tab
 * that keeps the buffer, the disk and the banner. From then on it records CSP violations and
 * errors. Call it before the editor's code runs; also exposed as `window.__modelerShellOrcaStub`.
 */
export function installOrcaEditorStub(options: OrcaEditorStubOptions): OrcaEditorStub {
  const scope = window as OrcaStubWindow;
  const failures = recordFailures();
  let colorScheme: OrcaColorScheme = options.colorScheme ?? "light";
  let document: OrcaDocument = {
    version: 1,
    readOnly: options.readOnly === true,
    text: options.text,
  };
  let disk = options.text;
  let buffer = options.text;
  let banner = false;
  let merges = false;
  let refuseNext = false;
  const edits: OrcaStubEdit[] = [];
  const saved: OrcaSaveAsRequest[] = [];
  const documentListeners = new Set<(document: OrcaDocument) => void>();
  const flushListeners = new Set<() => Promise<void> | undefined>();
  const themeListeners = new Set<(theme: { colorScheme: string }) => void>();
  const showMode = (): void => {
    const html = globalThis.document.documentElement;
    html.classList.remove("light", "dark");
    html.classList.add(colorScheme);
  };
  const deliver = (next: OrcaDocument): void => {
    document = next;
    void later().then(() => {
      for (const listener of [...documentListeners]) listener(next);
    });
  };

  const host: SessionHost = {
    current: () => document,
    async applyEdit(baseVersion, text) {
      await later();
      if (document.readOnly) {
        edits.push({ baseVersion, text, refused: "not_permitted" });
        throw new RefusedEdit("not_permitted");
      }
      if (refuseNext || baseVersion !== document.version) {
        refuseNext = false;
        edits.push({ baseVersion, text, refused: "conflict" });
        throw new RefusedEdit("conflict");
      }
      edits.push({ baseVersion, text });
      document = { ...document, text, ancestor: undefined };
      buffer = text;
    },
    onDocument(listener) {
      documentListeners.add(listener);
      return { dispose: () => void documentListeners.delete(listener) };
    },
    onFlush(listener) {
      flushListeners.add(listener);
      return { dispose: () => void flushListeners.delete(listener) };
    },
    announceMerges() {
      merges = true;
    },
  };

  const api: OrcaEditorApi = Object.freeze({
    document: Object.freeze({
      session: async (sessionOptions: OrcaSessionOptions = {}) => {
        await later();
        return openSession(host, {
          ...sessionOptions,
          merge:
            sessionOptions.merge &&
            ((lastSynced: string, external: string, draft: string) => {
              try {
                return sessionOptions.merge!(lastSynced, external, draft);
              } catch (error) {
                banner = true;
                throw error;
              }
            }),
        });
      },
    }),
    ...(options.files === false
      ? {}
      : {
          files: Object.freeze({
            saveAs: async (request: OrcaSaveAsRequest): Promise<OrcaSaveAsResult> => {
              saved.push(request);
              return { status: "saved" };
            },
          }),
        }),
    on(event: "theme", callback: (theme: { colorScheme: string }) => void) {
      if (event !== "theme") throw new Error(`the Orca stub knows no event ${String(event)}`);
      themeListeners.add(callback);
      return { dispose: () => void themeListeners.delete(callback) };
    },
  });

  showMode();
  scope.orca = api;

  const stub: OrcaEditorStub = {
    get text() {
      return buffer;
    },
    get disk() {
      return disk;
    },
    get dirty() {
      return buffer !== disk;
    },
    get banner() {
      return banner;
    },
    get edits() {
      return edits;
    },
    get saved() {
      return saved;
    },
    get merges() {
      return merges;
    },
    replace(text) {
      disk = text;
      buffer = text;
      banner = false;
      deliver({ version: document.version + 1, readOnly: document.readOnly, text });
    },
    conflictNext() {
      refuseNext = true;
    },
    diskWriteWhileDirty(text) {
      if (buffer === disk) {
        stub.replace(text);
        return;
      }
      const ancestor = disk;
      disk = text;
      if (!merges) {
        banner = true;
        return;
      }
      deliver({ version: document.version + 1, readOnly: document.readOnly, text, ancestor });
    },
    reload() {
      stub.replace(disk);
    },
    async save() {
      await Promise.allSettled([...flushListeners].map((listener) => listener()));
      disk = buffer;
      banner = false;
    },
    setColorScheme(next) {
      colorScheme = next;
      showMode();
      for (const listener of [...themeListeners]) listener({ colorScheme: next });
    },
    async idle() {
      await later();
      await Promise.allSettled([...flushListeners].map((listener) => listener()));
    },
    cspViolations: () => failures.violations,
    errors: () => failures.errors,
  };
  scope.__modelerShellOrcaStub = stub;
  return stub;
}
