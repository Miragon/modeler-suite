/**
 * The board's derived arrows (src/flow/derived-arrows.ts): the references a host lists between
 * files, mapped to the nodes that show those files.
 */
import assert from "node:assert/strict";
import { test } from "vitest";

import { derivedArrows } from "../src/flow/derived-arrows.js";
import type { BoardReference } from "../src/host/types.js";

const ORDER = "processes/order-to-cash.bpmn";
const INVOICE = "processes/subprocesses/invoice-handling.bpmn";
const CREDIT = "processes/credit-limit-check.dmn";

/** what a host reads out of order-to-cash: it calls invoice-handling and decides with credit-limit-check */
const REFERENCES: readonly BoardReference[] = [
  { from: ORDER, to: INVOICE, relation: "calls" },
  { from: ORDER, to: CREDIT, relation: "decides" },
];

test("an arrow runs from every node of the calling file to every node of the called file", () => {
  const nodes = [
    { id: "d-order", file: ORDER },
    { id: "d-order-2", file: ORDER },
    { id: "d-invoice", file: INVOICE },
    { id: "d-credit", file: CREDIT },
    { id: "d-credit-2", file: CREDIT },
    { id: "d-note" },
    { id: "d-image", file: "assets/sketch.svg" },
  ];
  assert.deepEqual(
    derivedArrows(REFERENCES, nodes).map((arrow) => arrow.id),
    [
      "derived:calls:d-order:d-invoice",
      "derived:calls:d-order-2:d-invoice",
      "derived:decides:d-order:d-credit",
      "derived:decides:d-order:d-credit-2",
      "derived:decides:d-order-2:d-credit",
      "derived:decides:d-order-2:d-credit-2",
    ],
  );
  assert.deepEqual(
    derivedArrows(REFERENCES, [{ id: "d-order", file: ORDER }]),
    [],
    "no node of the called file",
  );
  assert.deepEqual(
    derivedArrows(REFERENCES, [...nodes, ...nodes]).length,
    6,
    "once per pair and relation",
  );
});

test("an arrow carries the reference's relation and the two nodes it joins", () => {
  assert.deepEqual(
    derivedArrows(REFERENCES, [
      { id: "d-order", file: ORDER },
      { id: "d-credit", file: CREDIT },
    ]),
    [
      {
        id: "derived:decides:d-order:d-credit",
        source: "d-order",
        target: "d-credit",
        rel: "decides",
      },
    ],
  );
});

test("two relations between the same two files give two arrows, a repeated reference one", () => {
  const references: BoardReference[] = [
    { from: ORDER, to: CREDIT, relation: "decides" },
    { from: ORDER, to: CREDIT, relation: "calls" },
    { from: ORDER, to: CREDIT, relation: "decides" },
  ];
  assert.deepEqual(
    derivedArrows(references, [
      { id: "d-order", file: ORDER },
      { id: "d-credit", file: CREDIT },
    ]).map((arrow) => arrow.id),
    ["derived:decides:d-order:d-credit", "derived:calls:d-order:d-credit"],
  );
});

test("no reference and a node without a file give no arrow", () => {
  assert.deepEqual(derivedArrows([], [{ id: "d-order", file: ORDER }]), []);
  assert.deepEqual(
    derivedArrows(
      [{ from: ORDER, to: ORDER, relation: "calls" }],
      [{ id: "d-note" }, { id: "d-unnamed", file: undefined }],
    ),
    [],
  );
});
