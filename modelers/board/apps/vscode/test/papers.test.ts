import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SUITE_SUFFIXES } from "board-suite-editors/suffixes";
import { describe, expect, test } from "vitest";

/**
 * The papers a person who installs the extension reads, and what the VSIX takes of them: the
 * README, the CHANGELOG, the icon and the manifest's lines that name them.
 */

const APP = fileURLToPath(new URL("../", import.meta.url));
const read = (file: string): string => readFileSync(join(APP, file), "utf8");

const manifest = JSON.parse(read("package.json")) as {
  icon: string;
  galleryBanner: { color: string; theme: string };
  preview: boolean;
  version: string;
  scripts: Record<string, string>;
};

/** `.vscodeignore` as vsce reads it: one glob per line, from the extension's folder. */
const ignored = read(".vscodeignore")
  .split("\n")
  .filter((line) => line !== "" && !line.startsWith("#"))
  .map(
    (glob) =>
      new RegExp(
        `^${glob
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*\//g, "(?:.*/)?")
          .replace(/\*\*/g, ".*")
          .replace(/(?<!\.)\*/g, "[^/]*")}$`,
      ),
  );
const leftOut = (path: string): boolean => ignored.some((pattern) => pattern.test(path));

describe("the extension's icon", () => {
  const icon = readFileSync(join(APP, manifest.icon));

  test("is a PNG of 256 x 256, as the Marketplace takes it", () => {
    expect(manifest.icon).toBe("icon.png");
    expect(icon.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect([icon.readUInt32BE(16), icon.readUInt32BE(20)]).toEqual([256, 256]);
  });

  // A board on its stand with two cards, drawn in the icon system of the suite's modelers (the
  // blue tile, a white stroke of 2 on a grid of 24, one green accent) on the owner's word: the
  // Miragon modeler icon set had no board icon. `icon.svg` is its source, and a new rendering
  // changes this sum on purpose.
  test("is the board on its stand, as icon.svg was rendered", () => {
    expect(createHash("sha256").update(icon).digest("hex")).toBe(
      "ad753dfa9eda6bfbee8d71478dd9445d455727a4212ab4e9809a6eced2ce963d",
    );
  });

  test("stands on the banner every extension of the suite has", () => {
    expect(manifest.galleryBanner).toEqual({ color: "#335DE5", theme: "dark" });
  });
});

describe("what the VSIX takes of the papers", () => {
  test.each([
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "icon.png",
    "package.json",
    "dist/extension.cjs",
    "dist/webview.js",
    "dist/webview.css",
    "dist/fonts/geist-latin-wght-normal-T72VVCUW.woff2",
    "dist/THIRD_PARTY_NOTICES.md",
    "dist/dagre.esm.js.LEGAL.txt",
  ])("ships %s", (path) => {
    expect(leftOut(path)).toBe(false);
  });

  test.each([
    "src/extension.ts",
    "src/webview/main.ts",
    "test/papers.test.ts",
    "test-smoke/vscode-smoke.test.ts",
    "scripts/check-notices.mjs",
    "node_modules/esbuild/package.json",
    "esbuild.config.mjs",
    "tsconfig.json",
    "dist/webview.js.map",
    "dist/extension.cjs.map",
    "icon.svg",
  ])("leaves %s out", (path) => {
    expect(leftOut(path)).toBe(true);
  });

  test("has a script that checks the packed extension's notices and papers", () => {
    expect(manifest.scripts["check:notices"]).toBe("node scripts/check-notices.mjs");
  });
});

describe("the CHANGELOG", () => {
  const changelog = read("CHANGELOG.md");
  const versions = [...changelog.matchAll(/^## \[?(\d+\.\d+\.\d+)\b.*$/gm)];

  // release-please puts the notes of a release before the first heading it takes for a version
  // (its updater looks for /\n###? v?[0-9[]/). A file without one is kept whole below the new
  // notes with its title turned into a second-level heading.
  test("has a version heading that release-please writes its notes above", () => {
    expect(changelog.startsWith("# Changelog\n")).toBe(true);
    const firstVersion = changelog.search(/\n###? v?[0-9[]/);
    expect(changelog.slice(0, firstVersion)).toBe("# Changelog\n");
    expect(changelog.slice(firstVersion + 1).startsWith(versions[0]?.[0] ?? "no version")).toBe(
      true,
    );
  });

  test("has the manifest's version on top, and ends with the entry from before any release", () => {
    expect(versions[0]?.[1]).toBe(manifest.version);
    const oldest = versions.at(-1);
    expect(oldest?.[0]).toBe("## 0.0.0");
    expect(changelog.slice(oldest?.index)).toMatch(/^## 0\.0\.0\n\nNot released: /);
  });
});

describe("the README", () => {
  const readme = read("README.md");
  const headings = [...readme.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

  test("says what a person who installs the extension has to know, in this order", () => {
    expect(headings).toEqual([
      "Install",
      "Get started",
      "Models, edited in place",
      "Notes, pictures, groups and arrows",
      "The board is a text file",
      "Which files a board reaches",
      "What it cannot do yet",
      "Good to know",
      "Third-party software",
      "Feedback",
    ]);
  });

  test("says that it is a preview exactly while the manifest does", () => {
    expect(/^\*\*Preview\.\*\* /m.test(readme)).toBe(manifest.preview);
  });

  // The VSIX carries this file onto the listing of a marketplace, and nothing but the release
  // pull request stands between a merge and a publish: a sentence that is true only before one
  // would be untrue on the listing itself.
  test("says nothing of where it is published, which a release would make untrue", () => {
    expect(readme).not.toMatch(/marketplace|\bpublish|\bbranch\b|open vsx/i);
  });

  test("names every file suffix the board shows as a model", () => {
    for (const { kind, suffixes } of SUITE_SUFFIXES) {
      const row = readme.split("\n").find((line) => line.startsWith(`| ${kind} `));
      expect(row, kind).toBeDefined();
      for (const suffix of suffixes) expect(row, kind).toContain(`\`${suffix}\``);
    }
  });

  test("says where the third-party notices of the installed extension are", () => {
    expect(readme).toContain("`dist/THIRD_PARTY_NOTICES.md`");
  });

  // vsce rewrites a relative link to the repository's main branch, where a preview's files are
  // not yet.
  test("links only to whole addresses and to its own headings", () => {
    const targets = [...readme.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1] ?? "");
    expect(targets.length).toBeGreaterThan(0);
    const slugs = headings.map(
      (heading) =>
        `#${heading
          ?.toLowerCase()
          .replace(/[^a-z0-9 ]/g, "")
          .replace(/ /g, "-")}`,
    );
    for (const target of targets) {
      expect(target.startsWith("https://") || slugs.includes(target), target).toBe(true);
    }
    expect(readme).not.toMatch(/!\[/);
  });
});
