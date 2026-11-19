import type { CollaborativeModeler, ElementBounds, ElementsSurface } from "../index.js";
import type { ConformanceCase } from "./harness.js";
import {
  changeEvents,
  defaultSettle,
  exportOrFail,
  fail,
  importOrFail,
  same,
  skip,
} from "./support.js";

type BoundedElements = ElementsSurface & { bounds(id: string): ElementBounds | undefined };

const hasBounds = (elements: ElementsSurface): elements is BoundedElements =>
  typeof elements.bounds === "function";

const isFiniteBox = (box: ElementBounds | undefined): box is ElementBounds =>
  box !== undefined &&
  [box.x, box.y, box.width, box.height].every((n) => typeof n === "number" && Number.isFinite(n)) &&
  box.width >= 0 &&
  box.height >= 0;

const describeBox = (box: ElementBounds | undefined): string =>
  box === undefined
    ? "undefined"
    : `{ x: ${box.x}, y: ${box.y}, width: ${box.width}, height: ${box.height} }`;

type ContentBounded = CollaborativeModeler & { contentBounds(): ElementBounds | undefined };

const hasContentBounds = (m: CollaborativeModeler): m is ContentBounded =>
  typeof m.contentBounds === "function";

/**
 * how far a content edge may fall short of an element's edge: a box measured on the live SVG
 * (`getBBox`) comes back in float32, which rounds 123.4 to 123.4000015…, and that rounding grows
 * with the coordinate. A thousandth of a unit, or 2^-20 of the edge where that is more, stays far
 * below a pixel and far below what a stale or unsized box misses by
 */
const edgeTolerance = (edge: number): number => Math.max(1e-3, Math.abs(edge) * 2 ** -20);

const covers = (outer: ElementBounds, inner: ElementBounds): boolean => {
  const right = outer.x + outer.width;
  const bottom = outer.y + outer.height;
  return (
    inner.x >= outer.x - edgeTolerance(outer.x) &&
    inner.y >= outer.y - edgeTolerance(outer.y) &&
    inner.x + inner.width <= right + edgeTolerance(right) &&
    inner.y + inner.height <= bottom + edgeTolerance(bottom)
  );
};

function contentBoxOf(m: ContentBounded, when: string): ElementBounds | undefined {
  let box: ElementBounds | undefined;
  try {
    box = m.contentBounds();
  } catch (e) {
    fail(`contentBounds() threw ${when}: ${String(e)}`);
  }
  if (box === undefined) return undefined;
  if (!isFiniteBox(box)) {
    fail(
      `contentBounds() ${when} is ${describeBox(box)} — the content box must be finite with a non-negative size, or undefined when there is nothing to fit`,
    );
  }
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

/**
 * the content box around everything the elements surface lists: defined as
 * soon as one element is listed, and around each element's own box. An
 * element box that is itself broken is the bounds case's failure, not this one's
 */
function expectContentAroundElements(m: ContentBounded, when: string): ElementBounds | undefined {
  const box = contentBoxOf(m, when);
  const listed = m.elements?.list() ?? [];
  if (box === undefined) {
    if (listed.length > 0) {
      fail(
        `contentBounds() ${when} is undefined while elements.list() reports ${listed.length} element(s) — undefined means there is nothing to fit`,
      );
    }
    return undefined;
  }
  if (m.elements && hasBounds(m.elements)) {
    for (const { id } of listed) {
      const element = m.elements.bounds(id);
      if (!isFiniteBox(element)) continue;
      if (!covers(box, element)) {
        fail(
          `contentBounds() ${when} is ${describeBox(box)}, which does not cover elements.bounds('${id}') = ${describeBox(element)} — the content box holds every element (and reads the live canvas)`,
        );
      }
    }
  }
  return box;
}

function boxesOf(elements: BoundedElements, when: string): Map<string, ElementBounds> {
  const boxes = new Map<string, ElementBounds>();
  for (const { id } of elements.list()) {
    const box = elements.bounds(id);
    if (!isFiniteBox(box)) {
      fail(
        `elements.bounds('${id}') ${when} is ${describeBox(box)} — every listed id must give a finite box with a non-negative size`,
      );
    }
    boxes.set(id, { x: box.x, y: box.y, width: box.width, height: box.height });
  }
  return boxes;
}

const lettersAndDigits = (value: string): string =>
  value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const namesById = (m: CollaborativeModeler): Map<string, string | undefined> | undefined =>
  m.elements ? new Map(m.elements.list().map((e) => [e.id, e.name])) : undefined;

export const elementsCases: ConformanceCase[] = [
  {
    name: "elements (when present): stable ids across re-imports and unrelated edits, reveal and selection semantics",
    async run(h) {
      const m = await h.create();
      try {
        const text = h.canonicalTexts[0] ?? "";
        await m.importText(text);
        const elements = m.elements;
        if (!elements)
          return skip("the modeler exposes no elements surface (optional) — nothing to verify");
        const ids = elements.list().map((e) => e.id);
        if (new Set(ids).size !== ids.length) fail("element ids are not unique");
        await m.importText(text);
        const again = elements.list().map((e) => e.id);
        if (!same([...ids].sort(), [...again].sort()))
          fail("element ids are not stable across re-imports of the same text");
        if (elements.reveal("__modeler_api_no_such_id__") !== false)
          fail("reveal(unknown id) must return false");
        const firstId = ids[0];
        if (firstId !== undefined) {
          const deliveries: string[][] = [];
          const off = elements.onSelection((selected) => deliveries.push([...selected]));
          const { calls } = await changeEvents(h, m, () => {
            if (elements.reveal(firstId) !== true) fail("reveal(known id) must return true");
          });
          if (calls > 0)
            fail("reveal fired onContentChanged — revealing is view behavior, not an edit");
          if (!deliveries.some((d) => d.includes(firstId))) {
            fail(
              `reveal('${firstId}') delivered no selection containing the id — is it a selectable element (not a root or a label)?`,
            );
          }
          for (const d of deliveries) {
            for (const id of d) {
              if (!again.includes(id)) {
                fail(
                  `onSelection reported an id that is not an element: '${id}' (label ids must resolve to their target)`,
                );
              }
            }
          }
          if (!elements.selection().includes(firstId))
            fail("selection() does not contain the revealed id");
          const seen = deliveries.length;
          off();
          // a DIFFERENT selection after the unsubscribe — re-revealing the
          // same id would be deduplicated by many engines and prove nothing
          const otherId = ids[1];
          if (otherId !== undefined) elements.reveal(otherId);
          else await h.mutate(m);
          await (h.settle ?? defaultSettle)();
          if (deliveries.length !== seen) fail("onSelection delivered after unsubscribe");
        }
        // an edit to ANOTHER element must not renumber existing ids: every id
        // still exists AND (where the notation has names) still names the
        // same element — a positional scheme keeps the id strings while
        // shifting what they point at
        const namesBefore = new Map(elements.list().map((e) => [e.id, e.name]));
        await h.mutate(m);
        await (h.settle ?? defaultSettle)();
        const afterEdit = new Map(elements.list().map((e) => [e.id, e.name]));
        if (afterEdit.size <= namesBefore.size) {
          fail(
            "the harness mutate must ADD an element (the elements case verifies ids under an unrelated edit)",
          );
        }
        for (const [id, name] of namesBefore) {
          if (!afterEdit.has(id)) {
            fail(
              `element id '${id}' vanished after an unrelated edit — ids must survive edits to other elements`,
            );
          }
          if (name !== undefined && afterEdit.get(id) !== name) {
            fail(
              `element id '${id}' names a different element after an unrelated edit ('${name}' → '${String(afterEdit.get(id))}')`,
            );
          }
        }
      } finally {
        m.destroy();
      }
    },
  },
  {
    name: "elements (when present): ids and names survive export → import, in this and in a fresh instance",
    async run(h) {
      const m = await h.create();
      const others: CollaborativeModeler[] = [];
      try {
        await m.importText(h.canonicalTexts[0] ?? "");
        const elements = m.elements;
        if (!elements)
          return skip("the modeler exposes no elements surface (optional) — nothing to verify");
        // the element the session just created is the one an in-memory id
        // scheme gives away: its id was never read back from a text
        await h.mutate(m);
        await (h.settle ?? defaultSettle)();
        const session = new Map(elements.list().map((e) => [e.id, e.name]));
        const exported = exportOrFail(m, "after a user mutation");
        const expectSessionIds = (target: CollaborativeModeler, where: string): void => {
          const after = namesById(target);
          if (!after) fail(`${where} exposes no elements surface — the editor does`);
          for (const [id, name] of session) {
            if (!after.has(id)) {
              fail(
                `element id '${id}' is gone after export → import ${where} — the id a session reports must be the element's id in the document (write it back)`,
              );
            }
            // an empty name and an absent one are the same across the
            // serializer: the contract fixes ids, not how a parser reports
            // an element without a label
            if (name !== undefined && (after.get(id) ?? "") !== name) {
              fail(
                `element id '${id}' names a different element after export → import ${where} ('${name}' → '${String(after.get(id))}')`,
              );
            }
          }
        };
        await importOrFail(m, exported, "importText rejected the modeler's own export");
        expectSessionIds(m, "into the same instance");
        const fresh = await h.create();
        others.push(fresh);
        await importOrFail(fresh, exported, "a fresh instance rejected the modeler's own export");
        expectSessionIds(fresh, "into a fresh instance");
        if (h.createReadonly) {
          const viewer = await h.createReadonly();
          others.push(viewer);
          await importOrFail(viewer, exported, "the viewer rejected the editor's export");
          if (viewer.elements) expectSessionIds(viewer, "into the viewer");
        }
      } finally {
        m.destroy();
        for (const other of others) other.destroy();
      }
    },
  },
  {
    name: "elements (when present, recommended): ids created on two peers at the same time do not collide",
    async run(h) {
      const text = h.canonicalTexts[0] ?? "";
      const peers: CollaborativeModeler[] = [];
      try {
        const created: Array<Map<string, string | undefined>> = [];
        for (let count = 0; count < 2; count += 1) {
          const peer = await h.create();
          peers.push(peer);
          await peer.importText(text);
          if (!peer.elements)
            return skip("the modeler exposes no elements surface (optional) — nothing to verify");
          const before = new Set(peer.elements.list().map((e) => e.id));
          await h.mutate(peer);
          await (h.settle ?? defaultSettle)();
          const added = new Map(
            peer.elements
              .list()
              .filter((e) => !before.has(e.id))
              .map((e) => [e.id, e.name]),
          );
          if (added.size === 0) {
            fail(
              "the harness mutate must ADD an element (the elements cases compare the ids two instances allocate)",
            );
          }
          created.push(added);
        }
        const [
          onFirst = new Map<string, string | undefined>(),
          onSecond = new Map<string, string | undefined>(),
        ] = created;
        const shared = [...onFirst.keys()].filter((id) => onSecond.has(id));
        // an id derived from the content (OWM's component_<slug>) collides
        // when both peers create the same named element — by design, and the
        // merge reconciles identical content anyway; only an id allocated
        // regardless of the content is the recommendation's concern. An id
        // that spells out its element's name counts as derived from it
        const derivedFromContent = (id: string): boolean => {
          const name = onFirst.get(id) ?? "";
          if (name === "" || name !== (onSecond.get(id) ?? "")) return false;
          const spelled = lettersAndDigits(name);
          return spelled !== "" && lettersAndDigits(id).includes(spelled);
        };
        const allocated = shared.filter((id) => !derivedFromContent(id));
        const quoted = (ids: string[]): string => ids.map((id) => `'${id}'`).join(", ");
        if (allocated.length > 0) {
          return {
            advisories: [
              `two instances that imported the same document and each created one element, not of the same name, allocated the same id (${quoted(allocated)}) — RECOMMENDED: allocate ids for new elements that do not collide across peers (random or peer-scoped, not a per-instance counter); once both edits merge, two elements share one id`,
            ],
          };
        }
        if (shared.length > 0) {
          return skip(
            `both instances created an element of the same name and allocated the same id, one derived from that name (${quoted(shared)}) — such ids collide for identical content by design, so the check is inconclusive: let mutate's elements differ in content (a counter the harness shares across instances)`,
          );
        }
      } finally {
        for (const peer of peers) peer.destroy();
      }
    },
  },
  {
    name: "elements.bounds (when present): a finite box in diagram coordinates for every listed id, undefined for an unknown one, live after a new element and a move",
    async run(h) {
      const text = h.canonicalTexts[0] ?? "";
      const settle = h.settle ?? defaultSettle;
      const m = await h.create();
      let viewer: CollaborativeModeler | undefined;
      try {
        await m.importText(text);
        const elements = m.elements;
        if (!elements)
          return skip("the modeler exposes no elements surface (optional) — nothing to verify");
        if (!hasBounds(elements))
          return skip("the modeler exposes no elements.bounds (optional) — nothing to verify");
        boxesOf(elements, "after an import");
        if (elements.bounds("__modeler_api_no_such_id__") !== undefined)
          fail("elements.bounds(unknown id) must return undefined");
        // what a box cached at the last import gives away: an element the
        // session created has none, a moved one keeps its old position
        const imported = new Set(elements.list().map((e) => e.id));
        await h.mutate(m);
        await settle();
        for (const { id } of elements.list().filter((e) => !imported.has(e.id))) {
          const box = elements.bounds(id);
          if (!isFiniteBox(box)) {
            fail(
              `elements.bounds('${id}') of an element created in the session is ${describeBox(box)} — bounds must read the live canvas, not the last import`,
            );
          }
        }
        const unverified: string[] = [];
        if (h.moveElement) {
          const before = boxesOf(elements, "before a move");
          const movedId = await h.moveElement(m);
          await settle();
          const was = before.get(movedId);
          if (was === undefined)
            fail(
              `moveElement returned '${movedId}', an id elements.list() did not report before the move`,
            );
          const box = boxesOf(elements, "after a move").get(movedId);
          if (box === undefined)
            fail(`'${movedId}' is gone from elements.list() after moveElement moved it`);
          if (box.x === was.x && box.y === was.y) {
            fail(
              `elements.bounds('${movedId}') did not follow a move made through the modeler's own commands (still ${describeBox(was)}) — bounds must read the live canvas, not the last import (or moveElement did not move the element)`,
            );
          }
        } else {
          unverified.push("moveElement is undefined — that a box follows a move was not verified");
        }
        if (h.viewState !== undefined) {
          const atRest = boxesOf(elements, "before a view change");
          m.setViewState(h.viewState);
          for (const [id, box] of boxesOf(elements, "after setViewState")) {
            if (!same(box, atRest.get(id))) {
              fail(
                `elements.bounds('${id}') changed with the view (${describeBox(atRest.get(id))} → ${describeBox(box)}) — boxes are in diagram coordinates, which zoom and scroll leave alone`,
              );
            }
          }
        } else {
          unverified.push(
            "viewState is undefined — that boxes are independent of the view was not verified",
          );
        }
        if (h.createReadonly) {
          viewer = await h.createReadonly();
          await importOrFail(viewer, text, "the viewer rejected canonicalTexts[0]");
          if (viewer.elements && hasBounds(viewer.elements)) {
            boxesOf(viewer.elements, "on the viewer after an import");
            if (viewer.elements.bounds("__modeler_api_no_such_id__") !== undefined)
              fail("the viewer's elements.bounds(unknown id) must return undefined");
          }
        }
        if (unverified.length > 0) return skip(unverified.join("; "));
      } finally {
        m.destroy();
        viewer?.destroy();
      }
    },
  },
  {
    name: "contentBounds (when present): a finite box in diagram coordinates around every listed element, live after a new element, unchanged by zoom and scroll",
    async run(h) {
      const settle = h.settle ?? defaultSettle;
      const m = await h.create();
      let viewer: CollaborativeModeler | undefined;
      try {
        if (!hasContentBounds(m))
          return skip("the modeler exposes no contentBounds (optional, 1.3) — nothing to verify");
        contentBoxOf(m, "before the first import");
        for (const [index, text] of h.canonicalTexts.entries()) {
          await importOrFail(m, text, `importText(canonicalTexts[${index}]) rejected`);
          expectContentAroundElements(m, `after importing canonicalTexts[${index}]`);
        }
        // a box cached at the last import gives itself away here: the
        // element the session created lies outside it, or it has none
        await importOrFail(m, h.canonicalTexts[0] ?? "", "importText(canonicalTexts[0]) rejected");
        await h.mutate(m);
        await settle();
        const atRest = expectContentAroundElements(m, "after a user mutation added an element");
        const unverified: string[] = [];
        if (h.viewState !== undefined) {
          m.setViewState(h.viewState);
          const viewed = contentBoxOf(m, "after setViewState");
          if (!same(viewed, atRest)) {
            fail(
              `contentBounds() changed with the view (${describeBox(atRest)} → ${describeBox(viewed)}) — the content box is in diagram coordinates, which zoom and scroll leave alone`,
            );
          }
        } else {
          unverified.push(
            "viewState is undefined — that the content box is independent of the view was not verified",
          );
        }
        if (!m.elements || !hasBounds(m.elements)) {
          unverified.push(
            "the modeler exposes no elements.bounds — that the content box covers every element was not verified",
          );
        }
        if (h.createReadonly) {
          viewer = await h.createReadonly();
          if (hasContentBounds(viewer)) {
            contentBoxOf(viewer, "on the viewer before the first import");
            await importOrFail(
              viewer,
              h.canonicalTexts[0] ?? "",
              "the viewer rejected canonicalTexts[0]",
            );
            expectContentAroundElements(viewer, "on the viewer after an import");
          }
        }
        if (unverified.length > 0) return skip(unverified.join("; "));
      } finally {
        m.destroy();
        viewer?.destroy();
      }
    },
  },
];
