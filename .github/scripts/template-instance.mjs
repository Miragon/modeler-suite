// Creates a modeler from the new-modeler template the way a person starts one (the skill's "After
// copying"), but on the shared packages of this checkout instead of the registry's, so a pull
// request, a release pull request included, tests the versions it is about to publish.
//   node .github/scripts/template-instance.mjs <target directory, new or empty>
// Needs the shared packages built (npm run build:shared). The install is not locked, as a new
// modeler's first one is not, and the Playwright browsers come from the caller (CI's job runs in
// the Playwright image; elsewhere: npx playwright install chromium).
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const newModelerScript = join(
  repositoryRoot,
  "plugins/modeler-kit/skills/new-modeler/scripts/new-modeler.mjs",
);

// The template ships no design-system files (the skill has them copied from the brand plugin); the
// renderers hold the same vendored copies, which stand in for them here.
const vendoredThemeSource = join(
  repositoryRoot,
  "modelers/event-storming/packages/renderer/src/theme",
);
const vendoredThemeFiles = ["cd-tokens.generated.css", "cd-tokens.generated.json", "cd-canvas.css"];

const sharedPackages = [
  { name: "@miragon/modeler-api", directory: "packages/api" },
  { name: "@miragon/modeler-shell", directory: "packages/shell" },
];

const target = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (!target) {
  console.error("usage: node .github/scripts/template-instance.mjs <target directory>");
  process.exit(2);
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function packSharedPackages(destination) {
  for (const { name, directory } of sharedPackages) {
    if (!existsSync(join(repositoryRoot, directory, "dist"))) {
      throw new Error(`${name} is not built: run npm run build:shared first`);
    }
  }
  mkdirSync(destination, { recursive: true });
  const output = execFileSync(
    "npm",
    [
      "pack",
      "--json",
      "--ignore-scripts",
      `--pack-destination=${destination}`,
      ...sharedPackages.flatMap(({ name }) => ["-w", name]),
    ],
    { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  // An array in npm 10, an object keyed by workspace name in npm 12.
  return new Map(
    Object.values(JSON.parse(output)).map(({ name, version, filename }) => [
      name,
      { version, archive: join(destination, filename) },
    ]),
  );
}

function manifestsUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : manifestsUnder(path);
    return entry.name === "package.json" ? [path] : [];
  });
}

function pointSharedPackagesAtThePacks(packs) {
  let rewritten = 0;
  for (const path of manifestsUnder(target)) {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    for (const section of ["dependencies", "devDependencies"]) {
      for (const [name, { archive }] of packs) {
        if (manifest[section]?.[name] === undefined) continue;
        manifest[section][name] = archive;
        rewritten++;
      }
    }
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  if (rewritten === 0) throw new Error("No manifest of the template depends on a shared package");
}

// A pin that no longer matches the pack would let npm fetch the registry's copy, and the job would
// pass without having tested the branch.
function assertInstalledFromThePacks(packs) {
  const { packages } = JSON.parse(readFileSync(join(target, "package-lock.json"), "utf8"));
  for (const [name, { version }] of packs) {
    const installed = Object.entries(packages).filter(([path]) =>
      path.endsWith(`node_modules/${name}`),
    );
    if (installed.length === 0) throw new Error(`${name} is not installed`);
    for (const [path, entry] of installed) {
      if (entry.version !== version || entry.resolved?.startsWith("http")) {
        throw new Error(
          `${path} is ${entry.version} from ${entry.resolved}, not the packed ${version}`,
        );
      }
    }
  }
}

const packs = packSharedPackages(`${target}-packs`);

run(process.execPath, [
  newModelerScript,
  target,
  "--notation",
  "capability-map",
  "--name",
  "Capability Map",
  "--ext",
  "capmap",
  "--repo",
  "capability-map-modeler",
]);

const themeTarget = join(target, "packages/renderer/src/theme");
for (const file of vendoredThemeFiles) {
  copyFileSync(join(vendoredThemeSource, file), join(themeTarget, file));
}

pointSharedPackagesAtThePacks(packs);

// Husky's prepare script would point this throwaway repository's hooks at the template's.
run("git", ["init", "--quiet"], { cwd: target });
run("npm", ["install", "--no-audit", "--no-fund"], {
  cwd: target,
  env: { ...process.env, HUSKY: "0" },
});
assertInstalledFromThePacks(packs);

// The placeholders changed line lengths.
run("npm", ["run", "format", "--", "--log-level=warn"], { cwd: target });

const packed = [...packs].map(([name, { version }]) => `${name}@${version}`).join(" and ");
console.log(`A modeler from the template is ready in ${target}, on ${packed} of this checkout.`);
