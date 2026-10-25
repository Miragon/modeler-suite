import { expect, test, type Page } from "@playwright/test";

import {
  shellConformanceCases,
  type ShellConformanceCase,
  type ShellConformanceHarness,
} from "../src/testing.js";
import { createWebCases } from "../src/testing/web-cases.js";
import { demoHarness } from "./demo-harness.js";
import { webDemoHarness, type WebDemoHarnessOptions } from "./web-harness.js";

/*
 * The kit's own proof: each saboteur breaks the demo at runtime in one way the guide forbids, and
 * the case that encodes the rule must fail with the matching problem. A rule whose case passes a
 * saboteur is a rule the kit does not actually enforce.
 */

const WIDE_ONLY = [{ width: 1280, height: 900 }] as const;

/** Every case of the kit, the web column's included while it is not yet registered in createCases. */
function allCases(): ShellConformanceCase[] {
  const registered = shellConformanceCases();
  const names = new Set(registered.map((conformanceCase) => conformanceCase.name));
  return [
    ...registered,
    ...createWebCases().filter((conformanceCase) => !names.has(conformanceCase.name)),
  ];
}

function runCase(name: string, page: Page, harness: ShellConformanceHarness<Page>) {
  const found = allCases().find((conformanceCase) => conformanceCase.name === name);
  if (!found) throw new Error(`no conformance case "${name}"`);
  return found.run(page, harness);
}

/** The case's failure, or "passed". */
function failureOf(
  name: string,
  page: Page,
  harness: ShellConformanceHarness<Page>,
): Promise<string> {
  return runCase(name, page, harness).then(
    () => "passed",
    (error: unknown) => String(error),
  );
}

/**
 * Cases that run only for the saboteurs that expect them: the other saboteurs break nothing they
 * read, and their seconds per run, times every saboteur, would cost this suite minutes. The demo
 * passes them in conformance.spec.ts.
 */
const OWN_SABOTEURS_ONLY: ReadonlySet<string> = new Set([
  "reducedMotion",
  "forcedColors",
  "overlayLayers",
]);

/**
 * Runs every case; the failure (or skips) of each case that did not pass, by case name. Not `csp`:
 * it opens the demo's production bundle through `csp.open`, which these sabotages never reach, so
 * it would only add its walk to every run (the csp saboteurs run it alone).
 */
async function failures(
  page: Page,
  harness: ShellConformanceHarness<Page>,
  expected: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const failed = new Map<string, string>();
  for (const conformanceCase of allCases().filter(({ name }) => name !== "csp")) {
    if (OWN_SABOTEURS_ONLY.has(conformanceCase.name) && !expected.has(conformanceCase.name))
      continue;
    try {
      const outcome = await conformanceCase.run(page, harness);
      const skipped = outcome?.skipped ?? [];
      if (skipped.length > 0) {
        failed.set(
          conformanceCase.name,
          `skipped: ${skipped.map((skip) => skip.reason).join("; ")}`,
        );
      }
    } catch (error) {
      failed.set(conformanceCase.name, String(error));
    }
  }
  return failed;
}

/**
 * The saboteur breaks exactly one rule: `caseName` fails with every pattern, all other cases pass.
 * Resolves with that case's failure.
 */
async function expectOnlyCaseFails(
  page: Page,
  harness: ShellConformanceHarness<Page>,
  caseName: string,
  patterns: readonly RegExp[],
): Promise<string> {
  const failed = await expectOnlyCasesFail(page, harness, { [caseName]: patterns });
  return failed.get(caseName) ?? "";
}

/**
 * The saboteur breaks one rule that several cases check: each fails with its patterns, all others pass.
 * Resolves with the failures by case name.
 */
async function expectOnlyCasesFail(
  page: Page,
  harness: ShellConformanceHarness<Page>,
  expected: Readonly<Record<string, readonly RegExp[]>>,
): Promise<Map<string, string>> {
  const failed = await failures(page, harness, new Set(Object.keys(expected)));
  expect([...failed.entries()].filter(([name]) => !(name in expected))).toEqual([]);
  for (const [caseName, patterns] of Object.entries(expected)) {
    const failure = failed.get(caseName);
    expect(failure, `"${caseName}" passed the saboteur`).toBeDefined();
    for (const pattern of patterns) expect(failure).toMatch(pattern);
  }
  return failed;
}

/** The demo harness with `sabotage` applied right after every open. */
function sabotaged(
  sabotage: () => void,
  host: "ide" | "web" | "embedded" = "ide",
): ShellConformanceHarness<Page> {
  const harness = demoHarness(host);
  return {
    ...harness,
    sizes: WIDE_ONLY,
    async open(page, context) {
      await harness.open(page, context);
      await page.evaluate(sabotage);
    },
  };
}

/** The web demo's harness (`/web.html`) with `sabotage` applied right after every open. */
function webSabotaged(
  sabotage: () => void,
  options: WebDemoHarnessOptions = {},
): ShellConformanceHarness<Page> {
  const harness = webDemoHarness(options);
  return {
    ...harness,
    sizes: WIDE_ONLY,
    async open(page, context) {
      await harness.open(page, context);
      await page.evaluate(sabotage);
    },
  };
}

/**
 * Places the toast stack by another reading of guide §8 than the shell's: 8px above every bottom-row
 * island that comes closer than `limit` to the centred column of the stack itself or of its widest
 * card, 12px otherwise; the shell's own placement runs first, this one overrides it. Without
 * `ownLinks` the legal line ends after Datenschutz (about 325px), as for a modeler without links.
 */
interface ToastReading {
  column: "stack" | "card";
  limit: number;
  ownLinks: boolean;
}

function liftToasts({ column, limit, ownLinks }: ToastReading): void {
  const root = document.querySelector<HTMLElement>(".cd-shell")!;
  if (!ownLinks) {
    for (const item of [
      ...root.querySelectorAll('[data-chrome="legal"] .cd-shell-legal-item'),
    ].slice(2))
      item.remove();
  }
  const place = () => {
    const stack = root.querySelector<HTMLElement>('[data-chrome="toasts"]');
    const cards = [...(stack?.querySelectorAll<HTMLElement>(":scope > [data-status]") ?? [])];
    if (!stack || cards.length === 0) return;
    const box = root.getBoundingClientRect();
    const width =
      column === "stack"
        ? stack.getBoundingClientRect().width
        : Math.max(...cards.map((card) => card.getBoundingClientRect().width));
    const left = box.left + (box.width - width) / 2;
    let bottom = 12;
    for (const name of ["zoom", "legal", "problems"]) {
      const island = root.querySelector(`[data-chrome="${name}"]`);
      const rect = island?.getBoundingClientRect();
      if (!island || !rect || rect.width === 0 || getComputedStyle(island).visibility === "hidden")
        continue;
      if (Math.max(rect.left - (left + width), left - rect.right) < limit) {
        bottom = Math.max(bottom, box.bottom - rect.top + 8);
      }
    }
    if (stack.style.bottom !== `${bottom}px`) stack.style.bottom = `${bottom}px`;
  };
  new MutationObserver(place).observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style"],
  });
}

/** The web demo's harness with the toast stack placed by `reading` (`liftToasts`). */
function toastsLiftedBy(reading: ToastReading): ShellConformanceHarness<Page> {
  const harness = webDemoHarness();
  return {
    ...harness,
    sizes: WIDE_ONLY,
    async open(page, context) {
      await harness.open(page, context);
      await page.evaluate(liftToasts, reading);
    },
  };
}

/**
 * The demo's label editor commits (through its blur) 300ms after every change of the view, so a
 * step that leaves the view as it was commits nothing.
 */
function commitLabelLateAfterEveryViewChange(): void {
  const viewport = document.querySelector<SVGGraphicsElement>(".djs-container > svg > .viewport");
  if (!viewport) throw new Error("demo: no diagram-js viewport layer");
  // canvas.viewbox(box) writes transform.baseVal, which queues no MutationRecord in Chromium
  const viewOf = () => {
    const matrix = viewport.getCTM();
    return matrix ? `${matrix.a} ${matrix.d} ${matrix.e} ${matrix.f}` : "";
  };
  let seen = viewOf();
  const watch = () => {
    const view = viewOf();
    if (view !== seen) {
      seen = view;
      window.setTimeout(() => {
        const field = document.activeElement;
        if (field instanceof HTMLElement && field.classList.contains("demo-label-editor"))
          field.blur();
      }, 300);
    }
    window.requestAnimationFrame(watch);
  };
  window.requestAnimationFrame(watch);
}

/**
 * A size at which the demo fits at about 74 %: diagram-js's zoom raster snaps that to its 74 % step
 * and goes one step on to exactly 100 %, as from Context Maps' example (68 % at 1280 × 900) and
 * Event Storming's board (84 %).
 */
const ONE_STEP_TO_ACTUAL_SIZE = [{ width: 610, height: 900 }] as const;

/** The fit at `ONE_STEP_TO_ACTUAL_SIZE` is off 100 %, and one zoom in from it lands on 100 %. */
async function expectOneZoomStepToActual(
  page: Page,
  harness: ShellConformanceHarness<Page>,
): Promise<void> {
  await harness.open(page, { size: ONE_STEP_TO_ACTUAL_SIZE[0], requested: { theme: "light" } });
  const zooms = await page.evaluate(() => {
    const viewport = window.__demo!.connection.viewport;
    const fitted = viewport.zoom();
    viewport.stepZoom(1);
    return { fitted, stepped: viewport.zoom() };
  });
  expect(zooms.fitted).toBeLessThan(0.99);
  expect(zooms.stepped).toBeCloseTo(1, 3);
}

test.describe("saboteurs", () => {
  test.describe.configure({ timeout: 60_000 });

  test.describe("that break one rule and fail only its case", () => {
    test.describe.configure({ timeout: 150_000 });

    test("create fails when Enter on a creating palette entry places nothing", async ({ page }) => {
      const harness = sabotaged(() => {
        window.__demo!.flaws.noKeyboardCreate = true;
      });
      await expectOnlyCaseFails(page, harness, "create", [
        /create: Enter on palette entry "create\.box" added no element/,
      ]);
    });

    test("legendStart fails a shell that opens the legend by default", async ({ page }) => {
      // shell 0.4's rule, open above 440px width and 820px height, before the decision of 2026-10-24
      const harness = sabotaged(() => {
        const root = document.querySelector(".cd-shell")!;
        if (root.clientWidth > 440 && root.clientHeight > 820)
          window.__demo!.shell.legend?.setOpen(true);
      });
      const failure = await expectOnlyCaseFails(page, harness, "legendStart", [
        /legend: open on first load in a 441 × 900 container; without a stored state it starts closed in every container/,
        /legend: open on first load in a 1280 × 900 container; without a stored state it starts closed in every container/,
      ]);
      expect(failure).not.toMatch(/390 × 844/);
    });

    test("geometry fails for a second-row tooltip centred in the container", async ({ page }) => {
      // the other reading of guide §5.15's "mittig im Container", settled for the entry in 1.15.0
      const harness: ShellConformanceHarness<Page> = {
        ...sabotaged(() => {
          const root = document.querySelector<HTMLElement>(".cd-shell")!;
          const centre = () => {
            const tooltip = root.querySelector<HTMLElement>('[role="tooltip"]');
            if (!tooltip || root.getAttribute("data-palette") !== "second-row") return;
            if (tooltip.style.top !== "112px") return;
            const left = `${(root.clientWidth - tooltip.offsetWidth) / 2}px`;
            if (tooltip.style.left !== left) tooltip.style.left = left;
          };
          new MutationObserver(centre).observe(root, {
            subtree: true,
            attributes: true,
            attributeFilter: ["style"],
          });
        }),
        // the other cases read the first size, wide; the second row is the second
        sizes: [...WIDE_ONLY, { width: 720, height: 700 }],
      };
      await expectOnlyCaseFails(page, harness, "geometry", [
        /\[720 × 700\] tooltip: left is [\d.]+px, expected [\d.]+px \(±1px\) \(on palette-entry\)/,
      ]);
    });

    test("focusHandBack fails when a pointer click leaves the focus on the chrome", async ({
      page,
    }) => {
      // shell 0.2.1: the clicked button keeps the focus, so Delete and the arrows do nothing
      const harness = sabotaged(() => {
        window.__demo!.connection.viewport.focus = () => {};
      });
      await expectOnlyCaseFails(page, harness, "focusHandBack", [
        /focus: after a click on zoom in the focus is on button\.cd-shell-target, expected the canvas <svg>/,
        /focus: after a click on fit the focus is on button\.cd-shell-target, expected the canvas <svg>/,
        /focus: after a click on palette tool "lasso-tool" the focus is on div\.entry\S*, expected the canvas <svg>/,
      ]);
    });

    test("focusHandBack fails when a click on a Model action returns the focus to the trigger", async ({
      page,
    }) => {
      // guide §5.4 before Miragon/corporate-identity#36: every action entry returned the focus to the trigger
      const harness = sabotaged(() => {
        document.addEventListener("click", (event) => {
          const entry = (event.target as Element | null)?.closest?.(
            '[role="menu"] [data-menu-group="model"][role="menuitem"]',
          );
          if (entry) document.querySelector<HTMLElement>('[data-chrome="menu"]')?.focus();
        });
      });
      await expectOnlyCaseFails(page, harness, "focusHandBack", [
        /focus: after a click on menu entry "Arrange boxes" the focus is on button\S*\[data-chrome="menu"\]\S*, expected the canvas <svg>, so its keys act at once \(guide §5\.4, §5\.8\)/,
      ]);
    });

    test("readOnly fails when the lock leaves the canvas editable", async ({ page }) => {
      const harness = sabotaged(() => {
        window.__demo!.flaws.canvasUnlocked = true;
      });
      await expectOnlyCaseFails(page, harness, "readOnly", [
        /read-only: selecting "[^"]+" shows the context pad/,
        /read-only: a 40px drag changed "[^"]+"/,
        /read-only: Delete on the canvas deleted "[^"]+"/,
      ]);
    });

    test("keys fails in the IDE host when Cmd/Ctrl+A on the canvas goes on to VS Code", async ({
      page,
    }) => {
      const harness = sabotaged(() => {
        window.__demo!.flaws.noSelectAll = true;
      });
      await expectOnlyCaseFails(page, harness, "keys", [
        /Control\+KeyA on the canvas \(select all acts on the canvas only\) reached a keydown listener on window/,
        /Meta\+KeyA on the canvas \(select all acts on the canvas only\) reached a keydown listener on window/,
      ]);
    });

    test("appearance fails for a canvas surround painted outside the mode", async ({ page }) => {
      // Event Storming's `style dark` board: navy around a light modeler
      const harness = sabotaged(() => {
        const style = document.createElement("style");
        style.textContent =
          ".cd-shell-canvas, .djs-container { background-color: #080A20 !important; }";
        document.head.append(style);
      });
      await expectOnlyCaseFails(page, harness, "appearance", [
        /\[requested dark\] canvas surround: div\.djs-container\S* paints rgb\(8, 10, 32\), but --cd-ui-grund resolves to rgb\(/,
      ]);
    });

    test("webChrome fails when the primary action never collapses its label", async ({ page }) => {
      const harness = webSabotaged(() => {
        const root = document.querySelector(".cd-shell")!;
        const expand = () => {
          root.removeAttribute("data-primary");
          const primary = root.querySelector('[data-chrome="primary"]');
          primary?.removeAttribute("data-collapsed");
          primary?.querySelector("[hidden]")?.removeAttribute("hidden");
        };
        new MutationObserver(expand).observe(root, {
          subtree: true,
          attributes: true,
          attributeFilter: ["data-primary", "data-collapsed", "hidden"],
        });
      });
      await expectOnlyCaseFails(page, harness, "webChrome", [
        /\[\d+px wide\] primary: shows its label, but the 648px palette fits the top row only beside the icon; the label collapses first/,
      ]);
    });

    test("webChrome fails when a narrow legal line scrolls instead of wrapping", async ({
      page,
    }) => {
      const harness = webSabotaged(() => {
        const style = document.createElement("style");
        style.textContent = ".cd-shell-legal { flex-wrap: nowrap !important; overflow-x: auto; }";
        document.head.append(style);
      });
      await expectOnlyCaseFails(page, harness, "webChrome", [
        /legal: \[320px wide\] "[^"]+" is cut off or scrolled out of the legal line; it wraps instead/,
      ]);
    });

    test("webChrome fails when the zoom row rises only once it overlaps the legal line", async ({
      page,
    }) => {
      // without modeler links the 24px steps measure 13.8px and −10.2px and passed this reading
      const harness = webSabotaged(() => {
        for (const item of [
          ...document.querySelectorAll('[data-chrome="legal"] .cd-shell-legal-item'),
        ].slice(2))
          item.remove();
        const root = document.querySelector<HTMLElement>(".cd-shell")!;
        const lower = () => {
          if (root.getAttribute("data-zoom-row") !== "raised") return;
          const legal = root.querySelector('[data-chrome="legal"]')!.getBoundingClientRect();
          const zoom = root.querySelector('[data-chrome="zoom"]')!.getBoundingClientRect();
          if (root.getBoundingClientRect().right - 12 - zoom.width >= legal.right) {
            root.removeAttribute("data-zoom-row");
          }
        };
        new MutationObserver(lower).observe(root, {
          attributes: true,
          attributeFilter: ["data-zoom-row"],
        });
        lower();
      });
      await expectOnlyCaseFails(page, harness, "webChrome", [
        /\[\d+px wide\] zoom: [\d.]+px between the legal line and the zoom panel, but the root lacks data-zoom-row="raised"/,
      ]);
    });

    test("webChrome fails when a wrapped legal line leaves a separator at the end of a line", async ({
      page,
    }) => {
      // each separator moved to the link before it, so a wrap leaves it behind
      const harness = webSabotaged(() => {
        const legal = document.querySelector('[data-chrome="legal"]')!;
        const head = document.createElement("span");
        head.className = "cd-shell-legal-item";
        const first = legal.querySelector(":scope > a")!;
        first.replaceWith(head);
        head.append(first);
        let previous: Element = head;
        for (const item of legal.querySelectorAll(".cd-shell-legal-item")) {
          if (item === head) continue;
          previous.append(item.querySelector('[aria-hidden="true"]')!);
          previous = item;
        }
      });
      await expectOnlyCaseFails(page, harness, "webChrome", [
        /legal: \[320px wide\] the separator before "[^"]+" ends the line above; each separator travels with the link after it/,
      ]);
    });

    test("webChrome fails when the pill does not rise with a wrapped legal line", async ({
      page,
    }) => {
      const harness = webSabotaged(() => {
        const style = document.createElement("style");
        style.textContent = '.cd-shell [data-chrome="problems"] { bottom: 40px !important; }';
        document.head.append(style);
      });
      await expectOnlyCaseFails(page, harness, "webChrome", [
        /\[320px wide, a legal line of 2, the pill, the legend\] problems: bottom is 40px, expected 60px \(±1px\)/,
      ]);
    });

    test("toasts fails when every card spans the stack's full width", async ({ page }) => {
      // §8's min(480px, 100% − 24px) read as the card's width instead of its maximum
      const harness = webSabotaged(() => {
        const style = document.createElement("style");
        style.textContent =
          '[data-chrome="toasts"] > [data-status] { align-self: stretch !important; }';
        document.head.append(style);
      });
      await expectOnlyCaseFails(page, harness, "toasts", [
        /toasts: the success toast's card is 480px wide for [\d.]+px of content; a card is as wide as its content, at most the stack's 480px/,
      ]);
    });

    test("toasts fails when the stack rises for its own column instead of its widest card's", async ({
      page,
    }) => {
      // without modeler links no default size tells the two columns apart
      const harness = toastsLiftedBy({ column: "stack", limit: 8, ownLinks: false });
      await expectOnlyCaseFails(page, harness, "toasts", [
        /\[\d+px wide, the widest card 12px beside the bottom row\] toasts: bottom is 40px, expected 12px \(±1px\)/,
      ]);
    });

    test("toasts fails when the stack rises only once its widest card overlaps the bottom row", async ({
      page,
    }) => {
      const harness = toastsLiftedBy({ column: "card", limit: 0, ownLinks: true });
      await expectOnlyCaseFails(page, harness, "toasts", [
        /\[\d+px wide, the widest card 4px beside the bottom row\] toasts: bottom is 12px, expected 40px \(±1px\)/,
      ]);
    });

    test("emptyState fails when the start screen leaves the palette visible", async ({ page }) => {
      const harness = webSabotaged(() => {
        const style = document.createElement("style");
        style.textContent =
          '.cd-shell[data-empty-state="shown"] .djs-palette { visibility: visible !important; }';
        document.head.append(style);
      });
      await expectOnlyCaseFails(page, harness, "emptyState", [
        /empty-state: palette is visible behind the start screen; it hides the work chrome/,
      ]);
    });

    test("emptyState fails when the start screen swallows the browser's zoom keys", async ({
      page,
    }) => {
      const harness = webSabotaged(() => {
        document.addEventListener("keydown", (event) => {
          const shown = document.querySelector('.cd-shell[data-empty-state="shown"]') !== null;
          if (shown && (event.ctrlKey || event.metaKey) && (event.key === "=" || event.key === "-"))
            event.preventDefault();
        });
      });
      await expectOnlyCaseFails(page, harness, "emptyState", [
        /empty-state: Control\+Equal behind the start screen arrived prevented; with no diagram to zoom the browser keeps its page zoom/,
      ]);
    });

    test("emptyState fails when the start screen has no link to Open…", async ({ page }) => {
      const harness = webSabotaged(() => {
        const style = document.createElement("style");
        style.textContent = ".cd-shell-empty-state-open-item { display: none !important; }";
        document.head.append(style);
      });
      await expectOnlyCaseFails(page, harness, "emptyState", [
        /empty-state: the File group has Open…, but the hint does not end in a text link to it/,
      ]);
    });

    test("emptyState fails when the start screen's Open a file… is underlined only on hover and focus", async ({
      page,
    }) => {
      // shell 0.3.3: at rest the link's colour alone parted it from the hint (1.16:1, dark 1.15:1)
      const harness = webSabotaged(() => {
        const style = document.createElement("style");
        style.textContent =
          ".cd-shell .cd-shell-empty-state-open:not(:hover, :focus-visible) { text-decoration: none !important; }";
        document.head.append(style);
      });
      await expectOnlyCaseFails(page, harness, "emptyState", [
        /empty-state: "Open a file…" is not underlined at rest; beside the hint's quiet text its colour alone does not mark it as a link \(guide §3\.5, §8, WCAG 1\.4\.1\)/,
      ]);
    });

    test("emptyState fails when the start screen swallows the browser's Ctrl+0", async ({
      page,
    }) => {
      // a stored page zoom could not be reset there (WCAG 1.4.4)
      const harness = webSabotaged(() => {
        document.addEventListener("keydown", (event) => {
          const shown = document.querySelector('.cd-shell[data-empty-state="shown"]') !== null;
          if (shown && (event.ctrlKey || event.metaKey) && event.key === "0")
            event.preventDefault();
        });
      });
      await expectOnlyCaseFails(page, harness, "emptyState", [
        /empty-state: Control\+Digit0 behind the start screen arrived prevented; with no diagram to zoom the browser keeps its page zoom/,
      ]);
    });

    test("keys fails when a non-modal dialog blocks the chrome keys", async ({ page }) => {
      // every dialog read as modal: the reading design system 1.15.0 rules out for guide §5.8
      const harness = sabotaged(() => {
        const asModal = () => {
          for (const dialog of document.querySelectorAll(
            '[role="dialog"]:not([aria-modal]), dialog[open]',
          )) {
            if (!dialog.matches(":modal")) dialog.setAttribute("aria-modal", "true");
          }
        };
        new MutationObserver(asModal).observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["open"],
        });
      });
      await expectOnlyCaseFails(page, harness, "keys", [
        /Control\+Minus in a popover changed the zoom|Control\+Minus in a popover zoomed to/,
        /Control\+Minus in a non-modal <dialog> zoomed to 135% from 135%, expected 100%/,
      ]);
    });

    test("toasts fails when toasts never close by themselves", async ({ page }) => {
      const harness = webSabotaged(() => {
        const original = window.setTimeout.bind(window);
        window.setTimeout = ((handler: TimerHandler, timeout?: number, ...rest: unknown[]) =>
          timeout !== undefined && timeout >= 1400 && timeout <= 6000
            ? 0
            : original(handler, timeout, ...rest)) as typeof window.setTimeout;
      });
      await expectOnlyCaseFails(page, harness, "toasts", [
        /toasts: "Conformance: a plain toast" is still there 3700ms after it appeared; it closes after its lifetime/,
      ]);
    });

    test("toasts fails when the live regions come only with the toast", async ({ page }) => {
      const harness = webSabotaged(() => document.querySelector(".cd-shell-live")?.remove());
      await expectOnlyCaseFails(page, harness, "toasts", [
        /toasts: no role="status" live region in the root before the first toast/,
        /toasts: no role="alert" live region in the root before the first toast/,
      ]);
    });

    test("problemsList fails when a text row cannot take the focus", async ({ page }) => {
      const harness = webSabotaged(() => {
        const unfocusable = () => {
          for (const row of document.querySelectorAll("div.cd-shell-problem[tabindex]"))
            row.removeAttribute("tabindex");
        };
        unfocusable();
        new MutationObserver(unfocusable).observe(document.body, {
          childList: true,
          subtree: true,
        });
      });
      await expectOnlyCaseFails(page, harness, "problemsList", [
        /problems-popover: ArrowDown reaches row 1, expected row 2 of 2; the keyboard reads every row, text rows too/,
      ]);
    });

    test("dropZone fails when the drop zone ignores a forbidden drag", async ({ page }) => {
      const harness = webSabotaged(() => {
        const root = document.querySelector(".cd-shell")!;
        new MutationObserver(() => {
          if (root.getAttribute("data-drop") === "forbidden")
            root.setAttribute("data-drop", "over");
        }).observe(root, { attributes: true, attributeFilter: ["data-drop"] });
      });
      await expectOnlyCaseFails(page, harness, "dropZone", [
        /drop-zone: a drag of two files sets data-drop="over", expected "forbidden"/,
        /drop-zone: a file drag with a modal dialog open sets data-drop="over", expected "forbidden"/,
      ]);
    });

    test("aria fails for Impressum and Datenschutz without lang", async ({ page }) => {
      const harness = webSabotaged(() => {
        for (const link of document.querySelectorAll('[data-chrome="legal"] a[lang]'))
          link.removeAttribute("lang");
      });
      await expectOnlyCaseFails(page, harness, "aria", [
        /legal: "Impressum" has no lang, expected lang="de"/,
        /legal: "Datenschutz" has no lang, expected lang="de"/,
      ]);
    });

    test("problemsList fails for a problems list not labelled by its title", async ({ page }) => {
      const harness = webSabotaged(() => {
        document
          .querySelector('[data-chrome="problems-popover"]')
          ?.removeAttribute("aria-labelledby");
      });
      await expectOnlyCaseFails(page, harness, "problemsList", [
        /problems-popover: not labelled by its title \(aria-labelledby\)/,
      ]);
    });

    test("appearance fails when the web app does not store the chosen mode", async ({ page }) => {
      const harness = webSabotaged(
        () => {
          const setItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
            if (key !== "miragon.darstellung") setItem.call(this, key, value);
          };
        },
        { themes: ["light", "dark"] },
      );
      await expectOnlyCaseFails(page, harness, "appearance", [
        /mode: with Dark localStorage holds miragon\.darstellung=\(none\), expected "dark"/,
      ]);
    });

    test("geometry and toasts fail for a toast stack off its bottom", async ({ page }) => {
      const harness = webSabotaged(() => {
        const style = document.createElement("style");
        style.textContent = '[data-chrome="toasts"] { translate: 0 -10px; }';
        document.head.append(style);
      });
      await expectOnlyCasesFail(page, harness, {
        // 10px above toastStackBottom, which depends on the legal line's measured width
        geometry: [
          /\[1280 × 900, with a toast\] toasts: bottom is (\d+)px, expected (\d+)px \(±1px\)/,
        ],
        // the toasts case measures the lift at its two widths
        toasts: [
          /\[\d+px wide, the widest card 12px beside the bottom row\] toasts: bottom is 22px, expected 12px/,
        ],
      });
    });

    test("labelEditor fails when a view change commits the open label editor", async ({ page }) => {
      // the renderers built against contract 1.1 completed direct editing on canvas.viewbox.changing
      const harness = sabotaged(() => {
        window.__demo!.flaws.commitLabelOnViewChange = true;
      });
      await expectOnlyCaseFails(page, harness, "labelEditor", [
        /label editor: a click on Fit committed the open label editor \(labelEditor\.documentChanged\); a view change the host makes never commits it \(contract L5\)/,
        /label editor: Cmd\/Ctrl\+0 on the canvas committed the open label editor/,
        /label editor: Shift\+1 on the canvas committed the open label editor/,
        /label editor: a container resize committed the open label editor/,
      ]);
    });

    test("labelEditor fails when the shell's fit takes the focus from the label editor", async ({
      page,
    }) => {
      // the demo's editor commits when it loses the focus, as the renderers' do
      const harness = sabotaged(() => {
        const viewport = window.__demo!.connection.viewport;
        const fit = viewport.fit.bind(viewport);
        viewport.fit = (options) => {
          fit(options);
          viewport.focus?.();
        };
      });
      await expectOnlyCaseFails(page, harness, "labelEditor", [
        /label editor: a click on Fit committed the open label editor/,
        /label editor: Shift\+1 on the canvas committed the open label editor/,
      ]);
    });

    test("labelEditor fails when a view change closes the label editor and drops the typed text", async ({
      page,
    }) => {
      const harness = sabotaged(() => {
        window.__demo!.flaws.closeLabelOnViewChange = true;
      });
      await expectOnlyCaseFails(page, harness, "labelEditor", [
        /label editor: after a click on Fit the focus is on \S+, not in the label editor; it stays open with the typed "Renamed box \d+" \(L5 recommends it, the shell kit requires it\)/,
        /label editor: after Shift\+1 on the canvas the focus is on \S+, not in the label editor/,
        /label editor: after a container resize the focus is on \S+, not in the label editor/,
      ]);
    });

    test("labelEditor fails when the label editor commits a moment after a container resize", async ({
      page,
    }) => {
      // a debounced resize handler commits after the refit held still; the demo's editor commits on blur
      const harness = sabotaged(() => {
        let pending: number | undefined;
        window.addEventListener("resize", () => {
          window.clearTimeout(pending);
          pending = window.setTimeout(() => {
            const field = document.activeElement;
            if (field instanceof HTMLElement && field.classList.contains("demo-label-editor"))
              field.blur();
          }, 300);
        });
      });
      const failure = await expectOnlyCaseFails(page, harness, "labelEditor", [
        /label editor: a container resize committed the open label editor/,
      ]);
      expect(failure.match(/committed the open label editor/g)).toHaveLength(1);
    });

    test("labelEditor blames the view change that committed late, not the step after it", async ({
      page,
    }) => {
      // a commit 300ms after each view change lands after the view held still, while the case moves on
      const harness = sabotaged(commitLabelLateAfterEveryViewChange);
      const failure = await expectOnlyCaseFails(page, harness, "labelEditor", [
        /label editor: a click on zoom in committed the open label editor/,
        /label editor: a click on Fit committed the open label editor/,
        /label editor: Cmd\/Ctrl\+Plus on the canvas committed the open label editor/,
        /label editor: Cmd\/Ctrl\+0 on the canvas committed the open label editor/,
        /label editor: Cmd\/Ctrl\+Plus on the canvas after Cmd\/Ctrl\+0 committed the open label editor/,
        /label editor: Shift\+1 on the canvas committed the open label editor/,
        /label editor: a container resize committed the open label editor/,
      ]);
      expect(failure).not.toMatch(/labelEditor\.open/);
      // the demo fits at 100 % here, so the first Cmd/Ctrl+Plus already left 100 %
      expect(failure).not.toMatch(/one more Cmd\/Ctrl\+Plus/);
    });

    test("appearance fails for a renderer colour on the armed tool's icon", async ({ page }) => {
      // the lasso icon of Event Storming computed to rgb(29, 30, 33) from a renderer rule
      const harness = sabotaged(() => {
        const style = document.createElement("style");
        style.textContent =
          '.djs-palette .entry[aria-pressed="true"] svg { color: rgb(29, 30, 33) !important; }';
        document.head.append(style);
      });
      await expectOnlyCaseFails(page, harness, "appearance", [
        /palette: the <svg> icon of tool "lasso-tool" pressed has color rgb\(29, 30, 33\), expected --cd-ui-text/,
      ]);
    });
  });

  test("readOnly fails for a creating entry the lock does not mark", async ({ page }) => {
    const harness = sabotaged(() => {
      const unmark = () => {
        for (const entry of document.querySelectorAll(
          '[data-action="create.box"][aria-disabled]',
        )) {
          entry.removeAttribute("aria-disabled");
        }
      };
      new MutationObserver(unmark).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["aria-disabled"],
      });
    });
    await expect(runCase("readOnly", page, harness)).rejects.toThrow(
      /palette: "create\.box" is not aria-disabled on the read-only canvas/,
    );
  });

  test("readOnly fails for view toggles and export disabled on the read-only canvas", async ({
    page,
  }) => {
    const harness = sabotaged(() => {
      const disable = () => {
        if (!document.querySelector(".cd-shell[data-readonly]")) return;
        for (const item of document.querySelectorAll(
          '[data-menu-id="legend"], [data-menu-id="export-png"]',
        )) {
          if (item.getAttribute("aria-disabled") !== "true")
            item.setAttribute("aria-disabled", "true");
        }
      };
      new MutationObserver(disable).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
      });
    });
    const failure = await runCase("readOnly", page, harness).then(
      () => "passed",
      (error: unknown) => String(error),
    );
    expect(failure).toMatch(/menu: the Legend toggle is aria-disabled on the read-only canvas/);
    expect(failure).toMatch(/menu: "Export as PNG" is aria-disabled on the read-only canvas/);
  });

  test("focusHandBack fails when Enter or Space on zoom in moves the focus to the canvas", async ({
    page,
  }) => {
    const harness = sabotaged(() => {
      document
        .querySelector('[data-chrome="zoom"] [data-zoom="in"]')
        ?.addEventListener("click", () => window.__demo!.connection.viewport.focus?.());
    });
    const failure = await runCase("focusHandBack", page, harness).then(
      () => "passed",
      (error: unknown) => String(error),
    );
    expect(failure).toMatch(
      /focus: after Enter on zoom in the focus is on svg, expected it to stay on zoom in, so the next press acts again/,
    );
    expect(failure).toMatch(/focus: after Space on zoom in the focus is on svg/);
    expect(failure).not.toMatch(/after a click/);
  });

  test("focusHandBack fails when Enter on a File action leaves the focus on the canvas", async ({
    page,
  }) => {
    const harness = webSabotaged(() => {
      document.addEventListener("click", (event) => {
        const entry = (event.target as Element | null)?.closest?.(
          '[role="menu"] [data-menu-group="file"]',
        );
        if (entry && event.detail === 0) window.__webDemo!.connection.viewport.focus?.();
      });
    });
    const failure = await runCase("focusHandBack", page, harness).then(
      () => "passed",
      (error: unknown) => String(error),
    );
    expect(failure).toMatch(
      /focus: after Enter on menu entry "New diagram" the focus is on svg, expected the menu trigger, where the keyboard left the menu \(guide §5\.4\)/,
    );
    expect(failure).not.toMatch(/after a click/);
  });

  test("focusHandBack skips without a File or Model action, unless the harness declares it absent", async ({
    page,
  }) => {
    const hideArrange = () => {
      const style = document.createElement("style");
      style.textContent = '[data-menu-id="arrange"] { display: none !important; }';
      document.head.append(style);
    };
    const skips = await runCase("focusHandBack", page, sabotaged(hideArrange));
    expect(skips?.skipped).toEqual([
      {
        hook: "open",
        reason:
          'the menu has no File or Model action without a dialog: the focus after a click on a menu entry was not verified (absent: ["canvasMenuAction"] for a modeler without one)',
      },
    ]);
    const declared = { ...sabotaged(hideArrange), absent: ["canvasMenuAction"] as const };
    expect(await runCase("focusHandBack", page, declared)).toBeUndefined();
  });

  test("labelEditor fails for a documentChanged probe that never sees the commit", async ({
    page,
  }) => {
    const base = demoHarness("ide");
    const harness: ShellConformanceHarness<Page> = {
      ...base,
      sizes: WIDE_ONLY,
      labelEditor: { open: base.labelEditor!.open, documentChanged: async () => false },
    };
    await expect(runCase("labelEditor", page, harness)).rejects.toThrow(
      /label editor: a click on an empty spot of the canvas after the view changes left labelEditor\.documentChanged false, so the case proved nothing/,
    );
  });

  test("labelEditor passes at a fit from where one zoom step lands on 100 %", async ({ page }) => {
    // Cmd/Ctrl+0 right after that step would leave the view as it was and prove nothing
    const harness: ShellConformanceHarness<Page> = {
      ...demoHarness("ide"),
      sizes: ONE_STEP_TO_ACTUAL_SIZE,
    };
    await expectOneZoomStepToActual(page, harness);
    await expect(runCase("labelEditor", page, harness)).resolves.toBeUndefined();
  });

  test("labelEditor catches a commit on Cmd/Ctrl+0 at a fit from where one zoom step lands on 100 %", async ({
    page,
  }) => {
    const harness: ShellConformanceHarness<Page> = {
      ...sabotaged(commitLabelLateAfterEveryViewChange),
      sizes: ONE_STEP_TO_ACTUAL_SIZE,
    };
    await expectOneZoomStepToActual(page, harness);
    const failure = await runCase("labelEditor", page, harness).then(
      () => "passed",
      (error: unknown) => String(error),
    );
    expect(failure).toMatch(
      /label editor: one more Cmd\/Ctrl\+Plus on the canvas \(the view stood at 100 %\) committed the open label editor/,
    );
    expect(failure).toMatch(
      /label editor: Cmd\/Ctrl\+0 on the canvas committed the open label editor/,
    );
    expect(failure).not.toMatch(/left the view as it was/);
  });

  test("legendStart fails a harness whose open keeps the document, and passes it from about:blank", async ({
    page,
  }) => {
    // the web suites that carry the document in the URL fragment (Team Topologies, Context Maps)
    const fragmentOnly = (fresh: boolean): ShellConformanceHarness<Page> => ({
      ...webDemoHarness(),
      async open(target, { size }) {
        await target.setViewportSize(size);
        if (fresh) await target.goto("about:blank");
        await target.goto("/web.html?themes=light&legend=&inspector=#d=diagram");
        await target.waitForFunction(() => window.__webDemo?.ready === true);
      },
    });
    const failure = await runCase("legendStart", page, fragmentOnly(false)).then(
      () => "passed",
      (error: unknown) => String(error),
    );
    expect(failure).toMatch(
      /legendStart \(web host\)\n- harness: open kept the page's document at 441 × 900 \(a navigation that changes only the URL fragment keeps it\)/,
    );
    expect(failure).not.toMatch(/legend: open on first load/);
    expect(await runCase("legendStart", page, fragmentOnly(true))).toBeUndefined();
  });

  test("geometry and aria fail for an island the harness declares absent", async ({ page }) => {
    const base = demoHarness("ide");
    const harness: ShellConformanceHarness<Page> = {
      ...base,
      // the legend starts closed since 0.5, so the modeler that lies about it opens it itself
      async open(target, context) {
        await base.open(target, context);
        await target.evaluate(() => window.__demo?.shell.legend?.setOpen(true));
      },
      sizes: WIDE_ONLY,
      show: { ...base.show, legend: undefined },
      absent: ["legend"],
    };
    await expect(runCase("geometry", page, harness)).rejects.toThrow(
      /\[1280 × 900, as opened\] legend: visible, but harness\.absent says the modeler has no legend/,
    );
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /legend: visible, but harness\.absent says the modeler has no legend/,
    );
  });

  test("geometry fails for an island 2px off its anchor", async ({ page }) => {
    const harness = sabotaged(() => {
      document.querySelector<HTMLElement>('[data-chrome="zoom"]')!.style.translate = "-2px 0";
    });
    await expect(runCase("geometry", page, harness)).rejects.toThrow(
      /\[1280 × 900, as opened\] zoom: right is 14px, expected 12px \(±1px\)/,
    );
  });

  test("geometry fails for a dropdown and a tooltip off their anchors", async ({ page }) => {
    const harness = sabotaged(() => {
      const style = document.createElement("style");
      style.textContent = '[role="menu"], [role="tooltip"] { translate: 0 3px; }';
      document.head.append(style);
    });
    const failure = await runCase("geometry", page, harness).then(
      () => "passed",
      (error: unknown) => String(error),
    );
    expect(failure).toMatch(/\[1280 × 900\] dropdown: top is 63px, expected 60px \(±1px\)/);
    expect(failure).toMatch(
      /\[1280 × 900\] tooltip: top is 63px, expected 60px \(±1px\) \(on menu\)/,
    );
    expect(failure).toMatch(
      /\[1280 × 900\] tooltip: bottom is 57px, expected 60px \(±1px\) \(on zoom-in\)/,
    );
  });

  test("aria fails for a positive tabindex", async ({ page }) => {
    const harness = sabotaged(() => {
      document.querySelector('[data-chrome="menu"]')!.setAttribute("tabindex", "1");
    });
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /positive tabindex on button.*\[data-chrome="menu"\] \(tabindex="1"\)/,
    );
  });

  test("aria fails for a palette shortcut that only the tooltip chip names", async ({ page }) => {
    const harness = sabotaged(() => {
      for (const entry of document.querySelectorAll(
        '[data-chrome="palette"] [aria-keyshortcuts]',
      )) {
        entry.removeAttribute("aria-keyshortcuts");
      }
    });
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /palette: entry "lasso-tool" shows the shortcut "L" in its tooltip but has no aria-keyshortcuts/,
    );
  });

  test("aria fails for a palette entry whose aria-keyshortcuts names a character", async ({
    page,
  }) => {
    const harness = sabotaged(() => {
      document
        .querySelector('[data-chrome="palette"] [data-action="lasso-tool"]')!
        .setAttribute("aria-keyshortcuts", "Shift+?");
    });
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /palette: entry "lasso-tool" has aria-keyshortcuts="Shift\+\?", which names the character "\?", not a key \(guide §5\.6\)/,
    );
  });

  test("aria fails for a menu entry that names the character of its chip, not its keys", async ({
    page,
  }) => {
    const harness = sabotaged(() => {
      window.__demo!.shell.menu.setGroups({
        help: [
          {
            kind: "dialog",
            id: "shortcuts",
            label: "Keyboard shortcuts…",
            shortcut: "?",
            ariaKeyShortcuts: "?",
            onSelect() {},
          },
        ],
      });
    });
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /menu: "Keyboard shortcuts…" has aria-keyshortcuts="\?", which names the character "\?", not a key; expected "Shift\+\/ Shift\+ß" \(guide §5\.6\)/,
    );
  });

  test("aria fails for a menu entry that names the keys of one layout only", async ({ page }) => {
    const harness = sabotaged(() => {
      window.__demo!.shell.menu.setGroups({
        help: [
          {
            kind: "dialog",
            id: "shortcuts",
            label: "Keyboard shortcuts…",
            shortcut: "?",
            ariaKeyShortcuts: "Shift+/",
            onSelect() {},
          },
        ],
      });
    });
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /menu: "Keyboard shortcuts…" has aria-keyshortcuts="Shift\+\/" for the chip "\?", expected "Shift\+\/ Shift\+ß": the keys of the US, then the German layout \(guide §5\.6\)/,
    );
  });

  test("aria fails for a menu entry that opts its ? chip out of aria-keyshortcuts", async ({
    page,
  }) => {
    const harness = sabotaged(() => {
      window.__demo!.shell.menu.setGroups({
        help: [
          {
            kind: "dialog",
            id: "shortcuts",
            label: "Keyboard shortcuts…",
            shortcut: "?",
            ariaKeyShortcuts: "",
            onSelect() {},
          },
        ],
      });
    });
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /menu: "Keyboard shortcuts…" has no aria-keyshortcuts for the chip "\?", expected "Shift\+\/ Shift\+ß": the keys of the US, then the German layout \(guide §5\.6\)/,
    );
  });

  test("aria fails for a menu shortcut on a character that needs AltGr", async ({ page }) => {
    const harness = sabotaged(() => {
      window.__demo!.shell.menu.setGroups({
        export: [{ kind: "action", id: "mention", label: "Mention", shortcut: "@", onSelect() {} }],
      });
    });
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /menu: "Mention" shows the shortcut "@" on a character that needs AltGr or ⌥, sits on a dead key or is missing on the US or the German layout; guide §5\.6 rules such a shortcut out/,
    );
  });

  test("aria fails for a dialog entry without the ellipsis, whatever its shortcut chip", async ({
    page,
  }) => {
    const harness = sabotaged(() => {
      window.__demo!.shell.menu.setGroups({
        help: [
          {
            kind: "dialog",
            id: "shortcuts",
            label: "Keyboard shortcuts",
            shortcut: "?",
            onSelect() {},
          },
        ],
      });
    });
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /menu: "Keyboard shortcuts" opens a dialog, so its label ends with "…" \(U\+2026\)/,
    );
  });

  test("aria fails for a menu shortcut chip that assistive technology cannot hear", async ({
    page,
  }) => {
    // Without the saboteur the same entry passes: the failure is the lost description, not the chip.
    await runCase(
      "aria",
      page,
      sabotaged(() => {
        window.__demo!.shell.menu.setGroups({
          export: [
            {
              kind: "action",
              id: "goto",
              label: "Go to diagram",
              shortcut: "G then D",
              onSelect() {},
            },
          ],
        });
      }),
    );
    const harness = sabotaged(() => {
      window.__demo!.shell.menu.setGroups({
        export: [
          {
            kind: "action",
            id: "goto",
            label: "Go to diagram",
            shortcut: "G then D",
            onSelect() {},
          },
        ],
      });
      const menu = document.querySelector('[role="menu"]')!;
      new MutationObserver(() => {
        for (const item of menu.querySelectorAll("[aria-describedby]")) {
          item.removeAttribute("aria-describedby");
        }
      }).observe(menu, { childList: true, subtree: true });
    });
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /menu: "Go to diagram" shows the shortcut "G then D" but names it neither in aria-keyshortcuts nor in its description \(guide §5\.6\)/,
    );
  });

  test("aria fails for an extra tab stop a renderer puts on .djs-container", async ({ page }) => {
    // Event Storming's keyboard sets tabindex="0" on canvas.getContainer()
    const harness = sabotaged(() => {
      document.querySelector(".djs-container")?.setAttribute("tabindex", "0");
    });
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /tab order: Tab from the menu trigger lands on div\.djs-container.*\[tabindex="0"\], expected the palette's roving entry/,
    );
  });

  test("aria fails when the open menu lets its arrow keys reach document listeners", async ({
    page,
  }) => {
    const harness = sabotaged(() => {
      const ignore = () => {};
      Event.prototype.stopPropagation = ignore;
      Event.prototype.stopImmediatePropagation = ignore;
    });
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /menu: ArrowUp in the open menu reached a keydown listener on document/,
    );
  });

  test("aria fails for a canvas without an accessible name", async ({ page }) => {
    const harness = sabotaged(() => {
      document.querySelector(".djs-container > svg")?.removeAttribute("aria-label");
    });
    await expect(runCase("aria", page, harness)).rejects.toThrow(
      /canvas: the focusable <svg> has no accessible name/,
    );
  });

  test("keys fails when the canvas takes Cmd/Ctrl+Z from VS Code's document history", async ({
    page,
  }) => {
    const harness = sabotaged(() => {
      document.addEventListener("keydown", (event) => {
        const onCanvas = (event.target as Element | null)?.closest?.(".djs-container") !== null;
        if (onCanvas && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
        }
      });
    });
    await expect(runCase("keys", page, harness)).rejects.toThrow(
      /Control\+KeyZ on the canvas \(undo and redo belong to the VS Code document\) arrived prevented/,
    );
  });

  test("appearance fails for an embedded root that takes the host page's mode", async ({
    page,
  }) => {
    const harness = sabotaged(() => {
      document.querySelector(".cd-shell")?.removeAttribute("data-cd-theme");
    }, "embedded");
    await expect(runCase("appearance", page, harness)).rejects.toThrow(
      /\[requested dark\] the embedded root has no data-cd-theme \(host page dark, expected light\)/,
    );
  });

  test("keys fails when a handled key reaches a keydown listener on window", async ({ page }) => {
    const harness = sabotaged(() => {
      const ignore = () => {};
      Event.prototype.stopPropagation = ignore;
      Event.prototype.stopImmediatePropagation = ignore;
    });
    await expect(runCase("keys", page, harness)).rejects.toThrow(
      /Control\+Equal on the canvas reached a keydown listener on window/,
    );
  });

  test("keys fails when a zoom key acts twice", async ({ page }) => {
    const harness = sabotaged(() => {
      document.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "=")
          window.__demo?.connection.viewport.stepZoom(1);
      });
    });
    await expect(runCase("keys", page, harness)).rejects.toThrow(
      /Control\+Equal on the canvas zoomed to 182% from 100%, expected 135% \(exactly one step\)/,
    );
  });

  test("keys fails when a document undo binding takes Cmd/Ctrl+Z from a text field", async ({
    page,
  }) => {
    // Event Storming binds undo on document; registered before the kit's recorders, as a modeler's is
    const harness = sabotaged(() => {
      document.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z")
          event.preventDefault();
      });
    });
    await expect(runCase("keys", page, harness)).rejects.toThrow(
      /Control\+KeyZ in a text field was prevented; the shell only stops it/,
    );
  });

  test("keys fails when a zoom binding takes Cmd/Ctrl+= from an EditContext or Monaco editor", async ({
    page,
  }) => {
    // a modeler's own copy of the text field rule from before EditContext and Monaco counted
    const harness = sabotaged(() => {
      document.addEventListener("keydown", (event) => {
        const target = event.target as HTMLElement;
        const inTextField =
          target.isContentEditable || target.closest("input, textarea, select") !== null;
        const modal = document.querySelector('[aria-modal="true"], dialog:modal') !== null;
        const zoomIn = (event.ctrlKey || event.metaKey) && !event.altKey && event.key === "=";
        if (zoomIn && !event.defaultPrevented && !inTextField && !modal)
          window.__demo?.connection.viewport.stepZoom(1);
      });
    });
    await expect(runCase("keys", page, harness)).rejects.toThrow(
      /Control\+Equal in an EditContext editor changed the zoom[\s\S]*Control\+Equal in a Monaco editor changed the zoom/,
    );
  });

  test("keys fails when a key outside the IDE host is not prevented", async ({ page }) => {
    const harness = sabotaged(() => {
      const original = Event.prototype.preventDefault;
      Event.prototype.preventDefault = function (this: Event) {
        if (!(this instanceof KeyboardEvent && this.key === "=")) original.call(this);
      };
    }, "web");
    await expect(runCase("keys", page, harness)).rejects.toThrow(
      /Control\+Equal on the canvas arrived unprevented; a handled key calls preventDefault/,
    );
  });

  test("appearance fails for a dark subtree under a light-only modeler", async ({ page }) => {
    const harness = sabotaged(() => {
      document.querySelector('[data-chrome="zoom"]')!.setAttribute("data-cd-theme", "dark");
    });
    await expect(runCase("appearance", page, harness)).rejects.toThrow(
      /\[requested dark\] div.*\[data-chrome="zoom"\] carries data-cd-theme="dark": a second mode inside the modeler is half-dark/,
    );
  });

  test("cleanup fails for an element left after destroy", async ({ page }) => {
    const harness: ShellConformanceHarness<Page> = {
      ...demoHarness("ide"),
      async destroy(page) {
        await page.evaluate(() => {
          const zoom = document.querySelector('[data-chrome="zoom"]');
          window.__demo?.destroy();
          if (zoom) document.body.append(zoom);
        });
      },
    };
    await expect(runCase("cleanup", page, harness)).rejects.toThrow(
      /\[data-chrome="zoom"\] is left after destroy/,
    );
  });

  test("cleanup fails for a key listener that survives destroy", async ({ page }) => {
    const harness: ShellConformanceHarness<Page> = {
      ...demoHarness("ide"),
      async destroy(page) {
        await page.evaluate(() => {
          window.__demo?.destroy();
          document.addEventListener("keydown", (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "=") event.preventDefault();
          });
        });
      },
    };
    await expect(runCase("cleanup", page, harness)).rejects.toThrow(
      /Control\+Equal after destroy arrived prevented: a shell listener is still installed/,
    );
  });

  test("reducedMotion fails for a transition outside the shell root that reduced motion does not stop", async ({
    page,
  }) => {
    // a modeler panel in <body>: the shell's reduced-motion rule covers only its own root
    const harness = sabotaged(() => {
      const style = document.createElement("style");
      style.textContent = ".demo-side-panel { transition: opacity 200ms; }";
      document.head.append(style);
      const panel = document.createElement("div");
      panel.className = "demo-side-panel";
      document.body.append(panel);
    });
    const failure = await failureOf("reducedMotion", page, harness);
    expect(failure).toMatch(
      /\[prefers-reduced-motion\] motion: div\.demo-side-panel sets a transition of 200ms on "opacity" as opened; under reduced motion nothing moves \(guide §5\.14, §7\)/,
    );
    expect(failure).toMatch(
      /\[VS Code's reduce motion\] motion: div\.demo-side-panel sets a transition of 200ms on "opacity" as opened/,
    );
  });

  test("reducedMotion fails for an element.animate() that reduced motion cannot stop", async ({
    page,
  }) => {
    // a selection that pulses through the Web Animations API, which no CSS rule reaches
    const harness = sabotaged(() => {
      const container = document.querySelector(".djs-container")!;
      new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target as Element;
          if (target.matches(".djs-shape.selected"))
            target.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 400 });
        }
      }).observe(container, { subtree: true, attributes: true, attributeFilter: ["class"] });
    });
    const failure = await failureOf("reducedMotion", page, harness);
    expect(failure).toMatch(
      /\[prefers-reduced-motion\] motion: g\S*\.djs-shape\S* ran an element\.animate\(\) animation of 400ms with "[^"]+" selected/,
    );
    expect(failure).toMatch(
      /\[VS Code's reduce motion\] motion: g\S*\.djs-shape\S* ran an element\.animate\(\) animation of 400ms with "[^"]+" selected/,
    );
  });

  test("reducedMotion fails when an explicit fit glides under prefers-reduced-motion", async ({
    page,
  }) => {
    // a fit that ignores the media query, as with connectDiagramJs's prefersReducedMotion: () => false
    const harness = sabotaged(() => {
      const matchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query.includes("prefers-reduced-motion")
          ? ({ ...matchMedia(query), matches: false } as MediaQueryList)
          : matchMedia(query);
    });
    const failure = await failureOf("reducedMotion", page, harness);
    expect(failure).toMatch(
      /\[prefers-reduced-motion\] fit: a click on Fit passed through \d+ views; under reduced motion an explicit fit jumps \(guide §5\.9, §7\)/,
    );
    expect(failure).not.toMatch(/\[VS Code's reduce motion\] fit:/);
  });

  test("forcedColors fails for an island whose border vanishes under forced colours", async ({
    page,
  }) => {
    const harness = sabotaged(() => {
      const style = document.createElement("style");
      style.textContent =
        '@media (forced-colors: active) { .cd-shell [data-chrome="zoom"] { forced-color-adjust: none; border-color: transparent !important; } }';
      document.head.append(style);
    });
    const failure = await failureOf("forcedColors", page, harness);
    expect(failure).toMatch(
      /\[as opened\] forced colours: island "zoom" \(div\S*\[data-chrome="zoom"\]\) has its top, right, bottom, left border in rgba\(0, 0, 0, 0\), expected CanvasText \(rgb\([^)]*\)\); islands keep their border in system colours, nothing disappears \(guide §5\.14\)/,
    );
  });

  test("forcedColors fails for a pressed tool whose ring the browser drops", async ({ page }) => {
    // a ring without forced-color-adjust: none is a box-shadow, which forced colours remove
    const harness = sabotaged(() => {
      const style = document.createElement("style");
      style.textContent =
        '@media (forced-colors: active) { .djs-palette[data-chrome="palette"] .entry[aria-pressed="true"] { box-shadow: none !important; } }';
      document.head.append(style);
    });
    const failure = await failureOf("forcedColors", page, harness);
    expect(failure).toMatch(
      /forced colours: the pressed tool "lasso-tool" shows box-shadow "none", expected its ring as a 2px inset shadow in Highlight \(rgba?\([^)]*\)\), with forced-color-adjust: none so the browser keeps it \(guide §5\.14\)/,
    );
  });

  test("forcedColors fails for a modeler dialog that keeps its own border colour", async ({
    page,
  }) => {
    // forced-color-adjust: none on the dialog keeps the light border, which vanishes on a light Canvas
    const harness = sabotaged(() => {
      const style = document.createElement("style");
      style.textContent =
        ".demo-dialog { forced-color-adjust: none; border-color: rgb(228, 231, 236) !important; }";
      document.head.append(style);
    });
    const failure = await failureOf("forcedColors", page, harness);
    expect(failure).toMatch(
      /forced colours: the dialog of "Keyboard shortcuts…" \(dialog\.demo-dialog\) has its top, right, bottom, left border in rgb\(228, 231, 236\), expected CanvasText \(rgb\([^)]*\)\); a modeler's dialog sets its forced-colours rules itself/,
    );
  });

  test("forcedColors fails when the menu does not open again after a dialog", async ({ page }) => {
    // a panel that Escape does not close covers the menu trigger, so the next dialog stays unchecked
    const harness = sabotaged(() => {
      window.__demo!.shell.menu.setGroups({
        help: [
          {
            kind: "dialog",
            id: "about",
            label: "About…",
            onSelect() {
              const panel = document.createElement("div");
              panel.setAttribute("role", "dialog");
              panel.setAttribute("aria-label", "About");
              panel.style.cssText =
                "position:fixed;left:0;top:0;width:320px;height:160px;z-index:1000;background:Canvas;border:1px solid CanvasText;";
              document.body.append(panel);
            },
          },
          {
            kind: "dialog",
            id: "shortcuts",
            label: "Keyboard shortcuts…",
            shortcut: "?",
            onSelect() {},
          },
        ],
      });
    });
    const failure = await failureOf("forcedColors", page, harness);
    expect(failure).toMatch(
      /forced colours: the menu did not open again after the dialog of "About…", so the border of the dialog of "Keyboard shortcuts…" was not verified/,
    );
  });

  test("overlayLayers fails for an element toolbar above the palette", async ({ page }) => {
    // Event Storming's note toolbar at z-index 300, which nothing flagged
    const harness = sabotaged(() => {
      const container = document.querySelector<HTMLElement>(".djs-container")!;
      const toolbar = document.createElement("div");
      toolbar.className = "demo-element-toolbar";
      toolbar.style.cssText =
        "position:absolute;z-index:300;width:96px;height:32px;display:none;background:white;";
      container.append(toolbar);
      new MutationObserver(() => {
        const selected = container.querySelector(".djs-shape.selected");
        if (!selected) {
          toolbar.style.display = "none";
          return;
        }
        const box = selected.getBoundingClientRect();
        const origin = container.getBoundingClientRect();
        toolbar.style.display = "block";
        toolbar.style.left = `${box.left - origin.left}px`;
        toolbar.style.top = `${box.top - origin.top - 40}px`;
      }).observe(container, { subtree: true, attributes: true, attributeFilter: ["class"] });
    });
    const failure = await failureOf("overlayLayers", page, harness);
    expect(failure).toMatch(
      /canvas: div\.demo-element-toolbar lies at z-index 300 in \.djs-container with "[^"]+" selected and stays when the view zooms, above the palette at 110; an overlay that stays \(a toolbar, a prompt, a label editor\) lies at 100 or below, only a popup that closes on a pan or zoom may cover the palette \(guide §5\.13\)/,
    );
    expect(failure).not.toMatch(/as opened/);
  });

  test("overlayLayers fails for a context-pad prompt that follows the view instead of closing", async ({
    page,
  }) => {
    // Context Maps' description prompt at z-index 210, which followed a pan or zoom
    const harness = sabotaged(() => {
      window.__demo!.flaws.notePromptFollowsView = true;
    });
    const failure = await failureOf("overlayLayers", page, harness);
    expect(failure).toMatch(
      /canvas: div\.demo-note-prompt lies at z-index 210 in \.djs-container after a click on context-pad entry "note" of "[^"]+" and stays when the view zooms, above the palette at 110/,
    );
    expect(failure.match(/lies at z-index/g)).toHaveLength(1);
  });

  test("overlayLayers fails for a context-pad prompt that only hides while the view changes", async ({
    page,
  }) => {
    // a prompt re-placed on a deferred canvas.viewbox.changed: hidden in the zoom, back after it
    const harness = sabotaged(() => {
      window.__demo!.flaws.notePromptHidesWhileViewChanges = true;
    });
    const failure = await failureOf("overlayLayers", page, harness);
    expect(failure).toMatch(
      /canvas: div\.demo-note-prompt lies at z-index 210 in \.djs-container after a click on context-pad entry "note" of "[^"]+" and comes back once the zoomed view has settled, above the palette at 110/,
    );
    expect(failure.match(/lies at z-index/g)).toHaveLength(1);
  });

  test("overlayLayers selects a connection and clicks the entries of its own context pad", async ({
    page,
  }) => {
    // as Context Maps' relationships, whose own "description" entry opens a prompt of their own;
    // once selected, the line lies under its handles, as Value Chain's links under the bendpoints
    const harness = sabotaged(() => {
      interface DemoElement {
        id: string;
        parent?: unknown;
        waypoints?: unknown;
      }
      const diagram = window.__demo!.diagram;
      const boxes = diagram
        .get<{ filter(match: (element: DemoElement) => boolean): DemoElement[] }>("elementRegistry")
        .filter((element: DemoElement) => Boolean(element.parent) && !element.waypoints);
      diagram
        .get<{ connect(source: DemoElement, target: DemoElement): DemoElement }>("modeling")
        .connect(boxes[0]!, boxes[1]!);
      const container = diagram.get<{ getContainer(): HTMLElement }>("canvas").getContainer();
      const handles = document.createElement("div");
      handles.className = "demo-line-handles";
      handles.style.cssText = "position:absolute;display:none;";
      container.querySelector("svg")!.after(handles);
      new MutationObserver(() => {
        const line = container.querySelector(".djs-connection.selected");
        handles.style.display = line ? "block" : "none";
        if (!line) return;
        const box = line.getBoundingClientRect();
        const origin = (handles.offsetParent ?? container).getBoundingClientRect();
        Object.assign(handles.style, {
          left: `${box.left - origin.left - 8}px`,
          top: `${box.top - origin.top - 8}px`,
          width: `${box.width + 16}px`,
          height: `${box.height + 16}px`,
        });
      }).observe(container, { subtree: true, attributes: true, attributeFilter: ["class"] });
      const eventBus = diagram.get<{ once(event: string, callback: () => void): void }>("eventBus");
      diagram.get<{ registerProvider(provider: object): void }>("contextPad").registerProvider({
        getContextPadEntries(element: DemoElement) {
          if (!element.waypoints) return {};
          return {
            describe: {
              group: "edit",
              title: "Description…",
              html: '<div class="entry">D</div>',
              action: {
                click() {
                  const prompt = document.createElement("div");
                  prompt.className = "demo-connection-prompt";
                  prompt.style.cssText =
                    "position:absolute;z-index:210;right:40px;bottom:80px;width:160px;height:48px;background:white;";
                  container.append(prompt);
                  eventBus.once("selection.changed", () => prompt.remove());
                },
              },
            },
          };
        },
      });
    });
    const failure = await failureOf("overlayLayers", page, harness);
    expect(failure).toMatch(
      /canvas: div\.demo-connection-prompt lies at z-index 210 in \.djs-container after a click on context-pad entry "describe" of "[^"]+" and stays when the view zooms, above the palette at 110/,
    );
    expect(failure.match(/lies at z-index/g)).toHaveLength(1);
  });

  test("overlayLayers clicks a context-pad entry after earlier ones closed the pad and took the element away", async ({
    page,
  }) => {
    // before the note prompt that follows the view: an entry that closes the pad and keeps the
    // selection, and one that removes the element
    const harness = sabotaged(() => {
      interface DemoElement {
        id: string;
      }
      window.__demo!.flaws.notePromptFollowsView = true;
      const diagram = window.__demo!.diagram;
      const contextPad = diagram.get<{ close(): void; registerProvider(provider: object): void }>(
        "contextPad",
      );
      const modeling = diagram.get<{ removeElements(elements: DemoElement[]): void }>("modeling");
      contextPad.registerProvider({
        getContextPadEntries(element: DemoElement) {
          return (entries: Record<string, unknown>) => ({
            dismiss: {
              group: "edit",
              title: "Dismiss",
              html: '<div class="entry">X</div>',
              action: { click: () => contextPad.close() },
            },
            stash: {
              group: "edit",
              title: "Stash",
              html: '<div class="entry">S</div>',
              action: { click: () => modeling.removeElements([element]) },
            },
            ...entries,
          });
        },
      });
    });
    const failure = await failureOf("overlayLayers", page, harness);
    expect(failure).toMatch(
      /canvas: div\.demo-note-prompt lies at z-index 210 in \.djs-container after a click on context-pad entry "note" of "[^"]+" and stays when the view zooms, above the palette at 110/,
    );
    expect(failure).not.toMatch(/was not verified/);
  });

  test("overlayLayers fails for a context-pad entry that no element shows once an earlier one was clicked", async ({
    page,
  }) => {
    // a lock entry that redraws every pad without Note: the layers of the note prompt go unchecked
    const harness = sabotaged(() => {
      interface DemoElement {
        id: string;
      }
      const contextPad = window.__demo!.diagram.get<{
        open(target: DemoElement, force: boolean): void;
        registerProvider(provider: object): void;
      }>("contextPad");
      let locked = false;
      contextPad.registerProvider({
        getContextPadEntries(element: DemoElement) {
          return ({ note, ...entries }: Record<string, unknown>) => ({
            lock: {
              group: "edit",
              title: "Lock",
              html: '<div class="entry">L</div>',
              action: {
                click() {
                  locked = true;
                  contextPad.open(element, true);
                },
              },
            },
            ...(locked ? {} : { note }),
            ...entries,
          });
        },
      });
    });
    const failure = await failureOf("overlayLayers", page, harness);
    expect(failure).toMatch(
      /canvas: context-pad entry "note" of "[^"]+" could not be clicked: once the earlier entries had been clicked, neither that shape nor another with its context pad showed it, so the layers it opens were not verified/,
    );
  });

  test("forcedColors fails in the web host for a status bar, a tool icon, a focus ring and a dropdown border the forcing lost", async ({
    page,
  }) => {
    // forced-color-adjust: none keeps each light colour, which vanishes on a light Canvas
    const harness = webSabotaged(() => {
      const style = document.createElement("style");
      style.textContent = `@media (forced-colors: active) {
        .cd-shell .cd-shell-status::before { background: rgb(200, 200, 200) !important; }
        .cd-shell .djs-palette .entry svg { forced-color-adjust: none; color: rgb(200, 200, 200) !important; }
        .cd-shell .cd-shell-target:focus-visible { forced-color-adjust: none; outline-color: rgb(200, 200, 200) !important; }
        .cd-shell [role="menu"] { forced-color-adjust: none; border-color: transparent !important; }
      }`;
      document.head.append(style);
    });
    const failure = await failureOf("forcedColors", page, harness);
    expect(failure).toMatch(
      /\[as opened\] forced colours: the <svg> icon of tool "lasso-tool" has color rgb\(200, 200, 200\), expected CanvasText \(rgb\([^)]*\)\); icons stay visible \(guide §5\.14\)/,
    );
    expect(failure).toMatch(
      /forced colours: after Tab from zoom out the focus ring of \S+ is solid [\d.]+px in rgb\(200, 200, 200\), expected a solid ring of at least 2px in Highlight \(rgba?\([^)]*\)\) \(guide §5\.14, §8\)/,
    );
    expect(failure).toMatch(
      /\[with the menu open\] forced colours: the dropdown \(\S+\) has its top, right, bottom, left border in rgba\(0, 0, 0, 0\), expected CanvasText \(rgb\([^)]*\)\)/,
    );
    expect(failure).toMatch(
      /\[after show\.status\] forced colours: the status box's bar is [\d.]+px in rgb\(200, 200, 200\), expected CanvasText \(rgb\([^)]*\)\); it stays visible \(guide §5\.14\)/,
    );
  });

  test("reducedMotion fails in the web host for a toast that still moves under reduced motion", async ({
    page,
  }) => {
    // a rule more specific than the shell's reduced-motion rule, as a modeler's own toast style
    const harness = webSabotaged(() => {
      const style = document.createElement("style");
      style.textContent = ".cd-shell .cd-shell-toast { transition: opacity 300ms !important; }";
      document.head.append(style);
    });
    const failure = await failureOf("reducedMotion", page, harness);
    expect(failure).toMatch(
      /\[prefers-reduced-motion\] motion: div\.cd-shell-toast\S* sets a transition of 300ms on "opacity" with a toast; under reduced motion nothing moves \(guide §5\.14, §7\)/,
    );
    expect(failure).not.toMatch(/VS Code's reduce motion/);
  });

  test("reducedMotion looks only inside the embedded host's root, whose page belongs to the host", async ({
    page,
  }) => {
    // the same transition outside the root and inside it: only the modeler's own part counts
    const harness = sabotaged(() => {
      const style = document.createElement("style");
      style.textContent =
        ".demo-host-banner, .cd-shell .demo-inner-panel { position: absolute; width: 1px; height: 1px; transition: opacity 200ms !important; }";
      document.head.append(style);
      const banner = document.createElement("div");
      banner.className = "demo-host-banner";
      document.body.append(banner);
      const panel = document.createElement("div");
      panel.className = "demo-inner-panel";
      document.querySelector(".cd-shell")!.append(panel);
    }, "embedded");
    const failure = await failureOf("reducedMotion", page, harness);
    expect(failure).toMatch(
      /\[prefers-reduced-motion\] motion: div\.demo-inner-panel sets a transition of 200ms on "opacity" as opened/,
    );
    expect(failure).not.toMatch(/demo-host-banner/);
  });

  test.describe("that break the production bundle under the webview CSP", () => {
    /** The demo's harness with `sabotage` applied once `csp.open` loaded the production bundle. */
    function bundleSabotaged(sabotage: () => void): ShellConformanceHarness<Page> {
      const harness = demoHarness("ide");
      return {
        ...harness,
        csp: {
          async open(page, context) {
            await harness.csp!.open(page, context);
            await page.evaluate(sabotage);
          },
        },
      };
    }

    test("csp fails an eval probe that an export entry runs", async ({ page }) => {
      const harness = bundleSabotaged(() => {
        window.__demo!.flaws.evalUnderCsp = true;
      });
      await expect(runCase("csp", page, harness)).rejects.toThrow(
        /csp: script-src blocked eval at https:\/\/webview\.test\/webview\.js:\d+:\d+; the webview CSP blocks eval/,
      );
    });

    test("csp fails an uncaught error that a dialog entry causes", async ({ page }) => {
      const harness = bundleSabotaged(() => {
        window.__demo!.flaws.throwFromDialog = true;
      });
      await expect(runCase("csp", page, harness)).rejects.toThrow(
        /error: Error: demo: the shortcuts dialog failed to open\n {4}at /,
      );
    });

    test("csp fails a shell font that loads no face", async ({ page }) => {
      const harness = bundleSabotaged(() => {
        for (const sheet of document.styleSheets) {
          for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
            const rule = sheet.cssRules[index];
            if (
              rule instanceof CSSFontFaceRule &&
              rule.style.getPropertyValue("font-family").includes("Geist Mono")
            )
              sheet.deleteRule(index);
          }
        }
      });
      await expect(runCase("csp", page, harness)).rejects.toThrow(
        /fonts: "Geist Mono Variable" loaded no face; bundle its font files/,
      );
    });

    test("csp fails a shell font inlined as a data: URL", async ({ page }) => {
      const harness = bundleSabotaged(() => {
        const sheet = [...document.styleSheets].find((candidate) => candidate.href !== null)!;
        sheet.insertRule(
          '@font-face { font-family: "Geist Variable"; src: url(data:font/woff2;base64,AAAA) format("woff2"); unicode-range: U+1F600; }',
        );
      });
      await expect(runCase("csp", page, harness)).rejects.toThrow(
        /fonts: "Geist Variable" comes from a data: URL/,
      );
    });

    test("csp fails a font face the page needs whose file is not in the bundle", async ({
      page,
    }) => {
      const harness = bundleSabotaged(() => {
        const sheet = [...document.styleSheets].find((candidate) => candidate.href !== null)!;
        sheet.insertRule(
          '@font-face { font-family: "Geist Variable"; font-style: italic; src: url(fonts/geist-latin-wght-italic-missing.woff2) format("woff2"); }',
        );
        // Rendered, as the canvas renders an italic caption, so the page itself asks for the face.
        const caption = document.createElement("span");
        caption.textContent = "Inertia";
        caption.style.fontFamily = '"Geist Variable"';
        caption.style.fontStyle = "italic";
        document.body.append(caption);
      });
      await expect(runCase("csp", page, harness)).rejects.toThrow(
        /fonts: the face "Geist Variable" italic \S+ failed to load/,
      );
    });

    test("csp fails a subset of a shell font that lost its unicode-range", async ({ page }) => {
      const harness = bundleSabotaged(() => {
        const sheet = [...document.styleSheets].find((candidate) => candidate.href !== null)!;
        const index = [...sheet.cssRules].findIndex(
          (rule) => rule instanceof CSSFontFaceRule && rule.cssText.includes("geist-cyrillic-wght"),
        );
        const rule = sheet.cssRules[index]!.cssText.replace(/unicode-range:[^;}]*;?/, "");
        sheet.deleteRule(index);
        sheet.insertRule(rule, index);
      });
      await expect(runCase("csp", page, harness)).rejects.toThrow(
        /fonts: a face of "Geist Variable" has no unicode-range beside the family's other subsets/,
      );
    });

    test("csp fails a bundle whose palette and menu the walk cannot reach", async ({ page }) => {
      const harness = bundleSabotaged(() => {
        const sheet = [...document.styleSheets].find((candidate) => candidate.href !== null)!;
        sheet.insertRule(
          '[data-chrome="palette"], [data-chrome="menu"] { visibility: hidden !important; }',
          sheet.cssRules.length,
        );
      });
      await expect(runCase("csp", page, harness)).rejects.toThrow(
        /csp: no visible palette entry to hover[\s\S]*csp: no visible menu trigger to open/,
      );
    });

    test("csp fails a csp.open that loads the page without the webview CSP", async ({ page }) => {
      const harness = demoHarness("ide");
      const failure = runCase("csp", page, { ...harness, csp: { open: harness.open } });
      await expect(failure).rejects.toThrow(
        /csp: the page csp\.open loaded has no Content-Security-Policy/,
      );
    });
  });
});
