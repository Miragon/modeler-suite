import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type HostLauncher from "../../src/context-pad/HostLauncher.js";
import {
  createCollaborativeModeler,
  type CollaborativeDiagram,
  type ReadOnly,
} from "../../src/index.js";

let modeler: CollaborativeDiagram;
let host: HTMLElement;
let opened: number;

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
const titleButtons = () => [...host.querySelectorAll<HTMLButtonElement>(".bmc-header-title")];
const labels = () => titleButtons().map((button) => button.getAttribute("aria-label"));

beforeEach(async () => {
  modeler = createCollaborativeModeler();
  host = attachedHost();
  modeler.attachTo(host);
  opened = 0;
  modeler.diagram.get<HostLauncher>("hostLauncher").registerCanvasTitle(() => (opened += 1));
});

afterEach(() => {
  modeler.destroy();
  host.parentElement?.remove();
});

describe("the header's title", () => {
  it("opens Canvas title, and is the header's one field", async () => {
    await modeler.importText("version: 1\ncanvas:\n  title: Shop\n  x-owner: Commuters\n");
    await frame();
    expect(labels()).toEqual(["Edit the title"]);
    expect(modeler.diagram.saveSVG().svg).not.toContain("Commuters");
    titleButtons()[0]!.click();
    expect(opened).toBe(1);
  });

  it("stands for an untitled canvas too, never in an export", async () => {
    await modeler.importText("");
    await frame();
    expect(labels()).toEqual(["Edit the title"]);
    expect(modeler.diagram.saveSVG().svg).not.toContain("bmc-header-title");
  });

  it("offers nothing without a host that opens the dialog", async () => {
    const bare = createCollaborativeModeler();
    const bareHost = attachedHost();
    bare.attachTo(bareHost);
    await bare.importText("version: 1\ncanvas:\n  title: Shop\n");
    await frame();
    expect(bareHost.querySelectorAll(".bmc-header-title")).toHaveLength(0);
    bare.destroy();
    bareHost.parentElement?.remove();
  });

  it("is not editable on a read-only canvas", async () => {
    await modeler.importText("version: 1\ncanvas:\n  title: Shop\n");
    modeler.diagram.get<ReadOnly>("readOnly").setReadOnly(true);
    await frame();
    expect(labels()).toEqual([]);
  });
});
