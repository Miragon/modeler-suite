import { isKeyword } from "./keywords.js";
import type { ElementId, ElementKind, IdentifierMode, IdentifierRegister } from "./types.js";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const COMBINING_MARKS = /\p{M}+/gu;
const WORD_SEPARATORS = /[^A-Za-z0-9]+/;

const KIND_WORDS: Readonly<Record<ElementKind, string>> = {
  person: "person",
  softwareSystem: "softwareSystem",
  container: "container",
  component: "component",
  custom: "element",
};

/**
 * A readable identifier for `name` that the register does not hold yet (SPEC 3.3): `"Payment API"`
 * gives `paymentApi`, a taken one `paymentApi2`. The result is what a defining statement assigns.
 * In hierarchical mode with a `parentId` it is the local part and the element's id is
 * `<parentId>.<result>`; uniqueness is checked on that full key, keywords on the local part.
 */
export function deriveIdentifier(
  name: string,
  kind: ElementKind,
  register: IdentifierRegister,
  mode: IdentifierMode,
  parentId?: ElementId,
): string {
  const base = readableBase(name, kind);
  const scope = mode === "hierarchical" && parentId !== undefined ? `${parentId}.` : "";
  const isTaken = (candidate: string) =>
    isKeyword(candidate) ||
    register.archetypes.has(candidate.toLowerCase()) ||
    register.taken.has(`${scope}${candidate}`.toLowerCase());
  if (!isTaken(base)) return base;
  for (let counter = 2; ; counter++) {
    const candidate = `${base}${counter}`;
    if (!isTaken(candidate)) return candidate;
  }
}

/** The lexical rule `\w[a-zA-Z0-9_-]*` (R-DSL §2.8). */
export function isValidIdentifier(identifier: string): boolean {
  return IDENTIFIER_PATTERN.test(identifier);
}

function readableBase(name: string, kind: ElementKind): string {
  const words = name.normalize("NFKD").replace(COMBINING_MARKS, "").split(WORD_SEPARATORS);
  const camel = words
    .filter((word) => word.length > 0)
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("");
  const kindWord = KIND_WORDS[kind];
  if (camel.length === 0) return kindWord;
  return /^[0-9]/.test(camel) ? `${kindWord}${camel}` : camel;
}
