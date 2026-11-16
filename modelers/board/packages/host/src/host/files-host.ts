import type { BoardHost } from "@miragon/board-renderer";

import { imagesFrom } from "./images.js";
import { modelsFrom, type ModelsOptions } from "./models.js";

export type FilesHostOptions = ModelsOptions;

/**
 * A board host from the files of a repository and a registry of editors: the models and the
 * images. The parts stay the same objects for its life, as the board asks.
 */
export function createFilesHost(options: FilesHostOptions): BoardHost & { dispose(): void } {
  const images = imagesFrom(options.files);
  return {
    models: modelsFrom(options),
    images,
    dispose: () => images.dispose(),
  };
}
