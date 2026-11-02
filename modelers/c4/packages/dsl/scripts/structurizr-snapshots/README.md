# Structurizr reference snapshots

What Structurizr 6.2.4, the reference parser, makes of DSL texts, written as JSON that the unit
tests of `@miragon/c4-dsl` compare with. The snapshots are checked in, so the tests run without
Java; this script regenerates them. It is not part of CI.

## Requirements

- Java 17 or later (`java`, `javac`)
- Maven (`mvn`), which resolves `com.structurizr:structurizr-dsl:6.2.4` from Maven Central once
  (see `pom.xml`). To skip Maven, set `STRUCTURIZR_CLASSPATH` to the jars' classpath.

## Fixtures and cases

```sh
node packages/dsl/scripts/structurizr-snapshots/snapshot.mjs \
  --source <structurizr checkout>/structurizr-dsl/src/test/resources/dsl
```

Run from `modelers/c4`. It parses every `.dsl` file of `test/fixtures/structurizr/` (the
vendored fixtures) and of `test/semantic/cases/` (the builder's own cases) and writes
`test/fixtures/snapshots/structurizr-fixtures.json` and `semantic-cases.json`: per file whether
Structurizr accepts it (or the error it fails with), and for an accepted one the people,
software systems, containers, components and custom elements by canonical name, every
relationship with its implied flag, every static view's elements and relationships, and the
light-scheme styles.

`--source` points at a checkout of [structurizr/structurizr](https://github.com/structurizr/structurizr)
at the commit named in `test/fixtures/structurizr/NOTICE.md`: some fixtures include files, JSON
workspaces or images the vendored folder leaves out. Without `--source` the vendored folder is
read and those fixtures fail for the missing files. Fixtures that fail only for what the machine
lacks (a scripting engine, network access) are listed as such in `test/semantic/fixtures.test.ts`.

## Edit acceptance

```sh
node packages/dsl/scripts/write-fuzz-outputs.mjs <folder>
node packages/dsl/scripts/structurizr-snapshots/snapshot.mjs --edits --fuzz <folder>
```

The second command parses every golden `*.after.dsl` under `test/edit/` and every `.dsl` file of
`<folder>` (the seeded edit-fuzz outputs) and writes `test/fixtures/snapshots/edit-acceptance.json`:
per text its path, its SHA-256 and whether Structurizr accepts it (or the error). `--out <file>`
writes the JSON elsewhere instead.
