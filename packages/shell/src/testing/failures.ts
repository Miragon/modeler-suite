/** A `securitypolicyviolation` the stub recorded. */
export interface CspViolation {
  /** `effectiveDirective`, such as `script-src-elem` or `style-src-attr`. */
  directive: string;
  /** `blockedURI`: the blocked URL, or `inline` or `eval`. */
  blockedURI: string;
  /** `sourceFile:lineNumber:columnNumber` of the code that caused it, empty where unknown. */
  source: string;
  /** The start of a blocked inline script or style (`sample`), empty otherwise. */
  sample: string;
}

function describeValue(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function describeErrorEvent(event: Event): string {
  if (event instanceof ErrorEvent) {
    const where = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : "";
    return event.error instanceof Error
      ? describeValue(event.error)
      : `${event.message || "an error"}${where}`;
  }
  const target = event.target;
  if (target instanceof Element) {
    const url = target.getAttribute("src") ?? target.getAttribute("href") ?? "";
    return `<${target.localName}> failed to load ${url}`.trim();
  }
  return `an error event of ${String(target)}`;
}

/** Records what goes wrong in the page from now on: CSP violations, errors, `console.error`. */
export function recordFailures(): { violations: CspViolation[]; errors: string[] } {
  const violations: CspViolation[] = [];
  const errors: string[] = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    violations.push({
      directive: event.effectiveDirective || event.violatedDirective,
      blockedURI: event.blockedURI,
      source: event.sourceFile
        ? `${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`
        : "",
      sample: event.sample,
    });
  });
  // Capturing, so the failed load of a <script>, <link> or <img> (which does not bubble) counts too.
  window.addEventListener("error", (event) => errors.push(describeErrorEvent(event)), true);
  window.addEventListener("unhandledrejection", (event) =>
    errors.push(`unhandled rejection: ${describeValue(event.reason)}`),
  );
  const consoleError = console.error.bind(console);
  console.error = (...values: unknown[]) => {
    errors.push(`console.error: ${values.map(describeValue).join(" ")}`);
    consoleError(...values);
  };
  return { violations, errors };
}
