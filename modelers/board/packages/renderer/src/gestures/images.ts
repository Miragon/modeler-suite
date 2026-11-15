import type { Point } from "@miragon/board-schema-model";
import { imagesOf } from "../host/defaults.js";
import type { BoardHost } from "../host/types.js";
import {
  addNode,
  assetPath,
  checkImage,
  fitImage,
  formatBytes,
  type Size,
  takenIn,
} from "../store/actions.js";
import type { BoardStore } from "../store/board-store.js";
import { notices } from "./notices.js";

// ── images ───────────────────────────────────────────────────────────────────

/** the picture's own size; undefined when it has none (an SVG without one), "unreadable" when it is no picture */
async function naturalSize(blob: Blob): Promise<Size | undefined | "unreadable"> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : undefined;
  } catch {
    return "unreadable";
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The boards that were destroyed, by their store; `destroy()` of the contract factory says so
 * (collaborative.tsx). Reading a picture's size and a host's upload both take a moment, and a
 * board that was destroyed meanwhile calls no `store` and writes no node: its document may be
 * the host's own (`liveDocument`), where a late write would reach every peer. Not said by a part
 * of the canvas: the Image button is the toolbar's, and a part that has not loaded yet, or that
 * ended by an error of its own, says nothing about the board.
 */
const ended = new WeakSet<BoardStore>();

/** the board on `store` was destroyed: an image of it that is still read or stored is given up */
export function setBoardEnded(store: BoardStore): void {
  ended.add(store);
}

/**
 * Image files become files of the repository (the host's images, `assets/<name>`) and one image
 * node each, which holds the path and nothing else. A node is written once the host has stored
 * its file, which may take a promise's time. A file the board does not take, or the host refuses,
 * is named in a notice with the reason. Returns the ids of the new nodes.
 */
export async function importImages(
  board: { host: BoardHost; store: BoardStore },
  files: readonly File[],
  centre: Point,
): Promise<string[]> {
  const added: string[] = [];
  const images = imagesOf(board.host);
  if (images.store === undefined) {
    if (files.length > 0)
      notices.push(
        "refused",
        "This board cannot store a new image yet. Add it to the repository first.",
      );
    return added;
  }
  for (const file of files) {
    const name = file.name === "" ? "The pasted file" : file.name;
    const check = checkImage(file);
    if (!check.ok) {
      notices.push("refused", check.reason);
      continue;
    }
    // the same bytes under the type its extension stands for: what the image route would answer with
    const blob = file.slice(0, file.size, check.type);
    const size = await naturalSize(blob);
    if (ended.has(board.store)) return added;
    if (size === "unreadable") {
      notices.push("refused", `${name} was not added: it could not be read as an image.`);
      continue;
    }
    let path: string;
    try {
      path = assetPath(file.name, check.extension, takenIn(images));
      // a store that returns at once is followed by its node in the same task, as it was measured
      const stored = images.store(path, blob);
      if (stored !== undefined) await stored;
    } catch (error) {
      if (ended.has(board.store)) return added;
      const reason = error instanceof Error ? error.message : String(error);
      notices.push("refused", `${name} was not added: ${reason}`);
      continue;
    }
    if (ended.has(board.store)) return added;
    const offset = added.length * 28;
    added.push(
      addNode(
        board.store,
        { type: "image", file: path, ...fitImage(size) },
        { x: centre.x + offset, y: centre.y + offset },
      ),
    );
    notices.push("added", `${path} is a file of the repository now (${formatBytes(blob.size)}).`);
  }
  return added;
}
