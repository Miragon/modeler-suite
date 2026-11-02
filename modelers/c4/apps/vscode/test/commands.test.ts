import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { parseWorkspace } from "@miragon/c4-dsl";
import {
  GO_TO_VIEW_COMMAND,
  NO_DIAGRAM_MESSAGE,
  NO_SOURCE_MESSAGE,
  OPEN_DIAGRAM_COMMAND,
  OPEN_SOURCE_COMMAND,
  USE_FOR_WORKSPACE_DSL_COMMAND,
  WEBVIEW_COMMANDS,
} from "../src/commands.js";
import {
  ALREADY_ASSOCIATED_MESSAGE,
  ASSOCIATED_MESSAGE,
  NOT_ASSOCIATED_MESSAGE,
  OPEN_SETTINGS_ACTION,
} from "../src/defaultEditor.js";
import { DIAGRAM_VIEW_TYPE, DSL_DIAGRAM_VIEW_TYPE } from "../src/diagramEditorOptions.js";
import { EMPTY_DIAGRAM, EXAMPLE_DIAGRAM } from "../src/examples.js";
import { activate } from "../src/extension.js";
import {
  DRAFT_NOTE,
  GO_TO_VIEW_TITLE,
  NO_READABLE_VIEWS_MESSAGE,
  OTHER_VIEWS_LABEL,
  viewPickItems,
} from "../src/goToView.js";
import { FakeUri, fakeVsCode, vscodeModule } from "./fakeVsCode.js";

vi.mock("vscode", async () => (await import("./fakeVsCode.js")).vscodeModule);

const SHOP = FakeUri.file("/shop/workspace.c4");
const DSL_SHOP = FakeUri.file("/shop/workspace.dsl");
const SEPARATOR = -1;
const subscriptions: Array<{ dispose(): unknown }> = [];

beforeEach(() => {
  fakeVsCode.reset();
  activate({
    extensionUri: FakeUri.file("/extension"),
    subscriptions,
  } as unknown as vscode.ExtensionContext);
});
afterEach(() => {
  for (const subscription of subscriptions.splice(0)) subscription.dispose();
  vi.restoreAllMocks();
});

function openShop(text = EXAMPLE_DIAGRAM, options: { active?: boolean } = {}) {
  return fakeVsCode.openCustomEditor(DIAGRAM_VIEW_TYPE, SHOP, text, options);
}

/** A Structurizr `workspace.dsl`, opened through Reopen Editor With… › C4 Modeler. */
function openDslShop(text = EXAMPLE_DIAGRAM, options: { active?: boolean } = {}) {
  return fakeVsCode.openCustomEditor(DSL_DIAGRAM_VIEW_TYPE, DSL_SHOP, text, options);
}

function lastQuickPick() {
  const picker = fakeVsCode.quickPicks.at(-1);
  if (!picker) throw new Error("No QuickPick shown.");
  return picker;
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("the rows of Go to View…", () => {
  it("groups the views by type, written ones first, then the ones only Structurizr shows", () => {
    const items = viewPickItems(parseWorkspace(EXAMPLE_DIAGRAM).workspace);

    expect(
      items.map((item) => (item.kind === SEPARATOR ? `# ${item.label}` : item.description)),
    ).toEqual([
      "# System landscape",
      "SystemLandscape",
      "# System context",
      "SystemContext-bookshop",
      "SystemContext-mail",
      "SystemContext-payments",
      "# Container",
      "Containers-bookshop",
      "# Component",
      "Components-api",
      `# ${OTHER_VIEWS_LABEL}`,
      "PlaceOrder",
      "LiveDeployment",
    ]);
  });

  it("marks a view the file doesn't hold yet, and opens it all the same", () => {
    const items = viewPickItems(parseWorkspace(EXAMPLE_DIAGRAM).workspace);
    const draft = items.find((item) => item.description === "SystemContext-payments");

    expect(draft).toMatchObject({
      label: "System Context diagram for Payment Provider",
      detail: DRAFT_NOTE,
      key: "SystemContext-payments",
    });
    expect(items.find((item) => item.description === "SystemLandscape")).not.toHaveProperty(
      "detail",
    );
  });

  it("names the type of a view the canvas doesn't show, and gives it no key", () => {
    const items = viewPickItems(parseWorkspace(EXAMPLE_DIAGRAM).workspace);

    expect(items.find((item) => item.description === "PlaceOrder")).toEqual({
      label: "Dynamic diagram for Bookshop - API",
      description: "PlaceOrder",
      detail: "Dynamic view, shown in Structurizr only",
    });
  });

  it("lists the landscape of a new workspace", () => {
    const items = viewPickItems(parseWorkspace(EMPTY_DIAGRAM).workspace);

    expect(items.map((item) => item.label)).toEqual([
      "System landscape",
      "System Landscape diagram",
    ]);
    expect(items[1]).toMatchObject({ key: "SystemLandscape", detail: DRAFT_NOTE });
  });
});

describe("Go to View…", () => {
  it("shows the views of the focused diagram and switches its canvas to the chosen one", async () => {
    const { panel } = await openShop();

    const running = fakeVsCode.runCommand(GO_TO_VIEW_COMMAND);
    await settle();
    const picker = lastQuickPick();
    expect(picker).toMatchObject({ title: GO_TO_VIEW_TITLE, matchOnDescription: true });
    picker.accept("Container diagram for Bookshop");
    await running;

    expect(panel.posted).toContainEqual({ type: "c4.showView", key: "Containers-bookshop" });
    expect(picker.disposed).toBe(true);
  });

  it("switches the canvas of a .dsl diagram as well", async () => {
    const { panel } = await openDslShop();

    const running = fakeVsCode.runCommand(GO_TO_VIEW_COMMAND);
    await settle();
    lastQuickPick().accept("Component diagram for Bookshop - API");
    await running;

    expect(panel.posted).toContainEqual({ type: "c4.showView", key: "Components-api" });
  });

  it("keeps the list open on a view only Structurizr shows", async () => {
    const { panel } = await openShop();

    void fakeVsCode.runCommand(GO_TO_VIEW_COMMAND);
    await settle();
    const picker = lastQuickPick();
    picker.accept("Dynamic diagram for Bookshop - API");

    expect(picker.shown).toBe(true);
    expect(
      panel.posted.some((message) => (message as { type: string }).type === "c4.showView"),
    ).toBe(false);
    picker.hide();
  });

  it("switches nothing when the list closes without a choice", async () => {
    const { panel } = await openShop();

    const running = fakeVsCode.runCommand(GO_TO_VIEW_COMMAND);
    await settle();
    lastQuickPick().hide();
    await running;

    expect(
      panel.posted.some((message) => (message as { type: string }).type === "c4.showView"),
    ).toBe(false);
  });

  it("lists the views the canvas shows while the file is invalid: the last valid ones", async () => {
    const { panel, document } = await openShop();
    fakeVsCode.changeTextDocument(document, `${EXAMPLE_DIAGRAM}}\n`);
    await settle();

    const running = fakeVsCode.runCommand(GO_TO_VIEW_COMMAND);
    await settle();
    lastQuickPick().accept("Component diagram for Bookshop - API");
    await running;

    expect(panel.posted).toContainEqual({ type: "c4.showView", key: "Components-api" });
  });

  it("says so when the file was never valid since it opened", async () => {
    await openShop("workspace {\n    model {\n");

    await fakeVsCode.runCommand(GO_TO_VIEW_COMMAND);

    expect(fakeVsCode.quickPicks).toEqual([]);
    expect(fakeVsCode.notifications).toEqual([
      { severity: "info", message: NO_READABLE_VIEWS_MESSAGE, items: [] },
    ]);
  });

  it("says so when no diagram is open", async () => {
    await fakeVsCode.runCommand(GO_TO_VIEW_COMMAND);

    expect(fakeVsCode.notifications).toEqual([
      { severity: "info", message: NO_DIAGRAM_MESSAGE, items: [] },
    ]);
  });
});

describe("the webview's actions as commands", () => {
  it.each(Object.entries(WEBVIEW_COMMANDS))(
    "%s posts its name to the focused diagram",
    async (name, command) => {
      const { panel } = await openShop();

      await fakeVsCode.runCommand(command);

      expect(panel.posted).toContainEqual({ type: "command", name });
    },
  );

  it.each(Object.entries(WEBVIEW_COMMANDS))(
    "%s posts its name to a focused .dsl diagram, and to no other diagram",
    async (name, command) => {
      const c4 = await openShop(EXAMPLE_DIAGRAM, { active: false });
      const dsl = await openDslShop();

      await fakeVsCode.runCommand(command);

      expect(dsl.panel.posted).toContainEqual({ type: "command", name });
      expect(c4.panel.posted).not.toContainEqual({ type: "command", name });
    },
  );

  it("posts to the diagram a title button names, in either editor", async () => {
    const c4 = await openShop(EXAMPLE_DIAGRAM, { active: false });
    const dsl = await openDslShop(EXAMPLE_DIAGRAM, { active: false });

    await fakeVsCode.runCommand(WEBVIEW_COMMANDS.fitView, DSL_SHOP);
    await fakeVsCode.runCommand(WEBVIEW_COMMANDS.exportPng, SHOP);

    expect(dsl.panel.posted).toContainEqual({ type: "command", name: "fitView" });
    expect(c4.panel.posted).toContainEqual({ type: "command", name: "exportPng" });
  });

  it("tells the user when no diagram is focused", async () => {
    const { panel } = await openShop(EXAMPLE_DIAGRAM, { active: false });

    await fakeVsCode.runCommand(WEBVIEW_COMMANDS.parentView);

    expect(panel.posted.some((message) => (message as { type: string }).type === "command")).toBe(
      false,
    );
    expect(fakeVsCode.notifications).toEqual([
      { severity: "info", message: NO_DIAGRAM_MESSAGE, items: [] },
    ]);
  });
});

describe("source and diagram side by side", () => {
  it("opens the text beside the diagram, and the diagram beside the text", async () => {
    await openShop();

    await fakeVsCode.runCommand(OPEN_SOURCE_COMMAND);
    const text = FakeUri.file("/shop/other.c4");
    await fakeVsCode.runCommand(OPEN_DIAGRAM_COMMAND, text);

    expect(fakeVsCode.executedCommands).toEqual([
      ["vscode.openWith", SHOP, "default", -2],
      ["vscode.openWith", text, DIAGRAM_VIEW_TYPE, -2],
    ]);
  });

  // Reopen Editor With… lists the editor whose pattern matches: one C4 Modeler for each file.
  it("opens a .dsl text in the .dsl editor", async () => {
    const text = FakeUri.file("/shop/other.DSL");

    await fakeVsCode.runCommand(OPEN_DIAGRAM_COMMAND, text);

    expect(fakeVsCode.executedCommands).toEqual([
      ["vscode.openWith", text, DSL_DIAGRAM_VIEW_TYPE, -2],
    ]);
  });

  it("opens the text of the diagram focused last, whichever editor shows it", async () => {
    const dsl = await openDslShop();
    const c4 = await openShop();
    dsl.panel.setActive(true);
    c4.panel.setActive(false);
    dsl.panel.setActive(false);

    await fakeVsCode.runCommand(OPEN_SOURCE_COMMAND);

    expect(fakeVsCode.executedCommands).toEqual([["vscode.openWith", DSL_SHOP, "default", -2]]);
    expect(dsl.panel.revealed).toEqual([{ viewColumn: undefined, preserveFocus: false }]);
  });

  it("shows a .dsl diagram VS Code restored after a reload, and opens its text", async () => {
    const tab = {
      input: new vscodeModule.TabInputCustom(DSL_SHOP, DSL_DIAGRAM_VIEW_TYPE),
      group: { viewColumn: 2 },
    };
    vscodeModule.window.tabGroups.activeTabGroup.tabs.push(tab);

    await fakeVsCode.runCommand(OPEN_SOURCE_COMMAND);

    expect(fakeVsCode.executedCommands).toEqual([
      ["vscode.openWith", DSL_SHOP, DSL_DIAGRAM_VIEW_TYPE, 2],
      ["vscode.openWith", DSL_SHOP, "default", -2],
    ]);
  });

  it("asks for a .c4 or .dsl file when no text editor is focused", async () => {
    await fakeVsCode.runCommand(OPEN_DIAGRAM_COMMAND);

    expect(fakeVsCode.notifications).toEqual([
      { severity: "info", message: NO_SOURCE_MESSAGE, items: [] },
    ]);
  });
});

describe("Use C4 Modeler for workspace.dsl", () => {
  it("adds the association to the user settings and keeps the others there", async () => {
    fakeVsCode.setUserSettings({ "workbench.editorAssociations": { "*.png": "imagePreview" } });

    await fakeVsCode.runCommand(USE_FOR_WORKSPACE_DSL_COMMAND);

    expect(fakeVsCode.settingUpdates).toEqual([
      {
        section: "workbench.editorAssociations",
        value: { "*.png": "imagePreview", "workspace.dsl": DSL_DIAGRAM_VIEW_TYPE },
        target: 1,
      },
    ]);
    expect(fakeVsCode.notifications).toEqual([
      { severity: "info", message: ASSOCIATED_MESSAGE, items: [OPEN_SETTINGS_ACTION] },
    ]);
  });

  it("opens the setting when the user asks", async () => {
    fakeVsCode.answer({ notification: OPEN_SETTINGS_ACTION });

    await fakeVsCode.runCommand(USE_FOR_WORKSPACE_DSL_COMMAND);

    expect(fakeVsCode.executedCommands).toEqual([
      ["workbench.action.openSettings", "workbench.editorAssociations"],
    ]);
  });

  it.each([DSL_DIAGRAM_VIEW_TYPE, DIAGRAM_VIEW_TYPE])(
    "writes nothing when workspace.dsl opens in %s already",
    async (viewType) => {
      fakeVsCode.setUserSettings({ "workbench.editorAssociations": { "workspace.dsl": viewType } });

      await fakeVsCode.runCommand(USE_FOR_WORKSPACE_DSL_COMMAND);

      expect(fakeVsCode.settingUpdates).toEqual([]);
      expect(fakeVsCode.notifications).toEqual([
        { severity: "info", message: ALREADY_ASSOCIATED_MESSAGE, items: [OPEN_SETTINGS_ACTION] },
      ]);
    },
  );

  it("replaces an association of workspace.dsl with another editor", async () => {
    fakeVsCode.setUserSettings({
      "workbench.editorAssociations": { "workspace.dsl": "default" },
    });

    await fakeVsCode.runCommand(USE_FOR_WORKSPACE_DSL_COMMAND);

    expect(fakeVsCode.settingUpdates).toMatchObject([
      { value: { "workspace.dsl": DSL_DIAGRAM_VIEW_TYPE } },
    ]);
  });

  it("says in its own words when VS Code can't write the settings", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fakeVsCode.answer({
      settingsError: new Error("Unable to write into user settings."),
      notification: OPEN_SETTINGS_ACTION,
    });

    await fakeVsCode.runCommand(USE_FOR_WORKSPACE_DSL_COMMAND);

    expect(fakeVsCode.notifications).toEqual([
      { severity: "error", message: NOT_ASSOCIATED_MESSAGE, items: [OPEN_SETTINGS_ACTION] },
    ]);
    expect(fakeVsCode.executedCommands).toEqual([["workbench.action.openSettingsJson"]]);
    expect(consoleError).toHaveBeenCalled();
  });
});
