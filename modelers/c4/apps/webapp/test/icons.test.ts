import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (path: string) => new URL(`../${path}`, import.meta.url);
const html = readFileSync(file("index.html"), "utf8");

/** The public file a `<link rel>` of index.html points at; Vite serves `public/` at the root. */
function linkedPublicFile(rel: string): string | undefined {
  const href = new RegExp(`<link rel="${rel}"[^>]*\\shref="([^"]+)"`).exec(html)?.[1];
  return href === undefined ? undefined : `public/${href.replace(/^\.?\//, "")}`;
}

describe("the web app's icons", () => {
  it("links the C4 modeler icon as an SVG favicon", () => {
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    const favicon = linkedPublicFile("icon");
    expect(favicon).toBe("public/favicon.svg");
    expect(readFileSync(file(favicon!), "utf8")).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
  });

  it("links a 180 px PNG for the iOS home screen", () => {
    const touchIcon = linkedPublicFile("apple-touch-icon");
    expect(touchIcon).toBe("public/apple-touch-icon.png");
    const png = readFileSync(file(touchIcon!));
    expect([png.toString("latin1", 1, 4), png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
      "PNG",
      180,
      180,
    ]);
  });

  // The modeler icon stands for the tool; the start screen shows Miragon's comet.
  it("keeps the Miragon comet for the start screen, apart from the favicon", () => {
    expect(existsSync(file("public/miragon-komet-blau.svg"))).toBe(true);
    expect(readFileSync(file("public/miragon-komet-blau.svg"))).not.toEqual(
      readFileSync(file("public/favicon.svg")),
    );
  });
});
