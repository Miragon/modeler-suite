import { TOOLTIP_DELAY_MS } from "../core/index.js";
import {
  DEFAULT_SIZES,
  HOVER_MARGIN_MS,
  LIGHT,
  PARK,
  POLL_MS,
  assertHooksConsistent,
  closeByEscape,
  fail,
  finish,
  openHarness,
  pollUntil,
} from "./case-tools.js";
import { OVERLAY_LAYER_LIMIT, overlayLayerProblems, type OverlayLayerFacts } from "./checks.js";
import {
  canvasLayersProbe,
  contextPadEntriesProbe,
  emptyCanvasSpotProbe,
  holdWindowOpenProbe,
  labelEditorProbe,
  selectablesProbe,
  selectedIdsProbe,
  type CanvasLayerFacts,
  type CanvasLayersFacts,
  type ContextPadEntryFacts,
  type SelectableFacts,
} from "./facts.js";
import { DEFAULT_ROOT } from "./geometry.js";
import type { ShellConformanceCase, ShellConformanceHarness, ShellSkip } from "./harness.js";
import type { PageLike } from "./page.js";
import {
  canvasKeyProbe,
  inPage,
  removeInjectedProbe,
  settle,
  type CanvasKey,
} from "./page-tools.js";

/** Room for an overlay to go once the pointer left its element (a hover tooltip). */
const LAYER_WAIT_MS = TOOLTIP_DELAY_MS + HOVER_MARGIN_MS;

/** How late diagram-js fires `canvas.viewbox.changed` after the view changed (`deferUpdate`). */
const VIEWBOX_CHANGED_DELAY_MS = 300;

/**
 * How long the kit watches the layers once a zoom changed the view: long enough for a popup that
 * closes on `canvas.viewbox.changed`, and for an overlay that only hid while the view changed to
 * show again on it.
 */
const AFTER_ZOOM_WATCH_MS = VIEWBOX_CHANGED_DELAY_MS + HOVER_MARGIN_MS;

/** Room for the zoom to land before the kit looks again. */
const ZOOM_WAIT_MS = 1000;

const ZOOM_IN: CanvasKey = { key: "=", code: "Equal", ctrlKey: true };
const ZOOM_OUT: CanvasKey = { key: "-", code: "Minus", ctrlKey: true };

/** A context-pad entry the case leaves alone: it would take the element away. */
const DELETING_ENTRY = /delete|remove/i;

/**
 * The most elements the case selects in search of a context pad it has not seen yet, so a large
 * document does not lengthen the case.
 */
const MAX_SELECTED = 12;

async function layers(
  page: PageLike,
  root: string,
  host: ShellConformanceHarness["host"],
): Promise<CanvasLayersFacts> {
  const facts = await inPage(page, canvasLayersProbe, { root, limit: OVERLAY_LAYER_LIMIT });
  if (!facts) fail("overlayLayers", host, [`no .djs-container inside the shell root "${root}"`]);
  return facts;
}

const viewOf = async (page: PageLike, root: string): Promise<string | null> =>
  (await inPage(page, labelEditorProbe, { root }))?.view ?? null;

/** Dispatches `key` at the canvas; whether the view changed within `ZOOM_WAIT_MS`. */
async function zoomBy(page: PageLike, root: string, key: CanvasKey): Promise<boolean> {
  const before = await viewOf(page, root);
  await inPage(page, canvasKeyProbe, { root, key });
  const after = await pollUntil(
    page,
    () => viewOf(page, root),
    (view) => view !== before,
    ZOOM_WAIT_MS,
  );
  return after !== before;
}

/**
 * Watches `before` for `AFTER_ZOOM_WATCH_MS` after the view changed: which of them never closed,
 * and which closed and showed again.
 */
async function watchAfterZoom(
  page: PageLike,
  root: string,
  host: ShellConformanceHarness["host"],
  before: readonly CanvasLayerFacts[],
): Promise<NonNullable<OverlayLayerFacts["afterZoom"]>> {
  const closed = new Set<string>();
  const back = new Map<string, CanvasLayerFacts>();
  let latest: CanvasLayerFacts[];
  for (let waited = 0; ; waited += POLL_MS) {
    latest = (await layers(page, root, host)).layers;
    for (const layer of before) {
      const shown = latest.find((candidate) => candidate.description === layer.description);
      if (!shown) closed.add(layer.description);
      else if (closed.has(layer.description)) back.set(layer.description, shown);
    }
    if (waited >= AFTER_ZOOM_WATCH_MS) break;
    await page.waitForTimeout(POLL_MS);
  }
  return {
    stays: latest.filter((layer) => !closed.has(layer.description)),
    back: [...back.values()],
  };
}

/**
 * The layers above the limit in the state the page is in, with the pointer parked, and what became
 * of them after a zoom at the canvas (Cmd/Ctrl+Plus, else Cmd/Ctrl+Minus); the zoom is undone
 * afterwards.
 */
async function layerProblems<P extends PageLike>(
  page: P,
  harness: ShellConformanceHarness<P>,
  root: string,
  state: string,
): Promise<string[]> {
  await page.mouse.move(PARK.x, PARK.y);
  const before = await pollUntil(
    page,
    () => layers(page, root, harness.host),
    (facts) => facts.layers.length === 0,
    LAYER_WAIT_MS,
  );
  if (before.layers.length === 0) return [];
  let undo: CanvasKey | undefined;
  if (await zoomBy(page, root, ZOOM_IN)) undo = ZOOM_OUT;
  else if (await zoomBy(page, root, ZOOM_OUT)) undo = ZOOM_IN;
  let afterZoom: OverlayLayerFacts["afterZoom"] = null;
  if (undo) {
    afterZoom = await watchAfterZoom(page, root, harness.host, before.layers);
    await zoomBy(page, root, undo);
  }
  await settle(page);
  return overlayLayerProblems({
    state,
    palette: before.palette,
    before: before.layers,
    afterZoom,
  });
}

const selectables = (page: PageLike, root: string): Promise<SelectableFacts[]> =>
  inPage(page, selectablesProbe, { root });

const selectable = async (
  page: PageLike,
  root: string,
  id: string,
): Promise<SelectableFacts | undefined> =>
  (await selectables(page, root)).find((candidate) => candidate.id === id);

async function click(page: PageLike, point: { x: number; y: number }): Promise<void> {
  await page.mouse.click(point.x, point.y);
  await settle(page);
}

/** Takes the selection off `id`: a click on an empty spot of the canvas, else on `id` itself. */
async function deselect(page: PageLike, root: string, id: string): Promise<void> {
  const spot = await inPage(page, emptyCanvasSpotProbe, { root });
  if (spot) return click(page, spot);
  const element = await selectable(page, root, id);
  if (element) await click(page, element.client);
}

const isSelected = async (page: PageLike, root: string, id: string): Promise<boolean> =>
  (await inPage(page, selectedIdsProbe, { root })).includes(id);

/**
 * Selects `id` with a click unless it is selected; `afresh` takes a selection off first, so the
 * click opens its context pad anew (an entry may have closed it and kept the selection). `false`
 * when no pointer reaches `id` any more or a click does not select it.
 */
async function select(page: PageLike, root: string, id: string, afresh = false): Promise<boolean> {
  if (await isSelected(page, root, id)) {
    if (!afresh) return true;
    await deselect(page, root, id);
  }
  // The first click may select a neighbour instead, as seen once an entry had added an element.
  for (let attempt = 0; attempt < 2; attempt++) {
    const element = await selectable(page, root, id);
    if (!element) return false;
    await click(page, element.client);
    if (await isSelected(page, root, id)) return true;
  }
  return false;
}

/**
 * The elements to select: the first shape and the first connection, then the others spread evenly
 * from the first to the last up to `MAX_SELECTED`, since a document often lists its elements by
 * kind.
 */
function selectionOrder(found: readonly SelectableFacts[]): SelectableFacts[] {
  const first = (["shape", "connection"] as const)
    .map((kind) => found.find((element) => element.kind === kind))
    .filter((element): element is SelectableFacts => element !== undefined);
  const others = found.filter((element) => !first.includes(element));
  const room = Math.max(0, MAX_SELECTED - first.length);
  if (others.length <= room) return [...first, ...others];
  const step = (others.length - 1) / Math.max(1, room - 1);
  return [
    ...first,
    ...Array.from({ length: room }, (_, index) => others[Math.round(index * step)]!),
  ];
}

const padActions = async (page: PageLike, root: string): Promise<string[]> =>
  (await inPage(page, contextPadEntriesProbe, { root })).map((entry) => entry.action);

/** One kind of context pad: shape or connection, and its set of entries. */
const padKind = (kind: SelectableFacts["kind"], actions: readonly string[]): string =>
  `${kind}: ${[...actions].sort().join(" ")}`;

const padEntry = async (
  page: PageLike,
  root: string,
  action: string,
): Promise<ContextPadEntryFacts | undefined> =>
  (await inPage(page, contextPadEntriesProbe, { root })).find(
    (candidate) => candidate.action === action,
  );

/**
 * Entry `action` of the context pad `pad`, shown for a click: on `target`, its pad opened anew when
 * an earlier entry closed it, else on another element with that pad, since an earlier entry may
 * have replaced `target` or changed its pad. `null` when no element shows it.
 */
async function reachEntry(
  page: PageLike,
  root: string,
  target: { id: string; kind: SelectableFacts["kind"] },
  pad: string,
  action: string,
): Promise<{ id: string; entry: ContextPadEntryFacts } | null> {
  for (const afresh of [false, true]) {
    if (!(await select(page, root, target.id, afresh))) break;
    const entry = await padEntry(page, root, action);
    if (entry) return { id: target.id, entry };
  }
  const others = selectionOrder(
    (await selectables(page, root)).filter(
      (element) => element.kind === target.kind && element.id !== target.id,
    ),
  );
  for (const other of others) {
    if (!(await select(page, root, other.id, true))) continue;
    if (padKind(other.kind, await padActions(page, root)) !== pad) continue;
    const entry = await padEntry(page, root, action);
    if (entry) return { id: other.id, entry };
  }
  return null;
}

/**
 * Guide §5.13: what a modeler leaves in the canvas lies at `z-index` 100 or below, under the
 * palette at 110; only a popup that closes on a pan or zoom may cover it. As opened, with the label
 * editor open, with an element of each kind of context pad selected (a connection among them) and
 * after a click on each of their context-pad entries (but a deleting one), every layer of
 * `.djs-container` above 100 must close when the view zooms, and stay closed.
 */
export const overlayLayersCase: ShellConformanceCase = {
  name: "overlayLayers",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    assertHooksConsistent("overlayLayers", harness, ["labelEditor"]);
    const root = harness.root ?? DEFAULT_ROOT;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    const problems: string[] = [];
    const skipped: ShellSkip[] = [];
    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    problems.push(...(await layerProblems(page, harness, root, "as opened")));

    const labelEditor = harness.labelEditor;
    if (labelEditor) {
      await labelEditor.open(page);
      await settle(page);
      problems.push(...(await layerProblems(page, harness, root, "with the label editor open")));
      await closeByEscape(page);
    } else if (!harness.absent?.includes("labelEditor")) {
      skipped.push({
        hook: "labelEditor",
        reason: "harness.labelEditor is undefined: the layer of the label editor was not verified",
      });
    }

    const candidates = selectionOrder(await selectables(page, root));
    if (candidates.length === 0) {
      skipped.push({
        hook: "open",
        reason:
          "the opened document shows no shape or connection a pointer reaches: the layers of a selection and of its context pad were not verified",
      });
    }
    // Elements of one kind share their pad: one look per kind and set of entries, one click per
    // entry and kind, since a connection's entry may do something else than a shape's of that name.
    const pads = new Set<string>();
    const clicked = new Set<string>();
    await inPage(page, holdWindowOpenProbe, null);
    try {
      for (const element of candidates) {
        if (!(await select(page, root, element.id, true))) continue;
        const actions = await padActions(page, root);
        const pad = padKind(element.kind, actions);
        if (pads.has(pad)) continue;
        pads.add(pad);
        problems.push(
          ...(await layerProblems(page, harness, root, `with "${element.id}" selected`)),
        );
        let targetId = element.id;
        for (const action of actions) {
          const entryKey = `${element.kind}: ${action}`;
          if (DELETING_ENTRY.test(action) || clicked.has(entryKey)) continue;
          clicked.add(entryKey);
          const target = { id: targetId, kind: element.kind };
          const reached = await reachEntry(page, root, target, pad, action);
          if (!reached) {
            problems.push(
              `canvas: context-pad entry "${action}" of "${targetId}" could not be clicked: once the earlier entries had been clicked, neither that ${element.kind} nor another with its context pad showed it, so the layers it opens were not verified`,
            );
            continue;
          }
          targetId = reached.id;
          await page.mouse.click(reached.entry.client.x, reached.entry.client.y);
          await settle(page);
          problems.push(
            ...(await layerProblems(
              page,
              harness,
              root,
              `after a click on context-pad entry "${action}" of "${reached.id}"`,
            )),
          );
          await closeByEscape(page);
        }
      }
    } finally {
      await inPage(page, removeInjectedProbe, null);
    }
    return finish("overlayLayers", harness.host, problems, skipped);
  },
};
