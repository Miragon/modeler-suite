import type HostLauncher from "../context-pad/HostLauncher.js";
import { NoteMarkers } from "./NoteMarkers.js";
import { mountNotesPanel, type InspectorSlot, type NotesPanel } from "./NotesPanel.js";

interface ServiceSource {
  get<T>(name: string, strict?: boolean): T;
}

export interface NotesConnection {
  readonly panel: NotesPanel;
  destroy(): void;
}

/**
 * Notes for a mounted modeler: the panel in the shell's inspector, the markers on the canvas, the
 * pad's "Notes" and the N key. The panel is the one place where notes are written.
 */
export function connectNotes(inspector: InspectorSlot, diagram: ServiceSource): NotesConnection {
  const panel = mountNotesPanel(inspector, diagram);
  const markers = new NoteMarkers(
    diagram,
    (scope, addNote) => panel.show(scope, addNote),
    () => panel.activeScope(),
  );
  panel.onChange(() => markers.refresh());
  diagram
    .get<HostLauncher | undefined>("hostLauncher", false)
    ?.registerNotes((scope, addNote) => panel.show(scope, addNote));
  const onKey = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== "n" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.repeat || event.isComposing) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable], dialog, [role=menu]")) return;
    event.preventDefault();
    panel.toggle();
  };
  document.addEventListener("keydown", onKey);
  return {
    panel,
    destroy() {
      document.removeEventListener("keydown", onKey);
      markers.destroy();
    },
  };
}
