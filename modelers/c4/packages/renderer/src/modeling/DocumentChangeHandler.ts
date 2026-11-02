import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Element } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type { C4Edit, IdChange, ParseResult, TextEdit } from "@miragon/c4-dsl";
import type { ElementId, ViewKey } from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import { hashText } from "../document/hash.js";
import type { C4Engine } from "../engine/C4Engine.js";
import { reveal, select } from "../navigation/reveal.js";
import type Reconciler from "../reconcile/Reconciler.js";
import type SceneService from "../scene/SceneService.js";
import { VIEW_CHANGED_EVENT, type ViewChangeCause, type ViewChangedEvent } from "../services.js";
import type ViewService from "../views/ViewService.js";
import { changedItems } from "./changedItems.js";
import { C4HistoryMismatchError } from "./errors.js";

/** After the hosts' own listeners (1000), which restore or fit the view's place first. */
const AFTER_THE_HOST = 500;

/** The one command every document change runs as (SPEC 1.3, 1.4). */
export const DOCUMENT_CHANGE = "c4.document.change";

/** Reversible text patches guarded by text hashes: never a shape (SPEC 1.4). */
export interface DocumentChangeContext {
  /** For tests and a later history list. */
  readonly label: C4Edit["type"];
  /** Before to after, non-overlapping, against the text before. */
  readonly edits: readonly TextEdit[];
  /** After to before, against the text after. */
  readonly inverse: readonly TextEdit[];
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly viewBefore: ViewKey;
  /** The outcome's view: differs when the edit re-keyed, removed or created the view shown. */
  readonly viewAfter: ViewKey;
  /** Why `viewAfter` differs; undefined when it does not. */
  readonly viewCause: Extract<ViewChangeCause, "rekey" | "removed" | "user"> | undefined;
  readonly freshBefore: ReadonlySet<ElementId>;
  readonly freshAfter: ReadonlySet<ElementId>;
  readonly idChanges: readonly IdChange[];
}

/**
 * The command's handler: applies a patch to the store, then syncs the canvas in place. An undo or
 * redo that switches views selects what it changed there, so the switch points at its reason.
 */
export default class DocumentChangeHandler {
  static $inject = [
    "c4Document",
    "c4Engine",
    "c4Reconciler",
    "c4Views",
    "c4Scene",
    "eventBus",
    "injector",
  ];

  /** What the last switching undo or redo selected, revealed once the view's place is set. */
  private toReveal: readonly string[] = [];

  constructor(
    private readonly store: DocumentStore,
    private readonly engine: C4Engine,
    private readonly reconciler: Reconciler,
    private readonly views: ViewService,
    private readonly scenes: SceneService,
    eventBus: EventBus,
    private readonly injector: Injector,
  ) {
    eventBus.on(VIEW_CHANGED_EVENT, AFTER_THE_HOST, ({ cause }: ViewChangedEvent) => {
      const ids = this.toReveal;
      this.toReveal = [];
      if (cause !== "undo" && cause !== "redo") return;
      const registry = this.injector.get<ElementRegistry>("elementRegistry");
      const shapes = ids
        .map((id) => registry.get(id) as Element | undefined)
        .filter((shape): shape is Element => shape !== undefined);
      reveal(this.injector, shapes);
    });
  }

  /** The first run and every redo; diagram-js skips `preExecute` on a redo. */
  execute(context: DocumentChangeContext): Element[] {
    const shown = this.store.current().view;
    const cause: ViewChangeCause =
      shown === context.viewBefore ? (context.viewCause ?? "user") : "redo";
    return this.apply(
      context.edits,
      context.beforeHash,
      context.afterHash,
      context.viewAfter,
      context.freshAfter,
      context.idChanges,
      cause,
    );
  }

  revert(context: DocumentChangeContext): Element[] {
    // Undoing a re-key in the view it re-keyed gives the view its old key back: no other view.
    const sameView =
      context.viewCause === "rekey" && this.store.current().view === context.viewAfter;
    return this.apply(
      context.inverse,
      context.afterHash,
      context.beforeHash,
      context.viewBefore,
      context.freshBefore,
      [...context.idChanges].reverse().map(({ kind, from, to }) => ({ kind, from: to, to: from })),
      "undo",
      sameView,
    );
  }

  private apply(
    patch: readonly TextEdit[],
    from: string,
    to: string,
    view: ViewKey,
    fresh: ReadonlySet<ElementId>,
    idChanges: readonly IdChange[],
    cause: ViewChangeCause,
    sameView = cause === "rekey",
  ): Element[] {
    const current = this.store.textHash();
    if (current !== from) throw new C4HistoryMismatchError(from, current);
    const before = this.store.current();
    const text = this.engine.applyTextEdits(before.parse.text, patch);
    const actual = hashText(text);
    if (actual !== to) throw new C4HistoryMismatchError(to, actual);
    // Set first: `exportText()` inside `commandStack.changed` already returns the new text (L3).
    this.store.set({ parse: this.store.parseOf(text, to), view, fresh }, to);
    const switched = view !== before.view;
    if (switched) this.views.switchedInCommand(before.view, view, cause, sameView);
    const synced = this.reconciler.sync(this.scenes.current(), idChanges);
    if (switched && !sameView && (cause === "undo" || cause === "redo")) {
      this.selectChanged(before.parse, view, idChanges);
    }
    return synced;
  }

  private selectChanged(
    parseBefore: ParseResult,
    view: ViewKey,
    idChanges: readonly IdChange[],
  ): void {
    const changed = changedItems(
      this.scenes.ofParse(parseBefore, view),
      this.scenes.current(),
      idChanges,
    );
    this.toReveal = changed;
    select(this.injector, changed);
  }
}
