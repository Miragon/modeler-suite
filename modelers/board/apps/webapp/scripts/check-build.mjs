// Checks what the production build must carry and the dev server never shows (build-problems.mjs
// says what and why): run after `vite build`, on dist.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBuildNotices } from "board-suite-editors/build/notices-check.mjs";
import { LICENCE_COMMENTS, buildProblems } from "./build-problems.mjs";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const NOTICES_FILE = "THIRD_PARTY_NOTICES.txt";
const exampleFolder = fileURLToPath(new URL("../../../example/", import.meta.url));
const assets = readdirSync(join(dist, "assets")).sort();
const read = (name) => readFileSync(join(dist, "assets", name), "utf8");
const named = (suffix) => assets.filter((name) => name.endsWith(suffix));
const example = Object.fromEntries(
  readdirSync(exampleFolder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
    .map((path) => [
      relative(exampleFolder, path).split(sep).join("/"),
      readFileSync(path, "utf8"),
    ]),
);

const { problems, linked, later } = buildProblems({
  html: readFileSync(join(dist, "index.html"), "utf8"),
  sheets: Object.fromEntries(named(".css").map((name) => [name, read(name)])),
  scripts: named(".js").map(read),
  files: readdirSync(dist, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name),
  example,
});

const notices = checkBuildNotices(dist, { fileName: NOTICES_FILE });
problems.push(...notices.problems);

if (problems.length > 0) {
  console.error(`apps/webapp build check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `apps/webapp build check: the mode markup; the board's sheet, the shell's and the preview ` +
    `rule in the page's sheet (${linked.join(", ")}); the shared base once and before the ` +
    `${later.length} notation sheets; the ${Object.keys(example).length} files of the example; ` +
    `React's production build; ${Object.keys(LICENCE_COMMENTS).length} licence comments kept; ` +
    `the start screen's mark and the page's icon; ${notices.held} bundled packages and ` +
    `${notices.works} copied works that the source maps name held against the ` +
    `${notices.sections} sections of ${NOTICES_FILE}, every licence file a script names is there`,
);
