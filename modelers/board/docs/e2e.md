# The board's e2e projects

A part of the board's guide, moved here from [`CLAUDE.md`](../CLAUDE.md) as it was written. That
file keeps what every change needs and names
[every part's document](../CLAUDE.md#the-parts-and-their-documents).
What is found out or changed about both projects of `e2e/` is written here.

`e2e/` holds the Playwright config with the projects `webapp` and `vscode-webview`, their specs
and the webview test page, and, apart from both, [the bench](#the-bench-e2ebench). Each project
is described with the app it drives, and a change to one is written there:

- the config and the project `webapp` with the web app, under "The e2e project"
  ([`webapp.md`](webapp.md#the-web-app-and-the-example-appswebapp-example-e2e));
- the webview test page and the project `vscode-webview` with the VS Code extension
  ([`vscode.md`](vscode.md#the-webview-test-page-and-the-project-vscode-webview-e2e)).

## Tests of this part

The other projects and the rules of a test are under [Tests](../CLAUDE.md#tests).

- `npm run board test:e2e` (Playwright) runs 36 tests in two projects, the board's own specs in
  the place of the shell's conformance kit
  ([Three deviations under the shell](ide-editor.md#three-deviations-under-the-shell-each-with-an-end)).
  `e2e/tests/webapp/board.spec.ts` (10 tests) is under
  [The web app](webapp.md#the-web-app-and-the-example-appswebapp-example-e2e): the start screen, the
  example with seven engines ready and no page error, what is kept over a reload and the reset, a
  new board, a file opened through the browser's dialog, the download's bytes, the view kept
  over a reload, a picture dropped onto the example, and two narrow
  windows. `e2e/tests/vscode` (26 tests: `document-sync` 4,
  `files` 13, `shipped-bundle` 2, `view` 3, `drop` 3, `card` 1) is under
  [The webview test page and the project `vscode-webview`](vscode.md#the-webview-test-page-and-the-project-vscode-webview-e2e).
  `e2e/tests/support/input.ts` is what both projects share: a point of the bare pane, and a
  real drag of a file.

## A real drag of a file

`dragFile(page, file)` of `tests/support/input.ts` drags a file of the disk into the page as real
input: Chromium's own drag events through the DevTools protocol (`Input.dispatchDragEvent` on a
CDP session of the page, with the file's path in the drag data). They are trusted, are aimed by
hit testing as a pointer's are, carry the keys that are held (`SHIFT` is the protocol's bit for
Shift) and hand the page the file itself at the drop and not before, as a drag from a file
manager does: seen in the headless shell, `dataTransfer.types` is `Files` and `files` is empty
during the drag and holds the file at the drop. Playwright's own `locator.drop()` dispatches
events of its own making at an element and takes no key, so it reaches neither the hit testing
nor Shift. A test writes its file into its own output folder (`testInfo.outputPath`). This is as
far as a drop is reached here: what stands around the page in a real VS Code, which takes a
dragged file for itself before the webview's page hears of it, is not in it
([The webview half](vscode.md#the-webview-half-srcwebview)). The same drag, made on VS Code's own
window in the Docker runner, is how the walk of the fourth increment saw both
([item 15](vscode.md#taken-for-granted-for-daily-use-as-seen-in-a-real-vs-code)). Chromium only: the two projects run
no other browser.

## The local config of Playwright Test

The commands in short are under [Commands](../CLAUDE.md#commands), with the rule for a machine
where Chromium must not run without its sandbox and the local config of the browser project. The
local config of Playwright Test, for such a machine:

`modelers/board/e2e/playwright.sandbox.config.ts` spreads the committed `playwright.config.ts`
and sets `launchOptions.chromiumSandbox` in `use` and in every project, because a project's own
`launchOptions` replace the shared ones whole:

```ts
import { defineConfig } from "@playwright/test";
import committed from "./playwright.config.ts";

type Use = NonNullable<typeof committed.use>;

const sandboxed = (use: Use | undefined): Use => ({
  ...use,
  launchOptions: { ...use?.launchOptions, chromiumSandbox: true },
});

export default defineConfig({
  ...committed,
  use: sandboxed(committed.use),
  projects: (committed.projects ?? []).map((project) => ({
    ...project,
    use: sandboxed(project.use),
  })),
});
```

```sh
cd modelers/board/e2e
npx playwright test --config playwright.sandbox.config.ts --project=webapp
npx playwright test --config playwright.sandbox.config.ts --project=vscode-webview
```

Playwright Test starts that way on the agent VM, with both `webServer` entries. Either project
starts both dev servers (ports 5184 and 5194) and stops them again.

## The bench (`e2e/bench`)

`npm run board bench` measures the board with many models in Chromium: the web app's production
build and the extension's production webview bundle, on boards the bench generates. It measures
and asserts no budget, so it is no part of the gate: `npm run board test:e2e` does not collect it
(its config's `testDir` is `tests/`), no job of CI calls it, and no test of the gate reads a
clock or a heap for it. What the numbers are, how a run is read and what was measured is in
[`many-models.md`](many-models.md); this section is the bench as code.

- **It runs under Playwright Test with a config of its own**, `bench/playwright.config.ts`
  (`"bench": "playwright test --config bench/playwright.config.ts"` in the workspace, and
  `npm run board bench` in front of it): one worker, no retry, no time limit, the projects
  `webapp` and `webview`. Playwright Test is the runner because the bench reads the extension's
  editor options and the shell's test helpers from their TypeScript sources, as the specs do. A
  flag after `npm run board bench` never reaches it (the suite's rule for flags), so a run is
  told what to do through variables, which `bench/settings.ts` reads: `BOARD_BENCH_BOARDS` (the
  generator's names, comma separated; default every standard board), `BOARD_BENCH_RUNS` (default
  5), `BOARD_BENCH_RUN` (`cold`, `warm` or `cold,warm`), `BOARD_BENCH_OUT` (default
  `e2e/test-results/bench`, which Git ignores), `BOARD_BENCH_WEBAPP_PORT` and
  `BOARD_BENCH_WEBVIEW_PORT` (5186 and 5196, strict and apart from the e2e projects' 5184 and
  5194), `BOARD_BENCH_LOAD_LIMIT_MS` (300,000) and `BOARD_BENCH_SANDBOX`. One project alone:
  `npm run bench -w modelers/board/e2e -- --project=webview`.
- **Chromium's sandbox is on unless the environment turns it off** (`BOARD_BENCH_SANDBOX=off`,
  for a container in which the sandbox cannot start). That is the other way round than the two
  e2e projects, whose committed config leaves Playwright's default and whose local config turns
  the sandbox on: a bench is run by hand on a person's machine, where a browser without its
  sandbox is no default to have. So on a machine where Chromium must keep its sandbox the bench
  runs as it is, with no local config.
- **The files.** `generate.ts` (the boards; it imports nothing of the workspace, so
  `node modelers/board/e2e/bench/generate.ts <folder>` writes them as files, with `large` also
  the repository of 2,000 models among 20,000 other files), `build.ts` (the run's global setup:
  both production builds, from the tree as it is, into the bench's folder and never into an
  app's `dist`), `serve.ts` (the two servers), `page-probe.ts` (the bench's eyes inside the
  page, an init script), `extension-stand-in.ts` (what the extension answers, inside the page),
  `measure.ts` (a quiet load and a panned one, measured), `boards.ts` (the runs of a place), `report.ts` and
  `summary.ts` (the results), `webapp.bench.ts` and `webview.bench.ts` (the two places).
- **The web app's build** is `apps/webapp` under its own Vite config with one module swapped:
  `src/example.ts`, which reads the example folder when the app is built, is replaced by a
  module of the same export that reads the repository from the page (`REPOSITORY_GLOBAL`, set
  by an init script). So one build shows every generated board, and everything else is the app
  as it ships: its chunks, its notices, its start. A page is opened with `?reset`, which opens
  the example fitted and with nothing kept.
- **The webview's build** is the extension's own options for the VSIX
  (`bundleOptions({ production: true }).web` of `apps/vscode/esbuild.config.mjs`) with another
  output folder. It is served with the document and the policy the extension writes: the
  shell's `openWebviewBundle` answers a page through a route of Playwright, and a route turns
  the browser's cache off, so the bench hands that function a page of its own making and
  answers a real server with what it would have answered the route (the document, the shell's
  stand-in for VS Code's script, the bundle's files). The policy then names the bench's server
  as its source. The extension's side is `extension-stand-in.ts`: it answers `ready`,
  `board.hello`, `board.text.open` and `board.bytes.read` from a repository in memory, each
  answer in a task of its own. `esbuild` is imported without a line in the workspace's
  manifest and resolves through the workspace's hoisting, as the specs' imports of the other
  workspaces do.
- **No number is taken through a MutationObserver.** The probe looks on a 10 ms timer and in
  animation frames, finds each model node's editor element once and then reads one attribute
  of it: an observer on a subtree is asked for every attribute a modeler writes while it
  draws, which is the work that is measured.
- **A board is loaded twice per run and temperature** (`boards.ts`): once left alone
  (`measureLoad`: T2, and at rest a pan, the memory, the scripted two seconds and the arming),
  and once panned throughout (`measureAnswers`: T1 and the pans of the load). A pan is a frame
  the page has to produce, so the two are different loads. The cold panned load has a browser
  context of its own; the warm one is the fourth load of its context. It starts its pans at a
  point the quiet load found: bare pane with 3 px of pane around it once the board is fitted
  (`roomyPanePoint` of the probe, `RunNumbers.pane`).
- **The probe tells the bench what it has to know without being asked** (`BENCH_BINDING`, a
  function the bench puts into the page with `page.exposeBinding`): `drawn` once the board has
  drawn, `frame` once the frame after a move of a held drag was produced, `missed` for a press
  it kept from the board. A page answers a question of the bench (`page.evaluate`) behind the
  tasks it queued before, which while a board loads is behind the whole load. The first bench
  panned only after such an answer, and a load got no pan to three pans.
- **A pan is a hand's** (`panByHand` in `measure.ts`): the press, 60 ms later the move, and
  once the page drew that the release. The move is alone in its frame, so the answer is the
  answer to the move. The first bench sent the four events of a pan at once (`pan`, which stays
  for whoever wants that frame): the press and the release are then in the frame as well, 138.4 ms on the board of 200 models at rest where a move after a press took 85.8 ms. The browser
  sends no move for a press that was cancelled, so a press the probe keeps from the board (it
  landed on a node) is told as `missed` and its pan ends there.
- **The pans of a load begin when the board has drawn and leave the load half of the page's
  time** (`panDuring`): the next pan follows once the last one was answered and as long again
  has passed, and at least 50 ms. Pans sent as fast as the page takes them are no measure: a
  board of 200 models then did not finish loading in ten minutes. A pan waits 400 ms for its
  frame and goes on without it; the probe has the answer's time all the same. A panned load is
  given up after six times the quiet load's T2, and at least 30 s, and read as it stands.
- **A pan is answered when the frame that shows it has been produced**, and the probe sees that
  with a task of the highest priority that it queues in the frame's own callback
  (`scheduler.postTask` with `user-blocking`, `afterPaint` in `page-probe.ts`). The first bench
  queued a message task there, which waits behind every task the page queued earlier: while a
  board loaded, that was behind every text still to be mounted, and a pan of the load read as
  answered when the load had ended (on the board of 60 models a median of 1,107.8 ms by the
  message task where the frame was produced after 37.8 ms, five runs in one sitting). A pan
  counts when its press began on the bare pane, whether or not the view is another one by its
  frame; the probe keeps a press that lands on a node from the board, and its click and its
  double-click with it.
- **Two yardsticks** stand beside every quiet load: a fixed loop in the bench's own process,
  and the same loop on six threads at once. A browser that draws in software works on several
  threads, and the loop alone does not see a minute in which the host leaves the machine one
  processor ([`many-models.md`](many-models.md#the-machine)).
- **A run that is no run fails.** A model node that failed, a preview that said ready and drew
  nothing, a preview that never comes within the limit, an error of the page and a panned load
  in which no pan moved the board each end the board's test with a sentence that says which,
  and with a picture of the page under `failures/` in the bench's folder.
- **Without a test:** the bench itself. Its generator is held by what the bench does with its
  boards (every node of a board has to become a drawn preview, or the run fails), and nothing
  in the gate reads the bench's code but ESLint and the type check of this workspace.
