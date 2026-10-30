import { vi } from "vitest";

// Ids that a locale orders otherwise: upper and lower case, `_` against letters and digits, and
// letters that Estonian (z before t) and Lithuanian (y with i) move.
export const SHUFFLED_IDS = [
  "z_store",
  "b",
  "t_api",
  "B",
  "a_1",
  "y_db",
  "a1",
  "_x",
  "j_app",
  "a",
  "Z",
  "10",
  "9",
  "A",
];
export const CODE_POINT_ORDER = [
  "10",
  "9",
  "A",
  "B",
  "Z",
  "_x",
  "a",
  "a1",
  "a_1",
  "b",
  "j_app",
  "t_api",
  "y_db",
  "z_store",
];
export const LOCALES = ["en-US", "de-DE", "et-EE", "lt-LT", "sv-SE", "tr-TR"];

/** Runs `run` as on a runtime with `locale` as the default locale of `localeCompare`. */
export function withDefaultLocale(locale: string, run: () => void): void {
  const localeCompare = String.prototype.localeCompare;
  const asDefault = vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (
    this: string,
    that,
    locales,
    options,
  ) {
    return localeCompare.call(this, that, locales ?? locale, options);
  });
  try {
    run();
  } finally {
    asDefault.mockRestore();
  }
}
