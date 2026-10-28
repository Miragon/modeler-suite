/// <reference types="node" />
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  createFromPalette,
  formatVsCodeSmoke,
  runVsCodeSmoke,
  VSCODE_COLOR_THEMES,
  type VsCodeSmokeContext,
} from "@miragon/modeler-shell/testing/vscode-electron";
import { parseDocument, type TtDocument } from "@miragon/team-topologies-schema-model";
import { expect, it } from "vitest";
import { documentProblems } from "../src/problems.js";
import { WEBVIEW_THEMES } from "../src/themes.js";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const extensionFolder = resolve(here, "..");
const repositoryRoot = resolve(here, "../../..");
const screenshotDir = resolve(repositoryRoot, "test-results/vscode-smoke");
/** `stable`, `insiders` or a version like `1.96.0`; unset, the driver takes the newest stable. */
const requestedVsCodeVersion = process.env.VSCODE_VERSION?.trim() || undefined;
/** A packed VSIX to test instead of packing one: the release smoke-tests the file it publishes. */
const prebuiltVsix = process.env.VSCODE_SMOKE_VSIX?.trim() || undefined;
/** `1` keeps VS Code's profile after the run, so CI can upload the logs of a failed one. */
const keepVsCodeProfile = process.env.VSCODE_SMOKE_KEEP === "1";

/** The check the Problems view runs: valid JSON, a valid diagram, no dropped connector. */
function parseTeamTopology(text: string): TtDocument {
  const problems = documentProblems(text);
  if (problems.length > 0) {
    throw new Error(
      problems.map((problem) => `${problem.severity}: ${problem.message}`).join("; "),
    );
  }
  const result = parseDocument(JSON.parse(text));
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

/**
 * Packs the VSIX as the release does (`vsce package` runs `vscode:prepublish`, the production
 * build).
 */
async function packExtension(into: string): Promise<string> {
  const vsix = join(into, "team-topologies-modeler.vsix");
  await run("npx", ["--no-install", "vsce", "package", "--no-dependencies", "--out", vsix], {
    cwd: extensionFolder,
    maxBuffer: 16 * 1024 * 1024,
  });
  return vsix;
}

/** Unpacks the VSIX's `extension/` folder, so VS Code loads exactly the files that ship. */
async function unpackExtension(vsix: string, into: string): Promise<string> {
  await run("unzip", ["-q", vsix, "extension/*", "-d", into]);
  return join(into, "extension");
}

/**
 * The files the webview loads by URL: no activation error names them when the package lacks one.
 * Its bundle, its stylesheet and every file the stylesheet links (the Geist fonts).
 */
async function missingWebviewFiles(extensionPath: string): Promise<string[]> {
  const dist = join(extensionPath, "dist");
  const stylesheet = await readFile(join(dist, "webview.css"), "utf8").catch(() => "");
  const linkedFiles = [...stylesheet.matchAll(/url\("?(\.\/[^")]+)"?\)/g)].map(([, file]) => file);
  return ["webview.js", "webview.css", ...linkedFiles]
    .map((file) => join("dist", file))
    .filter((file) => !existsSync(join(extensionPath, file)));
}

/**
 * The default check (a shape on the canvas) passes an editor without its stylesheet: the shapes
 * and the chrome are in the DOM all the same, collapsed and unstyled. The shell's stylesheet lays
 * the palette over the canvas; without it the palette stays in the page's flow.
 */
async function showsStyledDiagram({ webview, timeoutMs }: VsCodeSmokeContext): Promise<void> {
  const html = webview.locator("html");
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const facts = await html.evaluate(() => {
      const palette = document.querySelector('[data-chrome="palette"]');
      return {
        shapes: document.querySelectorAll(".djs-shape").length,
        palettePosition: palette ? getComputedStyle(palette).position : undefined,
      };
    });
    if (facts.shapes > 0 && facts.palettePosition !== "static") return;
    if (performance.now() > deadline) {
      throw new Error(
        facts.shapes === 0
          ? "the canvas shows no element of the fixture"
          : "the webview's stylesheet did not apply (the palette is position: static)",
      );
    }
    await sleep(100);
  }
}

const typedTeamName = "Payments";
/** Long enough for a draft the save missed (the flush gives up after 1 s) to reach the document. */
const DOCUMENT_SETTLE_MS = 1_500;

const activeEditorIsDirty = (): boolean =>
  document.querySelector(".tabs-container .tab.active.dirty") !== null;

async function waitForEditorDirty(
  { page, timeoutMs }: VsCodeSmokeContext,
  dirty: boolean,
  failure: string,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while ((await page.evaluate(activeEditorIsDirty)) !== dirty) {
    if (performance.now() > deadline) throw new Error(failure);
    await sleep(100);
  }
}

/**
 * The inspector part, before the change the driver saves and undoes. The Name field commits only on
 * blur or Enter, so Cmd/Ctrl+S right after typing saves the name only when the save commits the
 * field's draft first. Cmd/Ctrl+Z in the field undoes the typing there and never reaches the
 * document's history (the shell keeps the field's native undo, guide §13.5). The driver's undo step
 * cannot cover that: its save leaves the focus in the field. So the hook presses both keys itself
 * and ends with a second team from the palette, which leaves the focus on the canvas.
 */
async function typeInInspectorThenCreateTeam(context: VsCodeSmokeContext): Promise<void> {
  const { page, keys } = context;
  await createFromPalette(context);
  await waitForEditorDirty(context, true, "the team from the palette never reached the document");
  const name = context.webview.locator('[data-chrome="inspector"]').getByLabel("Name");
  const nameBeforeTyping = await name.inputValue();
  await name.selectText();
  await name.pressSequentially(typedTeamName);

  await page.keyboard.press(keys.save);
  await waitForEditorDirty(
    context,
    false,
    `${keys.save} right after typing in the inspector left the editor dirty`,
  );

  await page.keyboard.press(keys.undo);
  await sleep(DOCUMENT_SETTLE_MS);
  const fieldAfterUndo = await name.inputValue();
  if (fieldAfterUndo !== nameBeforeTyping) {
    throw new Error(
      `${keys.undo} in the inspector's Name field left "${fieldAfterUndo}" in it, ` +
        `not "${nameBeforeTyping}" from before the typing`,
    );
  }
  if (await page.evaluate(activeEditorIsDirty)) {
    throw new Error(
      `the editor turned dirty after the save: a draft the save missed or ${keys.undo} in the ` +
        "inspector's Name field changed the document",
    );
  }

  await name.press("Escape");
  const committedName = await name.inputValue();
  if (committedName !== typedTeamName) {
    throw new Error(
      `${keys.save} did not commit the typed name: Escape restores "${committedName}"`,
    );
  }

  await createFromPalette(context);
}

// The first run downloads VS Code (about 320 to 360 MB) into the OS's cache directory.
it(
  "opens, edits, saves, undoes and themes a diagram in a real VS Code",
  { timeout: 600_000 },
  async () => {
    const workDirectory = await mkdtemp(join(tmpdir(), "team-topologies-vscode-smoke-"));
    try {
      const packStarted = performance.now();
      const vsix = prebuiltVsix ? resolve(prebuiltVsix) : await packExtension(workDirectory);
      const extensionPath = await unpackExtension(vsix, workDirectory);
      console.log(
        prebuiltVsix
          ? `unpacked ${vsix}`
          : `pack: ${Math.round(performance.now() - packStarted)} ms`,
      );
      expect(await missingWebviewFiles(extensionPath)).toEqual([]);

      const fixtureText = await readFile(join(here, "checkout.tt"), "utf8");
      const fixture = parseTeamTopology(fixtureText);

      const result = await runVsCodeSmoke({
        extensionPath,
        fixture: { fileName: "checkout.tt", text: fixtureText },
        parse: parseTeamTopology,
        ready: showsStyledDiagram,
        edit: typeInInspectorThenCreateTeam,
        // the first team, its name and the second team: three edits of the document
        undoSteps: 3,
        themes: WEBVIEW_THEMES,
        name: "team-topologies",
        screenshotDir,
        vscodeVersion: requestedVsCodeVersion,
        keepTemporaryFiles: keepVsCodeProfile,
        log: console.log,
      });
      console.log(formatVsCodeSmoke(result));

      expect(result.failures).toEqual([]);
      if (requestedVsCodeVersion && /^\d+\.\d+\.\d+$/.test(requestedVsCodeVersion)) {
        expect(result.vscodeVersion).toBe(requestedVsCodeVersion);
      }
      const saved = result.saved?.parsed as TtDocument | undefined;
      expect(saved?.nodes).toHaveLength(fixture.nodes.length + 2);
      const fixtureTeams = new Set(fixture.nodes.map(({ id }) => id));
      const newLabels = saved?.nodes
        .filter(({ id }) => !fixtureTeams.has(id))
        .map(({ label }) => label);
      expect(newLabels?.filter((label) => label === typedTeamName)).toHaveLength(1);
      expect(result.undone).toBe(true);
      expect(result.themes.map(({ theme, ok }) => [theme.id, ok])).toEqual(
        VSCODE_COLOR_THEMES.map(({ id }) => [id, true]),
      );
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  },
);
