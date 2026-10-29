/**
 * The board's vocabulary: the names its stickies use per kind, compared after normalisation, so
 * the editor can suggest an established name and point at spelling variants. Derived from the
 * board every time, never stored, so the schema and the DSL stay unchanged.
 */

import type { ElementType } from "./types.js";

/**
 * The sticky kinds whose labels name things of the domain. Hotspots and notes are free text and
 * drawings have no label, so they stay out of the vocabulary.
 */
export const VOCABULARY_STICKY_KINDS = [
  "event",
  "command",
  "actor",
  "aggregate",
  "policy",
  "readmodel",
  "external",
] as const satisfies readonly ElementType[];

export type VocabularyStickyKind = (typeof VOCABULARY_STICKY_KINDS)[number];

export function isVocabularyStickyKind(kind: string): kind is VocabularyStickyKind {
  return (VOCABULARY_STICKY_KINDS as readonly string[]).includes(kind);
}

/**
 * The name the palette and the keys give a new sticky of each kind until it is renamed; the next
 * one of a kind gets a number ("Domain Event 2"). Notes and drawings have none.
 */
export const PLACEHOLDER_LABELS = {
  event: "Domain Event",
  command: "Command",
  actor: "Actor",
  aggregate: "Aggregate",
  policy: "Policy",
  readmodel: "Read Model",
  external: "External System",
  hotspot: "Hotspot",
} as const satisfies Partial<Record<ElementType, string>>;

const PLACEHOLDER_OF: ReadonlyMap<string, string> = new Map(Object.entries(PLACEHOLDER_LABELS));

/**
 * Whether `label` is the placeholder a new sticky of `kind` gets: "Aggregate", "Aggregate 2". It
 * says nothing about the domain, so the label suggestions offer no such name and
 * `groupByAggregate` counts no such aggregate.
 */
export function isPlaceholderLabel(kind: ElementType, label: string): boolean {
  const placeholder = PLACEHOLDER_OF.get(kind);
  if (placeholder === undefined) return false;
  if (label === placeholder) return true;
  return label.startsWith(`${placeholder} `) && /^\d+$/.test(label.slice(placeholder.length + 1));
}

/** A sticky as the vocabulary reads it; every `BoardElement` fits. */
export interface LabelledSticky {
  readonly id: string;
  readonly elementType: ElementType;
  readonly label: string;
}

/** One way a term is written on the board, with the stickies that write it so. */
export interface LabelSpelling {
  readonly label: string;
  readonly elementIds: readonly string[];
}

/** A name of one sticky kind, in every spelling the board uses for it. */
export interface VocabularyTerm {
  readonly kind: VocabularyStickyKind;
  /** `normalizeLabel` of each of its spellings. */
  readonly key: string;
  /** The spelling most stickies use; on a tie, the one met first. */
  readonly label: string;
  /** The preferred spelling first, then by the number of stickies, then in the order met. */
  readonly spellings: readonly LabelSpelling[];
  /** How many stickies carry the term, in any spelling. */
  readonly count: number;
}

/** How many suggestions `suggestLabels` gives unless told otherwise. */
export const DEFAULT_SUGGESTION_LIMIT = 8;

const CAMEL_CASE_BOUNDARY = /(\p{Ll}|\p{Nd})(\p{Lu})/gu;
const APOSTROPHES = /['‘’ʼ`´]/gu;
const WORD_SEPARATORS = /[^\p{L}\p{M}\p{N}]+/u;
const DIGITS_ONLY = /^\p{N}+$/u;
const AMERICAN_IZE = /iz(e|ed|es|er|ers|ing|ation|ations)$/u;
/**
 * The British doubled `l` before an ending, after an unstressed `a` or `e` of a longer word:
 * `cancelled`, `modelling`, `signalled`, `traveller`. Short words keep it, so `filled` and
 * `filed` stay apart.
 */
const BRITISH_DOUBLED_L = /^(.*[aeiou][^aeiou]*[ae])ll(ed|ing|er)$/u;
const KEEPS_FINAL_S = /(ss|us|is)$/u;
/**
 * Where an English `-es` plural keeps its `e`: after a sibilant (`boxes`, `statuses`) and in
 * `-ies` (`policies`). The `e` goes in the singular too (`purchase`), so both read alike, while
 * `plane` and `plan` or `Akte` and `Akt` stay apart.
 */
const PLURAL_E = /(s|x|z|ch|sh|i)e$/u;

/**
 * German plural endings that leave no doubt about their singular, after the umlauts are folded
 * (`-täten` reads `-taeten`).
 */
const GERMAN_PLURALS: ReadonlyArray<readonly [plural: string, singular: string]> = [
  ["ungen", "ung"],
  ["heiten", "heit"],
  ["keiten", "keit"],
  ["schaften", "schaft"],
  ["ionen", "ion"],
  ["taeten", "taet"],
  ["innen", "in"],
  ["nisse", "nis"],
];

const FOLDED_LETTERS: Readonly<Record<string, string>> = { ß: "ss", ä: "ae", ö: "oe", ü: "ue" };

/** The label in lower-case words, split at spaces, punctuation and camel-case boundaries. */
function labelWords(label: string): string[] {
  return label
    .normalize("NFKC")
    .replace(CAMEL_CASE_BOUNDARY, "$1 $2")
    .replace(APOSTROPHES, "")
    .toLowerCase()
    .replace(/[ßäöü]/gu, (letter) => FOLDED_LETTERS[letter] ?? letter)
    .split(WORD_SEPARATORS)
    .filter((word) => word.length > 0);
}

function singularOf(word: string): string {
  for (const [plural, singular] of GERMAN_PLURALS) {
    if (word.length > plural.length + 1 && word.endsWith(plural)) {
      return word.slice(0, -plural.length) + singular;
    }
  }
  let stem = word;
  if (stem.length >= 4 && stem.endsWith("s") && !KEEPS_FINAL_S.test(stem)) stem = stem.slice(0, -1);
  if (stem.length >= 4 && PLURAL_E.test(stem)) stem = stem.slice(0, -1);
  if (stem.length >= 3 && stem.endsWith("y")) stem = `${stem.slice(0, -1)}i`;
  return stem;
}

/** One word as the comparison sees it: singular, British -ise, a British doubled l single. */
function wordKey(word: string): string {
  if (DIGITS_ONLY.test(word)) return word;
  return singularOf(word.replace(AMERICAN_IZE, "is$1")).replace(BRITISH_DOUBLED_L, "$1l$2");
}

/**
 * The form two labels are compared in: equal keys mean the labels differ only in spelling. It
 * ignores case (with `ß` as `ss` and `ä`, `ö`, `ü` as `ae`, `oe`, `ue`), whitespace, line breaks,
 * punctuation and camel case, and it reads simple plurals as their singular (English `-s`, `-es`,
 * `-ies`; German `-ungen`, `-heiten`, `-keiten`, `-schaften`, `-ionen`, `-täten`, `-innen`,
 * `-nisse`). It reads British and American spellings alike: `-ize` as `-ise`, and the doubled `l`
 * of `cancelled` or `modelling` as single. Digits stay as they are. Other letters count, so a word
 * with a final `e` or a doubled letter of its own stays a word of its own (`Plan` and `Plane`,
 * `Filled` and `Filed`). An empty key means the label names nothing.
 */
export function normalizeLabel(label: string): string {
  return labelWords(label).map(wordKey).join("");
}

interface TermDraft {
  readonly kind: VocabularyStickyKind;
  readonly key: string;
  readonly spellings: Map<string, string[]>;
}

function termOf(draft: TermDraft): VocabularyTerm {
  const spellings = [...draft.spellings]
    .map(([label, elementIds]) => ({ label, elementIds }))
    .sort((first, second) => second.elementIds.length - first.elementIds.length);
  return {
    kind: draft.kind,
    key: draft.key,
    label: spellings[0]!.label,
    spellings,
    count: spellings.reduce((sum, spelling) => sum + spelling.elementIds.length, 0),
  };
}

/**
 * The vocabulary of `stickies` (for a board, its `elements`): one term per kind and normalised
 * label, in the order of `VOCABULARY_STICKY_KINDS`, then in the order the terms are met. Stickies
 * of other kinds and labels without a word are left out.
 */
export function collectVocabulary(stickies: Iterable<LabelledSticky>): VocabularyTerm[] {
  const drafts = new Map<string, TermDraft>();
  for (const sticky of stickies) {
    const kind = sticky.elementType;
    if (!isVocabularyStickyKind(kind)) continue;
    const key = normalizeLabel(sticky.label);
    if (key === "") continue;
    const id = `${kind} ${key}`;
    let draft = drafts.get(id);
    if (!draft) {
      draft = { kind, key, spellings: new Map() };
      drafts.set(id, draft);
    }
    const elementIds = draft.spellings.get(sticky.label);
    if (elementIds) elementIds.push(sticky.id);
    else draft.spellings.set(sticky.label, [sticky.id]);
  }
  const terms = [...drafts.values()].map(termOf);
  return VOCABULARY_STICKY_KINDS.flatMap((kind) => terms.filter((term) => term.kind === kind));
}

/** The terms the board writes in more than one way. */
export function spellingVariants(vocabulary: readonly VocabularyTerm[]): VocabularyTerm[] {
  return vocabulary.filter((term) => term.spellings.length > 1);
}

/**
 * Where `query` meets the term: 0 at its start, 1 at the start of a later word, else none. The
 * words count as compared and as written, so a half-typed `Cancell` still finds `Cancelled`.
 */
function matchRank(term: VocabularyTerm, queries: readonly string[]): number | undefined {
  if (queries.some((query) => term.key.startsWith(query))) return 0;
  const written = labelWords(term.label);
  const compared = written.map(wordKey);
  for (let start = 0; start < written.length; start++) {
    const rests = [compared, written].map((words) => words.slice(start).join(""));
    if (rests.some((rest) => queries.some((query) => rest.startsWith(query)))) {
      return start === 0 ? 0 : 1;
    }
  }
  return undefined;
}

/**
 * The terms of `kind` worth offering while `typed` is being written: those whose normalised
 * label, or one of its later words, starts with what is typed, the ones it starts with first, then
 * the most used. The last typed word counts as written so far, so `Pay` finds `Payment`. A term
 * whose preferred spelling is exactly `typed` is left out, since it offers nothing new.
 */
export function suggestLabels(
  vocabulary: readonly VocabularyTerm[],
  kind: VocabularyStickyKind,
  typed: string,
  limit: number = DEFAULT_SUGGESTION_LIMIT,
): VocabularyTerm[] {
  const words = labelWords(typed);
  const last = words.at(-1);
  if (last === undefined) return [];
  const leading = words.slice(0, -1).map(wordKey).join("");
  const queries = [...new Set([`${leading}${wordKey(last)}`, `${leading}${last}`])];
  const wanted = typed.trim();
  return vocabulary
    .filter((term) => term.kind === kind && term.label !== wanted)
    .flatMap((term) => {
      const rank = matchRank(term, queries);
      return rank === undefined ? [] : [{ term, rank }];
    })
    .sort((first, second) => first.rank - second.rank || second.term.count - first.term.count)
    .slice(0, Math.max(0, limit))
    .map(({ term }) => term);
}
