import type { Page } from '@playwright/test';

const RECORDED = '__svgImages';
const DATA_URL_PREFIX = 'data:image/svg+xml;charset=utf-8,';

/**
 * Records the SVG every image of the page loads, from before the first script runs. The shell's
 * `svgToPng` draws the diagram as an image from a data: URL, so the recording is the SVG as the
 * PNG shows it: with the Geist faces inlined, or the plain one after a font fallback. The PNG's
 * pixels would tell the same, only less exactly.
 */
export async function recordSvgImages(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, prefix]) => {
      const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (!source?.set) return;
      const assign = source.set;
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        ...source,
        set(this: HTMLImageElement, value: string) {
          if (value.startsWith(prefix as string)) {
            const recorded = window as unknown as Record<string, string[]>;
            (recorded[key as string] ??= []).push(
              decodeURIComponent(value.slice((prefix as string).length)),
            );
          }
          assign.call(this, value);
        },
      });
    },
    [RECORDED, DATA_URL_PREFIX],
  );
}

export function recordedSvgImages(page: Page): Promise<string[]> {
  return page.evaluate(
    (key) => (window as unknown as Record<string, string[] | undefined>)[key] ?? [],
    RECORDED,
  );
}

/** What `embedGeist` writes into the SVG: a Geist face with its font file as a data: URL. */
export const EMBEDDED_GEIST = {
  family: "font-family:'Geist Variable'",
  file: /src:url\("data:font\/woff2;base64,[A-Za-z0-9+/]{100,}/,
} as const;
