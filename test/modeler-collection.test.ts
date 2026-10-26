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

const collection = readManifest(COLLECTION);
const walkthroughSteps =
  collection.contributes?.walkthroughs?.flatMap((walkthrough) => walkthrough.steps) ?? [];
const suiteExtensionIds = readdirSync(join(ROOT, "modelers")).map((modeler) => {
  const extension = readManifest(`modelers/${modeler}/apps/vscode`);
  return `${extension.publisher}.${extension.name}`;
});

describe("the modeler collection", () => {
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
