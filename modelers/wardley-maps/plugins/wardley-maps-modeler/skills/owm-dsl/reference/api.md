# `@miragon/wardley-dsl`: API

```bash
npm install @miragon/wardley-dsl zod
```

DOM-free (no `diagram-js`, no `window` / `document`), so it runs in Node, a worker or the browser.
ESM and CommonJS builds, TypeScript types included. `zod` is a peer dependency: the map schema
must be the same instance as the consumer's; npm 7+ installs it automatically.

## Text ↔ map

```ts
import { parseDSL, parseDSLWithDiagnostics, serializeDSL } from "@miragon/wardley-dsl";

const map = parseDSL(owmText); // WardleyMap
const text = serializeDSL(map); // canonical text, trailing newline included
```

`parseDSL` never throws: every string yields a valid map. Lines it cannot use are kept verbatim
in `map.rawPassthrough`, and `parseDSLWithDiagnostics` reports every line it did not use as
written. Older releases could throw on a few malformed pipelines and numbers; keep a `try` /
`catch` if you must support them.

## Writing edits back into hand-written text

`serializeDSL` writes the canonical form: comments and unknown lines move to the end, blank lines
disappear, `0.80` becomes `0.8`. Where the text file is the source of truth (an editor, a file under
Git), write an edited map back with `patchDSL`:

```ts
import { parseDSL, patchDSL } from "@miragon/wardley-dsl";

const map = parseDSL(fileText);
// … move, rename, add or delete elements in a copy of `map` …
const newText = patchDSL(fileText, editedMap);
```

Untouched lines stay exactly as written (comments, blank lines, order, number format, line breaks).
Changed statements are rewritten in place, removed ones are deleted together with their links, and
a rename rewrites every line that references the old name. The result always reads back as the same
map as `serializeDSL(editedMap)`; when an edit cannot be patched into the source layout safely,
`patchDSL` returns the canonical text instead. It never throws.

## Checking generated text

A check for diagnostics and unknown lines:

```ts
const { map, diagnostics } = parseDSLWithDiagnostics(text);

for (const d of diagnostics) console.error(`${d.line}: ${d.message}\n  ${d.text}`);

const notUnderstood = (map.rawPassthrough ?? []).filter((entry) => !/^\s*(\/\/|\/\*)/.test(entry));
for (const entry of notUnderstood) console.error(`not understood: ${entry}`);
```

```ts
interface ParseDiagnostic {
  readonly line: number; // 1-based
  readonly message: string;
  readonly text: string; // the trimmed source line
}
```

A non-empty result does not mean the parse failed. The map is still usable; some lines just did not
become elements or links, or were changed. The messages are catalogued in `grammar.md`.
`notUnderstood` also catches the two passthrough lines that carry no diagnostic: a `url` definition
nothing references, and `pipeline X` without a range next to a `component X`. (The comment filter
only recognises the first line of a multi-line `/* … */`; prefer `//` comments in generated files.)

A few mistakes leave no trace in either list (`grammar.md`, "Silent cases"). The likely ones:

- a link line starting with `Title` whose left name is not declared replaces the title;
- swapped or mistyped coordinates.

Compare what was read with what you wrote:

```ts
console.log(`title "${map.config.title}", ${map.edges.length} links`);
```

The link count must equal the number of link lines you wrote, and the title must be yours.

Round-trip self-test, useful after generating a map:

```ts
const canonical = serializeDSL(parseDSL(text));
const unchanged = canonical === text; // true when you wrote canonical text
```

A second pass over `canonical` always returns `canonical` again, so the useful comparison is with
your own text. It shows exactly what the canonicaliser changed. These are harmless:

- dropped blank lines and relocated comments;
- reordered suffixes and normalised spacing;
- rewritten legacy forms.

Anything else on a link, `title`, `y-axis`, pipeline or element line (a missing line, a line moved
to the end, words gone from a line) means content was **lost**, not reformatted.

### As a script

Without a project to install into, use a scratch directory:

```bash
mkdir -p /tmp/owm-check && cd /tmp/owm-check && npm install --silent @miragon/wardley-dsl zod
```

`/tmp/owm-check/check-map.mjs`:

```js
import { readFileSync } from "node:fs";
import { parseDSLWithDiagnostics, serializeDSL } from "@miragon/wardley-dsl";

const text = readFileSync(process.argv[2], "utf8");
const { map, diagnostics } = parseDSLWithDiagnostics(text);
for (const { line, message, text: source } of diagnostics) {
  console.log(`line ${line}: ${message}\n    ${source}`);
}
for (const entry of map.rawPassthrough ?? []) {
  if (!/^\s*(\/\/|\/\*)/.test(entry)) console.log(`not understood: ${entry}`);
}
console.log(
  `title "${map.config.title}", ${map.elements.length} elements, ${map.edges.length} links`,
);
console.log(serializeDSL(map) === text ? "already canonical" : "differs from canonical text");
```

Run it from that directory (so the bare import resolves): `node check-map.mjs /path/to/map.wmap`. A
clean, canonical file prints only its title and counts, then `already canonical`. Check that the
title and the link count are the ones you wrote. For `differs from canonical text`, diff your file
against the `serializeDSL` output and read the difference as described above. A changed link,
title, pipeline or element line is lost content.

### Checking the links of a map set

The parser never looks at the files an address names, so a set of maps that link to each other
(an overview and its detail maps) needs a check of its own. It resolves every relative address the
way the Modeler does (from the folder of the map that holds it, literally, in exact case) and lists
what would not open. Run `check-map.mjs` on every map first: a `url(…)` without its definition is
a diagnostic there and has no address here.

`/tmp/owm-check/check-links.mjs`:

```js
import { readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseDSL } from "@miragon/wardley-dsl";

const root = resolve(process.argv[2] ?? ".");
const MAP_FILE = /\.(wmap|owm)$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const files = readdirSync(root, { recursive: true, encoding: "utf8" })
  .filter((path) => MAP_FILE.test(path) && !path.split(/[\\/]/).includes("node_modules"))
  .map((path) => join(root, path));

// Exact case, segment by segment: a case-insensitive disk (macOS, Windows) finds a mistyped name.
function existsExactly(path) {
  let folder = root;
  for (const segment of relative(root, path).split(/[\\/]/)) {
    let names;
    try {
      names = readdirSync(folder);
    } catch {
      return false;
    }
    if (!names.includes(segment)) return false;
    folder = join(folder, segment);
  }
  return true;
}

const linkedTo = new Set();
for (const file of files) {
  for (const element of parseDSL(readFileSync(file, "utf8")).elements) {
    const address = element.url ?? element.urlRef;
    const where = `${relative(root, file)}, ${element.label}`;
    if (element.elementType === "submap" && !address)
      console.log(`${where}: submap without url(…)`);
    if (!address) continue;
    if (SCHEME.test(address)) {
      if (!/^(https?|mailto):/i.test(address)) console.log(`${where}: "${address}" never opens`);
      continue;
    }
    const target = join(dirname(file), address);
    const inside = relative(root, target);
    if (/^[\\/]/.test(address) || address.includes("\\")) {
      console.log(`${where}: "${address}": write it from this map's folder, with "/" only`);
    } else if (!MAP_FILE.test(address)) {
      console.log(`${where}: "${address}" is no .wmap or .owm file`);
    } else if (inside.startsWith("..") || isAbsolute(inside)) {
      console.log(`${where}: "${address}" leads out of the checked folder`);
    } else if (!existsExactly(target)) {
      console.log(`${where}: "${address}" not found (check the spelling and case)`);
    } else {
      linkedTo.add(target);
    }
  }
}
for (const file of files) {
  if (!linkedTo.has(file)) console.log(`${relative(root, file)}: no map links here`);
}
console.log(`${files.length} maps checked`);
```

Run it on the folder that holds the whole set, from the scratch directory as above:
`node check-links.mjs /path/to/maps`. A clean set prints `no map links here` only for its overview
(and not even that when the detail maps link back to it), then the count. Every other line is a
finding: a link that would not open, a submap that leads nowhere, or a map no other map links to.
Point it at the overview's folder: back links from `details/` (`../<overview>.wmap`) then stay inside
it, and maps that belong to no set do not show up as orphans unless they share that folder.

## The map model

The types live in `@miragon/wardley-schema-model` (a dependency of `@miragon/wardley-dsl`, which
does not re-export them):

```ts
import type { WardleyMap, MapElement, MapEdge } from "@miragon/wardley-schema-model";

interface WardleyMap {
  readonly schemaVersion: number; // currently 1
  readonly config: MapConfig;
  readonly elements: readonly MapElement[];
  readonly edges: readonly MapEdge[];
  readonly rawPassthrough?: readonly string[]; // unknown lines and comments, verbatim
}

interface MapConfig {
  readonly title: string;
  readonly size?: { width: number; height: number };
  readonly style?: "wardley" | "handwritten" | "colour" | "dark";
  readonly evolutionLabels?: readonly [string, string, string, string];
  readonly stageBoundaries?: readonly [number, number, number]; // no text syntax
  readonly yAxisLabel?: string;
  readonly yAxisEndLabels?: readonly [string, string]; // [bottom, top]
  readonly annotationsBoxPosition?: Coordinate;
}

interface Coordinate {
  readonly visibility: number; // 0…1, 1 = top
  readonly evolution: number; // 0…1, the text's "maturity"
}
```

The text's _maturity_ is `evolution` in the model.

`MapElement` is a discriminated union on `elementType`. Every element has `id`, `label`, `position`
and optionally `labelOffset` (`{ dx, dy }` px) and `color`.

| `elementType` | Text keyword                                    | Extra fields                                                         |
| ------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| `anchor`      | `anchor`                                        | none                                                                 |
| `component`   | `component` (and its legacy forms), block child | `decorators?`, `movement?`, `pipelineId?`, `url?`                    |
| `pipeline`    | `pipeline`                                      | `evolutionStart`, `evolutionEnd`, `childIds`                         |
| `note`        | `note`                                          | `patternType?` (no text syntax)                                      |
| `annotation`  | `annotation`                                    | `number`, `positions`, `text`                                        |
| `accelerator` | `accelerator`, `deaccelerator`                  | `direction: 'accelerate' \| 'deaccelerate'`                          |
| `attitude`    | `pioneers`, `settlers`, `townplanners`          | `kind`, `corner2` (`position` = top-left corner)                     |
| `submap`      | `submap`                                        | `urlRef?`                                                            |
| `drawing`     | `line`                                          | `points`, `closed?`, `strokeStyle?: 'solid' \| 'dashed' \| 'dotted'` |

- `decorators`: `{ market?, ecosystem?, inertia?, method?: 'build' | 'buy' | 'outsource' }`.
- `movement` (from `evolve`): `{ targetEvolution, newLabel?, method?, labelOffset? }`.
- `url` (component) and `urlRef` (submap): the link address exactly as its `url` line writes it.
  Nothing resolves or decodes it; a relative address stays relative to the map's file.
- A pipeline's `position` is the midpoint of its range at its height; its children carry
  `pipelineId`.

`MapEdge` is `DependencyLink` (`{ id, edgeType: 'dependency', from, to, label? }`) or `FlowLink`
(`{ id, edgeType: 'flow', from, to, flowValue?, bidirectional?, label? }`); `from` / `to` are
element ids, `label` is the `; annotation`.

Fields with no text syntax (`stageBoundaries`, a note's `patternType`) are lost when a map is
written as text. Everything is `readonly`: the model is a serialization format, not an editing
structure. Build a new map rather than mutating one, or use `@miragon/wardley-transforms`.

### Stages

```ts
import {
  evolutionStage,
  DEFAULT_STAGE_BOUNDARIES, // [0.17, 0.4, 0.7]
  DEFAULT_EVOLUTION_LABELS, // Genesis, Custom-Built, Product / Rental, Commodity / Utility
  EVOLUTION_PRESETS, // activities, practices, data, knowledge
} from "@miragon/wardley-schema-model";

evolutionStage(0.4); // 2: Product (boundaries belong to the stage on their right)
```

## JSON bridge

```ts
import { mapToJSON, mapFromJSON, loadMap } from "@miragon/wardley-dsl";

const json = mapToJSON(map); // deterministic: sorted keys, elements and edges sorted by id, numbers rounded to 3 decimals
const back = mapFromJSON(json); // validated WardleyMap
const any = loadMap(unknownValue); // validate + migrate an older schemaVersion
```

`mapFromJSON` / `loadMap` validate against the Zod schema and the cross-field invariants (unique
ids, edges pointing at existing elements) and throw on invalid input or an unknown
`schemaVersion`. The web app opens `.json` files in this format too. `createEmptyMap(title)` and
`validateMap(data)` come from `@miragon/wardley-schema-model`.

## Lexer helpers

Exported for tools and tests; generated text should go through `parseDSL` instead.

| Function                  | Returns                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseCoords(line)`       | the first `[a, b]` tuple as `{ a, b }` in written order, or `null`                                                                                                              |
| `parseDecorators(suffix)` | deprecated: `{ decorators, rest }` from every `( … )` group and `inertia` on the line; the parser itself reads decorators only after the coordinates and keeps the first method |
| `parseLabelOffset(text)`  | `{ labelOffset: { dx, dy } \| null, rest, unreadable? }`; `unreadable` holds the matched text when a number cannot be read                                                      |
| `keywordOf(line)`         | the first word, lowercased (`'component'`); `''` when a non-ASCII letter follows it                                                                                             |
| `slug(label)`             | the id slug (`'Hot Water!'` → `'hot_water'`)                                                                                                                                    |

## Share links

The web app (https://wardley-maps.modeler.miragon.io) keeps the whole map in the URL hash:
`#mz=` + base64url (no padding) of the deflate-raw compressed UTF-8 text. Node's `zlib` produces
exactly the bytes the web app's `CompressionStream('deflate-raw')` decodes:

```bash
node -e "const fs=require('fs'),zlib=require('zlib');const text=fs.readFileSync(process.argv[1],'utf8');console.log('https://wardley-maps.modeler.miragon.io/#mz='+zlib.deflateRawSync(Buffer.from(text,'utf8')).toString('base64url'))" map.wmap
```

Decoding a link someone shared:

```bash
node -e "const zlib=require('zlib');const url=process.argv[1];console.log(zlib.inflateRawSync(Buffer.from(url.slice(url.indexOf('#mz=')+4),'base64url')).toString('utf8'))" 'https://wardley-maps.modeler.miragon.io/#mz=…'
```

Legacy uncompressed links use `#m=` + base64url of the text; decode with
`Buffer.from(hash, 'base64url').toString('utf8')`. In a browser, the same encoding is
`new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))`, then base64url
without `=` padding.

## Links in a host

The renderer (`@miragon/wardley-renderer`) offers **Open link** in the context pad of a component or
submap with an address, and the host decides what a click does, through three options of the viewer
and the collaborative modeler:

- `openExternalLink(address)` takes an http(s) or `mailto:` address; without it a new browser tab
  opens.
- `openRelativeLink(address)` takes an address without a scheme. Only the host knows where the
  map's file lies, so it resolves the address or says why it can't. Without this option the pad
  offers no Open link for a relative address.
- `chooseLinkTarget()` adds **Link to map…**: the host lets the user choose another map and resolves
  with its address relative to the current map, which becomes the element's link.

No other scheme ever opens. The VS Code extension passes all three: it opens `.wmap` / `.owm` files
inside the workspace in their own tab and offers the workspace's other maps, nearest first. The web
app knows no folder, so its `openRelativeLink` only says that it cannot follow the link. A map
written for any other host follows relative links only if that host passes `openRelativeLink`.

## Related packages

| Package                         | Purpose                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `@miragon/wardley-schema-model` | the metamodel, Zod validation, stage derivation, migrations, deterministic JSON               |
| `@miragon/wardley-transforms`   | pure `map → map` transforms: `evolveComponent`, `setMethod`, `toggleInertia`, pipeline ranges |
| `@miragon/wardley-renderer`     | the diagram-js viewer / modeler (`importDSL`, `exportDSL`, SVG export) and its CSS            |
