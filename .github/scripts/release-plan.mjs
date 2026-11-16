// What a release publishes: every public workspace (npm), every VS Code extension (a workspace
// with engines.vscode) and every Orca plugin (a workspace with an orca-plugin.json) at or below the
// path of a component that released, so team-topologies'
// lockstep release publishes all of its packages and a new package is published without a new job.
// Nothing of a modeler in HELD_BACK is listed for a release.
//   node .github/scripts/release-plan.mjs '<paths_released of release-please-action>'
//   node .github/scripts/release-plan.mjs --all    (every component, for the dry run)
// Writes `npm`, `vscode` and `orca`, JSON arrays for a job matrix, to $GITHUB_OUTPUT.
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const argument = process.argv[2] || "[]";
const components = readJson("release-please-config.json").packages;
const released = argument === "--all" ? Object.keys(components) : JSON.parse(argument);

const workspaces = Object.keys(readJson("package-lock.json").packages).filter(
  (path) => path !== "" && !path.includes("node_modules/"),
);

// Modelers (their folder under modelers/) that are on main and not public yet. A release still
// gives a held modeler's components their versions, tags, changelogs and GitHub releases, and
// publishes nothing of it: no package to npm, no extension to a marketplace, no plugin to the Orca
// catalog. The dry run (--all) lists it like every other, so it is built and smoke-tested there.
// A modeler leaves this list in the pull request that makes it public, and in no other: that
// edit is the decision to publish, and the next release of its components carries it out.
// test/release-workflow.test.ts names the same modelers and changes with this list.
const HELD_BACK = new Set([]);

// The workflow also passes --all when a release names no path. Inside a workflow run the hold
// therefore gives way to the dry_run input alone, which the event's payload carries.
const eventPath = process.env.GITHUB_EVENT_PATH;
const dryRun =
  argument === "--all" && (!eventPath || String(readJson(eventPath).inputs?.dry_run) === "true");

const npm = [];
const vscode = [];
const orca = [];
const held = new Set();
for (const directory of workspaces) {
  const component = released.find((path) => directory === path || directory.startsWith(`${path}/`));
  if (!component) continue;
  const manifest = readJson(`${directory}/package.json`);
  const modeler = directory.startsWith("modelers/") ? directory.split("/")[1] : "";
  if (!dryRun && HELD_BACK.has(modeler)) {
    held.add(modeler);
    continue;
  }
  if (existsSync(`${directory}/orca-plugin.json`)) {
    const plugin = readJson(`${directory}/orca-plugin.json`);
    const tag = `${components[component]?.component ?? manifest.name}-v${plugin.version}`;
    orca.push({
      modeler,
      directory,
      name: manifest.name,
      id: plugin.id,
      version: plugin.version,
      tag,
    });
  } else if (manifest.engines?.vscode) {
    vscode.push({ modeler, directory, name: manifest.name, vsix: `${manifest.name}.vsix` });
  } else if (!manifest.private) {
    npm.push({ modeler, directory, name: manifest.name });
  }
}

console.log(`Released components: ${released.join(", ") || "none"}`);
console.log(`npm: ${npm.map(({ name }) => name).join(", ") || "none"}`);
console.log(`VS Code: ${vscode.map(({ name }) => name).join(", ") || "none"}`);
console.log(`Orca: ${orca.map(({ id }) => id).join(", ") || "none"}`);
if (held.size) console.log(`Held back, released without a publish: ${[...held].join(", ")}`);
const output = process.env.GITHUB_OUTPUT;
const lines = `npm=${JSON.stringify(npm)}\nvscode=${JSON.stringify(vscode)}\norca=${JSON.stringify(orca)}\n`;
if (output) appendFileSync(output, lines);
else process.stdout.write(lines);
