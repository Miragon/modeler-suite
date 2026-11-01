/**
 * Markup strings for the slots a host fills with `innerHTML` (legend rows, palette previews). Every
 * attribute value passes `escapeMarkup`, so a colour the document carries stays a value and never
 * becomes markup (Context Maps' `draw/markup.ts`).
 */

declare const markupBrand: unique symbol;

/** Markup built here: only escaped values, so it may be nested as it is. */
export type Markup = string & { readonly [markupBrand]: true };

export type MarkupAttributes = Readonly<Record<string, string | number | undefined>>;

const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeMarkup(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ENTITIES[character] ?? character);
}

function formatted(value: string | number): string {
  return typeof value === "number" ? String(Math.round(value * 1000) / 1000) : value;
}

/** Skips `undefined` attributes, so an optional value writes nothing rather than "undefined". */
export function markupElement(
  name: string,
  attributes: MarkupAttributes,
  ...children: readonly Markup[]
): Markup {
  const serialized = Object.entries(attributes)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([attribute, value]) => ` ${attribute}="${escapeMarkup(formatted(value))}"`)
    .join("");
  return (
    children.length > 0
      ? `<${name}${serialized}>${children.join("")}</${name}>`
      : `<${name}${serialized}/>`
  ) as Markup;
}
