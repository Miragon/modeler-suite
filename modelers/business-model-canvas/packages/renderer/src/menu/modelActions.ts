import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import { openCanvasTitleDialog } from "../dialogs/index.js";
import type { ChromeDialog, DialogChrome } from "../dialogs/index.js";
import type HostLauncher from "../context-pad/HostLauncher.js";
import type CanvasModeling from "../modeling/CanvasModeling.js";
import { READ_ONLY_CHANGED_EVENT } from "../read-only/index.js";
import type { DiagramModelActions } from "./menu.js";

interface ServiceSource {
  get<T>(name: string, strict?: boolean): T;
}

export interface CanvasModelActions extends DiagramModelActions {
  /** Closes an open title dialog: the host's teardown. */
  close(): void;
}

/**
 * The Model group's dialog for a mounted modeler. `chrome` is read when the dialog opens, since a
 * host's menu exists before its chrome does. The dialog closes when the canvas locks, and when a
 * text comes in from outside (an agent, the text editor beside it): its Apply would put back the
 * title it was filled with.
 */
export function canvasModelActions(
  diagram: ServiceSource,
  chrome: () => Omit<DialogChrome, "focusFallback">,
): CanvasModelActions {
  const modeling = diagram.get<CanvasModeling>("canvasModeling");
  const canvas = diagram.get<Canvas>("canvas");
  let open: ChromeDialog | undefined;
  const withFallback = (): DialogChrome => ({ ...chrome(), focusFallback: () => canvas.focus() });
  const eventBus = diagram.get<EventBus>("eventBus");
  eventBus.on(READ_ONLY_CHANGED_EVENT, (event: { readOnly?: boolean }) => {
    if (event.readOnly) open?.close();
  });
  eventBus.on("import.done", () => open?.close());
  const launcher = diagram.get<HostLauncher | undefined>("hostLauncher", false);
  const showCanvasTitle = (): void => {
    open?.close();
    open = openCanvasTitleDialog(withFallback(), modeling);
  };
  launcher?.registerCanvasTitle(showCanvasTitle);
  return {
    showCanvasTitle,
    close: () => open?.close(),
  };
}
