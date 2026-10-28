import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(packageDir, "src");
const modules = ["core", "dom", "diagram-js", "vscode", "export", "testing"] as const;

function filesUnder(directory: string, extension: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return filesUnder(path, extension);
    return path.endsWith(extension) ? [path] : [];
  });
}

const sourceFiles = filesUnder(sourceDir, ".ts").filter((path) => !path.endsWith(".test.ts"));

/** `./testing/vscode-electron` drives a real VS Code; only it may use these, as optional peers. */
const DRIVER_PEERS = ["@vscode/test-electron", "playwright-core"];
const driverDir = join(sourceDir, "testing", "vscode-electron");

function isDriverFile(path: string): boolean {
  return path === driverDir || path.startsWith(driverDir + sep);
}

function importSpecifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const pattern =
    /(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
  return [...code.matchAll(pattern)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? "",
  );
}

function moduleOf(path: string): string | undefined {
  const [first] = relative(sourceDir, path).split(sep);
  return modules.find((name) => name === first);
}

describe("package.json", () => {
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;

  it("has no runtime dependencies; the VS Code driver's peers are optional", () => {
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.optionalDependencies).toBeUndefined();
    expect(Object.keys(manifest.peerDependencies as Record<string, string>).sort()).toEqual(
      DRIVER_PEERS,
    );
    expect(manifest.peerDependenciesMeta).toEqual(
      Object.fromEntries(DRIVER_PEERS.map((peer) => [peer, { optional: true }])),
    );
  });

  it("mirrors every peer by an exact devDependency for its own build and tests", () => {
    const devDependencies = manifest.devDependencies as Record<string, string>;
    for (const peer of DRIVER_PEERS) expect(devDependencies[peer]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("pins every devDependency exactly", () => {
    const ranged = Object.entries(manifest.devDependencies as Record<string, string>).filter(
      ([, version]) => !/^\d+\.\d+\.\d+$/.test(version),
    );
    expect(ranged).toEqual([]);
  });

  // The sourcemaps in dist point at ../src, so the sources ship with them (tests excluded).
  it("publishes dist, the sources the sourcemaps name, API.md and the notices", () => {
    expect(manifest.files).toEqual([
      "dist",
      "src",
      "!src/**/*.test.ts",
      "API.md",
      "THIRD_PARTY_NOTICES.md",
    ]);
  });

  it("has one command, the VS Code smoke test in Docker, built from a source that starts with a shebang", () => {
    expect(manifest.bin).toEqual({ "modeler-shell-vscode-docker": "./dist/vscode-docker.js" });
    const cli = readFileSync(join(driverDir, "docker-cli.ts"), "utf8");
    expect(cli.split("\n")[0]).toBe("#!/usr/bin/env node");
    expect(readFileSync(join(packageDir, "tsup.config.ts"), "utf8")).toContain(
      '"vscode-docker": "src/testing/vscode-electron/docker-cli.ts"',
    );
  });
});

describe("third-party notices", () => {
  const icons = readFileSync(join(sourceDir, "dom", "icons.ts"), "utf8");
  const legalComment = /^\/\*![\s\S]*?\*\//.exec(icons)?.[0] ?? "";

  it("open icons.ts with a legal comment, so bundlers keep the Lucide and Feather attribution", () => {
    expect(legalComment).not.toBe("");
    for (const notice of [
      "lucide-static 1.59.0",
      "@license ISC",
      "Copyright (c) 2026 Lucide Icons and Contributors",
      "check, circle-x (x-circle), maximize,\n * minus, plus, triangle-alert (alert-triangle) and x",
      "Feather @license MIT",
      "Copyright (c) 2013-present Cole Bemis",
      "THIRD_PARTY_NOTICES.md",
    ]) {
      expect(legalComment).toContain(notice);
    }
  });

  it("name the same licences and holders in THIRD_PARTY_NOTICES.md", () => {
    const notices = readFileSync(join(packageDir, "THIRD_PARTY_NOTICES.md"), "utf8");
    for (const notice of [
      "lucide-static",
      "1.59.0",
      "ISC License",
      "Copyright (c) 2026 Lucide Icons and Contributors",
      "The MIT License (MIT)",
      "Copyright (c) 2013-present Cole Bemis",
    ]) {
      expect(notices).toContain(notice);
    }
  });
});

describe("sources", () => {
  it("never import diagram-js, vscode, Lucide, React or Playwright, not even as types; the VS Code driver only its peers", () => {
    const forbidden =
      /^(diagram-js|didi|tiny-svg|min-dom|min-dash|vscode|@vscode\/.*|lucide.*|react|react-dom|preact|@playwright\/.*|playwright|playwright-core)(\/|$)/;
    const offending = sourceFiles.flatMap((path) =>
      importSpecifiers(readFileSync(path, "utf8"))
        .filter((specifier) => forbidden.test(specifier))
        .filter((specifier) => !(isDriverFile(path) && DRIVER_PEERS.includes(specifier)))
        .map((specifier) => `${relative(packageDir, path)} → ${specifier}`),
    );
    expect(offending).toEqual([]);
  });

  // A static import would make loading the entry fail before the driver can explain the missing peer.
  it("reach the VS Code driver's peers only as types or through import()", () => {
    const staticImport = new RegExp(
      `^\\s*import\\s+(?!type\\b)[^;]*?from\\s*["'](${DRIVER_PEERS.join("|")})["']`,
      "m",
    );
    const offending = sourceFiles
      .filter(isDriverFile)
      .filter((path) => staticImport.test(readFileSync(path, "utf8")))
      .map((path) => relative(packageDir, path));
    expect(offending).toEqual([]);
  });

  it("keep the VS Code driver out of every entry but its own", () => {
    const ownEntry = join(sourceDir, "testing-vscode-electron.ts");
    const offending = sourceFiles
      .filter((path) => !isDriverFile(path) && path !== ownEntry)
      .flatMap((path) =>
        importSpecifiers(readFileSync(path, "utf8"))
          .filter(
            (specifier) =>
              specifier.startsWith(".") && isDriverFile(join(dirname(path), specifier)),
          )
          .map((specifier) => `${relative(packageDir, path)} → ${specifier}`),
      );
    expect(offending).toEqual([]);
  });

  it("import other modules only through their public index", () => {
    const offending = sourceFiles.flatMap((path) => {
      const own = moduleOf(path);
      if (!own) return [];
      return importSpecifiers(readFileSync(path, "utf8"))
        .filter((specifier) => specifier.startsWith("."))
        .filter((specifier) => {
          const target = moduleOf(join(dirname(path), specifier));
          if (!target || target === own) return false;
          const targetPath = relative(sourceDir, join(dirname(path), specifier))
            .split(sep)
            .join("/");
          const publicEntries =
            target === "vscode"
              ? ["vscode/extension/index.js", "vscode/webview/index.js"]
              : [`${target}/index.js`];
          return !publicEntries.includes(targetPath);
        })
        .map((specifier) => `${relative(packageDir, path)} → ${specifier}`);
    });
    expect(offending).toEqual([]);
  });

  it("keep core free of every other module", () => {
    const offending = sourceFiles
      .filter((path) => moduleOf(path) === "core")
      .flatMap((path) =>
        importSpecifiers(readFileSync(path, "utf8"))
          .filter(
            (specifier) =>
              !specifier.startsWith(".") || moduleOf(join(dirname(path), specifier)) !== "core",
          )
          .map((specifier) => `${relative(packageDir, path)} → ${specifier}`),
      );
    expect(offending).toEqual([]);
  });
});

describe("stylesheets", () => {
  const stylesheets = [
    ...filesUnder(sourceDir, ".css"),
    ...filesUnder(join(packageDir, "demo"), ".css"),
  ];
  const allowedTokens = /^--cd-(ui-|shell-|radius-|shadow-|motion-|ease)/;
  // Guide §8: the primary button's fill is fixed in both modes; only the button stylesheet reads it.
  const fixedButtonTokens = new Set(["--cd-blau", "--cd-blau-link", "--cd-weiss"]);
  const buttonStylesheet = join(sourceDir, "dom", "buttons.css");

  it("contain no colour literals", () => {
    const offending = stylesheets.flatMap((path) => {
      const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      const literals =
        css.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g) ?? [];
      return literals.map((literal) => `${relative(packageDir, path)}: ${literal}`);
    });
    expect(offending).toEqual([]);
  });

  it("use only the role, shell and non-colour tokens of the design system", () => {
    const offending = stylesheets.flatMap((path) => {
      const css = readFileSync(path, "utf8");
      const tokens = [...css.matchAll(/var\(\s*(--cd-[a-z0-9-]+)/g)].map((match) => match[1] ?? "");
      return tokens
        .filter((token) => !allowedTokens.test(token))
        .filter((token) => !(path === buttonStylesheet && fixedButtonTokens.has(token)))
        .map((token) => `${relative(packageDir, path)}: ${token}`);
    });
    expect(offending).toEqual([]);
  });

  it("are all imported by shell.css", () => {
    const entry = join(sourceDir, "shell.css");
    const imported = [...readFileSync(entry, "utf8").matchAll(/@import\s+"([^"]+)"/g)].map(
      (match) => join(sourceDir, match[1] ?? ""),
    );
    const parts = filesUnder(sourceDir, ".css").filter((path) => path !== entry);
    expect([...imported].sort()).toEqual([...parts].sort());
  });
});

describe("token fixture", () => {
  const fixtureDir = join(packageDir, "fixtures", "tokens");
  const css = readFileSync(join(fixtureDir, "cd-tokens.generated.css"), "utf8");
  const json = JSON.parse(readFileSync(join(fixtureDir, "cd-tokens.generated.json"), "utf8")) as {
    shell: Record<string, string>;
  };

  it("carries the vendoring header", () => {
    expect(css.split("\n")[0]).toMatch(
      /^\/\* Vendored unchanged from Miragon\/corporate-identity .*Do not edit; re-copy to update\. \*\/$/,
    );
  });

  it("has the same shell sizes in its CSS and JSON", () => {
    const cssSizes = Object.fromEntries(
      [...css.matchAll(/(--cd-shell-[a-z-]+):\s*([^;]+);/g)].map((match) => [
        match[1],
        match[2]?.trim(),
      ]),
    );
    expect(cssSizes).toEqual(json.shell);
  });
});
