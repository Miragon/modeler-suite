import type { ParseResult } from "@miragon/c4-dsl";
import type { ViewKey } from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import { hashText } from "../document/hash.js";
import type { C4Engine } from "../engine/C4Engine.js";
import type { C4SceneService } from "../services.js";
import { buildSceneWith } from "./build.js";
import type { SceneNotation } from "./notation.js";
import type { Scene } from "./types.js";

const CACHED_SCENES = 4;

/** The service `c4Scene`: the scene of the store's parse, memoised per (text hash, view). */
export default class SceneService implements C4SceneService {
  static $inject = ["c4Document", "c4Engine", "c4Notation"];

  /** Most recently used last. */
  private readonly scenes = new Map<string, { parse: ParseResult; scene: Scene }>();

  constructor(
    private readonly store: DocumentStore,
    private readonly engine: C4Engine,
    private readonly notation: SceneNotation,
  ) {}

  current(): Scene {
    const { parse, view } = this.store.current();
    return this.sceneOf(parse, this.store.textHash(), view);
  }

  of(view: ViewKey): Scene {
    const { parse } = this.store.current();
    return this.sceneOf(parse, this.store.textHash(), view);
  }

  /** The scene of another parse, as a fresh import would draw it (the invariant test). */
  ofParse(parse: ParseResult, view: ViewKey): Scene {
    return this.sceneOf(parse, hashText(parse.text), view);
  }

  private sceneOf(parse: ParseResult, hash: string, view: ViewKey): Scene {
    const key = `${hash}\n${view}`;
    const cached = this.scenes.get(key);
    if (cached && cached.parse === parse) {
      this.scenes.delete(key);
      this.scenes.set(key, cached);
      return cached.scene;
    }
    const scene = buildSceneWith(parse, view, this.engine, this.notation);
    this.scenes.delete(key);
    this.scenes.set(key, { parse, scene });
    while (this.scenes.size > CACHED_SCENES) {
      const [oldest] = this.scenes.keys();
      if (oldest === undefined) break;
      this.scenes.delete(oldest);
    }
    return scene;
  }
}
