# @miragon/business-model-canvas-renderer

The diagram-js viewer and modeler of the [Business Model Canvas Modeler](../../README.md),
implementing [`@miragon/modeler-api`](../../../../packages/api/README.md). Private to the suite:
its web app, VS Code extension and Orca plugin bundle it from source; it is not published to npm.

```ts
import { createCollaborativeModeler } from "@miragon/business-model-canvas-renderer";

const modeler = createCollaborativeModeler();
modeler.attachTo(document.getElementById("canvas")!);
await modeler.importText(bmcText);
modeler.onContentChanged(() => save(modeler.exportText()));
```

- The canvas frame (nine blocks, header band, the Strategyzer attribution) is drawn from the
  layout of the schema model; stickies flow in file order and land in the block and slot they are
  dropped on, one undo step per edit.
- `diagramMenu` gives the apps the Model group ("Canvas title…", the radio group "Stickies side
  by side" and the checkbox "Notes"),
  Export and Help; `renderLegend` the legend's one row, the folded corner of a sticky with notes;
  `connectNotes` the notes panel in the shell's inspector and the notes markers over the canvas;
  `saveSVG()` an SVG export with the attribution and without the hints of empty blocks.
- `THEMES` is `['light']`: the canvas draws light, exports stay light.

Architecture and tests: [`CLAUDE.md`](../../CLAUDE.md).
