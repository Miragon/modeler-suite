import type EventBus from "diagram-js/lib/core/EventBus";
import type Keyboard from "diagram-js/lib/features/keyboard/Keyboard";
import { hasModifier, isKey } from "diagram-js/lib/features/keyboard/KeyboardUtil";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Injector } from "didi";
import type { ElementId } from "@miragon/c4-schema-model";
import { DRILL_CLASS } from "../draw/drillBadge.js";
import { isElementShape } from "../scene/types.js";
import type { C4Views } from "../services.js";
import type C4Dialogs from "./C4Dialogs.js";

/** Ahead of the selection on click (diagram-js's at 500 and the default 1000). */
const BEFORE_THE_SELECTION = 1500;
/** Ahead of the label editor's double-click (the default 1000). */
const BEFORE_THE_LABEL_EDITOR = 1500;

interface ClickEvent {
  readonly element?: unknown;
  readonly originalEvent?: Event;
}

interface KeyContext {
  readonly keyEvent: KeyboardEvent;
}

/**
 * Drill-down and back (SPEC 4.5, 7.2): the drill badge and Enter open the view one level deeper
 * of a software system or container, U the parent view, G the "Views…" dialog. A view switch is
 * no command and writes nothing, so all of it works on a read-only canvas and in the viewer.
 */
export default class Navigation {
  static $inject = ["eventBus", "injector"];

  /**
   * The click count of the badge click that last opened a view, 0 once a new click began. The
   * rest of that double-click lands on the view it opened, where it would select an element or
   * open its label editor, or drill again through a badge at the same spot: it goes nowhere.
   */
  private drillClicks = 0;

  constructor(
    eventBus: EventBus,
    private readonly injector: Injector,
  ) {
    eventBus.on("element.click", BEFORE_THE_SELECTION, (event: ClickEvent) => {
      if (this.isRestOfDrill(event.originalEvent)) return false;
      this.drillClicks = 0;
      return this.badgeClicked(event) ? false : undefined;
    });
    eventBus.on("element.dblclick", BEFORE_THE_LABEL_EDITOR, (event: ClickEvent) =>
      this.isRestOfDrill(event.originalEvent) ? false : undefined,
    );
    this.injector
      .get<Keyboard>("keyboard", false)
      ?.addListener((context: KeyContext) => (this.onKey(context.keyEvent) ? true : undefined));
  }

  /** Shows the deeper view of a software system or container; false when it has none. */
  openChildOf(id: ElementId): boolean {
    const views = this.views();
    const child = views.childOf(id);
    return child !== undefined && views.open(child.key, { cause: "user" });
  }

  /** The deeper view of the one selected software system or container. */
  openSelectedChild(): boolean {
    const selected = this.injector.get<Selection>("selection", false)?.get() ?? [];
    const [only, ...more] = selected;
    if (more.length > 0 || !isElementShape(only)) return false;
    return this.openChildOf(only.c4.id);
  }

  openParent(): boolean {
    const views = this.views();
    const parent = views.parent();
    return parent !== undefined && views.open(parent.key, { cause: "user" });
  }

  showViews(): boolean {
    return this.injector.get<C4Dialogs>("c4Dialogs", false)?.showViews() !== undefined;
  }

  private badgeClicked({ element, originalEvent }: ClickEvent): boolean {
    const target = originalEvent?.target;
    if (!(target instanceof Element) || target.closest(`.${DRILL_CLASS}`) === null) return false;
    if (!isElementShape(element)) return false;
    if (this.openChildOf(element.c4.id) && originalEvent instanceof MouseEvent) {
      this.drillClicks = originalEvent.detail;
    }
    return true;
  }

  private isRestOfDrill(event: Event | undefined): boolean {
    const clicks = event instanceof MouseEvent ? event.detail : 0;
    return this.drillClicks > 0 && clicks > this.drillClicks;
  }

  private onKey(event: KeyboardEvent): boolean {
    if (hasModifier(event)) return false;
    if (isKey("Enter", event)) return this.openSelectedChild();
    if (isKey(["u", "U"], event)) return this.openParent();
    if (isKey(["g", "G"], event)) return this.showViews();
    return false;
  }

  private views(): C4Views {
    return this.injector.get<C4Views>("c4Views");
  }
}
