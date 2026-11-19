import type { ConformanceCase } from "./harness.js";
import {
  assertFinite,
  defaultSettle,
  exportOrFail,
  fail,
  foreignRoundTrips,
  importContentText,
  same,
  skip,
  sortedIds,
} from "./support.js";

export const viewerCase: ConformanceCase = {
  name: "viewer (when shipped): read-only, silent, canonical, fits, reveals, keeps foreign content, unshaken by a rejected import",
  async run(h) {
    if (!h.createReadonly)
      return skip("createReadonly is undefined — the package ships no viewer mount");
    const v = await h.createReadonly();
    try {
      if (v.meta.editable !== false)
        fail("createReadonly() must return a viewer (meta.editable === false)");
      try {
        const fresh = v.getViewState();
        if (fresh !== undefined) assertFinite(fresh, "on the viewer before the first import");
      } catch (e) {
        fail(`the viewer's getViewState threw before the first import: ${String(e)}`);
      }
      let calls = 0;
      const off = v.onContentChanged(() => {
        calls += 1;
      });
      try {
        for (const text of h.canonicalTexts) {
          await v
            .importText(text)
            .catch((e) => fail(`the viewer rejected a canonical text: ${String(e)}`));
          if (exportOrFail(v, "on the viewer") !== text)
            fail("the viewer's export is not the canonical text");
        }
        const doc = v.exportText();
        const ids = sortedIds(v);
        if (v.elements) {
          const firstId = v.elements.list()[0]?.id;
          if (firstId !== undefined) {
            const deliveries: string[][] = [];
            const offSel = v.elements.onSelection((s) => deliveries.push([...s]));
            if (v.elements.reveal(firstId) !== true)
              fail("the viewer's reveal(known id) must return true");
            await (h.settle ?? defaultSettle)();
            if (!deliveries.some((d) => d.includes(firstId)))
              fail("the viewer's reveal delivered no selection containing the id");
            if (!v.elements.selection().includes(firstId))
              fail("the viewer's selection() does not contain the revealed id");
            offSel();
          }
          if (v.elements.reveal("__modeler_api_no_such_id__") !== false)
            fail("the viewer's reveal(unknown id) must return false");
        }
        for (const bad of h.invalidTexts ?? []) {
          await v.importText(bad).then(
            () => fail("the viewer resolved a non-importable input — it must REJECT"),
            () => undefined,
          );
          if (v.exportText() !== doc) fail("a rejected import changed the viewer's document");
          if (ids && !same(ids, sortedIds(v)))
            fail("a rejected import changed the viewer's rendered elements");
        }
        await foreignRoundTrips(h, v, "the viewer's ");
        if (h.viewState !== undefined) {
          const text = await importContentText(h, v);
          const fitted = v.getViewState();
          assertFinite(fitted, "on the viewer after import");
          v.setViewState(h.viewState);
          const applied = v.getViewState();
          if (same(applied, fitted)) fail("the viewer's setViewState had no effect");
          await v.importText(text);
          if (!same(v.getViewState(), fitted))
            fail("the viewer's import must leave the view fitted (L5)");
          v.setViewState(applied);
          if (!same(v.getViewState(), applied))
            fail("setting the viewer's own readback did not yield that readback");
        }
        await (h.settle ?? defaultSettle)();
        if (calls > 0)
          fail(`the viewer fired onContentChanged ${calls}x — a viewer never changes content`);
      } finally {
        off();
      }
    } finally {
      v.destroy();
      v.destroy();
    }
  },
};
