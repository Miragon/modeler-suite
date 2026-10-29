/// <reference types="vite/client" />
import "@fontsource-variable/geist/wght.css";
import fontsourceCss from "@fontsource-variable/geist/wght.css?raw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GEIST_UNICODE_RANGES, embedGeist, pageGeistFaces, type GeistFace } from "./index.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const fakeFile = (name: string): string => `data:font/woff2;base64,${btoa(name)}`;

/** fontsource's subsets in its order, each with a file of its own name. */
const FONTSOURCE_FACES: GeistFace[] = [
  { src: fakeFile("cyrillic-ext"), unicodeRange: GEIST_UNICODE_RANGES.cyrillicExt },
  { src: fakeFile("cyrillic"), unicodeRange: GEIST_UNICODE_RANGES.cyrillic },
  { src: fakeFile("vietnamese"), unicodeRange: GEIST_UNICODE_RANGES.vietnamese },
  { src: fakeFile("latin-ext"), unicodeRange: GEIST_UNICODE_RANGES.latinExt },
  { src: fakeFile("latin"), unicodeRange: GEIST_UNICODE_RANGES.latin },
];

/** fontsource's `wght-italic.css`, which the Wardley Maps apps load after `wght.css`. */
const FONTSOURCE_ITALIC_FACES: GeistFace[] = [
  { src: fakeFile("cyrillic-ext-italic"), unicodeRange: GEIST_UNICODE_RANGES.cyrillicExt },
  { src: fakeFile("cyrillic-italic"), unicodeRange: GEIST_UNICODE_RANGES.cyrillic },
  { src: fakeFile("vietnamese-italic"), unicodeRange: GEIST_UNICODE_RANGES.vietnamese },
  { src: fakeFile("latin-ext-italic"), unicodeRange: GEIST_UNICODE_RANGES.latinExt },
  { src: fakeFile("latin-italic"), unicodeRange: GEIST_UNICODE_RANGES.latin },
].map((face) => ({ ...face, style: "italic", weight: "100 900" }));

const UPRIGHT = "font-family:'Geist Variable';font-style:normal;font-weight:100";
const ITALIC = "font-family:'Geist Variable';font-style:italic;font-weight:100";

function diagram(label: string): string {
  return (
    `<svg xmlns="${SVG_NAMESPACE}" width="200" height="80"><rect width="200" height="80"/>` +
    `<text font-family="'Geist Variable', 'Geist', ui-sans-serif">${label}</text></svg>`
  );
}

function parse(svg: string): Element {
  return new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
}

function fontFaces(root: Element): string[] {
  return root.querySelector("defs > style")?.textContent?.match(/@font-face\{[^}]*\}/g) ?? [];
}

function preloadTexts(root: Element): string[][] {
  const preload = root.children[1];
  return Array.from(preload?.children ?? [], (text) => [
    text.localName,
    text.getAttribute("style") ?? "",
    text.textContent ?? "",
  ]);
}

/** A unicode-range as the CSSOM or fontsource writes it, compared without spaces and leading zeros. */
function normalizedRange(range: string | undefined): string {
  return (range ?? "")
    .replace(/\s/g, "")
    .toUpperCase()
    .replace(/(U\+|-)0+(?=[0-9A-F])/g, "$1");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GEIST_UNICODE_RANGES", () => {
  it("are the ranges of the @fontsource-variable/geist the shell is tested with, in its order", () => {
    const declared = [...fontsourceCss.matchAll(/unicode-range:\s*([^;]+);/g)].map((match) =>
      match[1]?.trim(),
    );
    expect(Object.values(GEIST_UNICODE_RANGES)).toEqual(declared);
  });
});

describe("embedGeist", () => {
  it("puts the faces the text uses into a <style> ahead of the drawing, each loaded by a hidden text", async () => {
    const root = parse(await embedGeist(diagram("Cup of Tea from Łódź"), FONTSOURCE_FACES));
    const [defs, preload, drawing] = Array.from(root.children);
    expect(defs?.localName).toBe("defs");
    expect(defs?.firstElementChild?.localName).toBe("style");
    const faces = fontFaces(root);
    expect(faces).toEqual([
      "@font-face{font-family:'Geist Variable';font-style:normal;font-weight:100 900;" +
        `font-display:swap;src:url("${fakeFile("latin-ext")}");` +
        `unicode-range:${GEIST_UNICODE_RANGES.latinExt}}`,
      "@font-face{font-family:'Geist Variable';font-style:normal;font-weight:100 900;" +
        `font-display:swap;src:url("${fakeFile("latin")}");` +
        `unicode-range:${GEIST_UNICODE_RANGES.latin}}`,
    ]);
    expect(preload?.localName).toBe("g");
    expect(preload?.getAttribute("visibility")).toBe("hidden");
    expect(preloadTexts(root)).toEqual([
      ["text", UPRIGHT, "Ł"],
      ["text", UPRIGHT, "C"],
    ]);
    expect(drawing?.localName).toBe("rect");
    expect(root.querySelector("svg > text")?.textContent).toBe("Cup of Tea from Łódź");
  });

  it("sets each hidden text in a character no face declared after it draws, from its own range where the text has only white space for it", async () => {
    const samples = async (label: string): Promise<string[]> =>
      preloadTexts(parse(await embedGeist(diagram(label), FONTSOURCE_FACES))).map(
        ([, , sample]) => sample ?? "",
      );
    expect(await samples("Tee: Чай, Łódź")).toEqual(["Ч", "Ł", "T"]);
    // vietnamese and latin-ext both hold Ă; latin-ext, declared later, draws it
    expect(await samples("Ăn ạ")).toEqual(["ạ", "Ă", "n"]);
    // latin is in only for the space
    expect(await samples("Чай чай")).toEqual(["Ч", "!"]);
  });

  it("compares a face only with the later faces of its style and weight, and sets its hidden text in them", async () => {
    const root = parse(
      await embedGeist(diagram("Kettle from Łódź"), [
        ...FONTSOURCE_FACES,
        ...FONTSOURCE_ITALIC_FACES,
      ]),
    );
    expect(fontFaces(root).map((face) => /src:url\("([^"]+)"\)/.exec(face)?.[1])).toEqual([
      fakeFile("latin-ext"),
      fakeFile("latin"),
      fakeFile("latin-ext-italic"),
      fakeFile("latin-italic"),
    ]);
    expect(preloadTexts(root)).toEqual([
      ["text", UPRIGHT, "Ł"],
      ["text", UPRIGHT, "K"],
      ["text", ITALIC, "Ł"],
      ["text", ITALIC, "K"],
    ]);
  });

  it("embeds a face without a unicode-range for every text, and gives a data: URL of another type the font type", async () => {
    const root = parse(
      await embedGeist(diagram("Tea"), [{ src: "data:application/octet-stream;base64,AAAA" }]),
    );
    expect(fontFaces(root)).toEqual([
      "@font-face{font-family:'Geist Variable';font-style:normal;font-weight:100 900;" +
        'font-display:swap;src:url("data:font/woff2;base64,AAAA")}',
    ]);
    expect(preloadTexts(root)).toEqual([["text", UPRIGHT, "T"]]);
  });

  it("keeps the weight and style a face names, and sets its hidden text in their first value", async () => {
    const root = parse(
      await embedGeist(diagram("Tea"), [
        { src: fakeFile("latin"), weight: "400", style: "italic", unicodeRange: "U+0-FF" },
        { src: fakeFile("latin-bold"), weight: "700", style: "italic", unicodeRange: "U+0-FF" },
        { src: fakeFile("latin-slanted"), style: " Oblique  0deg 10deg ", unicodeRange: "U+0-FF" },
      ]),
    );
    expect(fontFaces(root)).toEqual([
      "@font-face{font-family:'Geist Variable';font-style:italic;font-weight:400;" +
        `font-display:swap;src:url("${fakeFile("latin")}");unicode-range:U+0-FF}`,
      "@font-face{font-family:'Geist Variable';font-style:italic;font-weight:700;" +
        `font-display:swap;src:url("${fakeFile("latin-bold")}");unicode-range:U+0-FF}`,
      "@font-face{font-family:'Geist Variable';font-style:oblique 0deg 10deg;font-weight:100 900;" +
        `font-display:swap;src:url("${fakeFile("latin-slanted")}");unicode-range:U+0-FF}`,
    ]);
    expect(preloadTexts(root)).toEqual([
      ["text", "font-family:'Geist Variable';font-style:italic;font-weight:400", "T"],
      ["text", "font-family:'Geist Variable';font-style:italic;font-weight:700", "T"],
      ["text", "font-family:'Geist Variable';font-style:oblique 0deg;font-weight:100", "T"],
    ]);
  });

  it("reads the wildcards of a unicode-range", async () => {
    const wildcard: GeistFace = { src: fakeFile("cyrillic"), unicodeRange: "u+4??" };
    expect(fontFaces(parse(await embedGeist(diagram("Ж"), [wildcard])))).toHaveLength(1);
    expect(await embedGeist(diagram("a"), [wildcard])).toBe(diagram("a"));
  });

  it("returns an SVG without text, or without a face for its text, as it is", async () => {
    const blank = `<svg xmlns="${SVG_NAMESPACE}" width="10" height="10"><rect width="10" height="10"/></svg>`;
    expect(await embedGeist(blank, FONTSOURCE_FACES)).toBe(blank);
    expect(await embedGeist(diagram("Tea"), [])).toBe(diagram("Tea"));
    expect(await embedGeist(diagram("字"), FONTSOURCE_FACES)).toBe(diagram("字"));
  });

  it("refuses an SVG that does not parse", async () => {
    await expect(embedGeist("<svg", FONTSOURCE_FACES)).rejects.toThrow(/does not parse/);
    await expect(embedGeist("<html/>", FONTSOURCE_FACES)).rejects.toThrow(/does not parse/);
  });

  it("fetches a face's file once per page and puts it in as a data: URL", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(new Uint8Array([1, 2, 3])));
    const face: GeistFace = { src: "/fonts/once/geist-latin.woff2", unicodeRange: "U+0-FF" };
    const first = await embedGeist(diagram("Tea"), [face]);
    const second = await embedGeist(diagram("Cup"), [face]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(new URL(face.src, document.baseURI).href);
    expect(first).toContain('src:url("data:font/woff2;base64,AQID")');
    expect(second).toContain('src:url("data:font/woff2;base64,AQID")');
  });

  it("rejects when a file cannot be read, and fetches it again on the next export", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    const face: GeistFace = { src: "/fonts/retry/geist-latin.woff2", unicodeRange: "U+0-FF" };
    await expect(embedGeist(diagram("Tea"), [face])).rejects.toThrow(/answered 404/);
    expect(await embedGeist(diagram("Tea"), [face])).toContain("data:font/woff2;base64,AQID");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("takes the page's own faces when it is given none", async () => {
    const root = parse(await embedGeist(diagram("Kettle from Łódź")));
    const faces = fontFaces(root);
    expect(faces).toHaveLength(2);
    for (const face of faces) expect(face).toMatch(/src:url\("data:font\/woff2;base64,/);
    expect(preloadTexts(root).map(([, , sample]) => sample)).toEqual(["Ł", "K"]);
  });
});

describe("pageGeistFaces", () => {
  it("reads every 'Geist Variable' face of the page's stylesheets in their order, each file resolved", () => {
    const faces = pageGeistFaces();
    expect(faces.map((face) => /geist-[a-z-]+-wght-normal/.exec(face.src)?.[0])).toEqual([
      "geist-cyrillic-ext-wght-normal",
      "geist-cyrillic-wght-normal",
      "geist-vietnamese-wght-normal",
      "geist-latin-ext-wght-normal",
      "geist-latin-wght-normal",
    ]);
    for (const face of faces) {
      expect(face.src.startsWith(`${location.origin}/`)).toBe(true);
      expect(face.weight).toBe("100 900");
      expect(face.style).toBe("normal");
    }
    expect(faces.map((face) => normalizedRange(face.unicodeRange))).toEqual(
      Object.values(GEIST_UNICODE_RANGES).map(normalizedRange),
    );
  });

  it("looks into @media, leaves other families out and takes a face declared twice once", () => {
    const [latin] = pageGeistFaces().slice(-1);
    const style = document.createElement("style");
    style.textContent =
      `@media all { @font-face { font-family: "Geist Variable"; src: url("data:font/woff2;base64,AAAA") format("woff2"); unicode-range: U+1F600; } }` +
      `@font-face { font-family: "Geist Mono Variable"; src: url("/fonts/mono.woff2"); }` +
      `@font-face { font-family: 'Geist Variable'; src: url("${latin?.src}"); unicode-range: ${latin?.unicodeRange}; }`;
    document.head.append(style);
    try {
      const faces = pageGeistFaces();
      expect(faces).toHaveLength(6);
      expect(faces.at(-1)).toMatchObject({
        src: "data:font/woff2;base64,AAAA",
        unicodeRange: expect.stringMatching(/^U\+1F600$/i),
      });
      expect(faces.some((face) => face.src.endsWith("/fonts/mono.woff2"))).toBe(false);
    } finally {
      style.remove();
    }
  });
});
