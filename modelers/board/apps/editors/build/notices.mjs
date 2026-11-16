import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The third-party notices of a build of the board, written from the files that went into it. A
 * board's page bundles the seven renderers of the suite and whatever they bundle, so no list
 * kept by hand stays true: the caller hands in the files its bundler names (esbuild's metafile,
 * the modules of a Vite build) and gets the text, the licence files the bundle names as lying
 * next to it, and what is wrong.
 *
 * Three things a bundler does not see are said here: a package that an upstream build carries
 * inside its own file (`INLINED_BY_UPSTREAM`), a work that is copied into a source of the suite
 * (`COPIED_WORKS`, found by its mark in the bundled sources), and which licences the suite ships
 * (`SHIPPED_LICENCES`).
 */

/** The file a VSIX carries; a web app takes a `.txt`, which every static host shows as text. */
export const NOTICES_FILE = "THIRD_PARTY_NOTICES.md";

/**
 * The licences a build of the board may carry. Nothing in the suite names a list, so this is the
 * set its bundles hold today plus 0BSD; anything else stops the build until its owner decides.
 */
export const SHIPPED_LICENCES = [
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
  "OFL-1.1",
];

/**
 * Packages whose published build holds another package's code in its own file, where no bundler
 * names it: dagre's ESM build has graphlib inside.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const INLINED_BY_UPSTREAM = { "@dagrejs/dagre": ["@dagrejs/graphlib"] };

const LICENCES = fileURLToPath(new URL("./licences/", import.meta.url));
const BOARD_RENDERER = fileURLToPath(new URL("../../../packages/renderer/", import.meta.url));

/**
 * Works copied into sources of the suite. `mark` is how a source says that it carries one; the
 * licence text comes from an installed package of the same work, or from a copy kept here.
 *
 * @typedef {{
 *   name: string,
 *   licence: string,
 *   mark: RegExp,
 *   about: string,
 *   text: { installed: string, from: string } | { file: string },
 * }} CopiedWork
 * @type {readonly CopiedWork[]}
 */
export const COPIED_WORKS = [
  {
    name: "Lucide",
    licence: "ISC",
    mark: /Lucide Icons and Contributors|lucide-static \d|\blucide(?:-react)? \d+\.\d+\.\d+/,
    about:
      "Icon geometry of Lucide (https://lucide.dev), part of it derived from Feather (MIT), " +
      "copied into the sources of",
    text: { installed: "lucide-react", from: BOARD_RENDERER },
  },
  {
    name: "Material Icons",
    licence: "Apache-2.0",
    mark: /Material Icons/,
    about:
      "Paths of Google's Material Icons (https://github.com/google/material-design-icons), " +
      "Copyright Google LLC, copied into the sources of",
    text: { file: join(LICENCES, "apache-2.0.txt") },
  },
  {
    name: "Tailwind CSS preflight",
    licence: "MIT",
    mark: /tailwindcss v\d+\.\d+\.\d+ \(preflight\.css\)/,
    about:
      "preflight.css of Tailwind CSS (https://tailwindcss.com), copied in a scoped form into " +
      "the sources of",
    text: { file: join(LICENCES, "tailwindcss.txt") },
  },
];

/**
 * @typedef {{ file: string, text: string }} LicenceText
 * @typedef {{
 *   name: string,
 *   version: string,
 *   directory: string,
 *   suite: boolean,
 *   declared: string | undefined,
 *   licence: string | undefined,
 *   texts: LicenceText[],
 *   within?: string | undefined,
 * }} BundledPackage a package with a file in the build: `suite` for a workspace of this
 *   repository, `declared` as its manifest says, `licence` the shipped one it is taken under
 * @typedef {{
 *   work: CopiedWork,
 *   carriers: string[],
 *   comments: string[],
 *   text: string | undefined,
 * }} CarriedWork
 * @typedef {{ name: string, source: string, owner: string }} LegalFile a licence file that
 *   lies beside a bundled file, such as `dagre.esm.js.LEGAL.txt`
 */

const NOTICE_FILE = /^(licen[cs]e|copying|notice|third[-_]party[-_]notices?)(?:[-._].*)?$/i;
const OWN_NOTICE_FILE = /^(notice|third[-_]party[-_]notices?)(?:[-._].*)?$/i;
const LEGAL_SIBLING = /\.(?:LEGAL|LICEN[CS]E)\.txt$/;
const NAMED_LEGAL_FILE = /(?<![\w@./+-])[\w@.+-]+\.(?:LEGAL|LICEN[CS]E)\.txt\b/g;
const SOURCE_TEXT = /\.(?:[cm]?[jt]sx?|css)$/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LEGAL_COMMENT = /^\/\*!|@license\b|@preserve\b/;

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} code point order: `localeCompare` would follow the building machine's language
 */
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @param {string} text
 * @returns {string} with Unix line ends and no blank line at either end
 */
const tidy = (text) => text.replace(/\r\n?/g, "\n").replace(/^\n+/, "").trimEnd();

/**
 * @param {string} path
 * @returns {Record<string, unknown> | undefined}
 */
function manifestAt(path) {
  if (!existsSync(path)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    return typeof manifest === "object" && manifest !== null ? manifest : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The folder of the package a bundled file belongs to: the last `node_modules/<name>` on its
 * path, or for a workspace of the suite the nearest folder whose manifest has a name. A package
 * may hold folders with a manifest of their own (`preact/hooks`, `htm/preact`): they are no
 * packages.
 *
 * @param {string} file an absolute path
 * @returns {{ directory: string, suite: boolean } | undefined}
 */
export function packageDirectory(file) {
  const parts = file.split(sep);
  const at = parts.lastIndexOf("node_modules");
  if (at !== -1) {
    const length = at + (parts[at + 1]?.startsWith("@") ? 3 : 2);
    return length < parts.length
      ? { directory: parts.slice(0, length).join(sep), suite: false }
      : undefined;
  }
  for (let folder = dirname(file); folder !== dirname(folder); folder = dirname(folder)) {
    if (typeof manifestAt(join(folder, "package.json"))?.name === "string") {
      return { directory: folder, suite: true };
    }
  }
  return undefined;
}

/**
 * @param {Record<string, unknown>} manifest
 * @returns {string | undefined} the licence expression a manifest names, in either spelling npm knew
 */
function declaredLicence(manifest) {
  const { license, licenses } = manifest;
  if (typeof license === "string") return license;
  const typeOf = (/** @type {unknown} */ entry) =>
    typeof entry === "object" && entry !== null && "type" in entry && typeof entry.type === "string"
      ? entry.type
      : undefined;
  if (Array.isArray(licenses)) {
    const types = licenses.map(typeOf).filter((type) => type !== undefined);
    return types.length > 0 ? types.join(" OR ") : undefined;
  }
  return typeOf(license);
}

/**
 * @param {string} expression
 * @returns {string[]} the alternatives an SPDX expression offers (`A OR B`), without brackets
 */
const alternatives = (expression) =>
  expression
    .trim()
    .replace(/^\((.*)\)$/, "$1")
    .split(/\s+OR\s+/i)
    .map((choice) => choice.trim());

/**
 * The licence a package is taken under: the first alternative of its expression that the suite
 * ships. `(MPL-2.0 OR Apache-2.0)` is taken under Apache-2.0, a GPL package under nothing.
 *
 * @param {string | undefined} declared
 * @returns {string | undefined}
 */
export function licenceTaken(declared) {
  if (declared === undefined) return undefined;
  return alternatives(declared).find((choice) => SHIPPED_LICENCES.includes(choice));
}

/**
 * @param {string} directory
 * @returns {string[]} the plain files of a folder, in code point order
 */
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort(byCodePoint);
}

/**
 * @param {string} directory
 * @param {string[]} names
 * @returns {LicenceText[]}
 */
const textsOf = (directory, names) =>
  names.map((file) => ({ file, text: tidy(readFileSync(join(directory, file), "utf8")) }));

/**
 * The licence files of an npm package: every licence, notice and copying file of its folder, but
 * the text of an alternative that is not taken (`LICENSE-MPL` of a package taken under Apache).
 *
 * @param {string} directory
 * @param {string | undefined} declared
 * @param {string | undefined} taken
 * @returns {LicenceText[]}
 */
function licenceTexts(directory, declared, taken) {
  const notTaken = (declared === undefined ? [] : alternatives(declared))
    .filter((choice) => choice !== taken)
    .map((choice) => choice.split("-")[0]?.toUpperCase());
  const names = filesIn(directory).filter((name) => {
    if (!NOTICE_FILE.test(name)) return false;
    const family = /^licen[cs]e[-._]([a-z0-9]+)/i.exec(name)?.[1]?.toUpperCase();
    return family === undefined || !notTaken.includes(family);
  });
  return textsOf(directory, names);
}

/**
 * The licence of a workspace of the suite: the nearest LICENSE above it (the modeler's, the
 * repository's) first, then the notices it keeps in its own folder, as the shell does for Lucide.
 *
 * @param {string} directory
 * @returns {LicenceText[]} empty without a LICENSE
 */
function suiteTexts(directory) {
  for (let folder = directory; folder !== dirname(folder); folder = dirname(folder)) {
    const licence = filesIn(folder).find((name) => /^licen[cs]e(\.(md|txt))?$/i.test(name));
    if (licence !== undefined) {
      const own = filesIn(directory).filter((name) => OWN_NOTICE_FILE.test(name));
      return [...textsOf(folder, [licence]), ...textsOf(directory, own)];
    }
  }
  return [];
}

/**
 * @param {string | undefined} text
 * @returns {string | undefined} the licence a LICENSE file is, by how it opens
 */
function licenceOfText(text) {
  if (text === undefined) return undefined;
  if (/^(The )?MIT License\b/.test(text)) return "MIT";
  if (/^ISC License\b/.test(text)) return "ISC";
  return /^\s*Apache License\s+Version 2\.0\b/.test(text) ? "Apache-2.0" : undefined;
}

/**
 * @param {string} directory
 * @param {boolean} suite
 * @returns {BundledPackage | undefined}
 */
function packageAt(directory, suite) {
  const manifest = manifestAt(join(directory, "package.json"));
  if (manifest === undefined || typeof manifest.name !== "string") return undefined;
  const version = typeof manifest.version === "string" ? manifest.version : "";
  if (suite) {
    // A private workspace of the suite may name no licence (its web apps do not): it is under
    // the LICENSE above it.
    const texts = suiteTexts(directory);
    const declared = declaredLicence(manifest) ?? licenceOfText(texts[0]?.text);
    return {
      name: manifest.name,
      version,
      directory,
      suite,
      declared,
      licence: licenceTaken(declared),
      texts,
    };
  }
  const declared = declaredLicence(manifest);
  const licence = licenceTaken(declared);
  const texts = licenceTexts(directory, declared, licence);
  return { name: manifest.name, version, directory, suite, declared, licence, texts };
}

/**
 * @param {string} name
 * @param {string} from
 * @returns {string | undefined} the folder of an installed package, as Node finds it from `from`
 */
function installedPackage(name, from) {
  for (let folder = from; ; folder = dirname(folder)) {
    const candidate = join(folder, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (folder === dirname(folder)) return undefined;
  }
}

/**
 * @param {BundledPackage} bundled
 * @returns {string[]} what keeps this package out of a build
 */
function packageProblems({ name, version, suite, declared, licence, texts }) {
  const label = suite ? name : `${name} ${version}`;
  const problems = [];
  if (licence === undefined) {
    problems.push(
      declared === undefined
        ? `${label} names no licence in its manifest`
        : `${label} is under ${declared}, which the suite does not ship ` +
            `(${SHIPPED_LICENCES.join(", ")})`,
    );
  }
  if (texts.length === 0) problems.push(`${label} has no licence file to quote`);
  return problems;
}

/**
 * Every package with a file in the build, once per name and version, in code point order: the
 * npm packages and, marked `suite`, the workspaces of this repository.
 *
 * @param {readonly string[]} files absolute paths of the files a bundle was made of
 * @returns {{ packages: BundledPackage[], problems: string[] }}
 */
export function bundledPackages(files) {
  /** @type {Map<string, BundledPackage>} */
  const found = new Map();
  /** @type {Set<string>} */
  const seen = new Set();
  const add = (/** @type {BundledPackage | undefined} */ bundled) => {
    if (bundled !== undefined) found.set(`${bundled.name}@${bundled.version}`, bundled);
    return bundled;
  };
  for (const file of files) {
    const place = packageDirectory(file);
    if (place === undefined || seen.has(place.directory)) continue;
    seen.add(place.directory);
    const bundled = add(packageAt(place.directory, place.suite));
    for (const inlined of bundled === undefined ? [] : (INLINED_BY_UPSTREAM[bundled.name] ?? [])) {
      const directory = installedPackage(inlined, place.directory);
      const inside = directory === undefined ? undefined : packageAt(directory, false);
      if (inside !== undefined) add({ ...inside, within: bundled.name });
    }
  }
  const packages = [...found.values()].sort(
    (a, b) => byCodePoint(a.name, b.name) || byCodePoint(a.version, b.version),
  );
  return { packages, problems: packages.flatMap(packageProblems) };
}

/**
 * The licence files that lie beside a bundled file under its own name (`<file>.LEGAL.txt`,
 * `<file>.LICENSE.txt`): a bundle that keeps the file's legal comment names them.
 *
 * @param {readonly string[]} files
 * @returns {LegalFile[]}
 */
export function legalFilesBeside(files) {
  /** @type {Map<string, LegalFile>} */
  const found = new Map();
  /** @type {Map<string, string[]>} */
  const siblings = new Map();
  for (const file of files) {
    const place = packageDirectory(file);
    if (place === undefined || place.suite) continue;
    const folder = dirname(file);
    if (!siblings.has(folder)) {
      siblings.set(
        folder,
        existsSync(folder) ? filesIn(folder).filter((name) => LEGAL_SIBLING.test(name)) : [],
      );
    }
    const owner = manifestAt(join(place.directory, "package.json"))?.name;
    for (const name of siblings.get(folder) ?? []) {
      if (typeof owner === "string" && name.startsWith(`${basename(file)}.`)) {
        found.set(name, { name, source: join(folder, name), owner });
      }
    }
  }
  return [...found.values()].sort((a, b) => byCodePoint(a.name, b.name));
}

/**
 * @param {string} text a built script or sheet
 * @returns {string[]} the licence files it names as lying next to it
 */
export function namedLegalFiles(text) {
  return [...new Set(text.match(NAMED_LEGAL_FILE) ?? [])].sort(byCodePoint);
}

/**
 * @param {CopiedWork} work
 * @returns {string | undefined}
 */
function workText(work) {
  if ("file" in work.text) {
    return existsSync(work.text.file) ? tidy(readFileSync(work.text.file, "utf8")) : undefined;
  }
  const directory = installedPackage(work.text.installed, work.text.from);
  const texts = directory === undefined ? [] : licenceTexts(directory, undefined, undefined);
  return texts.length > 0 ? texts.map(({ text }) => text).join("\n\n") : undefined;
}

/**
 * The works copied into the bundled sources of the suite, found by their marks, with the legal
 * comments those sources carry. A legal comment that no work answers is a problem: somebody
 * copied something in and the notices do not know it.
 *
 * @param {readonly string[]} files
 * @param {readonly CopiedWork[]} [known]
 * @returns {{ works: CarriedWork[], problems: string[] }}
 */
export function copiedWorks(files, known = COPIED_WORKS) {
  const carried = known.map((work) => ({
    work,
    carriers: /** @type {Set<string>} */ (new Set()),
    comments: /** @type {Set<string>} */ (new Set()),
  }));
  const problems = [];
  for (const file of [...new Set(files)].sort(byCodePoint)) {
    const place = packageDirectory(file);
    if (place === undefined || !place.suite || !SOURCE_TEXT.test(file) || !existsSync(file)) {
      continue;
    }
    const owner = String(manifestAt(join(place.directory, "package.json"))?.name);
    const source = readFileSync(file, "utf8");
    for (const entry of carried) if (entry.work.mark.test(source)) entry.carriers.add(owner);
    for (const comment of source.match(BLOCK_COMMENT) ?? []) {
      if (!LEGAL_COMMENT.test(comment)) continue;
      const answered = carried.filter((entry) => entry.work.mark.test(comment));
      for (const entry of answered) entry.comments.add(tidy(comment));
      if (answered.length === 0) {
        const first = tidy(comment).split("\n")[0];
        problems.push(
          `${file} of ${owner} carries a legal comment that no notice answers: ${first}`,
        );
      }
    }
  }
  const works = carried
    .filter(({ carriers }) => carriers.size > 0)
    .map(({ work, carriers, comments }) => ({
      work,
      carriers: [...carriers].sort(byCodePoint),
      comments: [...comments].sort(byCodePoint),
      text: workText(work),
    }));
  for (const { work, text } of works) {
    if (text === undefined) problems.push(`no licence text at hand for ${work.name}`);
    if (!SHIPPED_LICENCES.includes(work.licence)) {
      problems.push(`${work.name} is under ${work.licence}, which the suite does not ship`);
    }
  }
  return { works, problems };
}

/**
 * @param {string} paragraph
 * @param {number} [width]
 * @returns {string} broken at spaces into lines of at most `width` characters
 */
function wrapped(paragraph, width = 96) {
  /** @type {string[]} */
  const lines = [];
  for (const word of paragraph.split(" ")) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= width) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines.join("\n");
}

/**
 * @param {BundledPackage} bundled
 * @returns {string} the licence a heading names: the one taken, else what the manifest says
 */
const namedLicence = ({ licence, declared }) =>
  licence ?? declared?.replace(/^\((.*)\)$/, "$1") ?? "no licence named";

/**
 * @param {string} text
 * @returns {string} as a fenced block that the text itself cannot end
 */
function fenced(text) {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

/**
 * @param {readonly string[]} names
 * @returns {string} `a`, `b` and `c`
 */
function listed(names) {
  const quoted = names.map((name) => `\`${name}\``);
  return quoted.length < 2
    ? quoted.join("")
    : `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
}

/**
 * @param {CarriedWork} carried
 * @returns {string}
 */
function workSection({ work, carriers, comments, text }) {
  const lines = [
    `## ${work.name} (${work.licence})`,
    "",
    wrapped(`${work.about} ${listed(carriers)}.`),
  ];
  if (comments.length > 0) {
    lines.push("", "The notices those sources carry:", "", fenced(comments.join("\n\n")));
  }
  if (text !== undefined) lines.push("", fenced(text));
  return `${lines.join("\n")}\n`;
}

/**
 * @param {BundledPackage} bundled
 * @param {readonly LegalFile[]} legal
 * @returns {string}
 */
function packageSection(bundled, legal) {
  const { name, version, declared, licence, texts, within } = bundled;
  const lines = [`## ${name} ${version} (${namedLicence(bundled)})`];
  if (licence !== undefined && declared !== undefined && declared !== licence) {
    lines.push("", `Offered under \`${declared}\`; bundled under ${licence}.`);
  }
  if (within !== undefined) lines.push("", `Inside the published build of \`${within}\`.`);
  const single = texts.length === 1;
  for (const { file, text } of texts)
    lines.push("", ...(single ? [] : [`\`${file}\`:`, ""]), fenced(text));
  for (const { name: file, source } of legal.filter(({ owner }) => owner === name)) {
    lines.push(
      "",
      `\`${file}\`, the licence file its published build names:`,
      "",
      fenced(tidy(readFileSync(source, "utf8"))),
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The workspaces of the suite in the build, under the licence text they share. They are no
 * third parties and carry no version: a release moves it, and the text stays the same.
 *
 * @param {readonly BundledPackage[]} suite
 * @returns {string[]}
 */
function suiteSections(suite) {
  /** @type {Map<string, BundledPackage[]>} */
  const byLicence = new Map();
  for (const bundled of suite) {
    const text = bundled.texts[0]?.text ?? "";
    byLicence.set(text, [...(byLicence.get(text) ?? []), bundled]);
  }
  return [...byLicence.entries()].map(([text, members]) => {
    const licences = [...new Set(members.map(namedLicence))].sort(byCodePoint);
    const lines = [
      `## Miragon modeler suite (${licences.join(", ")})`,
      "",
      "Built from these workspaces of the Miragon modeler suite",
      "(https://github.com/Miragon/modeler-suite), which are no third parties:",
      "",
      ...members.map(({ name }) => `- \`${name}\``),
    ];
    if (text !== "") lines.push("", fenced(text));
    for (const { name, texts } of members) {
      for (const { file, text: own } of texts.slice(1)) {
        lines.push("", `\`${file}\` of \`${name}\`:`, "", fenced(own));
      }
    }
    return `${lines.join("\n")}\n`;
  });
}

/**
 * @param {readonly BundledPackage[]} packages
 * @returns {string} how many packages there are under each licence
 */
function tally(packages) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const bundled of packages) {
    const key = namedLicence(bundled);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => byCodePoint(a, b))
    .map(([licence, count]) => `${licence} (${count})`)
    .join(", ");
}

/**
 * The notices of a build.
 *
 * @param {{
 *   product: string,
 *   files: readonly string[],
 *   outputs?: Readonly<Record<string, string>> | undefined,
 * }} build `product` as a sentence's subject ("The Modeler Board extension"), the absolute paths
 *   of the files the bundles were made of, and the built scripts and sheets by their path in the
 *   build, in which a licence file may be named
 * @returns {{
 *   text: string,
 *   beside: Record<string, string>,
 *   packages: BundledPackage[],
 *   works: CarriedWork[],
 *   problems: string[],
 * }} the notices, the licence files to write by their path in the build, and what is wrong
 */
export function composeNotices({ product, files, outputs = {} }) {
  const { packages, problems: packageIssues } = bundledPackages(files);
  const { works, problems: workIssues } = copiedWorks(files);
  const legal = legalFilesBeside(files);
  const problems = [...packageIssues, ...workIssues];

  /** @type {Record<string, string>} */
  const beside = {};
  for (const [output, text] of Object.entries(outputs)) {
    for (const name of namedLegalFiles(text)) {
      const file = legal.find((candidate) => candidate.name === name);
      const folder = dirname(output);
      if (file === undefined) {
        problems.push(`${output} names ${name}, and no bundled file has such a file beside it`);
      } else {
        beside[folder === "." ? name : `${folder}/${name}`] = readFileSync(file.source, "utf8");
      }
    }
  }

  const thirdParty = packages.filter(({ suite }) => !suite);
  const suite = packages.filter((bundled) => bundled.suite);
  const text = [
    "# Third-party notices",
    "",
    wrapped(
      `${product} bundles the software below. The build writes this file from the list of ` +
        "the files that went into it, so do not edit it by hand.",
    ),
    "",
    `- ${thirdParty.length} packages from npm: ${tally(thirdParty)}`,
    ...(works.length > 0
      ? [`- copied into sources of the suite: ${works.map(({ work }) => work.name).join(", ")}`]
      : []),
    `- ${suite.length} workspaces of the Miragon modeler suite`,
    "",
    ...works.map(workSection),
    ...thirdParty.map((bundled) => packageSection(bundled, legal)),
    ...suiteSections(suite),
  ].join("\n");
  return { text, beside, packages, works, problems };
}
