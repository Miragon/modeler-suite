import { afterEach, describe, expect, it } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import { connectLegend } from "../../src/menu/legendBinding.js";
import { SINGLE } from "./support/interaction/fixtures.js";
import {
  destroyMounted,
  mountModeler,
  service,
  type Mounted,
} from "./support/interaction/mount.js";

const bodies: HTMLElement[] = [];

afterEach(() => {
  for (const body of bodies.splice(0)) body.remove();
  destroyMounted();
});

/** The shell's live legend body: rendered into by the modeler, never replaced. */
function legendBody(): HTMLElement {
  const body = document.createElement("div");
  body.className = "cd-shell-legend-body";
  document.body.append(body);
  bodies.push(body);
  return body;
}

function rows(body: HTMLElement): [string, string][] {
  return [...body.querySelectorAll<HTMLElement>(".c4-legend-row")].map((row) => [
    row.dataset.legendKind ?? "",
    row.textContent ?? "",
  ]);
}

function kinds(body: HTMLElement): string[] {
  return rows(body).map(([kind]) => kind);
}

async function connected(): Promise<{ page: Mounted; body: HTMLElement }> {
  const page = await mountModeler();
  const body = legendBody();
  connectLegend(body, page.modeler);
  return { page, body };
}

describe("the legend follows the view on the canvas (SPEC 6.6)", () => {
  it("shows the looks of the view at once", async () => {
    const { body } = await connected();
    expect(rows(body)).toEqual([
      ["element", "Person"],
      ["element", "Software System"],
      ["relationship", "Relationship"],
    ]);
    const preview = body.querySelector(".cd-shell-legend-preview svg");
    expect(preview?.getAttribute("width")).toBe("24");
  });

  it("shows another view's looks after a view switch: its boundary and the database's cylinder", async () => {
    const { page, body } = await connected();
    page.modeler.views.open("Containers", { cause: "user" });
    expect(kinds(body)).toEqual(["element", "element", "element", "boundary", "relationship"]);
    expect(rows(body).map(([, label]) => label)).toContain("Database");
    expect(body.querySelector(".cd-shell-legend-separator")).not.toBeNull();
  });

  it("follows a command and its undo", async () => {
    const { page, body } = await connected();
    const plain = body.innerHTML;
    page.modeler.c4.applyC4Colours();
    expect(body.innerHTML).not.toBe(plain);
    expect(kinds(body)).toEqual(["element", "element", "relationship"]);
    service<CommandStack>(page.modeler, "commandStack").undo();
    expect(body.innerHTML).toBe(plain);
  });

  it("follows an import", async () => {
    const { page, body } = await connected();
    await page.modeler.importText(SINGLE);
    expect(rows(body)).toEqual([["element", "Person"]]);
    await page.modeler.importText("");
    expect(body.textContent).toBe("Nothing in this view yet");
  });

  it("stops with its destroy and with the diagram", async () => {
    const page = await mountModeler();
    const body = legendBody();
    const binding = connectLegend(body, page.modeler);
    binding.destroy();
    page.modeler.views.open("Containers", { cause: "user" });
    expect(kinds(body)).toEqual(["element", "element", "relationship"]);

    const other = legendBody();
    connectLegend(other, page.modeler);
    page.modeler.destroy();
    expect(kinds(other)).toEqual(["element", "element", "element", "boundary", "relationship"]);
  });
});
