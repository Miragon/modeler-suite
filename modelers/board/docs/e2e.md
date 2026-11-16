# The board's e2e projects

A part of the board's guide, moved here from [`CLAUDE.md`](../CLAUDE.md) as it was written. That
file keeps what every change needs and names
[every part's document](../CLAUDE.md#the-parts-and-their-documents).
What is found out or changed about both projects of `e2e/` is written here.

`e2e/` holds the Playwright config with the projects `webapp` and `vscode-webview`, their specs
and the webview test page. Each project is described with the app it drives, and a change to one
is written there:

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
