import type { ConformanceCase } from "./harness.js";
import {
  assertFinite,
  exportOrFail,
  fail,
  foreignRoundTrips,
  importContentText,
  importOrFail,
  same,
  settleOf,
  skip,
  sortedIds,
  UNKNOWN_ELEMENT_ID,
} from "./support.js";

export const viewerCase: ConformanceCase = {
  name: "viewer (when shipped): read-only, silent, canonical, fits, reveals, keeps foreign content, unshaken by a rejected import",
  async run(harness) {
    if (!harness.createReadonly)
      return skip("createReadonly is undefined — the package ships no viewer mount");
    const viewer = await harness.createReadonly();
    try {
      if (viewer.meta.editable !== false)
        fail("createReadonly() must return a viewer (meta.editable === false)");
      try {
        const fresh = viewer.getViewState();
        if (fresh !== undefined) assertFinite(fresh, "on the viewer before the first import");
      } catch (error) {
        fail(`the viewer's getViewState threw before the first import: ${String(error)}`);
      }
      let calls = 0;
      const off = viewer.onContentChanged(() => {
        calls += 1;
      });
      try {
        for (const text of harness.canonicalTexts) {
          await importOrFail(viewer, text, "the viewer rejected a canonical text");
          if (exportOrFail(viewer, "on the viewer") !== text)
            fail("the viewer's export is not the canonical text");
        }
        const doc = viewer.exportText();
        const ids = sortedIds(viewer);
        if (viewer.elements) {
          const firstId = viewer.elements.list()[0]?.id;
          if (firstId !== undefined) {
            const deliveries: string[][] = [];
            const offSelection = viewer.elements.onSelection((selected) =>
              deliveries.push([...selected]),
            );
            if (viewer.elements.reveal(firstId) !== true)
              fail("the viewer's reveal(known id) must return true");
            await settleOf(harness)();
            if (!deliveries.some((delivery) => delivery.includes(firstId)))
              fail("the viewer's reveal delivered no selection containing the id");
            if (!viewer.elements.selection().includes(firstId))
              fail("the viewer's selection() does not contain the revealed id");
            offSelection();
          }
          if (viewer.elements.reveal(UNKNOWN_ELEMENT_ID) !== false)
            fail("the viewer's reveal(unknown id) must return false");
        }
        for (const bad of harness.invalidTexts ?? []) {
          await viewer.importText(bad).then(
            () => fail("the viewer resolved a non-importable input — it must REJECT"),
            () => undefined,
          );
          if (viewer.exportText() !== doc) fail("a rejected import changed the viewer's document");
          if (ids && !same(ids, sortedIds(viewer)))
            fail("a rejected import changed the viewer's rendered elements");
        }
        await foreignRoundTrips(harness, viewer, "the viewer's ");
        if (harness.viewState !== undefined) {
          const text = await importContentText(harness, viewer);
          const fitted = viewer.getViewState();
          assertFinite(fitted, "on the viewer after import");
          viewer.setViewState(harness.viewState);
          const applied = viewer.getViewState();
          if (same(applied, fitted)) fail("the viewer's setViewState had no effect");
          await viewer.importText(text);
          if (!same(viewer.getViewState(), fitted))
            fail("the viewer's import must leave the view fitted (L5)");
          viewer.setViewState(applied);
          if (!same(viewer.getViewState(), applied))
            fail("setting the viewer's own readback did not yield that readback");
        }
        await settleOf(harness)();
        if (calls > 0)
          fail(`the viewer fired onContentChanged ${calls}x — a viewer never changes content`);
      } finally {
        off();
      }
    } finally {
      viewer.destroy();
      viewer.destroy();
    }
  },
};
