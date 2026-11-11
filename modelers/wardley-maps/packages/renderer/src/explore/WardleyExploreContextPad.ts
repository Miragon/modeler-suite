import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type { ContextPadTarget } from "diagram-js/lib/features/context-pad/ContextPad";
import type {
  ContextPadEntries,
  ContextPadEntriesCallback,
  ContextPadEntry,
  default as ContextPadProvider,
} from "diagram-js/lib/features/context-pad/ContextPadProvider";
import type { Element } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import { focusCanvasWithoutRing } from "../a11y/index.js";
import { cpHtml } from "../context-pad/index.js";
import { chromeIcon, type LucideIconName } from "../draw/lucide.js";
import { isWardleyShape } from "../model/di-types.js";
import type { ExploreDirection } from "./explore-graph.js";
import { EXPLORE_CHROME_PRIORITY, isKeyboardClick } from "./explore-chrome.js";
import { EXPLORE_CHANGED } from "./WardleyExplore.js";
import type WardleyExplore from "./WardleyExplore.js";

/** Below the modelling pad's provider, so explore mode's entries replace its entries. */
const PAD_PRIORITY = 500;

/** The pad's rows (`wardley.css`): the steps that reveal, then Hide. */
const GROUP_REVEAL = "edit";
const GROUP_HIDE = "wardley";

interface RevealSpec {
  readonly action: string;
  readonly title: string;
  readonly icon: LucideIconName;
  readonly direction: ExploreDirection;
  /** The whole chain in `direction`, not one level. */
  readonly chain: boolean;
}

const REVEAL_ENTRIES: readonly RevealSpec[] = [
  {
    action: "explore.dependencies",
    title: "Show dependencies",
    icon: "chevron-down",
    direction: "dependencies",
    chain: false,
  },
  {
    action: "explore.dependents",
    title: "Show dependents",
    icon: "chevron-up",
    direction: "dependents",
    chain: false,
  },
  {
    action: "explore.all-dependencies",
    title: "Show all dependencies",
    icon: "chevrons-down",
    direction: "dependencies",
    chain: true,
  },
  {
    action: "explore.all-dependents",
    title: "Show all dependents",
    icon: "chevrons-up",
    direction: "dependents",
    chain: true,
  },
];

const HIDE_ACTION = "explore.hide";
const HIDE_TITLE = "Hide";

interface ContextPadInternals {
  _current?: { target?: ContextPadTarget; html?: HTMLElement } | null;
}

/**
 * The context pad while exploring: on a component that shows, the steps from it (each only where it
 * would reveal something) and Hide (where it would hide something), in the look of the modelling
 * pad. It replaces the modelling entries, which the canvas lock leaves empty, and opens on nothing
 * else: no pad on links, commentary, a selection of several elements or a component without a
 * step. A step re-renders the pad on its component; after Enter or Space the focus goes back to the
 * entry of the same step, or to the first entry once that step has nothing left to reveal.
 */
export default class WardleyExploreContextPad implements ContextPadProvider {
  static $inject = ["eventBus", "canvas", "wardleyExplore", "injector"];

  private readonly contextPad: ContextPad | null;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly explore: WardleyExplore,
    injector: Injector,
  ) {
    this.contextPad = injector.get<ContextPad | null>("contextPad", false) ?? null;
    if (!this.contextPad) return;
    this.contextPad.registerProvider(PAD_PRIORITY, this);
    eventBus.on("contextPad.open.allowed", (event: { target?: ContextPadTarget }) =>
      this.allows(event.target) ? undefined : this.refuse(),
    );
    eventBus.on(EXPLORE_CHANGED, EXPLORE_CHROME_PRIORITY, () => this.refresh());
  }

  getContextPadEntries(element: Element): ContextPadEntriesCallback | ContextPadEntries {
    if (!this.explore.isActive()) return {};
    return () => this.entriesFor(element);
  }

  private entriesFor(element: Element): ContextPadEntries {
    if (!this.explore.isVisibleNode(element) || !isWardleyShape(element)) return {};
    const nodeId = element.id;
    const entries: ContextPadEntries = {};
    for (const spec of REVEAL_ENTRIES) {
      if (this.explore.hiddenCount(nodeId, spec.direction, spec.chain) === 0) continue;
      entries[spec.action] = this.entry(GROUP_REVEAL, spec.action, spec.title, spec.icon, () =>
        spec.chain
          ? this.explore.revealChain(nodeId, spec.direction)
          : this.explore.revealNeighbours(nodeId, spec.direction),
      );
    }
    if (this.explore.canHide(nodeId)) {
      entries[HIDE_ACTION] = this.entry(GROUP_HIDE, HIDE_ACTION, HIDE_TITLE, "eye-off", () =>
        this.explore.hide(nodeId),
      );
    }
    return entries;
  }

  private entry(
    group: string,
    action: string,
    title: string,
    icon: LucideIconName,
    step: () => void,
  ): ContextPadEntry {
    return {
      group,
      title,
      html: cpHtml(chromeIcon(icon), title),
      action: { click: (event: Event) => this.run(event, action, step) },
    };
  }

  private run(event: Event, action: string, step: () => void): void {
    step();
    if (isKeyboardClick(event)) this.focusEntry(action);
    else focusCanvasWithoutRing(this.canvas);
  }

  /**
   * While exploring, the pad opens on one component that shows and has a step to offer, and on
   * nothing else.
   */
  private allows(target: ContextPadTarget | undefined): boolean {
    if (!this.explore.isActive()) return true;
    if (!target || Array.isArray(target)) return false;
    return Object.keys(this.entriesFor(target as Element)).length > 0;
  }

  /** A refused pad also takes the pad of the previous selection away. */
  private refuse(): false {
    this.contextPad?.close();
    return false;
  }

  /** A step changes what the entries offer, so an open pad renders again on its component. */
  private refresh(): void {
    const contextPad = this.contextPad;
    if (!contextPad?.isOpen() || !this.explore.isActive()) return;
    const target = this.internals()._current?.target;
    if (target && this.allows(target)) contextPad.open(target, true);
    else contextPad.close();
  }

  private focusEntry(action: string): void {
    const pad = this.contextPad?.isOpen() ? this.internals()._current?.html : undefined;
    if (!pad) return;
    const entries = [...pad.querySelectorAll<HTMLElement>(".entry")];
    (entries.find((entry) => entry.dataset["action"] === action) ?? entries[0])?.focus();
  }

  private internals(): ContextPadInternals {
    return this.contextPad as unknown as ContextPadInternals;
  }
}
