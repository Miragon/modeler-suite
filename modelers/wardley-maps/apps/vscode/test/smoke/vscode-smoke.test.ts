import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Frame, Locator, Page } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  formatVsCodeSmoke,
  runVsCodeSmoke,
  type VsCodeSmokeContext,
} from "@miragon/modeler-shell/testing/vscode-electron";
import { parseDSLWithDiagnostics } from "@miragon/wardley-dsl";
import type { WardleyMap } from "@miragon/wardley-schema-model";
import { WARDLEY_THEMES } from "@miragon/wardley-renderer/themes";

const APP_DIRECTORY = fileURLToPath(new URL("../../", import.meta.url));
const SCREENSHOT_DIRECTORY = fileURLToPath(
  new URL("../../../../test-results/vscode-smoke/", import.meta.url),
);
const FIXTURE_FILE_NAME = "tea-shop.wmap";
const EVOLVED_COMPONENT_ID = "cmp_kettle";
/** The component the links step links to a map in a subfolder. */
const LINKED_COMPONENT_ID = "cmp_kettle";
const PAYMENT_FILE = "details/payment.wmap";
const ARCHIVE_FILE = "details/archive.wmap";
/** The maps beside the fixture: the payment map links on to the archive next to it. */
const LINKED_MAPS: Readonly<Record<string, string>> = {
  [PAYMENT_FILE]: `title Payment
url Archive URL [archive.wmap]
component Ledger [0.4, 0.3] url(Archive URL)
`,
  [ARCHIVE_FILE]: `title Archive
component Old Ledger [0.5, 0.5]
`,
};
const POLL_INTERVAL_MS = 100;
/** A fit glides; the shapes stand still well within this. */
const FIT_SETTLE_MS = 1_000;

const runFile = promisify(execFile);

/**
 * The extension as the Marketplace gets it: `vsce package` runs vscode:prepublish (the production
 * bundles) and leaves out what .vscodeignore lists.
 */
async function packExtension(into: string): Promise<string> {
  const vsix = join(into, "wardley-mapping-modeler.vsix");
  const vsce = createRequire(import.meta.url).resolve("@vscode/vsce/vsce");
  await runFile(process.execPath, [vsce, "package", "--no-dependencies", "--out", vsix], {
    cwd: APP_DIRECTORY,
  });
  return vsix;
}

/**
 * Unpacked outside the repository, no node_modules of the monorepo sits next to the bundle, so a
 * module esbuild did not inline fails the activation here as it would for a user.
 */
async function unpackExtension(vsix: string, into: string): Promise<string> {
  await runFile("unzip", ["-q", vsix, "extension/*", "-d", into]);
  return join(into, "extension");
}

/**
 * An empty text parses without a diagnostic, yet no save of the fixture is empty: rejecting it
 * makes the driver's save step read the file again instead of passing a write it caught halfway.
 */
function parseMap(text: string): WardleyMap {
  const { map, diagnostics } = parseDSLWithDiagnostics(text);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map(({ line, message }) => `line ${line}: ${message}`).join("; "));
  }
  if (map.elements.length === 0) throw new Error("the map has no elements");
  return map;
}

function evolutionOf(map: WardleyMap, elementId: string): number {
  const element = map.elements.find(({ id }) => id === elementId);
  if (!element) throw new Error(`The map has no element ${elementId}.`);
  return element.position.evolution;
}

/**
 * The everyday Wardley edit: select a component and evolve it one coarse step to the right. Then
 * Escape and a pointer on the empty plot beside it, so neither its context pad nor its hover
 * outline is in the theme screenshots.
 */
async function evolveComponent({ webview, page, timeoutMs }: VsCodeSmokeContext): Promise<void> {
  const shape = `.djs-shape[data-element-id="${EVOLVED_COMPONENT_ID}"]`;
  const hitArea = webview.locator(`${shape} > .djs-hit`);
  await hitArea.click({ timeout: timeoutMs });
  await webview.locator(`${shape}.selected`).waitFor({ timeout: timeoutMs });
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Escape");
  await webview.locator(`${shape}.selected`).waitFor({ state: "detached", timeout: timeoutMs });
  const box = await hitArea.boundingBox();
  if (box) await page.mouse.move(box.x - 60, box.y + box.height / 2);
}

interface LocatorRoot {
  locator(selector: string): Locator;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** What the map editor shows of its selection and context pad, for a failure message. */
async function padState(editor: LocatorRoot): Promise<string> {
  return editor
    .locator("html")
    .evaluate(() => {
      const selected = [...document.querySelectorAll(".djs-element.selected")].map((element) =>
        element.getAttribute("data-element-id"),
      );
      const pad = document.querySelector(".djs-context-pad");
      const entries = [...(pad?.querySelectorAll(".entry") ?? [])].map((entry) =>
        entry.getAttribute("data-action"),
      );
      const state = pad ? (pad.classList.contains("open") ? "open" : "closed") : "missing";
      return `selected [${selected.join(", ")}], pad ${state} [${entries.join(", ")}], focus on ${document.activeElement?.tagName}`;
    })
    .catch((error: unknown) => `no state: ${String(error)}`);
}

/** Selects the element in a map editor, unless its pad shows, and clicks an entry of the pad. */
async function clickPadEntry(
  editor: LocatorRoot,
  elementId: string,
  action: string,
  timeoutMs: number,
): Promise<void> {
  const entry = editor.locator(`.djs-context-pad.open [data-action="${action}"]`);
  if (!(await entry.isVisible())) {
    await editor
      .locator(`.djs-shape[data-element-id="${elementId}"] > .djs-hit`)
      .click({ timeout: timeoutMs });
  }
  try {
    await entry.click({ timeout: timeoutMs });
  } catch (error) {
    throw new Error(`no ${action} entry: ${await padState(editor)}`, { cause: error });
  }
}

/** The webview frame of the map editor that draws `elementId`, among every open editor's. */
async function editorDrawing(page: Page, elementId: string, timeoutMs: number): Promise<Frame> {
  const selector = `.djs-shape[data-element-id="${elementId}"]`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (
        (await frame
          .locator(selector)
          .count()
          .catch(() => 0)) > 0
      )
        return frame;
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`no map editor drew ${elementId} within ${timeoutMs} ms`);
}

/** The fixture on disk once it holds `wanted`, or the last text read. */
async function savedFixture(workspaceDir: string, wanted: string, timeoutMs: number) {
  const file = join(workspaceDir, FIXTURE_FILE_NAME);
  const deadline = Date.now() + timeoutMs;
  let text = await readFile(file, "utf8");
  while (!text.includes(wanted) && Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
    text = await readFile(file, "utf8");
  }
  return text;
}

/**
 * Runs one part of the links step; a failure names the part, and a screenshot of the window,
 * `wardley-links-failure.png` next to the theme screenshots, shows where it stopped.
 */
async function linksPart<T>(page: Page, part: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    await page
      .screenshot({ path: join(SCREENSHOT_DIRECTORY, "wardley-links-failure.png") })
      .catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${part}: ${message.split("\n").slice(0, 8).join(" | ")}`, { cause: error });
  }
}

/**
 * Links a component to a map in a subfolder through "Link to map…" and VS Code's Quick Pick, saves,
 * and follows the link and the linked map's own link on: each map opens in the map editor, and in
 * a tab of its own, as a preview tab would be replaced by the next map opened from a link.
 */
async function followMapLinks({
  page,
  webview,
  keys,
  timeoutMs,
  workspaceDir,
}: VsCodeSmokeContext): Promise<void> {
  await linksPart(page, "fit the map", async () => {
    // The keys, history and reload steps before leave the view zoomed.
    const focused = await webview.locator("html").evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>(".djs-container > svg");
      svg?.focus({ preventScroll: true });
      return document.activeElement === svg;
    });
    if (!focused) throw new Error("the canvas <svg> did not take the focus");
    await page.keyboard.press("Shift+1");
    await delay(FIT_SETTLE_MS);
  });

  const quickPick = page.locator(".quick-input-widget");
  await linksPart(page, "Link to map…", async () => {
    await clickPadEntry(webview, LINKED_COMPONENT_ID, "link-map", timeoutMs);
    await quickPick.waitFor({ state: "visible", timeout: timeoutMs });
  });
  await linksPart(page, "the Quick Pick", async () => {
    const offered = await quickPick.locator(".monaco-list-row .label-name").allInnerTexts();
    for (const file of [PAYMENT_FILE, ARCHIVE_FILE]) {
      if (!offered.includes(file)) {
        throw new Error(`it offered ${offered.join(", ") || "nothing"}, not ${file}`);
      }
    }
    await page.keyboard.type(PAYMENT_FILE);
    await page.keyboard.press("Enter");
    await quickPick.waitFor({ state: "hidden", timeout: timeoutMs });
    await webview
      .locator(`.djs-context-pad [data-action="open-link"][title="Open link (${PAYMENT_FILE})"]`)
      .waitFor({ timeout: timeoutMs });
  });

  await linksPart(page, "save the link", async () => {
    await page.keyboard.press(keys.save);
    const saved = await savedFixture(workspaceDir, `[${PAYMENT_FILE}]`, timeoutMs);
    const linked = parseMap(saved).elements.find(({ id }) => id === LINKED_COMPONENT_ID);
    if ((linked as { url?: string } | undefined)?.url !== PAYMENT_FILE) {
      throw new Error(`the saved map does not link ${LINKED_COMPONENT_ID} to ${PAYMENT_FILE}`);
    }
  });

  const payment = await linksPart(page, `Open link to ${PAYMENT_FILE}`, async () => {
    await clickPadEntry(webview, LINKED_COMPONENT_ID, "open-link", timeoutMs);
    return editorDrawing(page, "cmp_ledger", timeoutMs);
  });
  await linksPart(page, `Open link to ${ARCHIVE_FILE}`, async () => {
    await clickPadEntry(payment, "cmp_ledger", "open-link", timeoutMs);
    await editorDrawing(page, "cmp_old_ledger", timeoutMs);
  });

  await linksPart(page, "the tabs", async () => {
    const tabs = await page.locator(".tabs-container .tab .label-name").allInnerTexts();
    for (const name of [FIXTURE_FILE_NAME, "payment.wmap", "archive.wmap"]) {
      if (!tabs.includes(name)) throw new Error(`${tabs.join(", ")} has no tab ${name}`);
    }
  });
}

let workDirectory: string | undefined;
let extensionPath = "";

beforeAll(async () => {
  await rm(SCREENSHOT_DIRECTORY, { recursive: true, force: true });
  workDirectory = await mkdtemp(join(tmpdir(), "wardley-vscode-smoke-"));
  // The release passes the VSIX it is about to publish, so the smoke checks that very file.
  const prebuiltVsix = process.env.VSCODE_SMOKE_VSIX;
  const vsix = prebuiltVsix ? resolve(prebuiltVsix) : await packExtension(workDirectory);
  extensionPath = await unpackExtension(vsix, workDirectory);
}, 300_000);

afterAll(async () => {
  if (workDirectory) await rm(workDirectory, { recursive: true, force: true });
});

// The first run downloads VS Code (about 350 MB) into the OS cache directory; later runs reuse it.
it(
  "opens, edits, saves, undoes, themes and follows the links of a map in a real VS Code",
  { timeout: 600_000 },
  async () => {
    const fixtureText = await readFile(new URL(FIXTURE_FILE_NAME, import.meta.url), "utf8");
    const evolutionBefore = evolutionOf(parseMap(fixtureText), EVOLVED_COMPONENT_ID);

    const result = await runVsCodeSmoke({
      extensionPath,
      fixture: { fileName: FIXTURE_FILE_NAME, text: fixtureText, files: LINKED_MAPS },
      parse: parseMap,
      edit: evolveComponent,
      custom: followMapLinks,
      themes: WARDLEY_THEMES,
      name: "wardley",
      screenshotDir: SCREENSHOT_DIRECTORY,
      vscodeVersion: process.env.VSCODE_VERSION || undefined,
      keepTemporaryFiles: process.env.VSCODE_SMOKE_KEEP === "1",
      log: (line) => console.log(line),
    });
    console.log(formatVsCodeSmoke(result));

    expect(result.failures, result.failures.join("\n")).toEqual([]);
    const saved = result.saved?.parsed as WardleyMap;
    expect(evolutionOf(saved, EVOLVED_COMPONENT_ID)).toBeGreaterThan(evolutionBefore);
  },
);
