import { FIT_ANIMATION_MS, type ShellHost } from "../core/index.js";
import {
  DEFAULT_SIZES,
  LIGHT,
  POLL_MS,
  assertHooksConsistent,
  documentChangedFrom,
  documentStateSkip,
  fail,
  finish,
  openHarness,
} from "./case-tools.js";
import {
  isViewAtActualSize,
  labelEditorCommitProblems,
  labelEditorOpenProblems,
  labelEditorStepProblems,
} from "./checks.js";
import { emptyCanvasSpotProbe, labelEditorProbe, type LabelEditorFacts } from "./facts.js";
import { DEFAULT_ROOT } from "./geometry.js";
import type {
  LabelEditorHooks,
  ShellConformanceCase,
  ShellConformanceHarness,
  ShellSkip,
} from "./harness.js";
import type { PageLike } from "./page.js";
import {
  CHROME_TARGET_SELECTORS,
  canvasKeyProbe,
  inPage,
  scriptedClickProbe,
  settle,
  type CanvasKey,
} from "./page-tools.js";

/** Room for a view change to land and hold still: the fit's animation, a resize's frame, a margin. */
const VIEW_WAIT_MS = FIT_ANIMATION_MS + 750;

/**
 * Room for a modeler that commits a moment after the view held still or after the click: a
 * debounced resize handler, a commit a frame or two late.
 */
const COMMIT_WAIT_MS = 500;

/** The resize narrows the page like a side bar or panel opening next to the editor. */
const RESIZED_WIDTH_FACTOR = 0.75;
const MIN_RESIZED_WIDTH = 320;

interface ViewStep {
  name: string;
  /** Whether the step is due in the view before it (`LabelEditorFacts.view`); without it, always. */
  due?(view: string | null): boolean;
  /** Changes the view through the shell; `false` when there is nothing to trigger it with. */
  run(page: PageLike, root: string): Promise<boolean>;
}

function chromeClick(name: string, target: "zoom-in" | "zoom-fit"): ViewStep {
  return {
    name,
    run: (page, root) =>
      inPage(page, scriptedClickProbe, { root, selector: CHROME_TARGET_SELECTORS[target] }),
  };
}

function canvasKey(name: string, key: CanvasKey): ViewStep {
  return { name, run: (page, root) => inPage(page, canvasKeyProbe, { root, key }) };
}

const viewportSizeProbe = (_: null) => ({ width: window.innerWidth, height: window.innerHeight });

const containerResize: ViewStep = {
  name: "a container resize",
  async run(page) {
    const { width, height } = await page.evaluate(viewportSizeProbe, null);
    const narrower = Math.max(MIN_RESIZED_WIDTH, Math.round(width * RESIZED_WIDTH_FACTOR));
    if (narrower >= width) return false;
    await page.setViewportSize({ width: narrower, height });
    return true;
  },
};

const ZOOM_IN_KEY: CanvasKey = { key: "=", code: "Equal", ctrlKey: true };

/**
 * The shell's own view changes. The kit triggers them without moving the focus (a scripted click,
 * keys dispatched at the canvas), so a modeler that commits on blur is not blamed for the click a
 * user makes elsewhere. Each zoom in takes the view off the fitted one, so the fit and the refit
 * after it change the view again. A zoom step snaps to the raster of guide §5.8 first, so from a
 * fit between about 64 % and 86 % the first one lands on exactly 100 %; one more then takes the
 * view off 100 %, so that Cmd/Ctrl+0 changes it too.
 */
const VIEW_STEPS: readonly ViewStep[] = [
  chromeClick("a click on zoom in", "zoom-in"),
  chromeClick("a click on Fit", "zoom-fit"),
  canvasKey("Cmd/Ctrl+Plus on the canvas", ZOOM_IN_KEY),
  {
    ...canvasKey("one more Cmd/Ctrl+Plus on the canvas (the view stood at 100 %)", ZOOM_IN_KEY),
    due: isViewAtActualSize,
  },
  canvasKey("Cmd/Ctrl+0 on the canvas", { key: "0", code: "Digit0", ctrlKey: true }),
  canvasKey("Cmd/Ctrl+Plus on the canvas after Cmd/Ctrl+0", ZOOM_IN_KEY),
  canvasKey("Shift+1 on the canvas", { key: "!", code: "Digit1", shiftKey: true }),
  containerResize,
];

async function editorFacts(
  page: PageLike,
  root: string,
  host: ShellHost,
): Promise<LabelEditorFacts> {
  const facts = await inPage(page, labelEditorProbe, { root });
  if (!facts) fail("labelEditor", host, [`no element matches the shell root selector "${root}"`]);
  return facts;
}

/**
 * The facts once the view differs from `before` and held still for one poll (or `VIEW_WAIT_MS`
 * passed), and then `COMMIT_WAIT_MS` more. The full wait, not a poll that stops at the first
 * commit, keeps a late commit with the step that caused it: the editor opened for the next step
 * would otherwise take the commits still pending from this one.
 */
async function afterViewChange(
  page: PageLike,
  root: string,
  host: ShellHost,
  before: string | null,
): Promise<LabelEditorFacts> {
  let previous = await editorFacts(page, root, host);
  for (let waited = 0; waited < VIEW_WAIT_MS; waited += POLL_MS) {
    await page.waitForTimeout(POLL_MS);
    const current = await editorFacts(page, root, host);
    if (current.view !== before && current.view === previous.view) break;
    previous = current;
  }
  await page.waitForTimeout(COMMIT_WAIT_MS);
  await settle(page);
  return editorFacts(page, root, host);
}

interface OpenedEditor {
  typed: string;
  /** `documentState` once the editor was open with the typed text. */
  documentAtOpen: string;
}

/**
 * `labelEditor.open`, checked; the typed text and the document it left. Without an open editor
 * the case cannot go on.
 */
async function openEditor<P extends PageLike>(
  page: P,
  root: string,
  hooks: LabelEditorHooks<P>,
  documentState: (page: P) => Promise<string>,
  harness: ShellConformanceHarness<P>,
  problems: readonly string[],
): Promise<OpenedEditor> {
  const typed = await hooks.open(page);
  await settle(page);
  const opened = labelEditorOpenProblems(typed, await editorFacts(page, root, harness.host));
  if (opened.length > 0) fail("labelEditor", harness.host, [...problems, ...opened]);
  return { typed, documentAtOpen: await documentState(page) };
}

/**
 * Contract L5 through the shell's own view changes: over a label editor with typed text, zoom in
 * and Fit (clicked), Cmd/Ctrl+Plus (twice when the first lands on 100 %), Cmd/Ctrl+0 and Shift+1
 * (at the canvas) and a container resize (the refit) never commit it (L5), nor take it down (L5
 * only recommends that, the shell kit requires it); then a click on the canvas, the user's commit,
 * must change the document.
 */
export const labelEditorCase: ShellConformanceCase = {
  name: "labelEditor",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    assertHooksConsistent("labelEditor", harness, ["labelEditor"]);
    const hooks = harness.labelEditor;
    if (!hooks) {
      if (harness.absent?.includes("labelEditor")) return undefined;
      return {
        skipped: [
          {
            hook: "labelEditor",
            reason:
              "harness.labelEditor is undefined: that the shell's zoom, fit and refit never commit or close an open label editor was not verified",
          },
        ],
      };
    }
    const { documentState } = harness;
    if (!documentState) {
      return {
        skipped: [
          documentStateSkip(
            "that the shell's zoom, fit and refit never commit an open label editor",
          ),
        ],
      };
    }
    const root = harness.root ?? DEFAULT_ROOT;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    await editorFacts(page, root, harness.host);
    const problems: string[] = [];
    let editor = await openEditor(page, root, hooks, documentState, harness, problems);
    let committed = false;

    for (const step of VIEW_STEPS) {
      const before = await editorFacts(page, root, harness.host);
      if (step.due && !step.due(before.view)) continue;
      if (!(await step.run(page, root))) {
        problems.push(`label editor: ${step.name} found nothing to act on`);
        continue;
      }
      const after = await afterViewChange(page, root, harness.host, before.view);
      const documentChanged = (await documentState(page)) !== editor.documentAtOpen;
      problems.push(
        ...labelEditorStepProblems({
          step: step.name,
          typed: editor.typed,
          viewBefore: before.view,
          after,
          documentChanged,
        }),
      );
      committed ||= documentChanged;
      // The next step needs an editor with typed text that no commit has written yet.
      if (documentChanged || !after.editing || !after.text.includes(editor.typed)) {
        editor = await openEditor(page, root, hooks, documentState, harness, problems);
      }
    }

    const skipped: ShellSkip[] = [];
    if (!committed) {
      const spot = await inPage(page, emptyCanvasSpotProbe, { root });
      if (spot) {
        await page.mouse.click(spot.x, spot.y);
        await settle(page);
        problems.push(
          ...labelEditorCommitProblems(
            await documentChangedFrom(page, documentState, editor.documentAtOpen, COMMIT_WAIT_MS),
          ),
        );
      } else {
        skipped.push({
          hook: "open",
          reason:
            "the canvas shows no empty spot a pointer reaches: that documentState sees a commit was not verified",
        });
      }
    }
    return finish("labelEditor", harness.host, problems, skipped);
  },
};
