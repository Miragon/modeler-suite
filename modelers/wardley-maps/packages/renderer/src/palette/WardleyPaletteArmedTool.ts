import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";

const TOOL_ENTRY_SELECTOR = '.djs-palette-entries .group[data-group="tools"] .entry[data-action]';
const TOOL_ACTION_SUFFIX = "-tool";

/**
 * `aria-pressed` on the tools of the renderer's own palette (lasso, draw), `"true"` on the armed one
 * (guide §5.5, §5.14), for a host without the Miragon modeler shell, whose palette skin does the
 * same. diagram-js marks the armed tool with its `highlighted-entry` class only, and after it rebuilt
 * the entries that class no longer reaches them: diagram-js keeps the tools group it found first. So
 * the armed tool comes from `tool-manager.update`, and every rebuild (`palette.changed`) gets the
 * state again; `wardley.css` keys the armed ring on it. A palette any chrome skins
 * (`data-chrome="palette"`) is left to that chrome.
 */
export default class WardleyPaletteArmedTool {
  static $inject = ["eventBus", "injector"];

  private container: HTMLElement | undefined;
  private armedTool: string | null = null;

  constructor(eventBus: EventBus, injector: Injector) {
    if (injector.get("modelerShell", false)) return;
    eventBus.on("palette.create", (event: { container: HTMLElement }) => {
      this.container = event.container;
    });
    eventBus.on("palette.changed", () => this.apply());
    eventBus.on("tool-manager.update", (event: { tool?: string | null }) => {
      this.armedTool = event.tool ?? null;
      this.apply();
    });
  }

  private apply(): void {
    const container = this.container;
    if (!container || container.getAttribute("data-chrome") === "palette") return;
    for (const entry of container.querySelectorAll<HTMLElement>(TOOL_ENTRY_SELECTOR)) {
      const action = entry.getAttribute("data-action")!;
      if (!action.endsWith(TOOL_ACTION_SUFFIX)) continue;
      const tool = action.slice(0, -TOOL_ACTION_SUFFIX.length);
      entry.setAttribute("aria-pressed", String(tool === this.armedTool));
    }
  }
}
