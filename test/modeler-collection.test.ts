import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const COLLECTION = "extensions/modeler-collection";

interface ExtensionManifest {
  name: string;
  publisher: string;
  extensionPack?: string[];
  contributes?: {
    walkthroughs?: { steps: { description: string; media: { markdown: string } }[] }[];
  };
}

function readManifest(directory: string): ExtensionManifest {
  return JSON.parse(
    readFileSync(join(ROOT, directory, "package.json"), "utf8"),
  ) as ExtensionManifest;
}

/**
 * Modelers whose extension is not on the Marketplace and Open VSX yet. A pack entry for an
 * extension that does not exist there breaks installing the pack, and the release publishes every
 * extension in parallel, so the new extension's first release comes first; the pull request after
 * it adds the pack entry and the walkthrough step and takes the modeler off this list.
 */
const PENDING_FIRST_PUBLISH: readonly string[] = ["c4"];

const collection = readManifest(COLLECTION);
const walkthroughSteps =
  collection.contributes?.walkthroughs?.flatMap((walkthrough) => walkthrough.steps) ?? [];
const modelers = readdirSync(join(ROOT, "modelers"));

function extensionIdOf(modeler: string): string {
  const extension = readManifest(`modelers/${modeler}/apps/vscode`);
  return `${extension.publisher}.${extension.name}`;
}

const suiteExtensionIds = modelers
  .filter((modeler) => !PENDING_FIRST_PUBLISH.includes(modeler))
  .map(extensionIdOf);

describe("the modeler collection", () => {
  it("leaves out only modelers of this suite whose extension is not published yet", () => {
    expect(PENDING_FIRST_PUBLISH.filter((modeler) => !modelers.includes(modeler))).toEqual([]);
    const pendingIds = PENDING_FIRST_PUBLISH.map(extensionIdOf);
    expect(collection.extensionPack?.filter((id) => pendingIds.includes(id)) ?? []).toEqual([]);
  });

  it.each(suiteExtensionIds)("packs %s", (extensionId) => {
    expect(collection.extensionPack).toContain(extensionId);
  });

  it.each(suiteExtensionIds)("walks through %s", (extensionId) => {
    const stepsOpeningTheTutorial = walkthroughSteps.filter((step) =>
      step.description.includes(`%22${extensionId}%23`),
    );
    expect(stepsOpeningTheTutorial).toHaveLength(1);
  });

  it("walks through every extension it packs, and only those", () => {
    const tutorialIds = walkthroughSteps.map(
      (step) => /openWalkthrough\?%22([^%]+)%23/.exec(step.description)?.[1],
    );
    expect(tutorialIds.sort()).toEqual([...(collection.extensionPack ?? [])].sort());
  });
});
