/**
 * Markup strings for the slots diagram-js and the hosts fill with `innerHTML` (palette and pad
 * entries, popup menu images, legend previews). Every attribute value and every text passes
 * `escapeMarkup`, so a value a host or a document hands in stays a value and never becomes markup.
 */

declare const markupBrand: unique symbol;

/** Markup built here: only escaped values, so it may be nested as it is. */
export type Markup = string & { readonly [markupBrand]: true };

export type MarkupAttributes = Readonly<Record<string, string | number | undefined>>;

const MARKUP_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeMarkup(value: string): string {
  return value.replace(/[&<>"']/g, (character) => MARKUP_ENTITIES[character] ?? character);
}

export function markupText(text: string): Markup {
  return escapeMarkup(String(text)) as Markup;
}

/**
 * Skips `undefined` attributes, so an optional value such as a solid line's dash writes no
 * attribute rather than "undefined".
 */
export function markupElement(
  name: string,
  attributes: MarkupAttributes,
  ...children: Markup[]
): Markup {
  const serialized = Object.entries(attributes)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([attribute, value]) => ` ${attribute}="${escapeMarkup(String(value))}"`)
    .join("");
  const markup =
    children.length > 0
      ? `<${name}${serialized}>${children.join("")}</${name}>`
      : `<${name}${serialized}/>`;
  return markup as Markup;
}
