import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Every control of the palette, the context pad and the inspector that changes the diagram and
 * would leave the focus where no canvas key acts: on itself, or on `<body>` once it has gone away
 * with its action. The canvas keys act only while the canvas `<svg>` has the focus, so each of
 * them hands it there (guide §5.5, §5.8). Both hosts run them on the modeler shell, each on the
 * sample topology, whose ids these use.
 */

const CANVAS_SVG = '.cd-shell-canvas svg[role="application"]';
/** A team no case changes, so Cmd/Ctrl+A selecting it shows that the canvas keys act. */
const UNTOUCHED_TEAM = "team_platform";
const LABEL_EDITOR = "textarea.tt-label-editor";

export interface FocusHandBackCase {
  name: string;
  /** Acts on the opened sample; ends where the canvas should hold the focus. */
  run(page: Page): Promise<void>;
}

function shape(page: Page, id: string): Locator {
  return page.locator(`[data-element-id="${id}"]`);
}

function padEntry(page: Page, action: string): Locator {
  return page.locator(`.djs-context-pad.open [data-action="${action}"]`);
}

function paletteEntry(page: Page, action: string): Locator {
  return page.locator(`.djs-palette [data-action="${action}"]`);
}

function inspector(page: Page): Locator {
  return page.locator('[data-chrome="inspector"]');
}

function shapeCount(page: Page): Promise<number> {
  return page.locator(".cd-shell-canvas .djs-shape").count();
}

/** Selects the elements with a click, adding the others with Shift. */
async function select(page: Page, ...ids: string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    await shape(page, id).click(index === 0 ? {} : { modifiers: ["Shift"] });
  }
  for (const id of ids) await expect(shape(page, id)).toHaveClass(/selected/);
}

async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function closeLabelEditor(page: Page): Promise<void> {
  await expect(page.locator(LABEL_EDITOR)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(LABEL_EDITOR)).toHaveCount(0);
}

async function giveTeamOwnFill(page: Page): Promise<Locator> {
  await select(page, "team_checkout");
  await inspector(page).getByLabel("Fill").fill("#ff0000");
  const reset = inspector(page).getByRole("button", { name: "Reset colours" });
  await expect(reset).toBeVisible();
  return reset;
}

export const FOCUS_HAND_BACK_CASES: readonly FocusHandBackCase[] = [
  {
    name: "a pointer on the palette's lasso",
    async run(page) {
      await select(page, "team_checkout");
      await paletteEntry(page, "lasso-tool").click();
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "a pointer on a palette entry, then on the canvas",
    async run(page) {
      const before = await shapeCount(page);
      await paletteEntry(page, "team.enabling").click();
      const target = await centre(shape(page, "team_discovery"));
      await page.mouse.move(target.x, target.y, { steps: 4 });
      await page.mouse.click(target.x, target.y);
      await expect.poll(() => shapeCount(page)).toBe(before + 1);
    },
  },
  {
    name: "a drag from a palette entry onto the canvas",
    async run(page) {
      const before = await shapeCount(page);
      const from = await centre(paletteEntry(page, "team.enabling"));
      const to = await centre(shape(page, "team_discovery"));
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();
      await expect.poll(() => shapeCount(page)).toBe(before + 1);
    },
  },
  {
    name: "Enter on a palette entry, once its label editor closes",
    async run(page) {
      await paletteEntry(page, "team.enabling").focus();
      await page.keyboard.press("Enter");
      await closeLabelEditor(page);
    },
  },
  {
    name: "a pointer on the context pad's delete",
    async run(page) {
      await select(page, "team_checkout");
      await padEntry(page, "delete").click();
      await expect(shape(page, "team_checkout")).toHaveCount(0);
    },
  },
  {
    name: "Enter on the context pad's delete",
    async run(page) {
      await select(page, "team_checkout");
      await padEntry(page, "delete").press("Enter");
      await expect(shape(page, "team_checkout")).toHaveCount(0);
    },
  },
  {
    name: "a pointer on the context pad's delete for several elements",
    async run(page) {
      await select(page, "team_checkout", "team_fulfilment");
      await padEntry(page, "delete").click();
      await expect(shape(page, "team_checkout")).toHaveCount(0);
      await expect(shape(page, "team_fulfilment")).toHaveCount(0);
    },
  },
  {
    name: "a pointer on the context pad's Attach to element, then Escape",
    async run(page) {
      await select(page, "ann_fraud_handover");
      await padEntry(page, "connect").click();
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "a pointer on the context pad's Rename, once its label editor closes",
    async run(page) {
      await select(page, "team_checkout");
      await padEntry(page, "edit-label").click();
      await closeLabelEditor(page);
    },
  },
  {
    name: "Enter on the context pad's Rename, once its label editor closes",
    async run(page) {
      await select(page, "team_checkout");
      await padEntry(page, "edit-label").press("Enter");
      await closeLabelEditor(page);
    },
  },
  {
    name: "a pointer on the context pad's Add annotation, once its label editor closes",
    async run(page) {
      await select(page, "team_checkout");
      await padEntry(page, "append-annotation").click();
      await closeLabelEditor(page);
    },
  },
  {
    name: "the inspector's Close",
    async run(page) {
      await select(page, "team_checkout");
      await inspector(page).getByRole("button", { name: "Close" }).click();
      await expect(inspector(page)).toBeHidden();
    },
  },
  {
    name: "Escape in an inspector field",
    async run(page) {
      await select(page, "team_checkout");
      await inspector(page).getByRole("textbox", { name: "Name" }).press("Escape");
      await expect(inspector(page)).toBeHidden();
    },
  },
  ...(
    [
      ["the team's name", "team_checkout", "Name"],
      ["an interaction's label", "int_checkout_fraud", "Label"],
      ["the flow of change's label", "flow_main", "Label"],
    ] as const
  ).map(([field, id, label]): FocusHandBackCase => ({
    name: `Enter in the inspector's field for ${field}`,
    async run(page) {
      await select(page, id);
      const textbox = inspector(page).getByRole("textbox", { name: label });
      await textbox.fill("Renamed");
      await textbox.press("Enter");
      await expect(shape(page, id)).toContainText("Renamed");
    },
  })),
  ...(["a pointer", "Enter"] as const).flatMap((by): FocusHandBackCase[] => {
    const activate = (control: Locator) =>
      by === "a pointer" ? control.click() : control.press("Enter");
    return [
      {
        name: `${by} on the inspector's Delete team`,
        async run(page) {
          await select(page, "team_checkout");
          await activate(inspector(page).getByRole("button", { name: "Delete team" }));
          await expect(shape(page, "team_checkout")).toHaveCount(0);
        },
      },
      {
        name: `${by} on the inspector's Delete for several elements`,
        async run(page) {
          await select(page, "team_checkout", "team_fulfilment");
          await activate(inspector(page).getByRole("button", { name: "Delete 2 elements" }));
          await expect(shape(page, "team_checkout")).toHaveCount(0);
          await expect(shape(page, "team_fulfilment")).toHaveCount(0);
        },
      },
      {
        name: `${by} on the inspector's Reset colours`,
        async run(page) {
          const reset = await giveTeamOwnFill(page);
          await activate(reset);
          await expect(reset).toHaveCount(0);
        },
      },
      {
        name: `${by} on the inspector's Detach`,
        async run(page) {
          await select(page, "ann_fraud_handover");
          await activate(inspector(page).getByRole("button", { name: "Detach" }));
          await expect(inspector(page)).toContainText("Not attached");
        },
      },
    ];
  }),
];

/** The canvas has the focus, and its keys act at once: Cmd/Ctrl+A selects every element. */
export async function expectCanvasKeysAct(page: Page): Promise<void> {
  await expect(page.locator(CANVAS_SVG)).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await expect(shape(page, UNTOUCHED_TEAM)).toHaveClass(/selected/);
}
