/** The native file extension: Structurizr DSL under a name of its own. */
export const NATIVE_EXTENSION = ".c4";

/** What the Structurizr DSL export downloads: the name Structurizr's own tools look for. */
export const WORKSPACE_FILE_NAME = "workspace.dsl";

/**
 * What Open… and the drop zone take: the native file, a Structurizr DSL file and plain text. The
 * MIME type decides during a drag, the extension at the drop (guide §9); `.c4` and `.dsl` files
 * have no MIME type a browser knows.
 */
export const OPENABLE_FILE_TYPES: readonly string[] = [
  NATIVE_EXTENSION,
  ".dsl",
  ".txt",
  "text/plain",
];

const FALLBACK_BASE = "workspace";
const MAX_SLUG_LENGTH = 60;

/** "Größe & Übergabe" → "grosse-ubergabe", "SystemLandscape" → "system-landscape". */
export function slugify(text: string): string {
  return text
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");
}

/** The whole workspace as the native file, named after it: "bookshop.c4", else "workspace.c4". */
export function nativeFileName(workspaceName: string): string {
  return `${slugify(workspaceName) || FALLBACK_BASE}${NATIVE_EXTENSION}`;
}

/**
 * A picture shows one view, so its name has the workspace and the view:
 * "bookshop-containers-bookshop.png".
 */
export function pictureFileName(
  workspaceName: string,
  viewKey: string,
  extension: "png" | "svg",
): string {
  const parts = [slugify(workspaceName) || FALLBACK_BASE, slugify(viewKey)].filter(Boolean);
  return `${parts.join("-")}.${extension}`;
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
