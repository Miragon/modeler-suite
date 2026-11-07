// Makes the images of the Orca plugins' pages in Orca's plugin directory, for every modeler in
// listing.json (or those passed with --modeler):
//   modelers/<modeler>/apps/orca/images/cover.webp           the branded image, 1600×1000
//   modelers/<modeler>/apps/orca/images/screenshot-orca.webp  the editor in a whole Orca window
// The shots come from a fresh Orca in the Orca smoke container (shoot.mjs), so they hold no data of
// this machine. --skip-shots reuses the PNGs of the last run in test-results/orca-listing-images.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const results = "test-results/orca-listing-images";
const listing = JSON.parse(readFileSync(join(here, "listing.json"), "utf8"));
const { values } = parseArgs({
  options: {
    modeler: { type: "string", multiple: true },
    orca: { type: "string" },
    "skip-shots": { type: "boolean", default: false },
  },
});
const modelers = values.modeler ?? Object.keys(listing);
for (const modeler of modelers) {
  if (!listing[modeler]) throw new Error(`${modeler} is not in listing.json`);
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
};

// The smoke runner calls `docker`; where that is only a shell alias for podman, a shim stands in.
const dockerPath = () => {
  if (spawnSync("docker", ["--version"], { stdio: "ignore" }).status === 0) return process.env.PATH;
  if (spawnSync("podman", ["--version"], { stdio: "ignore" }).status !== 0) {
    throw new Error("the Orca shots need docker or podman");
  }
  const shim = mkdtempSync(join(tmpdir(), "docker-shim-"));
  writeFileSync(join(shim, "docker"), '#!/bin/sh\nexec podman "$@"\n', { mode: 0o755 });
  return `${shim}:${process.env.PATH}`;
};

if (!values["skip-shots"]) {
  run("npm", ["run", "build", "-w", "packages/shell"]);
  const builds = Object.keys(listing).map((modeler) => `npm run ${modeler} build:orca`);
  const inContainer = [
    "npm run build:shared",
    ...builds,
    "node tooling/orca-listing-images/shoot.mjs",
  ];
  run(
    "node",
    [
      join(root, "packages/shell/dist/orca-docker.js"),
      ...(values.orca ? ["--orca", values.orca] : []),
      "--results",
      results,
      "--env",
      `LISTING_MODELERS=${modelers.join(",")}`,
      "--",
      "bash",
      "-c",
      inContainer.join(" && "),
    ],
    { env: { ...process.env, PATH: dockerPath() } },
  );
}

const asset = (path) => pathToFileURL(join(here, "assets", path)).href;
const font = pathToFileURL(
  createRequire(import.meta.url).resolve(
    "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  ),
).href;
const template = readFileSync(join(here, "cover.html"), "utf8");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  });
  // Chromium's canvas encodes the WEBP, scaling the double-resolution cover down on the way.
  const webp = async (png, width, height) => {
    const encoder = await browser.newPage();
    const dataUrl = await encoder.evaluate(
      async ({ source, width, height }) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = width ?? image.naturalWidth;
        canvas.height = height ?? image.naturalHeight;
        const context = canvas.getContext("2d");
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/webp", 0.9);
      },
      { source: `data:image/png;base64,${png.toString("base64")}`, width, height },
    );
    await encoder.close();
    return Buffer.from(dataUrl.split(",")[1], "base64");
  };

  for (const modeler of modelers) {
    const { title, claim } = listing[modeler];
    const shots = join(root, results);
    const html = template
      .replace("__FONT__", font)
      .replace("__ICON__", asset(`icons/${modeler}.svg`))
      .replace("__WORDMARK__", asset("miragon-logo-weiss.svg"))
      .replace("__EDITOR__", pathToFileURL(join(shots, `${modeler}-editor.png`)).href)
      .replace("__TITLE__", title)
      .replace("__CLAIM__", claim);
    const coverPage = join(shots, `${modeler}-cover.html`);
    writeFileSync(coverPage, html);
    await page.goto(pathToFileURL(coverPage).href);
    await page.evaluate(() => document.fonts.ready);
    const cover = await page.screenshot();

    const images = join(root, "modelers", modeler, "apps", "orca", "images");
    mkdirSync(images, { recursive: true });
    writeFileSync(join(images, "cover.webp"), await webp(cover, 1600, 1000));
    const window = readFileSync(join(shots, `${modeler}-window.png`));
    writeFileSync(join(images, "screenshot-orca.webp"), await webp(window));
    console.log(`[orca-listing-images] ${modeler}: ${images}`);
  }
} finally {
  await browser.close();
}
