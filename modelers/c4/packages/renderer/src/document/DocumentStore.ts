import type { ParseResult } from "@miragon/c4-dsl";
import type { ElementId, ViewKey } from "@miragon/c4-schema-model";
import type { C4Engine } from "../engine/C4Engine.js";
import { hashText } from "./hash.js";

/** The document while it is edited (SPEC 1.1): nothing on the canvas is authoritative. */
export interface DocumentState {
  readonly parse: ParseResult;
  /** The view on the canvas: written, implicit or draft. */
  readonly view: ViewKey;
  /** Palette-created ids that still follow the first name (SPEC 3.3). */
  readonly fresh: ReadonlySet<ElementId>;
}

/** The implicit landscape of a blank document (SPEC 4.2). */
export const INITIAL_VIEW: ViewKey = "SystemLandscape";

const CACHED_PARSES = 8;

/**
 * The text and its parse, the view on the canvas and the fresh ids. Only the document command,
 * the importer, a rebase and the view service set it. Starts on the empty workspace, so calls
 * before the first import work; parsed on first use, so a diagram built only to be mounted parses
 * nothing.
 */
export default class DocumentStore {
  static $inject = ["c4Engine"];

  private state: DocumentState | undefined;
  private hash = "";
  /** Most recently used last. */
  private readonly parses = new Map<string, ParseResult>();

  constructor(private readonly engine: C4Engine) {}

  current(): DocumentState {
    return this.state ?? this.startEmpty();
  }

  /** `hash` is the text's `hashText`, when the caller has it already. */
  set(state: DocumentState, hash: string = hashText(state.parse.text)): void {
    this.state = state;
    this.hash = hash;
    this.remember(state.parse, hash);
  }

  textHash(): string {
    this.current();
    return this.hash;
  }

  /** The parse of `text`, from the cache when a command made it already. */
  parseOf(text: string, hash: string = hashText(text)): ParseResult {
    const cached = this.parses.get(hash);
    if (cached && cached.text === text) {
      this.remember(cached, hash);
      return cached;
    }
    const parse = this.engine.parse(text);
    this.remember(parse, hash);
    return parse;
  }

  private startEmpty(): DocumentState {
    const state: DocumentState = {
      parse: this.engine.parse(""),
      view: INITIAL_VIEW,
      fresh: new Set(),
    };
    this.set(state);
    return state;
  }

  /** Keeps `parse` for a later `parseOf` of its text: the outcome of an edit, before its command. */
  remember(parse: ParseResult, hash: string = hashText(parse.text)): void {
    this.parses.delete(hash);
    this.parses.set(hash, parse);
    while (this.parses.size > CACHED_PARSES) {
      const [oldest] = this.parses.keys();
      if (oldest === undefined) break;
      this.parses.delete(oldest);
    }
  }
}
