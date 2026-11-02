import type { ParseResult } from "@miragon/c4-dsl";
import type { ViewKey } from "@miragon/c4-schema-model";
import { hashText } from "../document/hash.js";
import type { C4Engine } from "../engine/C4Engine.js";
import { buildSceneWith } from "./build.js";
import { schemaModelNotation } from "./notation.js";
import type { Scene } from "./types.js";

const CACHED_SCENES = 8;

/** Most recently used last, per engine: two engines may draw one text differently. */
const scenesByEngine = new WeakMap<C4Engine, Map<string, { parse: ParseResult; scene: Scene }>>();

/**
 * What the canvas draws for `view` of `parse` with the schema model's styles and sizes (SPEC 6.1):
 * the scene a fresh import shows. Memoised per (text hash, view) and engine.
 */
export function buildScene(parse: ParseResult, view: ViewKey, engine: C4Engine): Scene {
  let scenes = scenesByEngine.get(engine);
  if (!scenes) {
    scenes = new Map();
    scenesByEngine.set(engine, scenes);
  }
  const key = `${hashText(parse.text)}\n${view}`;
  const cached = scenes.get(key);
  scenes.delete(key);
  if (cached && cached.parse === parse) {
    scenes.set(key, cached);
    return cached.scene;
  }
  const scene = buildSceneWith(parse, view, engine, schemaModelNotation);
  scenes.set(key, { parse, scene });
  for (const oldest of scenes.keys()) {
    if (scenes.size <= CACHED_SCENES) break;
    scenes.delete(oldest);
  }
  return scene;
}
