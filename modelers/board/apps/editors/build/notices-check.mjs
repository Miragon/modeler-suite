import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  bundledPackages,
  copiedWorks,
  namedLegalFiles,
  NOTICES_FILE,
  SHIPPED_LICENCES,
} from "./notices.mjs";

/**
 * Whether the notices of a build are whole, read from the build itself. It fails for three
 * reasons: a built script or sheet names a licence file the build does not hold (C4's layout
 * engine names `dagre.esm.js.LEGAL.txt`), a package that is in the build or a work that is
 * copied into one of its sources has no section in the notices, or something in it is under a
 * licence the suite does not ship.
 *
 * Which packages and which copied works are in the build is evidence the caller brings, and
 * never the notices themselves: the source maps of a web build (`sourceMapSources`), or the
 * files of a build measured again.
 */

const BUILT_TEXT = /\.(?:[cm]?js|css)$/;
const SECTION = /^## (.+?)(?: (\d\S*))? \((.+)\)$/;
const FENCE = /^(`{3,})/;

/**
 * @typedef {import("./notices.mjs").BundledPackage} BundledPackage
 * @typedef {Pick<import("./notices.mjs").CopiedWork, "name" | "licence">} HeldWork
 * @typedef {{
 *   name: string,
 *   version: string | undefined,
 *   licence: string,
 *   quoted: boolean,
 *   members: string[],
 * }} NoticesSection one `## name version (licence)` of the notices: whether it quotes a text,
 *   and the names it lists (the workspaces of the suite)
 */

/**
 * @param {string} notices
 * @returns {NoticesSection[]} the sections of a notices file, headings inside a quoted text left out
 */
export function noticesSections(notices) {
  /** @type {NoticesSection[]} */
  const sections = [];
  /** @type {string | undefined} */
  let fence;
  for (const line of notices.split("\n")) {
    const current = sections[sections.length - 1];
    const marks = FENCE.exec(line)?.[1];
    if (fence !== undefined) {
      if (line === fence) fence = undefined;
    } else if (marks !== undefined) {
      fence = marks;
      if (current !== undefined) current.quoted = true;
    } else {
      const heading = SECTION.exec(line);
      const member = /^- `([^`]+)`$/.exec(line)?.[1];
      if (heading !== null) {
        const [, name = "", version, licence = ""] = heading;
        sections.push({ name, version, licence, quoted: false, members: [] });
      } else if (member !== undefined && current !== undefined) {
        current.members.push(member);
      }
    }
  }
  return sections;
}

/**
 * @param {string} path a path in a build, with forward slashes
 * @returns {string} the folder it lies in, `""` for the build's root
 */
const folderOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "");

/**
 * @param {BundledPackage} bundled
 * @param {readonly NoticesSection[]} sections
 * @returns {string[]}
 */
function packageProblems(bundled, sections) {
  const { name, version, suite, declared, licence } = bundled;
  if (suite) {
    return sections.some(({ members }) => members.includes(name))
      ? []
      : [`${name}, a workspace of the suite, is in the build and the notices do not name it`];
  }
  const label = `${name} ${version}`;
  const problems = [];
  if (licence === undefined) {
    problems.push(
      `${label} is in the build under ${declared ?? "no licence its manifest names"}, ` +
        `which the suite does not ship (${SHIPPED_LICENCES.join(", ")})`,
    );
  }
  const section = sections.find((entry) => entry.name === name && entry.version === version);
  if (section === undefined) {
    problems.push(`${label} is in the build and the notices have no section for it`);
  } else if (licence !== undefined && section.licence !== licence) {
    problems.push(`${label} is under ${licence}, and the notices say ${section.licence}`);
  }
  return problems;
}

/**
 * @param {HeldWork} work
 * @param {readonly NoticesSection[]} sections
 * @returns {string[]}
 */
function workProblems({ name, licence }, sections) {
  // a copied work has no version of its own: its section is `## name (licence)`
  const section = sections.find((entry) => entry.name === name && entry.version === undefined);
  if (section === undefined) {
    return [`${name} is copied into a source of the build and the notices have no section for it`];
  }
  return section.licence === licence
    ? []
    : [`${name} is under ${licence}, and the notices say ${section.licence}`];
}

/**
 * What is wrong with the notices of a build, as a function of its files.
 *
 * @param {{
 *   notices: string | undefined,
 *   texts: Readonly<Record<string, string>>,
 *   names: readonly string[],
 *   bundled: readonly BundledPackage[],
 *   works?: readonly HeldWork[] | undefined,
 * }} build the notices file's text, the built scripts and sheets by their path in the build,
 *   every file of the build by its path, and the packages that are in the build and the works
 *   that are copied into its sources, both by evidence other than the notices
 * @returns {string[]}
 */
export function noticesProblems({ notices, texts, names, bundled, works = [] }) {
  const problems = [];
  for (const [path, text] of Object.entries(texts)) {
    for (const name of namedLegalFiles(text)) {
      if (!names.includes(`${folderOf(path)}${name}`)) {
        problems.push(
          `${path} names the licence file ${name}, and the build holds no ` +
            `${folderOf(path)}${name}`,
        );
      }
    }
  }
  if (notices === undefined || notices.trim() === "") {
    return [...problems, "the build holds no third-party notices"];
  }
  const sections = noticesSections(notices);
  if (sections.length === 0) problems.push("the third-party notices have no section");
  for (const { name, version, licence, quoted } of sections) {
    const label = version === undefined ? name : `${name} ${version}`;
    if (!licence.split(", ").every((one) => SHIPPED_LICENCES.includes(one))) {
      problems.push(
        `the notices list ${label} under ${licence}, which the suite does not ship ` +
          `(${SHIPPED_LICENCES.join(", ")})`,
      );
    }
    if (!quoted) problems.push(`the notices quote no licence text for ${label}`);
  }
  return [
    ...problems,
    ...bundled.flatMap((entry) => packageProblems(entry, sections)),
    ...works.flatMap((work) => workProblems(work, sections)),
  ];
}

/**
 * @param {string} directory
 * @param {string} [prefix]
 * @returns {string[]} every file below a folder, as a path from it with forward slashes
 */
function filesBelow(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesBelow(join(directory, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`],
    );
}

/**
 * The files the source maps of a build name: evidence of what was bundled that no notices
 * generator wrote. Only for a build that still lies where it was built, since a map names its
 * sources by relative path. A source need not be on disk for its path to name its package: a
 * package that ships a map of its own (dagre) is named by sources it does not ship.
 *
 * @param {string} directory
 * @returns {string[]} absolute paths
 */
export function sourceMapSources(directory) {
  /** @type {Set<string>} */
  const sources = new Set();
  for (const path of filesBelow(directory).filter((name) => name.endsWith(".map"))) {
    const map = JSON.parse(readFileSync(join(directory, path), "utf8"));
    const root = typeof map.sourceRoot === "string" ? map.sourceRoot : "";
    for (const source of Array.isArray(map.sources) ? map.sources : []) {
      if (typeof source === "string") {
        sources.add(resolve(dirname(join(directory, path)), root, source));
      }
    }
  }
  return [...sources];
}

/**
 * Checks the notices of a build on disk.
 *
 * A source map names scripts only. So a check that reads the maps holds no package that brings
 * only a sheet or a font, and no work that is copied into a sheet: those are held where the
 * build is made, and by a caller that measured the build again.
 *
 * @param {string} directory the build's output folder
 * @param {{
 *   fileName?: string | undefined,
 *   bundled?: readonly BundledPackage[] | undefined,
 *   works?: readonly HeldWork[] | undefined,
 * }} [options] the notices file's name at the root of the build, and the packages in the build
 *   and the works copied into its sources where the caller measured them; without them each is
 *   read from the build's source maps
 * @returns {{ problems: string[], held: number, works: number, sections: number }} what is
 *   wrong, how many bundled packages and how many copied works were held against the notices,
 *   and how many sections the notices have
 */
export function checkBuildNotices(directory, { fileName = NOTICES_FILE, bundled, works } = {}) {
  if (!existsSync(directory)) {
    return { problems: [`there is no build at ${directory}`], held: 0, works: 0, sections: 0 };
  }
  const names = filesBelow(directory);
  const texts = Object.fromEntries(
    names
      .filter((name) => BUILT_TEXT.test(name))
      .map((name) => [name, readFileSync(join(directory, name), "utf8")]),
  );
  const notices = names.includes(fileName)
    ? readFileSync(join(directory, fileName), "utf8")
    : undefined;
  const sources = bundled === undefined || works === undefined ? sourceMapSources(directory) : [];
  const evidence = bundled ?? bundledPackages(sources).packages;
  const copied = works ?? copiedWorks(sources).works.map(({ work }) => work);
  const problems = noticesProblems({ notices, texts, names, bundled: evidence, works: copied });
  if (evidence.filter(({ suite }) => !suite).length === 0) {
    problems.push(
      "nothing says which packages are in this build: it has no source map that names a file " +
        "on disk, and its caller measured none",
    );
  }
  return {
    problems,
    held: evidence.length,
    works: copied.length,
    sections: notices === undefined ? 0 : noticesSections(notices).length,
  };
}
