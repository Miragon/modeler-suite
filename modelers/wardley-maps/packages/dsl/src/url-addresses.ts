import { parseDSLWithSourceMap, type UrlAddress } from "./parser.js";

/**
 * Every `url Name [address]` statement of `text` with the place of its address, in source order:
 * the definitions elements use, and the unused and replaced ones the text keeps. Lines inside a
 * comment hold none. An editor that rewrites an address there keeps every other character of the
 * file as it is, which a parse and `patchDSL` would not promise for the spacing inside the line.
 */
export function locateUrlAddresses(text: string): UrlAddress[] {
  return [...parseDSLWithSourceMap(text).sourceMap.urlAddresses];
}
