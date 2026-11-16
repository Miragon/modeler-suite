/**
 * The repositories the bench measures: boards of many model nodes, made from the seven models
 * of `modelers/board/example`, each node on a copy of its model under a path of its own. The
 * same call gives the same bytes: nothing here is random, and nothing it writes is committed.
 *
 * This file imports nothing of the workspace, so Node runs it as it is:
 *
 *     node modelers/board/e2e/bench/generate.ts <folder>          # the ten boards
 *     node modelers/board/e2e/bench/generate.ts <folder> large    # and the large repository
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** One notation of the suite with the example's model of it, in the order of the suffix table. */
export interface BenchNotation {
  readonly notation: string;
  /** the example's file, relative to the example folder */
  readonly source: string;
  /** the name a copy starts with */
  readonly stem: string;
  /** with the dot: what a copy's name ends in */
  readonly suffix: string;
}

export const BENCH_NOTATIONS: readonly BenchNotation[] = [
  { notation: "wardley", source: "models/tea.owm", stem: "tea", suffix: ".owm" },
  {
    notation: "event-storming",
    source: "models/order-checkout.storm",
    stem: "order-checkout",
    suffix: ".storm",
  },
  { notation: "team-topologies", source: "models/sample.tt", stem: "teams", suffix: ".tt" },
  { notation: "context-maps", source: "models/sample.cm", stem: "contexts", suffix: ".cm" },
  { notation: "value-chain", source: "models/porter.vc.json", stem: "porter", suffix: ".vc.json" },
  { notation: "c4", source: "models/bookshop.c4", stem: "bookshop", suffix: ".c4" },
  {
    notation: "business-model-canvas",
    source: "models/miragon.bmc",
    stem: "miragon",
    suffix: ".bmc",
  },
];

const PICTURE = "assets/miragon-komet-blau.svg";

/** The example's node size and the room between two nodes, as `example/example.board` has them. */
const NODE = { width: 800, height: 540 } as const;
const STEP = { x: 880, y: 640 } as const;

/** The files of the example folder the generator copies, by their path in it. */
export type ExampleFiles = Readonly<Record<string, string>>;

export function readExample(folder: string): ExampleFiles {
  const paths = [...BENCH_NOTATIONS.map((entry) => entry.source), PICTURE];
  return Object.fromEntries(paths.map((path) => [path, readFileSync(join(folder, path), "utf8")]));
}

export interface BenchModelNode {
  readonly id: string;
  readonly file: string;
  readonly notation: string;
}

/** One generated repository: a board file and the files its nodes show. */
export interface BenchRepository {
  /** the folder's name and the board file's stem: `models-60`, `wardley-10` */
  readonly name: string;
  /** the board file's path in the repository */
  readonly boardFile: string;
  readonly board: string;
  /** every other file by its repository-relative path; each is a text, the picture an SVG */
  readonly files: Readonly<Record<string, string>>;
  /** the model nodes in the order of the grid, row by row */
  readonly modelNodes: readonly BenchModelNode[];
  /** every node the board draws: models, notes, the group and the picture */
  readonly nodeCount: number;
  readonly arrowCount: number;
}

export interface BoardOptions {
  /** how many model nodes */
  readonly models: number;
  /** one notation alone; absent: the seven in equal shares, one after the other */
  readonly notation?: string | undefined;
}

const padded = (value: number, width: number): string => String(value).padStart(width, "0");

// Keys of one width from letters alone, so that plain string order is the order of the nodes and
// none ends in the lowest digit of a fractional index, below which no key fits.
const ORDER_LETTERS = "bcdefghijklmnopqrstuvwxy";
function orderKey(index: number): string {
  const base = ORDER_LETTERS.length;
  const letter = (digit: number): string => ORDER_LETTERS.charAt(digit % base);
  return `${letter(Math.floor(index / (base * base)))}${letter(Math.floor(index / base))}${letter(index)}`;
}

/** Object keys sorted at every depth: the board's canonical form, as `encodeBoard` writes it. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = canonical((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function boardText(title: string, elements: Readonly<Record<string, object>>): string {
  const header = { format: "structured-model", version: 1, meta: { title, version: 1 } };
  const lines = [
    JSON.stringify(canonical(header)),
    ...Object.keys(elements)
      .sort()
      .map((id) => JSON.stringify(canonical({ ...elements[id], id }))),
  ];
  return `${lines.join("\n")}\n`;
}

function notationsOf(options: BoardOptions): readonly BenchNotation[] {
  if (options.notation === undefined) return BENCH_NOTATIONS;
  const one = BENCH_NOTATIONS.find((entry) => entry.notation === options.notation);
  if (!one) throw new Error(`the bench knows no notation '${options.notation}'`);
  return [one];
}

interface Placed {
  readonly elements: Record<string, object>;
  next: number;
}

const place = (placed: Placed, id: string, attrs: object): void => {
  placed.elements[id] = { kind: "node", ...attrs, z: orderKey(placed.next++) };
};

/** The group above the grid with two notes and the picture, as the example has it. */
function placeLead(placed: Placed, models: number): void {
  place(placed, "n_about", {
    type: "group",
    text: "Start here",
    x: 0,
    y: -380,
    width: 1680,
    height: 300,
  });
  place(placed, "n_logo", {
    type: "image",
    file: PICTURE,
    parent: "n_about",
    x: 40,
    y: 80,
    width: 180,
    height: 180,
  });
  place(placed, "n_welcome", {
    type: "text",
    parent: "n_about",
    text: `## A board of ${models} models\n\nEvery model here is a file of this repository, drawn by its own modeler.\n\n- **Double-click** a model to edit it in place.\n- **Done**, or a zoom of the board, ends the editing.`,
    x: 260,
    y: 80,
    width: 660,
    height: 180,
  });
  place(placed, "n_files", {
    type: "text",
    color: "amber",
    parent: "n_about",
    text: "## Where an edit goes\n\nAn edit of a model is written into that model's own file. The board file stores where a file sits, never what is in it.",
    x: 960,
    y: 80,
    width: 680,
    height: 180,
  });
}

/**
 * A board of `options.models` model nodes on a grid at the example's node size, under a group
 * with two notes and a picture, with one more note per thirty models beside the grid and an
 * arrow from every tenth model to its neighbour.
 */
export function generateBoard(example: ExampleFiles, options: BoardOptions): BenchRepository {
  const { models } = options;
  if (!Number.isInteger(models) || models < 1) throw new Error("a board has one model or more");
  const notations = notationsOf(options);
  const name =
    options.notation === undefined ? `models-${models}` : `${options.notation}-${models}`;
  const columns = Math.ceil(Math.sqrt(models * 1.2));
  const files: Record<string, string> = { [PICTURE]: example[PICTURE] ?? "" };
  const placed: Placed = { elements: {}, next: 0 };
  placeLead(placed, models);

  const modelNodes: BenchModelNode[] = [];
  for (let index = 0; index < models; index++) {
    const entry = notations[index % notations.length];
    const text = entry && example[entry.source];
    if (!entry || text === undefined) throw new Error("the example folder lacks a model");
    const copy = Math.floor(index / notations.length) + 1;
    const file = `models/${entry.notation}/${entry.stem}-${padded(copy, 3)}${entry.suffix}`;
    files[file] = text;
    const id = `n_model_${padded(index + 1, 3)}`;
    modelNodes.push({ id, file, notation: entry.notation });
    place(placed, id, {
      type: "model",
      file,
      x: (index % columns) * STEP.x,
      y: Math.floor(index / columns) * STEP.y,
      ...NODE,
    });
  }

  const notes = Math.floor(models / 30);
  for (let index = 0; index < notes; index++) {
    place(placed, `n_note_${padded(index + 1, 2)}`, {
      type: "text",
      text: `Row ${index + 1}\n\nA note beside the models.`,
      x: -360,
      y: index * STEP.y,
      width: 280,
      height: 160,
    });
  }

  let arrowCount = 0;
  for (let index = 0; index + 1 < models; index += 10) {
    const [from, to] = [modelNodes[index], modelNodes[index + 1]];
    if (!from || !to) break;
    arrowCount += 1;
    placed.elements[`e_arrow_${padded(arrowCount, 2)}`] = {
      kind: "edge",
      source: from.id,
      target: to.id,
      sourceHandle: "right",
      targetHandle: "left",
      ...(index === 0 ? { label: "feeds" } : {}),
    };
  }

  return {
    name,
    boardFile: `${name}.board`,
    board: boardText(`Bench: ${models} models`, placed.elements),
    files,
    modelNodes,
    nodeCount: placed.next,
    arrowCount,
  };
}

/** The boards the bench measures by default: three of all notations, and ten nodes of each. */
export function standardBoards(example: ExampleFiles): BenchRepository[] {
  return [
    ...[7, 60, 200].map((models) => generateBoard(example, { models })),
    ...BENCH_NOTATIONS.map(({ notation }) => generateBoard(example, { models: 10, notation })),
  ];
}

export interface LargeRepositoryOptions {
  /** how many model files, in equal shares of the seven notations */
  readonly models: number;
  /** how many files no board shows */
  readonly others: number;
}

const OTHER_SUFFIXES = [".ts", ".md", ".txt", ".css", ".yaml", ".html", ".java", ".py"] as const;

/**
 * A repository with many model files among many others, for the repository's side of a board:
 * the list a picker offers and a burst of file events. The models lie three folders deep, forty
 * to a folder, the others a hundred to a folder. The board shows the first seven models.
 */
export function generateLargeRepository(
  example: ExampleFiles,
  options: LargeRepositoryOptions,
): BenchRepository {
  const files: Record<string, string> = { [PICTURE]: example[PICTURE] ?? "" };
  const modelFiles: { file: string; notation: string }[] = [];
  for (let index = 0; index < options.models; index++) {
    const entry = BENCH_NOTATIONS[index % BENCH_NOTATIONS.length];
    const text = entry && example[entry.source];
    if (!entry || text === undefined) throw new Error("the example folder lacks a model");
    const folder = `domains/area-${padded(Math.floor(index / 400) + 1, 2)}/team-${padded((Math.floor(index / 40) % 10) + 1, 2)}`;
    const file = `${folder}/${entry.stem}-${padded(index + 1, 4)}${entry.suffix}`;
    files[file] = text;
    modelFiles.push({ file, notation: entry.notation });
  }
  for (let index = 0; index < options.others; index++) {
    const suffix = OTHER_SUFFIXES[index % OTHER_SUFFIXES.length] ?? ".txt";
    const folder = `src/package-${padded(Math.floor(index / 1000) + 1, 2)}/part-${padded((Math.floor(index / 100) % 10) + 1, 2)}`;
    files[`${folder}/file-${padded(index + 1, 5)}${suffix}`] = `file ${index + 1}\n`;
  }

  const placed: Placed = { elements: {}, next: 0 };
  const modelNodes: BenchModelNode[] = modelFiles.slice(0, 7).map(({ file, notation }, index) => {
    const id = `n_model_${padded(index + 1, 3)}`;
    place(placed, id, {
      type: "model",
      file,
      x: (index % 4) * STEP.x,
      y: Math.floor(index / 4) * STEP.y,
      ...NODE,
    });
    return { id, file, notation };
  });
  const name = `repository-${options.models}-${options.others}`;
  return {
    name,
    boardFile: `${name}.board`,
    board: boardText(`Bench: ${options.models} models in a repository`, placed.elements),
    files,
    modelNodes,
    nodeCount: placed.next,
    arrowCount: 0,
  };
}

/** Writes a repository into `folder`: the board file and every file its nodes show. */
export function writeRepository(folder: string, repository: BenchRepository): void {
  const all = { ...repository.files, [repository.boardFile]: repository.board };
  for (const [path, text] of Object.entries(all)) {
    const file = join(folder, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

/** The example folder beside this workspace, which the boards are made from. */
export const EXAMPLE_FOLDER = fileURLToPath(new URL("../../example/", import.meta.url));

const [script, target, extra] = process.argv.slice(1);
if (script !== undefined && script === fileURLToPath(import.meta.url)) {
  if (target === undefined) {
    console.error("Name the folder to write into: node generate.ts <folder> [large]");
    process.exit(1);
  }
  const example = readExample(EXAMPLE_FOLDER);
  const repositories = standardBoards(example);
  if (extra === "large") {
    repositories.push(generateLargeRepository(example, { models: 2000, others: 20_000 }));
  }
  for (const repository of repositories) {
    writeRepository(join(target, repository.name), repository);
    const count = Object.keys(repository.files).length + 1;
    console.log(`${repository.name}: ${repository.modelNodes.length} model nodes, ${count} files`);
  }
}
