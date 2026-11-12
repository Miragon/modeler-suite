import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openOrcaEditor, orcaTab } from "./support/orca.js";

/**
 * The Orca editor's document sync against the stub's tab, which follows the rules of Orca's own
 * session: an agent's write to a clean tab reaches the canvas, one under unsaved edits is merged
 * with them by `mergeTeamTopologiesText`, a conflicting one leaves the user's draft and Orca's
 * banner, and the canvas owns undo.
 */
const DIAGRAM = readFileSync(
  new URL("../../../apps/orca/test-smoke/smoke.tt", import.meta.url),
  "utf8",
);

interface TeamNode {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

const teamsOf = (text: string): TeamNode[] => (JSON.parse(text) as { nodes: TeamNode[] }).nodes;

const positionOf = (text: string, id: string) =>
  teamsOf(text).find((team) => team.id === id)?.position;

const labelsOf = (text: string) => teamsOf(text).map((team) => team.label);

const withTeam = (text: string, id: string, label: string): string => {
  const document = JSON.parse(text) as { nodes: TeamNode[] };
  document.nodes.push({
    id,
    type: "enabling",
    label,
    position: { x: 40, y: 500 },
    size: { width: 200, height: 80 },
  });
  return JSON.stringify(document, null, 2);
};

const withTeamAt = (text: string, id: string, position: { x: number; y: number }): string => {
  const document = JSON.parse(text) as { nodes: TeamNode[] };
  document.nodes = document.nodes.map((team) => (team.id === id ? { ...team, position } : team));
  return JSON.stringify(document, null, 2);
};

const moveOnCanvas = (page: Page, id: string, dx: number) =>
  page.evaluate(
    ({ elementId, delta }) => {
      const diagram = window.modeler!.diagram;
      const shape = diagram.get<{ get(id: string): unknown }>("elementRegistry").get(elementId);
      diagram
        .get<{ moveElements(shapes: unknown[], delta: { x: number; y: number }): void }>("modeling")
        .moveElements([shape], { x: delta, y: 0 });
    },
    { elementId: id, delta: dx },
  );

const canvasText = (page: Page) => page.evaluate(() => window.modeler!.exportText());

test.describe("Orca editor: document sync", () => {
  test("an agent's write to the clean tab reaches the canvas, and undo cannot revert it", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: DIAGRAM });
    await page.evaluate(
      (text) => window.__modelerShellOrcaStub!.replace(text),
      withTeam(DIAGRAM, "team_agent", "Written by an agent"),
    );
    await expect
      .poll(async () => labelsOf(await canvasText(page)))
      .toContain("Written by an agent");
    expect(
      await page.evaluate(() =>
        window.modeler!.diagram.get<{ canUndo(): boolean }>("commandStack").canUndo(),
      ),
    ).toBe(false);
  });

  test("a canvas edit goes to Orca's tab, a save writes it, and Cmd/Ctrl+Z on the canvas undoes it", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: DIAGRAM });
    await moveOnCanvas(page, "team_browse", 40);
    const tab = await orcaTab(page);
    expect(positionOf(tab.text, "team_browse")).toEqual({ x: 80, y: 100 });
    expect(tab.dirty).toBe(true);
    await page.evaluate(() => window.__modelerShellOrcaStub!.save());
    expect(positionOf((await orcaTab(page)).disk, "team_browse")).toEqual({ x: 80, y: 100 });

    await page
      .locator(".cd-shell-canvas svg")
      .first()
      .click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ControlOrMeta+z");
    await expect
      .poll(async () => positionOf((await orcaTab(page)).text, "team_browse"))
      .toEqual({ x: 40, y: 100 });
  });

  test("an agent's write under unsaved edits is merged with them, without the banner", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: DIAGRAM });
    await moveOnCanvas(page, "team_browse", 40);
    await orcaTab(page);
    await page.evaluate(
      (text) => window.__modelerShellOrcaStub!.diskWriteWhileDirty(text),
      withTeam(DIAGRAM, "team_agent", "Written by an agent"),
    );
    await expect
      .poll(async () => labelsOf(await canvasText(page)))
      .toContain("Written by an agent");
    expect(positionOf(await canvasText(page), "team_browse")).toEqual({ x: 80, y: 100 });
    const tab = await orcaTab(page);
    expect(tab.banner).toBe(false);
    expect(tab.dirty).toBe(true);
    expect(labelsOf(tab.text)).toContain("Written by an agent");
    expect(positionOf(tab.text, "team_browse")).toEqual({ x: 80, y: 100 });
  });

  test("a write that changes what the user changed keeps the draft and leaves the choice to Orca's banner", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: DIAGRAM });
    await moveOnCanvas(page, "team_browse", 40);
    await orcaTab(page);
    await page.evaluate(
      (text) => window.__modelerShellOrcaStub!.diskWriteWhileDirty(text),
      withTeamAt(DIAGRAM, "team_browse", { x: 40, y: 500 }),
    );
    await expect.poll(async () => (await orcaTab(page)).banner).toBe(true);
    expect(positionOf(await canvasText(page), "team_browse")).toEqual({ x: 80, y: 100 });

    await page.evaluate(() => window.__modelerShellOrcaStub!.reload());
    await expect
      .poll(async () => positionOf(await canvasText(page), "team_browse"))
      .toEqual({ x: 40, y: 500 });
  });
});
