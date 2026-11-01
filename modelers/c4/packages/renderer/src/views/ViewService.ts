import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";
import type { ParseResult } from "@miragon/c4-dsl";
import type { Box, ElementId, ViewCatalog, ViewEntry, ViewKey } from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import type { C4Engine } from "../engine/C4Engine.js";
import type { ImportConfig } from "../io/Importer.js";
import type Reconciler from "../reconcile/Reconciler.js";
import type SceneService from "../scene/SceneService.js";
import {
  VIEW_CHANGED_EVENT,
  type C4Views,
  type ViewChangeCause,
  type ViewChangedEvent,
} from "../services.js";

/** Before the contract wrapper's change listeners (1000): a host reading the view sees the new one. */
const BEFORE_HOST_LISTENERS = 1500;

interface HeldGestures {
  holdAction(): () => void;
  cancel(): void;
}

interface SuspendableEditing {
  suspend(): void;
  resumeAfterImport(): void;
}

interface Closable {
  close(): void;
}

interface Rebuildable {
  _rebuild(): void;
}

interface Fitting {
  fitToContent(): void;
}

/**
 * The service `c4Views`: which view of the catalog the canvas shows, and the switch to another
 * (SPEC 1.7). A switch is no command and writes nothing: navigation never dirties the file, adds
 * no undo step and works under the read-only lock.
 */
export default class ViewService implements C4Views {
  static $inject = [
    "c4Document",
    "c4Engine",
    "c4Scene",
    "c4Reconciler",
    "eventBus",
    "canvas",
    "injector",
    "config.import",
  ];

  private readonly viewboxes = new Map<ViewKey, Box>();
  private catalogOf: { parse: ParseResult; catalog: ViewCatalog } | undefined;
  /** A switch inside a command, announced once the command has run. */
  private pending: ViewChangedEvent | undefined;
  private paletteFor: string | undefined;
  private destroyed = false;

  constructor(
    private readonly store: DocumentStore,
    private readonly engine: C4Engine,
    private readonly scenes: SceneService,
    private readonly reconciler: Reconciler,
    private readonly eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly injector: Injector,
    private readonly config: ImportConfig | undefined,
  ) {
    eventBus.on("commandStack.changed", BEFORE_HOST_LISTENERS, () => this.announcePending());
    eventBus.on("diagram.destroy", () => {
      this.destroyed = true;
      this.pending = undefined;
    });
  }

  catalog(): ViewCatalog {
    const { parse } = this.store.current();
    if (this.catalogOf?.parse !== parse) {
      this.catalogOf = { parse, catalog: this.engine.catalog(parse.workspace) };
    }
    return this.catalogOf.catalog;
  }

  active(): ViewEntry {
    const catalog = this.catalog();
    return catalog.resolve(this.store.current().view) ?? catalog.defaultView();
  }

  resolves(key: ViewKey): boolean {
    return this.catalog().resolve(key) !== undefined;
  }

  parent(): ViewEntry | undefined {
    return this.catalog().parentOf(this.active().key);
  }

  childOf(id: ElementId): ViewEntry | undefined {
    return this.catalog().childOf(id);
  }

  viewboxFor(key: ViewKey): Box | undefined {
    return this.viewboxes.get(key);
  }

  /**
   * Shows `key` outside a command; true once it is shown. A host's import from the selection
   * change the switch delivers waits until the switch has drawn the view.
   */
  open(key: ViewKey, options: { readonly cause: ViewChangeCause }): boolean {
    if (this.destroyed) return false;
    const entry = this.catalog().resolve(key);
    if (!entry) return false;
    const previous = this.active().key;
    if (entry.key === previous && this.store.current().view === entry.key) return true;
    const gestures = this.service<HeldGestures>("gestures");
    const release = gestures?.holdAction();
    const labelEditing = this.service<SuspendableEditing>("labelEditing");
    try {
      gestures?.cancel();
      labelEditing?.suspend();
      this.service<Closable>("contextPad")?.close();
      this.rememberViewbox(previous);
      this.store.set({ ...this.store.current(), view: entry.key }, this.store.textHash());
      this.reconciler.syncAndRedraw(this.scenes.current());
      // The shell's viewport drops its cached fit for the new content.
      this.eventBus.fire("elements.changed", { elements: [] });
      this.refreshPalette();
      if (this.config?.fitOnImport !== false && options.cause !== "host") {
        this.restoreViewbox(entry.key);
      }
      if (!this.destroyed) {
        this.eventBus.fire(VIEW_CHANGED_EVENT, { view: entry.key, previous, cause: options.cause });
      }
      labelEditing?.resumeAfterImport();
    } finally {
      release?.();
    }
    return true;
  }

  /**
   * The document command switched the view (an undo or redo across views, a view it removed or
   * re-keyed): the store and the canvas are set already; the event follows the command.
   * `sameView`: both keys name the view shown, as a re-key and its undo do, so the place the user
   * looks at goes over to the new key and nothing fits (SPEC 4.2). A removed view's place goes,
   * so its undo fits again (SPEC 7.5).
   */
  switchedInCommand(
    previous: ViewKey,
    next: ViewKey,
    cause: ViewChangeCause,
    sameView = cause === "rekey",
  ): void {
    if (cause === "removed") {
      this.viewboxes.delete(previous);
    } else {
      this.rememberViewbox(previous);
      if (sameView) this.rememberViewbox(next);
      if (cause === "rekey") this.viewboxes.delete(previous);
    }
    this.pending =
      this.pending === undefined
        ? { view: next, previous, cause }
        : { view: next, previous: this.pending.previous, cause };
  }

  /** The palette's entries follow the view's type and whether it is editable (SPEC 5.1). */
  refreshPalette(): void {
    const view = this.active();
    const signature = `${view.type}:${String(view.editable)}`;
    if (signature === this.paletteFor) return;
    this.paletteFor = signature;
    this.service<Rebuildable>("palette")?._rebuild();
  }

  private announcePending(): void {
    const event = this.pending;
    this.pending = undefined;
    if (!event || this.destroyed || event.view === event.previous) return;
    this.refreshPalette();
    if (this.config?.fitOnImport !== false && event.cause !== "rekey") {
      this.restoreViewbox(event.view);
    }
    this.eventBus.fire(VIEW_CHANGED_EVENT, event);
  }

  private rememberViewbox(key: ViewKey): void {
    try {
      const { x, y, width, height } = this.canvas.viewbox();
      if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
        this.viewboxes.set(key, { x, y, width, height });
      }
    } catch {
      // A canvas without a size yet has no viewbox to remember.
    }
  }

  private restoreViewbox(key: ViewKey): void {
    const remembered = this.viewboxes.get(key);
    if (remembered) this.canvas.viewbox(remembered);
    else this.service<Fitting>("importer")?.fitToContent();
  }

  private service<T>(name: string): T | undefined {
    return this.injector.get<T>(name, false) ?? undefined;
  }
}
