/*
 * The autosave: the open workspace's text and the view on the canvas, kept in this browser and
 * restored on a visit without a link, plus whether the legend was open. A blocked storage (private
 * mode, a policy) keeps nothing; the workspace still lives in the page and in its link.
 */
import type { ViewKey } from "@miragon/c4-schema-model";

const DOCUMENT_KEY = "c4-modeler.document";
const VIEW_KEY = "c4-modeler.view";
const LEGEND_KEY = "c4-modeler.legend";

export interface StoredDocument {
  readonly text: string;
  readonly view: ViewKey | undefined;
}

/** Reads the storage, or undefined where the browser refuses it (the getter itself may throw). */
function storage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

function read(key: string): string | undefined {
  try {
    return storage()?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // A full or blocked storage: the workspace still lives in the page and in its link.
  }
}

function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing was stored.
  }
}

export function readStoredDocument(): StoredDocument | undefined {
  const text = read(DOCUMENT_KEY);
  if (text === undefined) return undefined;
  return { text, view: read(VIEW_KEY) || undefined };
}

export function storeDocument(text: string, view: ViewKey): void {
  write(DOCUMENT_KEY, text);
  write(VIEW_KEY, view);
}

export function forgetStoredDocument(): void {
  remove(DOCUMENT_KEY);
  remove(VIEW_KEY);
}

/** Whether the legend was open on the last visit; undefined before the first toggle. */
export function readLegendOpen(): boolean | undefined {
  const stored = read(LEGEND_KEY);
  return stored === undefined ? undefined : stored === "open";
}

export function writeLegendOpen(open: boolean): void {
  write(LEGEND_KEY, open ? "open" : "closed");
}
