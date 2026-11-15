// Every renderer sheet of the suite brings diagram-js's sheet and the vendored canvas mapping
// along, and the build empties both wherever a renderer sheet imports them (`build/css-base.mjs`),
// or a later copy would override an earlier renderer's own rules. The page loads the two here,
// once and before any renderer sheet, through specifiers that helper does not catch: a query on
// the first, and for the second a path that is not the literal `../theme/cd-canvas.css`. The seven
// renderers vendor the same bytes of it; the board vendors none.
import "diagram-js/assets/diagram-js.css?base";
import "../../../../business-model-canvas/packages/renderer/src/theme/cd-canvas.css";
import "@miragon/board-host/assets/embed.css";
