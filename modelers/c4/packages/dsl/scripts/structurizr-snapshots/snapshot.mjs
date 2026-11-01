#!/usr/bin/env node
// Runs Structurizr 6.2.4 (Java 17 or later, Maven) over the vendored fixtures or over edited texts
// and writes what it accepts as JSON under test/fixtures/snapshots. Not part of CI: see README.md.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const HERE = import.meta.dirname;
const PACKAGE = resolve(HERE, "..", "..");
const FIXTURES = join(PACKAGE, "test", "fixtures", "structurizr");
const SNAPSHOTS = join(PACKAGE, "test", "fixtures", "snapshots");
const EDIT_TESTS = join(PACKAGE, "test", "edit");
const CASES = join(PACKAGE, "test", "semantic", "cases");
const STRUCTURIZR = { version: "6.2.4", commit: "e3a736a90194d3ac692ad7b5c1c7a48287355347" };

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function dslFiles(folder, suffix = ".dsl") {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

function classpath(workDirectory) {
  if (process.env.STRUCTURIZR_CLASSPATH) return process.env.STRUCTURIZR_CLASSPATH;
  const output = join(workDirectory, "classpath.txt");
  execFileSync(
    "mvn",
    [
      "-q",
      "-f",
      join(HERE, "pom.xml"),
      "dependency:build-classpath",
      `-Dmdep.outputFile=${output}`,
    ],
    { stdio: "inherit" },
  );
  return readFileSync(output, "utf8").trim();
}

function runSnapshot(args) {
  const workDirectory = mkdtempSync(join(tmpdir(), "c4-structurizr-"));
  try {
    const dependencies = classpath(workDirectory);
    execFileSync("javac", ["-cp", dependencies, "-d", workDirectory, join(HERE, "Snapshot.java")], {
      stdio: "inherit",
    });
    const output = execFileSync(
      "java",
      ["-cp", `${workDirectory}:${dependencies}`, "Snapshot", ...args],
      { maxBuffer: 256 * 1024 * 1024, encoding: "utf8" },
    );
    return JSON.parse(output);
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

function write(name, data) {
  const path = resolve(option("--out") ?? join(SNAPSHOTS, name));
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  execFileSync("npx", ["prettier", "--write", path], { stdio: "inherit", cwd: PACKAGE });
  console.log(`wrote ${relative(process.cwd(), path)}`);
}

function fixtures() {
  const source = resolve(option("--source") ?? FIXTURES);
  const files = dslFiles(FIXTURES).map((path) => relative(FIXTURES, path));
  write("structurizr-fixtures.json", {
    structurizr: STRUCTURIZR,
    results: runSnapshot(["fixtures", source, ...files]),
  });
  const cases = dslFiles(CASES).map((path) => relative(CASES, path));
  write("semantic-cases.json", {
    structurizr: STRUCTURIZR,
    results: runSnapshot(["fixtures", CASES, ...cases]),
  });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function edits() {
  const fuzz = option("--fuzz");
  const labelled = [
    ...dslFiles(EDIT_TESTS, ".after.dsl").map((path) => ({ path, file: relative(PACKAGE, path) })),
    ...(fuzz
      ? dslFiles(resolve(fuzz)).map((path) => ({
          path,
          file: `fuzz/${relative(resolve(fuzz), path)}`,
        }))
      : []),
  ];
  const results = runSnapshot(["edits", ...labelled.map(({ path }) => path)]);
  write("edit-acceptance.json", {
    structurizr: STRUCTURIZR,
    results: results.map((result, index) => {
      const entry = labelled[index];
      if (sha256(entry.path) !== result.sha256) throw new Error(`hash mismatch for ${entry.file}`);
      return { ...result, file: entry.file };
    }),
  });
}

if (process.argv.includes("--edits")) edits();
else fixtures();
