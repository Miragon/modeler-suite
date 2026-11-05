// What a release publishes: every public workspace (npm), every VS Code extension (a workspace
// with engines.vscode) and every Orca plugin (a workspace with an orca-plugin.json) at or below the
// path of a component that released, so team-topologies'
// lockstep release publishes all of its packages and a new package is published without a new job.
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

const npm = [];
const vscode = [];
const orca = [];
for (const directory of workspaces) {
  const component = released.find((path) => directory === path || directory.startsWith(`${path}/`));
  if (!component) continue;
  const manifest = readJson(`${directory}/package.json`);
  const modeler = directory.startsWith("modelers/") ? directory.split("/")[1] : "";
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
const output = process.env.GITHUB_OUTPUT;
const lines = `npm=${JSON.stringify(npm)}\nvscode=${JSON.stringify(vscode)}\norca=${JSON.stringify(orca)}\n`;
if (output) appendFileSync(output, lines);
else process.stdout.write(lines);
