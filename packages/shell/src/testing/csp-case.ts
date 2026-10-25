import { TOOLTIP_DELAY_MS } from "../core/index.js";
import {
  DEFAULT_SIZES,
  HOVER_MARGIN_MS,
  LIGHT,
  PARK,
  closeByEscape,
  finish,
  hover,
  openMenuByClick,
  shapes,
} from "./case-tools.js";
import { cspProblems, type CspFacts, type FontFacts } from "./csp-checks.js";
import { menuEntriesProbe, type ShapeFacts } from "./facts.js";
import { DEFAULT_ROOT } from "./geometry.js";
import type { ShellConformanceCase, ShellConformanceHarness, ShellSkip } from "./harness.js";
import type { PageLike } from "./page.js";
import { findTarget, inPage, settle, type ToolWindow } from "./page-tools.js";
import type { StubWindow } from "./vscode-stub.js";

/** Room for what an action starts after its click: an export's image, a dialog's font. */
const ACTION_WAIT_MS = 300;

/** Room for the walk's last asynchronous work before the case reads what the page recorded. */
const FINAL_WAIT_MS = 500;

/** Escapes the walk sends at most to close what an action left open. */
const MAX_ESCAPES = 3;

interface Point {
  x: number;
  y: number;
}

const contextPadEntriesProbe = ({ root }: { root: string }): Point[] => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const entries = document.querySelector(root)?.querySelectorAll(".djs-context-pad .entry") ?? [];
  return [...entries]
    .filter((entry) => tools.visible(entry))
    .map((entry) => {
      const rect = entry.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
};

const menuEntryPointProbe = ({
  root,
  menuId,
  value,
}: {
  root: string;
  menuId: string;
  value: string | null;
}): Point | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const menu = [...(document.querySelector(root)?.querySelectorAll('[role="menu"]') ?? [])].find(
    (element) => tools.visible(element),
  );
  const id = `[data-menu-id="${CSS.escape(menuId)}"]`;
  const selector =
    value === null
      ? id
      : `${id} [data-menu-value="${CSS.escape(value)}"], ${id}[data-menu-value="${CSS.escape(value)}"]`;
  const item = [...(menu?.querySelectorAll(selector) ?? [])].find((element) =>
    tools.visible(element),
  );
  if (!item) return null;
  const rect = item.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

/** Whether the shell's menu or a dialog is open (a modeler's dialog, the shortcuts dialog). */
const openLayerProbe = ({ root }: { root: string }): boolean => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const menus = document.querySelector(root)?.querySelectorAll('[role="menu"]') ?? [];
  const dialogs = document.querySelectorAll(
    'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]',
  );
  return [...menus, ...dialogs].some((element) => tools.visible(element));
};

const rootProbe = ({ root }: { root: string }): boolean => document.querySelector(root) !== null;

/**
 * What the page recorded and loaded: its policy, the stub's violations and errors, and the shell's
 * two fonts (the first family of `--modeler-shell-font` and `--modeler-shell-font-mono`).
 */
const cspFactsProbe = async ({ root }: { root: string }): Promise<CspFacts> => {
  const stub = (window as StubWindow).__modelerShellVsCodeStub;
  const recording = typeof stub?.cspViolations === "function" && typeof stub.errors === "function";
  const policy =
    [...document.querySelectorAll("meta[http-equiv]")]
      .find((meta) => meta.getAttribute("http-equiv")?.toLowerCase() === "content-security-policy")
      ?.getAttribute("content") ?? null;
  const rootElement = document.querySelector(root);
  const unquote = (name: string) => name.trim().replace(/^["']|["']$/g, "");
  const families = rootElement
    ? ["--modeler-shell-font", "--modeler-shell-font-mono"]
        .map((property) =>
          unquote(getComputedStyle(rootElement).getPropertyValue(property).split(",")[0] ?? ""),
        )
        .filter((family) => family !== "")
    : [];

  const sources = (family: string): string[] => {
    const found: string[] = [];
    const visit = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSFontFaceRule) {
          if (unquote(rule.style.getPropertyValue("font-family")) === family)
            found.push(rule.style.getPropertyValue("src"));
        } else if (rule instanceof CSSImportRule) {
          if (rule.styleSheet) visit(rule.styleSheet.cssRules);
        } else if ("cssRules" in rule) {
          visit((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        visit(sheet.cssRules);
      } catch {
        // a cross-origin sheet hides its rules; the policy admits none but cspSource
      }
    }
    return found;
  };

  /** Whether a face of `family` covers every code point although its style comes in subsets. */
  const unranged = (family: string): boolean => {
    const styles = new Map<string, FontFace[]>();
    for (const face of document.fonts) {
      if (unquote(face.family) !== family) continue;
      const style = `${face.style} ${face.weight} ${face.stretch}`;
      styles.set(style, [...(styles.get(style) ?? []), face]);
    }
    return [...styles.values()].some(
      (faces) =>
        faces.length > 1 &&
        faces.some((face) => /^U\+0+-10FFFF$/i.test(face.unicodeRange.replace(/\s/g, ""))),
    );
  };

  await document.fonts.ready;
  const fonts: FontFacts[] = [];
  for (const family of families) {
    let faces = 0;
    let error = "";
    try {
      faces = (await document.fonts.load(`13px "${family}"`, "Aa")).length;
    } catch (reason) {
      error = String(reason);
    }
    const inlined = sources(family).some((source) => /url\(\s*["']?data:/i.test(source));
    fonts.push({ family, faces, error, inlined, unranged: unranged(family) });
  }
  const failedFaces = [...document.fonts]
    .filter((face) => face.status === "error")
    .map((face) => `"${unquote(face.family)}" ${face.style} ${face.weight}`);
  return {
    policy,
    origin: location.origin,
    recording,
    violations: recording ? [...stub!.cspViolations()] : [],
    errors: recording ? [...stub!.errors()] : [],
    fonts,
    failedFaces,
  };
};

/** Presses Escape until neither the menu nor a dialog is open. */
async function closeOpenLayers(page: PageLike, root: string): Promise<void> {
  for (let escapes = 0; escapes < MAX_ESCAPES; escapes++) {
    if (!(await inPage(page, openLayerProbe, { root }))) return;
    await closeByEscape(page);
  }
}

/** The tooltip of a palette entry. */
async function walkPalette(page: PageLike, root: string): Promise<string[]> {
  const entry = await hover(page, root, "palette-entry");
  await page.mouse.move(PARK.x, PARK.y);
  return entry
    ? []
    : ["csp: no visible palette entry to hover; its tooltip under the CSP was not verified"];
}

/** Selects `shape`, hovers each entry of its context pad, opens its label editor and leaves it. */
async function walkShape(page: PageLike, root: string, shape: ShapeFacts): Promise<void> {
  await page.mouse.click(shape.client.x, shape.client.y);
  await settle(page);
  for (const entry of await inPage(page, contextPadEntriesProbe, { root })) {
    await page.mouse.move(entry.x, entry.y);
    await page.waitForTimeout(TOOLTIP_DELAY_MS + HOVER_MARGIN_MS);
  }
  await page.mouse.move(PARK.x, PARK.y);
  const current = (await shapes(page, root)).find((found) => found.id === shape.id) ?? shape;
  await page.mouse.dblclick(current.client.x, current.client.y);
  await settle(page);
  await closeByEscape(page);
  await closeOpenLayers(page, root);
}

/**
 * Every enabled menu entry that is not destructive, each from a freshly opened menu: the exports,
 * the dialogs (closed again by Escape), the toggles such as the Legend, each radio option not
 * chosen yet. A menu the walk cannot open, or one without an entry it activated, is a problem: the
 * bundle's exports and dialogs would then go unverified.
 */
async function walkMenu(page: PageLike, root: string): Promise<string[]> {
  if (!(await openMenuByClick(page, root))) {
    return [
      "csp: no visible menu trigger to open; the menu's entries under the CSP were not verified",
    ];
  }
  const entries = await inPage(page, menuEntriesProbe, { root });
  await closeByEscape(page);
  if (!entries) {
    return [
      'csp: no visible role="menu" after clicking the trigger; the menu\'s entries under the CSP were not verified',
    ];
  }
  let activated = 0;
  let previous = "the first entry";
  for (const entry of entries) {
    if (entry.disabled || entry.danger || entry.menuId === null) continue;
    if (entry.role === "menuitemradio" && entry.checked === "true") continue;
    if (!(await openMenuByClick(page, root))) {
      return [
        `csp: the menu trigger was gone after ${previous}; the rest of the menu was not verified`,
      ];
    }
    const point = await inPage(page, menuEntryPointProbe, {
      root,
      menuId: entry.menuId,
      value: entry.value,
    });
    if (point) {
      await page.mouse.click(point.x, point.y);
      await settle(page);
      await page.waitForTimeout(ACTION_WAIT_MS);
      activated++;
      previous = `"${entry.name}"`;
    }
    await closeOpenLayers(page, root);
  }
  return activated > 0
    ? []
    : [
        "csp: the walk activated no menu entry (none enabled and not data-danger, or none found in a freshly opened menu); no export or dialog under the CSP was verified",
      ];
}

async function walkZoom(page: PageLike, root: string): Promise<void> {
  for (const target of ["zoom-in", "zoom-fit"] as const) {
    const control = await findTarget(page, root, target);
    if (!control) continue;
    await page.mouse.click(control.client.x, control.client.y);
    await settle(page);
  }
  await page.mouse.move(PARK.x, PARK.y);
}

/**
 * The IDE host's production bundle under `renderWebviewHtml`'s CSP, opened through `csp.open`:
 * after a walk over a tooltip, a shape's context pad and label editor, every menu entry and the zoom,
 * no `securitypolicyviolation`, no error, the shell's fonts loaded from files and no font face that
 * failed to load. A palette or menu the walk cannot reach fails the case too. Other hosts have no
 * webview CSP and pass with nothing to verify.
 */
export const cspCase: ShellConformanceCase = {
  name: "csp",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    if (harness.host !== "ide") return undefined;
    const hooks = harness.csp;
    if (!hooks) {
      return {
        skipped: [
          {
            hook: "csp",
            reason:
              "harness.csp is undefined: the production webview bundle under renderWebviewHtml's CSP was not verified",
          },
        ],
      };
    }
    const root = harness.root ?? DEFAULT_ROOT;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    const skipped: ShellSkip[] = [];
    const walked: string[] = [];
    await hooks.open(page, { size, requested: LIGHT });
    await settle(page);

    // Without the shell there is nothing to walk, but what the page recorded tells why.
    const mounted = (await inPage(page, rootProbe, { root })) === true;
    if (mounted) {
      walked.push(...(await walkPalette(page, root)));
      const shape = (await shapes(page, root)).find((found) => found.hit);
      if (shape) {
        await walkShape(page, root, shape);
      } else {
        skipped.push({
          hook: "open",
          reason:
            "the bundle csp.open opened shows no shape a pointer reaches: its context pad and label editor under the CSP were not verified",
        });
      }
      walked.push(...(await walkMenu(page, root)));
      await walkZoom(page, root);
      await page.waitForTimeout(FINAL_WAIT_MS);
      await settle(page);
    }

    const facts = await inPage(page, cspFactsProbe, { root });
    const problems = [
      ...(mounted
        ? []
        : [
            `csp: no element matches the shell root selector "${root}" once csp.open resolved; the bundle did not mount the shell`,
          ]),
      ...walked,
      ...(facts ? cspProblems(facts) : []),
    ];
    return finish("csp", harness.host, problems, skipped);
  },
};
