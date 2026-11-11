/** What the web app downloads. */
type DownloadKind = "png" | "svg" | "bmc";

const FALLBACK_FILE_BASE = "canvas";
/** Names the app gives a canvas itself; a download is not named after them. */
const DEFAULT_NAMES = new Set(["", "new business model", "untitled canvas"]);
const EXTENSIONS: Readonly<Record<DownloadKind, string>> = {
  png: ".png",
  svg: ".svg",
  bmc: ".bmc",
};

/** "Größe & Übergabe" -> "grosse-ubergabe": ASCII, lower case, dashes, at most 60 characters. */
function slugify(text: string): string {
  return text
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
}

/** Whether `name` is one the app gave the canvas rather than the user. */
export function isDefaultName(name: string | undefined): boolean {
  return DEFAULT_NAMES.has(name?.trim().toLowerCase() ?? "");
}

/** The download name of the canvas titled `name`, e.g. "miragon-modeler-suite.png". */
export function canvasFileName(name: string | undefined, kind: DownloadKind): string {
  const base = (isDefaultName(name) ? "" : slugify(name?.trim() ?? "")) || FALLBACK_FILE_BASE;
  return `${base}${EXTENSIONS[kind]}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, fileName: string, type: string): void {
  downloadBlob(new Blob([text], { type }), fileName);
}
