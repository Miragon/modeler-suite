import {
  FIT_ANIMATION_MS,
  INVALID_STATUS_DELAY_MS,
  type ShellHost,
  type Size,
} from "../core/index.js";
import {
  DEFAULT_SIZES,
  HOVER_MARGIN_MS,
  LIGHT,
  PARK,
  closeByEscape,
  enterOnEntry,
  fail,
  finish,
  firstCreatingEntry,
  openHarness,
  pollUntil,
  shapes,
  sizeLabel,
} from "./case-tools.js";
import {
  EMPTY_DOCUMENTS,
  emptyDocumentSkips,
  emptyHintProblems,
  emptyNotInvalidProblems,
  emptyViewProblems,
  firstElementProblems,
  lastElementProblems,
} from "./empty-file-checks.js";
import {
  elementBoundsProbe,
  emptyHintProbe,
  emptyViewProbe,
  type EmptyHintFacts,
  type EmptyViewFacts,
} from "./empty-file-facts.js";
import { paletteEntriesProbe, readOnlyStateProbe } from "./facts.js";
import { DEFAULT_ROOT, freeRectangle, measureChrome, type Rectangle } from "./geometry.js";
import type { ShellConformanceCase, ShellConformanceHarness } from "./harness.js";
import type { PageLike } from "./page.js";
import { findTarget, focusTarget, inPage, settle } from "./page-tools.js";

/** How long the view may take to hold still after the explicit fit's glide (guide §5.9). */
const REFIT_WAIT_MS = 1000;

/** Room for a modeler that shows or hides the hint a frame or two after the change. */
const HINT_WAIT_MS = 1000;

const NO_HINT: EmptyHintFacts = {
  visible: false,
  text: "",
  content: null,
  actions: [],
  startScreen: false,
};

/**
 * The first size of the harness and its last: by default 1280 × 900 and 420 × 700, where the
 * palette moves to the second row.
 */
function emptyFileSizes(sizes: readonly Size[]): Size[] {
  const first = sizes[0] ?? DEFAULT_SIZES[0]!;
  const last = sizes[sizes.length - 1] ?? first;
  return sizeLabel(first) === sizeLabel(last) ? [first] : [first, last];
}

async function hintFacts(page: PageLike, root: string): Promise<EmptyHintFacts> {
  return (await inPage(page, emptyHintProbe, { root })) ?? NO_HINT;
}

async function viewFacts(page: PageLike, root: string, host: ShellHost): Promise<EmptyViewFacts> {
  const view = await inPage(page, emptyViewProbe, { root });
  if (!view) fail("emptyFile", host, [`no element matches the shell root selector "${root}"`]);
  return view;
}

/** A click on Fit, read after its glide once the view holds still or `REFIT_WAIT_MS` passed. */
async function refit(
  page: PageLike,
  root: string,
  host: ShellHost,
  opened: EmptyViewFacts,
): Promise<EmptyViewFacts> {
  const fit = await findTarget(page, root, "zoom-fit");
  if (!fit) return opened;
  await page.mouse.click(fit.client.x, fit.client.y);
  await page.waitForTimeout(FIT_ANIMATION_MS + HOVER_MARGIN_MS);
  let previous: string | null | undefined;
  const refitted = await pollUntil(
    page,
    () => viewFacts(page, root, host),
    (facts) => {
      const still = facts.view === previous;
      previous = facts.view;
      return still;
    },
    REFIT_WAIT_MS,
  );
  await page.mouse.move(PARK.x, PARK.y);
  return refitted;
}

/**
 * Enter on the first creating palette entry places the first element (the hint goes, the view
 * stays); Delete on it empties the diagram again (the hint returns).
 */
async function firstAndLastElement(
  page: PageLike,
  root: string,
  host: ShellHost,
  free: Rectangle,
): Promise<string[]> {
  const entry = firstCreatingEntry(await inPage(page, paletteEntriesProbe, { root }));
  // A notation whose palette only switches tools has nothing to place.
  if (!entry) return [];
  await page.mouse.move(PARK.x, PARK.y);
  const viewBefore = await viewFacts(page, root, host);
  const before = await shapes(page, root);
  const after = await enterOnEntry(page, root, entry.action, before);
  if (!after) return [`first element: the palette's roving focus does not reach "${entry.action}"`];
  const hint = await pollUntil(
    page,
    () => hintFacts(page, root),
    (facts) => !facts.visible,
    HINT_WAIT_MS,
  );
  const known = new Set(before.map((shape) => shape.id));
  const added = after.filter((shape) => !known.has(shape.id));
  const problems = firstElementProblems({
    entry: entry.action,
    before,
    after,
    bounds:
      added.length === 1
        ? await inPage(page, elementBoundsProbe, { root, id: added[0]!.id })
        : undefined,
    hint,
    viewBefore,
    viewAfter: await viewFacts(page, root, host),
    free,
  });
  if (added.length !== 1) return problems;
  const id = added[0]!.id;
  // The label editor a notation opens on its new element closes first; the element stays.
  await closeByEscape(page);
  const current = (await shapes(page, root)).find((shape) => shape.id === id);
  if (current) {
    if (!current.selected) await page.mouse.click(current.client.x, current.client.y);
    await focusTarget(page, root, "canvas");
    await page.keyboard.press("Delete");
    await settle(page);
  }
  const removed = !(await shapes(page, root)).some((shape) => shape.id === id);
  const returned = await pollUntil(
    page,
    () => hintFacts(page, root),
    (facts) => facts.visible,
    removed ? HINT_WAIT_MS : 0,
  );
  await page.mouse.move(PARK.x, PARK.y);
  problems.push(...lastElementProblems({ id, removed, hint: returned, free }, host));
  return problems;
}

/**
 * Guide §5.9, §8 (design system 1.23.0) and §13.5 on every empty document the harness lists
 * (`documents`: "empty", and "blank" for a file of zero bytes): it opens at 100 %, or fitted to a
 * plot that always counts, without an invalid-file state, and the middle of the free rectangle
 * shows the empty-file hint, in the web app without "Insert example". At the first size the first
 * element, placed by Enter on the palette, takes the hint away without moving the view, and
 * deleting it brings the hint back.
 */
export const emptyFileCase: ShellConformanceCase = {
  name: "emptyFile",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    const host = harness.host;
    const listed = harness.documents ?? [];
    const skipped = emptyDocumentSkips(host, listed);
    const documents = EMPTY_DOCUMENTS.filter((key) => listed.includes(key));
    const root = harness.root ?? DEFAULT_ROOT;
    const problems: string[] = [];
    for (const document of documents) {
      for (const [index, size] of emptyFileSizes(harness.sizes ?? DEFAULT_SIZES).entries()) {
        const where = (problem: string) =>
          `[document "${document}", ${sizeLabel(size)}] ${problem}`;
        await openHarness(page, harness, { size, requested: LIGHT, document });
        await page.mouse.move(PARK.x, PARK.y);
        await settle(page);
        const opened = await viewFacts(page, root, host);
        const free = freeRectangle(await measureChrome(page, root), host);
        problems.push(...emptyHintProblems(await hintFacts(page, root), free, host).map(where));
        const refitted = opened.fitDisabled ? undefined : await refit(page, root, host, opened);
        problems.push(...emptyViewProblems(opened, refitted).map(where));
        if (index > 0) continue;
        // An invalid file shows its marks and the status box this long after the import.
        await page.waitForTimeout(INVALID_STATUS_DELAY_MS);
        const state = await inPage(page, readOnlyStateProbe, { root });
        if (state) problems.push(...emptyNotInvalidProblems(state).map(where));
        problems.push(...(await firstAndLastElement(page, root, host, free)).map(where));
      }
    }
    return finish("emptyFile", host, problems, skipped);
  },
};
