// Checks what the production build must carry and the dev server never shows (build-problems.mjs
// says what and why): run after `vite build`, on dist.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LICENCE_COMMENTS, buildProblems } from "./build-problems.mjs";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const assets = readdirSync(join(dist, "assets")).sort();
const read = (name) => readFileSync(join(dist, "assets", name), "utf8");
const named = (suffix) => assets.filter((name) => name.endsWith(suffix));

const { problems, linked, later } = buildProblems({
  html: readFileSync(join(dist, "index.html"), "utf8"),
  sheets: Object.fromEntries(named(".css").map((name) => [name, read(name)])),
  scripts: named(".js").map(read),
});

if (problems.length > 0) {
  console.error(`apps/webapp build check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `apps/webapp build check: the board's sheet and the preview rule in the page's sheet ` +
    `(${linked.join(", ")}), the shared base once and before the ${later.length} notation ` +
    `sheets, ${Object.keys(LICENCE_COMMENTS).length} licence comments kept`,
);
