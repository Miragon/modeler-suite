import type { EditorEntry } from "@miragon/board-host";

/**
 * The declared face of `src/registry.ts`. The apps that import this workspace read this file and
 * never follow into another modeler's sources under their own compiler flags; a bundler takes the
 * source.
 */
export declare const SUITE_EDITORS: readonly EditorEntry[];
