/*
 * The link: the workspace text compressed (deflate-raw, built into the browser, so no CDN) as
 * URL-safe Base64 in the hash (`#mz=`, the format of the other Miragon web apps), and the view it
 * shows (`&v=<key>`). The address bar holds it after every change, so the URL is the workspace on
 * the canvas; the fragment never reaches a server. A link shares an editable workspace, not a
 * picture.
 */
import type { ViewKey } from "@miragon/c4-schema-model";

const DOCUMENT_PREFIX = "#mz=";
const DOCUMENT_PARAMETER = "mz";
const VIEW_PARAMETER = "v";

/** What a link holds: the workspace text and the view it opens on, when it names one. */
export interface SharedLink {
  readonly text: string;
  readonly view: ViewKey | undefined;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64: string): Uint8Array {
  let normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  if (padding) normalized += "=".repeat(4 - padding);
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: ReadableWritablePair): Promise<Uint8Array> {
  const piped = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

/** UTF-8, then deflate-raw, then URL-safe Base64. A workspace shrinks by about 4 to 6 times. */
export async function encodeDocument(text: string): Promise<string> {
  const deflated = await pipe(new TextEncoder().encode(text), new CompressionStream("deflate-raw"));
  return toBase64Url(deflated);
}

/** URL-safe Base64, then inflate, then UTF-8. */
export async function decodeDocument(encoded: string): Promise<string> {
  const inflated = await pipe(fromBase64Url(encoded), new DecompressionStream("deflate-raw"));
  return new TextDecoder("utf-8", { fatal: true }).decode(inflated);
}

/** Whether `hash` carries a workspace at all, readable or not (a link cut off when copied). */
export function holdsLink(hash: string): boolean {
  return hash.startsWith(DOCUMENT_PREFIX);
}

/** The workspace and view of a `#mz=` hash; undefined without one or when it can't be decoded. */
export async function readLink(hash: string): Promise<SharedLink | undefined> {
  if (!holdsLink(hash)) return undefined;
  const parameters = new URLSearchParams(hash.slice(1));
  const encoded = parameters.get(DOCUMENT_PARAMETER);
  if (!encoded) return undefined;
  try {
    const text = await decodeDocument(encoded);
    return { text, view: parameters.get(VIEW_PARAMETER) || undefined };
  } catch {
    return undefined;
  }
}

/** The hash that carries `text`, and `view` when given: `#mz=<text>&v=<key>`. */
export async function linkHash(text: string, view?: ViewKey): Promise<string> {
  const encoded = await encodeDocument(text);
  const viewPart = view ? `&${VIEW_PARAMETER}=${encodeURIComponent(view)}` : "";
  return `${DOCUMENT_PREFIX}${encoded}${viewPart}`;
}

/**
 * The whole link to the page at `origin`, `pathname` and `search`, with `text` and `view` in its
 * hash: the URL the address bar holds for that workspace (`createLinkWriter`).
 */
export async function shareUrl(
  page: { readonly origin: string; readonly pathname: string; readonly search?: string },
  text: string,
  view?: ViewKey,
): Promise<string> {
  return `${page.origin}${page.pathname}${page.search ?? ""}${await linkHash(text, view)}`;
}

/** The page's address and its history entry: `window.location` and `window.history` in the app. */
export interface AddressBar {
  readonly location: { readonly pathname: string; readonly search: string; readonly hash: string };
  readonly history: {
    readonly state: unknown;
    replaceState(data: unknown, unused: string, url: string): void;
  };
}

/** Keeps the address bar on the workspace of the canvas (`createLinkWriter`). */
export interface LinkWriter {
  /**
   * The link to `link` in the address bar, once compressed and its turn has come, unless a later
   * call overtook it. Never rejects: a write the browser refuses is tried again.
   */
  show(link: SharedLink): Promise<void>;
  /** The address bar without a hash: an empty workspace has no link (a clean URL). */
  clear(): void;
  /** Drops a write still being compressed or waiting: a link the user pasted overtakes it. */
  cancel(): void;
  /** No write from now on. */
  stop(): void;
}

/**
 * The least time between two writes of the address bar. Browsers refuse a burst of history writes
 * (WebKit throws a SecurityError from the 101st within 10 seconds), and a held arrow key moves the
 * selection about 30 times a second, one edit each.
 */
export const LINK_WRITE_INTERVAL_MS = 250;

/** How long a write the browser refused waits before it is tried again. */
const REFUSED_WRITE_RETRY_MS = 1000;

/** The time and the timers the link writer waits with; a test passes its own. */
export interface LinkWriterClock {
  now(): number;
  setTimeout(run: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

const SYSTEM_CLOCK: LinkWriterClock = {
  now: () => performance.now(),
  setTimeout: (run, delay) => globalThis.setTimeout(run, delay),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Writes the link into the address bar in place of the current entry: no history step, no
 * `hashchange`, so the back button leaves the app instead of stepping through edits. Compressing
 * takes a moment, so a write that a later one overtook in the meantime is dropped. A change after a
 * quiet moment is written at once; the changes of a burst wait for the interval and only the last
 * of them is written.
 */
export function createLinkWriter(
  bar: AddressBar,
  clock: LinkWriterClock = SYSTEM_CLOCK,
): LinkWriter {
  let writes = 0;
  let stopped = false;
  let lastWrite = Number.NEGATIVE_INFINITY;
  let waitingHash: string | undefined;
  let timer: unknown;
  let waiting: (() => void)[] = [];

  const settle = (): void => {
    const settled = waiting;
    waiting = [];
    for (const resolve of settled) resolve();
  };

  const unschedule = (): void => {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = undefined;
  };

  const flush = (): void => {
    timer = undefined;
    const hash = waitingHash;
    waitingHash = undefined;
    if (stopped || hash === undefined || bar.location.hash === hash) return settle();
    const { pathname, search } = bar.location;
    try {
      bar.history.replaceState(bar.history.state, "", `${pathname}${search}${hash}`);
    } catch {
      // The browser refuses history writes for a while; a later change may overtake this one.
      waitingHash = hash;
      timer = clock.setTimeout(flush, REFUSED_WRITE_RETRY_MS);
    }
    lastWrite = clock.now();
    settle();
  };

  const request = (hash: string): Promise<void> => {
    waitingHash = hash;
    if (timer === undefined && bar.location.hash === hash) {
      waitingHash = undefined;
      return Promise.resolve();
    }
    const written = new Promise<void>((resolve) => waiting.push(resolve));
    if (timer === undefined) {
      const wait = lastWrite + LINK_WRITE_INTERVAL_MS - clock.now();
      if (wait <= 0) flush();
      else timer = clock.setTimeout(flush, wait);
    }
    return written;
  };

  const cancel = (): void => {
    writes += 1;
    waitingHash = undefined;
    unschedule();
    settle();
  };

  return {
    async show(link) {
      const write = ++writes;
      const hash = await linkHash(link.text, link.view);
      if (write !== writes || stopped) return;
      await request(hash);
    },
    clear() {
      writes += 1;
      if (!stopped) void request("");
    },
    cancel,
    stop() {
      stopped = true;
      cancel();
    },
  };
}
