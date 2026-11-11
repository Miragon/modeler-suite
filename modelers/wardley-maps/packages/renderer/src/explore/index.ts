import type { ModuleDeclaration } from "didi";
import OverlaysModule from "diagram-js/lib/features/overlays";
import SelectionModule from "diagram-js/lib/features/selection";
import { readOnlyModule } from "../read-only/index.js";
import WardleyExplore from "./WardleyExplore.js";
import WardleyExploreChips from "./WardleyExploreChips.js";
import WardleyExploreContextPad from "./WardleyExploreContextPad.js";
import WardleyExplorePalette from "./WardleyExplorePalette.js";
import WardleyExploreStartMenu from "./WardleyExploreStartMenu.js";

/**
 * Explore mode: the map revealed step by step along its value chain (Modeler only), with its
 * toolbar in the palette, its context pad, the chips on the components and the "Start from…" menu.
 * The toolbar, pad and menu take the palette, context pad and popup menu the editor has.
 */
export const exploreModule: ModuleDeclaration = {
  __depends__: [OverlaysModule, SelectionModule, readOnlyModule],
  __init__: [
    "wardleyExplore",
    "wardleyExploreChips",
    "wardleyExploreContextPad",
    "wardleyExploreStartMenu",
    "wardleyExplorePalette",
  ],
  wardleyExplore: ["type", WardleyExplore],
  wardleyExploreChips: ["type", WardleyExploreChips],
  wardleyExploreContextPad: ["type", WardleyExploreContextPad],
  wardleyExploreStartMenu: ["type", WardleyExploreStartMenu],
  wardleyExplorePalette: ["type", WardleyExplorePalette],
};

export {
  default as WardleyExplore,
  EXPLORE_CHANGED,
  EXPLORE_OVERLAY_TYPE,
} from "./WardleyExplore.js";
export type {
  ExploreChangedEvent,
  ExploreCounts,
  ExploreNode,
  ExplorePhase,
} from "./WardleyExplore.js";
export type { ExploreDirection } from "./explore-graph.js";
export { default as WardleyExploreChips, EXPLORE_CHIP_CLASS } from "./WardleyExploreChips.js";
export { default as WardleyExploreContextPad } from "./WardleyExploreContextPad.js";
export { default as WardleyExplorePalette } from "./WardleyExplorePalette.js";
export {
  default as WardleyExploreStartMenu,
  EXPLORE_START_MENU,
} from "./WardleyExploreStartMenu.js";
