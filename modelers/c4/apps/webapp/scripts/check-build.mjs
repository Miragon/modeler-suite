// What the production build must carry and the dev server never shows: the mode markup the Vite
// plugin writes into index.html (guide §13.3), the renderer's stylesheet (the dev server also takes
// it through the renderer's entry, the build only by name) and the shell's Lucide licence comment.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const html = readFileSync(join(dist, "index.html"), "utf8");
const assets = (extension) =>
  readdirSync(join(dist, "assets"))
    .filter((name) => name.endsWith(extension))
    .map((name) => readFileSync(join(dist, "assets", name), "utf8"));
const scripts = assets(".js");
const styles = assets(".css");

const problems = [];
if (html.includes("<!-- miragon-mode -->")) problems.push("index.html still has the mode marker");
if (!/<meta name="theme-color" content="#[0-9A-Fa-f]{6}"/.test(html)) {
  problems.push("index.html has no theme-color from the tokens");
}
if (!html.includes("prefers-contrast")) problems.push("index.html has no contrast line");
if (!styles.some((source) => source.includes("--cd-ui-text:"))) {
  problems.push("no stylesheet carries the vendored design-system tokens");
}
if (!styles.some((source) => source.includes(".c4-container"))) {
  problems.push("no stylesheet carries the renderer’s rules");
}
if (!scripts.some((source) => /@license[\s\S]{0,400}Lucide/.test(source))) {
  problems.push("no bundle keeps the shell’s @license comment naming Lucide");
}
if (problems.length > 0) {
  console.error(`apps/webapp build check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(
  "apps/webapp build check: mode markup, renderer stylesheet and licence comment present",
);
