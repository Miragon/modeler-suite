import type EventBus from "diagram-js/lib/core/EventBus";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type {
  PaletteEntries,
  PaletteEntriesCallback,
  default as PaletteProvider,
} from "diagram-js/lib/features/palette/PaletteProvider";
import type { Injector } from "didi";
import { paletteToolIcon } from "../draw/palette-icons.js";
import {
  EXPLORE_ENTRY,
  type PaletteToolSpec,
  type WardleyPaletteProvider,
} from "../palette/index.js";
import { EXPLORE_CHROME_PRIORITY } from "./explore-chrome.js";
import { EXPLORE_CHANGED } from "./WardleyExplore.js";
import type WardleyExplore from "./WardleyExplore.js";
import type WardleyExploreStartMenu from "./WardleyExploreStartMenu.js";

/** Below every provider of the modelling palette: explore mode's toolbar has the last word. */
const TOOLBAR_PRIORITY = 100;

const START_FROM: PaletteToolSpec = {
  key: "explore.start-from",
  title: "Start from…",
  icon: paletteToolIcon("search"),
};
const STEP_BACK: PaletteToolSpec = {
  key: "explore.back",
  title: "Step back",
  shortcut: "B",
  icon: paletteToolIcon("step-back"),
};
const SHOW_ALL: PaletteToolSpec = {
  key: "explore.show-all",
  title: "Show all",
  icon: paletteToolIcon("eye"),
};
const RESTART: PaletteToolSpec = {
  key: "explore.restart",
  title: "Start over",
  shortcut: "R",
  icon: paletteToolIcon("rotate-ccw"),
};
const FADED_REST: PaletteToolSpec = {
  key: "explore.faded",
  title: "Faded rest",
  shortcut: "F",
  icon: paletteToolIcon("blend"),
};

const START_FROM_SELECTOR = `.entry[data-action="${START_FROM.key}"]`;

interface PaletteInternals {
  _rebuild(): void;
  _container?: HTMLElement;
}

/**
 * Explore mode's toolbar: while it runs, the palette holds its steps instead of the modelling
 * tools, all in the tools group (diagram-js's tool highlight needs that group), with the pressed
 * "Explore mode" first, which ends it. "Step back" is `aria-disabled` without a step to go back
 * to, and then does nothing. The palette is built again whenever what it shows changes; the
 * palette's keyboard and the shell's skin keep the focus on the entry of the same action.
 */
export default class WardleyExplorePalette implements PaletteProvider {
  static $inject = ["eventBus", "wardleyExplore", "wardleyExploreStartMenu", "injector"];

  private readonly palette: Palette | null;
  private readonly tools: WardleyPaletteProvider | null;
  private builtFor: string | undefined;

  constructor(
    eventBus: EventBus,
    private readonly explore: WardleyExplore,
    private readonly startMenu: WardleyExploreStartMenu,
    injector: Injector,
  ) {
    this.palette = injector.get<Palette | null>("palette", false) ?? null;
    this.tools =
      injector.get<WardleyPaletteProvider | null>("wardleyPaletteProvider", false) ?? null;
    if (!this.palette || !this.tools) return;
    this.palette.registerProvider(TOOLBAR_PRIORITY, this);
    this.builtFor = this.shownState();
    eventBus.on(EXPLORE_CHANGED, EXPLORE_CHROME_PRIORITY, () => this.rebuildOnChange());
    // A cleared canvas ends explore mode without EXPLORE_CHANGED; the explore service, injected
    // first, has heard of the clear already.
    eventBus.on("diagram.clear", () => this.rebuildOnChange());
  }

  getPaletteEntries(): PaletteEntriesCallback {
    return (entries) => (this.explore.isActive() ? this.toolbar() : entries);
  }

  private toolbar(): PaletteEntries {
    const explore = this.explore;
    const tools = this.tools!;
    const canStepBack = explore.canStepBack();
    return {
      [EXPLORE_ENTRY]: tools.exploreToggleEntry(explore),
      [START_FROM.key]: tools.toolEntry(START_FROM, (event) => this.openStartMenu(event)),
      [STEP_BACK.key]: tools.toolEntry(
        { ...STEP_BACK, disabled: !canStepBack },
        () => explore.stepBack(),
        { handsFocusToCanvas: canStepBack },
      ),
      [SHOW_ALL.key]: tools.toolEntry(SHOW_ALL, () => explore.showAll(), {
        handsFocusToCanvas: true,
      }),
      [RESTART.key]: tools.toolEntry(RESTART, () => explore.restart(), {
        handsFocusToCanvas: true,
      }),
      [FADED_REST.key]: tools.toolEntry(
        { ...FADED_REST, pressed: explore.isFadeRest() },
        () => explore.setFadeRest(!explore.isFadeRest()),
        { handsFocusToCanvas: true },
      ),
    };
  }

  /** The menu opens below its entry, also for Enter or Space, whose click has no pointer. */
  private openStartMenu(event: Event): void {
    const target = (event as { delegateTarget?: EventTarget }).delegateTarget ?? event.target;
    const entry =
      (target instanceof Element ? target.closest<HTMLElement>(".entry") : null) ??
      (this.palette as unknown as PaletteInternals)._container?.querySelector<HTMLElement>(
        START_FROM_SELECTOR,
      );
    if (entry) this.startMenu.open(entry.getBoundingClientRect());
  }

  /** What the toolbar shows: explore mode itself, whether a step is there to go back to, the fade. */
  private shownState(): string {
    const explore = this.explore;
    if (!explore.isActive()) return "modelling";
    return `exploring:${String(explore.canStepBack())}:${String(explore.isFadeRest())}`;
  }

  private rebuildOnChange(): void {
    const state = this.shownState();
    if (state === this.builtFor) return;
    this.builtFor = state;
    (this.palette as unknown as PaletteInternals)._rebuild();
  }
}
