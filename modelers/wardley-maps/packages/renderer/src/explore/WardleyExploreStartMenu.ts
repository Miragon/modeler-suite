import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type {
  PopupMenuEntries,
  default as PopupMenuProvider,
} from "diagram-js/lib/features/popup-menu/PopupMenuProvider";
import type { Element } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import { focusCanvasWithoutRing, leaveKeysOnHiddenMenuToPage } from "../a11y/index.js";
import type { WardleyShapeType } from "../model/di-types.js";
import { keepKeysInsidePopup } from "../popup/index.js";
import { EXPLORE_CHROME_PRIORITY } from "./explore-chrome.js";
import { EXPLORE_CHANGED, type ExploreChangedEvent } from "./WardleyExplore.js";
import type WardleyExplore from "./WardleyExplore.js";

/** The diagram-js popup menu of "Start from…", also the menu's class and `data-popup`. */
export const EXPLORE_START_MENU = "wardley-explore-start";

/** Screen px between the palette entry and the menu below it. */
const MENU_OFFSET = 4;
const MENU_WIDTH = 280;

const TYPE_NAMES: Partial<Record<WardleyShapeType, string>> = {
  component: "Component",
  anchor: "User",
  submap: "Submap",
  pipeline: "Pipeline",
};

interface PopupMenuInternals {
  _current?: { providerId?: string; container?: HTMLElement } | null;
}

/**
 * "Start from…" of explore mode's toolbar: a searchable diagram-js popup menu of every component by
 * name, its type beside it; the chosen one is where exploring starts (again). The keyboard's way to
 * a start, next to a click on a faded component in the pick phase. Its keys stay inside it, and a
 * key on a menu the host hid is the page's, as in the element settings.
 */
export default class WardleyExploreStartMenu implements PopupMenuProvider {
  static $inject = ["eventBus", "canvas", "wardleyExplore", "injector"];

  private readonly popupMenu: PopupMenu | null;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly explore: WardleyExplore,
    injector: Injector,
  ) {
    this.popupMenu = injector.get<PopupMenu | null>("popupMenu", false) ?? null;
    const popupMenu = this.popupMenu;
    if (!popupMenu) return;
    popupMenu.registerProvider(EXPLORE_START_MENU, this);
    leaveKeysOnHiddenMenuToPage(popupMenu);
    eventBus.on("popupMenu.open", () => {
      const container = this.openContainer();
      container?.addEventListener("keydown", keepKeysInsidePopup);
    });
    eventBus.on(EXPLORE_CHANGED, EXPLORE_CHROME_PRIORITY, (event: ExploreChangedEvent) => {
      if (!event.active && this.isOpen()) popupMenu.close();
    });
    // A cleared canvas ends explore mode without EXPLORE_CHANGED, and its components are gone.
    eventBus.on("diagram.clear", () => {
      if (this.isOpen()) popupMenu.close();
    });
  }

  /** Opens the menu below `anchor` (the palette entry), while explore mode runs. */
  open(anchor: DOMRect): void {
    if (!this.popupMenu || !this.explore.isActive()) return;
    this.popupMenu.open(
      this.canvas.getRootElement() as unknown as Element,
      EXPLORE_START_MENU,
      { x: anchor.left, y: anchor.bottom + MENU_OFFSET },
      { title: "Start from", search: true, width: MENU_WIDTH },
    );
  }

  isOpen(): boolean {
    return this.openContainer() !== undefined;
  }

  getPopupMenuEntries(): PopupMenuEntries {
    const entries: PopupMenuEntries = {};
    for (const node of this.explore.nodes()) {
      entries[`explore-start.${node.id}`] = {
        label: node.label,
        description: TYPE_NAMES[node.type] ?? "",
        action: (event: Event) => this.startFrom(node.id, event),
      };
    }
    return entries;
  }

  private startFrom(nodeId: string, event: Event): void {
    this.popupMenu?.close();
    this.explore.startFrom(nodeId);
    // The menu took the focus with it: the canvas holds it next, where the explore keys act.
    if (event instanceof KeyboardEvent) this.canvas.focus();
    else focusCanvasWithoutRing(this.canvas);
  }

  private openContainer(): HTMLElement | undefined {
    const current = (this.popupMenu as unknown as PopupMenuInternals | null)?._current;
    return current?.providerId === EXPLORE_START_MENU ? current.container : undefined;
  }
}
