#!/usr/bin/env node
// Seeded edit sequences on Big Bank and five vendored fixtures (SPEC 9.1 "Edit acceptance"). The
// unit tests run the generator on the sources; run directly, it writes the results of the first
// 200 seeds as `seed-NNNN.dsl` into a folder for the snapshot script's `--edits` mode, which
// parses each with Structurizr 6.2.4. Build the package first (`npm run build -w packages/dsl`).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FUZZ_BASES = [
  "big-bank-plc.dsl",
  "financial-risk-system.dsl",
  "groups.dsl",
  "hierarchical-identifiers.dsl",
  "this.dsl",
  "views-without-keys.dsl",
];

export const ACCEPTANCE_SEEDS = 200;

const STATIC_TYPES = new Set(["systemLandscape", "systemContext", "container", "component"]);
const WORDS = [
  "Billing",
  "Orders",
  "Search",
  "Mail",
  "Ledger",
  "Portal",
  "Gateway",
  "Cache",
  "Queue",
  "Reports",
];
const TEXTS = [
  "Handles the money.",
  'Says "hello" to everyone.',
  "Two lines,\nnot one.",
  "Café and naïve, ünïcödé.",
  "",
  "Uses # and // inside a string.",
  "Ends with a brace {",
];
const TECHNOLOGIES = ["Java", "Kotlin", "JSON/HTTPS", "", "PostgreSQL"];
const KINDS_BY_VIEW = {
  systemLandscape: ["person", "softwareSystem"],
  systemContext: ["person", "softwareSystem"],
  container: ["person", "softwareSystem", "container"],
  component: ["person", "softwareSystem", "container", "component"],
};

/** Mulberry32: small, seeded, the same numbers in Node and in every test run. */
export function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, items) {
  return items.length === 0 ? undefined : items[Math.floor(random() * items.length)];
}

function suffixes(random) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  return () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
}

/** The boxes a scene would show: stored ones, else a grid in document order. */
function boxesFor(api, workspace, entry) {
  const boxes = new Map();
  if (entry === undefined || !STATIC_TYPES.has(entry.type)) return boxes;
  const members = api.viewMembers(workspace, entry);
  const stored = entry.definition?.layout.elements ?? new Map();
  members.elements.forEach((id, index) => {
    const element = workspace.elements.find((candidate) => candidate.id === id);
    const size =
      element?.kind === "person" ? { width: 216, height: 216 } : { width: 240, height: 160 };
    const box = stored.get(id);
    boxes.set(id, {
      x: box?.x ?? (index % 5) * 320,
      y: box?.y ?? Math.floor(index / 5) * 280,
      width: box?.width ?? size.width,
      height: box?.height ?? size.height,
    });
  });
  return boxes;
}

function pickEdit(random, api, workspace, entry) {
  const catalog = api.viewCatalog(workspace);
  const editable = entry !== undefined && entry.editable && STATIC_TYPES.has(entry.type);
  const members = editable
    ? api.viewMembers(workspace, entry)
    : { elements: [], relationships: [] };
  const element = () =>
    pick(
      random,
      members.elements.length > 0 && random() < 0.8
        ? members.elements
        : workspace.elements.map((item) => item.id),
    );
  const explicit = workspace.relationships.filter((relationship) => !relationship.implied);
  const roll = random();
  if (roll < 0.16 && editable) {
    const kind = pick(random, KINDS_BY_VIEW[entry.type]);
    const named = random() < 0.5;
    const name = named ? { name: `${pick(random, WORDS)} ${Math.floor(random() * 90) + 10}` } : {};
    const tags = kind === "container" && random() < 0.3 ? { tags: ["Database"] } : {};
    const center = { x: Math.round(random() * 1200), y: Math.round(random() * 800) };
    // An append derives from the centre and draws no number, so every other edit keeps its seed.
    const appends = center.x % 3 === 0 && members.elements.length > 0;
    const connectFrom = appends
      ? { connectFrom: members.elements[center.y % members.elements.length] }
      : {};
    const placed = appends && center.y % 2 === 0 ? {} : { center };
    return { type: "createElement", kind, ...name, ...tags, ...placed, ...connectFrom };
  }
  if (roll < 0.28 && editable) {
    const sourceId = pick(random, members.elements);
    const destinationId = pick(
      random,
      members.elements.filter((id) => id !== sourceId),
    );
    if (sourceId === undefined || destinationId === undefined) return undefined;
    return {
      type: "createRelationship",
      sourceId,
      destinationId,
      ...(random() < 0.6 ? { description: pick(random, TEXTS) } : {}),
      ...(random() < 0.3 ? { technology: pick(random, TECHNOLOGIES) } : {}),
    };
  }
  if (roll < 0.42) {
    const id = element();
    if (id === undefined) return undefined;
    const fields = {};
    const choice = random();
    if (choice < 0.3) fields.name = `${pick(random, WORDS)} ${pick(random, WORDS)}`;
    else if (choice < 0.55) fields.description = pick(random, TEXTS);
    else if (choice < 0.7) fields.technology = pick(random, TECHNOLOGIES);
    else if (choice < 0.85)
      fields.tags = random() < 0.3 ? [] : [pick(random, WORDS), pick(random, WORDS)];
    else
      fields.url =
        random() < 0.3 ? null : `https://example.com/${pick(random, WORDS).toLowerCase()}`;
    return { type: "updateElement", id, fields };
  }
  if (roll < 0.48) {
    const relationship = pick(random, explicit);
    if (relationship === undefined) return undefined;
    return {
      type: "updateRelationship",
      key: relationship.canvasKey,
      fields:
        random() < 0.6
          ? { description: `${pick(random, TEXTS)} ${Math.floor(random() * 100)}` }
          : { technology: pick(random, TECHNOLOGIES) },
    };
  }
  if (roll < 0.54) {
    const id = element();
    if (id === undefined) return undefined;
    return {
      type: "renameIdentifier",
      id,
      identifier: `${pick(random, WORDS).toLowerCase()}${Math.floor(random() * 1000)}`,
    };
  }
  if (roll < 0.66 && editable && members.elements.length > 0) {
    const boxes = boxesFor(api, workspace, entry);
    const moved = new Map();
    for (const id of members.elements) {
      if (random() < 0.4) {
        const box = boxes.get(id);
        moved.set(id, {
          ...box,
          x: box.x + Math.round(random() * 200 - 100),
          y: box.y + Math.round(random() * 200 - 100),
          ...(random() < 0.2 ? { width: 320, height: 200 } : {}),
        });
      }
    }
    const vertices = new Map();
    const relationship = pick(random, members.relationships);
    if (relationship !== undefined && random() < 0.4) {
      vertices.set(
        relationship,
        random() < 0.3 ? null : [{ x: Math.round(random() * 600), y: Math.round(random() * 600) }],
      );
    }
    return { type: "setLayout", boxes: moved, vertices };
  }
  if (roll < 0.74 && editable) {
    const ids = members.elements.filter(() => random() < 0.25);
    const relationships = members.relationships.filter(() => random() < 0.15);
    return { type: "smartDelete", ids, relationships };
  }
  if (roll < 0.78) {
    const id = element();
    return id === undefined ? undefined : { type: "deleteFromModel", ids: [id], relationships: [] };
  }
  if (roll < 0.82 && editable) {
    const ids = members.elements.filter(() => random() < 0.2);
    const relationships = members.relationships.filter(() => random() < 0.2);
    return { type: "removeFromView", ids, relationships };
  }
  if (roll < 0.85 && editable) {
    const allowed = new Set([...KINDS_BY_VIEW[entry.type], "custom"]);
    const candidates = workspace.elements.filter(
      (item) => allowed.has(item.kind) && !members.elements.includes(item.id),
    );
    const chosen = pick(random, candidates);
    return chosen === undefined ? undefined : { type: "includeInView", ids: [chosen.id] };
  }
  if (roll < 0.88) {
    const type = pick(random, ["systemLandscape", "systemContext", "container", "component"]);
    const scopes = workspace.elements.filter(
      (item) => item.kind === (type === "component" ? "container" : "softwareSystem"),
    );
    const scope = type === "systemLandscape" ? undefined : pick(random, scopes);
    if (type !== "systemLandscape" && scope === undefined) return undefined;
    return {
      type: "createView",
      viewType: type,
      ...(scope ? { scopeId: scope.id } : {}),
      ...(random() < 0.5 ? { title: `${pick(random, WORDS)} view` } : {}),
    };
  }
  if (roll < 0.91) {
    const target = pick(
      random,
      catalog.list().filter((item) => item.editable),
    );
    if (target === undefined) return undefined;
    return {
      type: "updateView",
      key: target.key,
      fields:
        random() < 0.5
          ? { title: random() < 0.2 ? null : `${pick(random, WORDS)} diagram` }
          : { description: random() < 0.2 ? null : pick(random, TEXTS) },
    };
  }
  if (roll < 0.93) {
    const target = pick(random, workspace.views);
    return target === undefined ? undefined : { type: "deleteView", key: target.key };
  }
  if (roll < 0.95) return { type: "clearLayout" };
  if (roll < 0.98) {
    return {
      type: "updateWorkspace",
      fields:
        random() < 0.5
          ? { name: `${pick(random, WORDS)} workspace` }
          : { description: pick(random, TEXTS) },
    };
  }
  return { type: "applyC4Colours" };
}

function pickView(random, api, workspace, current) {
  const entries = api
    .viewCatalog(workspace)
    .list()
    .filter((entry) => entry.editable);
  return pick(random, entries)?.key ?? current;
}

/**
 * One seeded sequence of edits on one base text. `api` is the package's own exports, from the
 * sources in the tests and from `dist` here: `parseWorkspace`, `applyEdit`, `viewCatalog`,
 * `viewMembers`.
 */
export function runFuzzSequence(seed, api, bases, length = 5) {
  const random = prng(Math.imul(seed, 2654435761) >>> 0);
  const base = bases[seed % bases.length];
  let document = api.parseWorkspace(base.text);
  let view = api.viewCatalog(document.workspace).defaultView().key;
  let fresh = new Set();
  const steps = [];
  for (let step = 0; step < length; step += 1) {
    if (random() < 0.3) view = pickView(random, api, document.workspace, view);
    const entry = api.viewCatalog(document.workspace).resolve(view);
    const edit = pickEdit(random, api, document.workspace, entry);
    if (edit === undefined) continue;
    const context = {
      view,
      boxes: boxesFor(api, document.workspace, entry),
      vertices: new Map(),
      fresh,
      identifiers: random() < 0.2 ? "collision-free" : "readable",
      random: suffixes(random),
    };
    const outcome = api.applyEdit(document, edit, context);
    steps.push({ before: document, view, edit, outcome });
    if (outcome.ok) {
      document = outcome.document;
      view = outcome.view;
      fresh = new Set(outcome.fresh);
    }
  }
  return { base: base.name, text: document.text, steps };
}

export function readBases(fixtures) {
  return FUZZ_BASES.map((name) => ({ name, text: readFileSync(join(fixtures, name), "utf8") }));
}

export function fuzzFileName(seed) {
  return `seed-${String(seed).padStart(4, "0")}.dsl`;
}

async function main() {
  const folder = process.argv[2];
  if (folder === undefined) {
    console.error("usage: node packages/dsl/scripts/write-fuzz-outputs.mjs <folder>");
    process.exit(2);
  }
  const here = import.meta.dirname;
  const dsl = await import(pathToFileURL(resolve(here, "..", "dist", "index.js")).href);
  const model = await import("@miragon/c4-schema-model");
  const api = {
    parseWorkspace: dsl.parseWorkspace,
    applyEdit: dsl.applyEdit,
    viewCatalog: model.viewCatalog,
    viewMembers: model.viewMembers,
  };
  const bases = readBases(resolve(here, "..", "test", "fixtures", "structurizr"));
  mkdirSync(folder, { recursive: true });
  for (let seed = 1; seed <= ACCEPTANCE_SEEDS; seed += 1) {
    writeFileSync(join(folder, fuzzFileName(seed)), runFuzzSequence(seed, api, bases).text);
  }
  console.log(`wrote ${ACCEPTANCE_SEEDS} fuzz outputs to ${folder}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
