/*
 * `styles`, `theme(s)` and `terminology` (R-DSL §12): element and relationship styles per tag,
 * values normalised as Structurizr's model stores them. Themes are named, never fetched.
 */
import type { MetadataSymbols, ShapeName } from "@miragon/c4-schema-model";
import { HTML_COLOURS } from "./colourNames.js";
import { child, type Context } from "./context.js";
import { checkArity, requireBlock, type Outcome } from "./outcome.js";
import type { StyleRecord } from "./records.js";
import type { Build, Values } from "./state.js";

const SHAPES: readonly ShapeName[] = [
  "Box",
  "RoundedBox",
  "Circle",
  "Ellipse",
  "Hexagon",
  "Diamond",
  "Cylinder",
  "Bucket",
  "Pipe",
  "Person",
  "Robot",
  "Folder",
  "WebBrowser",
  "Window",
  "Terminal",
  "Shell",
  "MobileDevicePortrait",
  "MobileDeviceLandscape",
  "Component",
];

/** Drawn as another shape in v1 (SPEC 6.2). */
const SUBSTITUTED: Readonly<Partial<Record<ShapeName, ShapeName>>> = {
  Robot: "Person",
  Bucket: "Cylinder",
  Terminal: "Window",
  Shell: "Window",
};

const LINE_STYLES = ["solid", "dashed", "dotted"] as const;

export function stylesStatement(build: Build, values: Values, context: Context): Outcome {
  const statement = values.statement;
  switch (values.lower) {
    case "light":
    case "dark":
      build.role(statement, "colourScheme");
      return requireBlock(
        build,
        values,
        context,
        child(context, "styles", { scheme: values.lower }),
      );
    case "element":
    case "relationship":
      return style(
        build,
        values,
        context,
        values.lower === "element" ? "elementStyle" : "relationshipStyle",
      );
    case "theme":
    case "themes":
      return theme(build, values, context);
    default:
      return undefined;
  }
}

function style(build: Build, values: Values, context: Context, type: StyleRecord["type"]): Outcome {
  const statement = values.statement;
  build.role(statement, type);
  const grammar = `${values.keyword} <tag> {`;
  checkArity(build, values, context, grammar, 2, 2);
  const tag = values.tokens[1] ?? "";
  if (tag === "")
    build.incompatible(
      values,
      context,
      "Structurizr needs a tag for every style. Write the tag in quotes after the keyword.",
    );
  const record: StyleRecord = { type, tag, scheme: context.scheme, statement, values: {} };
  build.styles.push(record);
  return requireBlock(build, values, context, {
    kind: type,
    style: record,
    anchor: () => `style ${tag} `,
  });
}

/** `theme <name|url>` and `themes <name|url> […]`: kept by name, never loaded (SPEC 3.7). */
export function theme(build: Build, values: Values, context: Context): Outcome {
  const statement = values.statement;
  build.role(statement, "theme");
  if (values.lower === "theme") checkArity(build, values, context, "theme <name|url>", 2, 2);
  else
    checkArity(build, values, context, "themes <name|url> [name|url…]", 2, Number.MAX_SAFE_INTEGER);
  for (const [index, name] of values.tokens.slice(1).entries()) {
    build.themes.push(name);
    build.report.note(
      "theme-not-loaded",
      "info",
      `The modeler doesn't load the theme “${name}”, so its styles and icons aren't drawn. Structurizr still applies it.`,
      build.tokenRange(statement, index + 1),
      build.anchor(statement, context),
    );
  }
  return "leaf";
}

/** `#rrggbb` or an HTML colour name, as lower-case hex; undefined, with the refusal reported, otherwise. */
function colour(build: Build, values: Values, context: Context): string | undefined {
  const value = values.tokens[1] ?? "";
  if (/^#[A-Fa-f0-9]{6}$/.test(value)) return value.toLowerCase();
  const named = HTML_COLOURS[value.toLowerCase()];
  if (named !== undefined) return named;
  build.incompatible(
    values,
    context,
    `Structurizr accepts a colour as #rrggbb or an HTML colour name, not “${value}”. Write it in one of these forms.`,
    "invalid-statement",
    1,
  );
  return undefined;
}

function integer(build: Build, values: Values, context: Context, what: string): number | undefined {
  const value = values.tokens[1] ?? "";
  if (/^[+-]?\d+$/.test(value) && Math.abs(Number(value)) <= 2147483647) return Number(value);
  build.incompatible(
    values,
    context,
    `Structurizr expects a whole number for ${what}, not “${value}”.`,
    "invalid-statement",
    1,
  );
  return undefined;
}

function flag(build: Build, values: Values, context: Context): boolean | undefined {
  const value = (values.tokens[1] ?? "").toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  build.incompatible(
    values,
    context,
    "Structurizr expects true or false here.",
    "invalid-statement",
    1,
  );
  return undefined;
}

function oneOf<Value extends string>(
  build: Build,
  values: Values,
  context: Context,
  allowed: readonly Value[],
): Value | undefined {
  const value = (values.tokens[1] ?? "").toLowerCase();
  const match = allowed.find((candidate) => candidate.toLowerCase() === value);
  if (match === undefined) {
    build.incompatible(
      values,
      context,
      `Structurizr expects one of ${allowed.join(", ")} here.`,
      "invalid-statement",
      1,
    );
  }
  return match;
}

function ignored(build: Build, values: Values, context: Context, why: string): void {
  build.report.note(
    "style-property-ignored",
    "info",
    `The modeler doesn't draw “${values.keyword}” ${why}. Structurizr still applies it.`,
    values.statement.head,
    build.anchor(values.statement, context),
  );
}

const clamp = (value: number | undefined, minimum: number, maximum: number) =>
  value === undefined ? undefined : Math.min(maximum, Math.max(minimum, value));

export function elementStyleStatement(build: Build, values: Values, context: Context): Outcome {
  const record = context.style;
  if (record === undefined) return undefined;
  const set = (name: string, value: unknown) => {
    if (value !== undefined) (record.values as Record<string, unknown>)[name] = value;
  };
  if (!isElementStyleProperty(values.lower)) return undefined;
  build.role(values.statement, "styleProperty");
  if (!checkArity(build, values, context, `${values.keyword} <value>`, 2, 2)) return "leaf";
  switch (values.lower) {
    case "shape": {
      const shape = oneOf(build, values, context, SHAPES);
      set("shape", shape);
      const substitute = shape === undefined ? undefined : SUBSTITUTED[shape];
      if (substitute) {
        build.report.note(
          "shape-substituted",
          "info",
          `The modeler draws the shape ${shape} as ${substitute}. Structurizr still draws it as ${shape}.`,
          values.statement.head,
          build.anchor(values.statement, context),
        );
      }
      return "leaf";
    }
    case "background":
    case "stroke":
      set(values.lower, colour(build, values, context));
      return "leaf";
    case "color":
    case "colour":
      set("color", colour(build, values, context));
      return "leaf";
    case "strokewidth":
      set("strokeWidth", clamp(integer(build, values, context, "the stroke width"), 1, 10));
      return "leaf";
    case "width":
    case "height":
      set(values.lower, integer(build, values, context, `the ${values.lower}`));
      return "leaf";
    case "fontsize":
      set("fontSize", integer(build, values, context, "the font size"));
      ignored(build, values, context, "(text keeps its size)");
      return "leaf";
    case "border":
      set("border", oneOf(build, values, context, LINE_STYLES));
      return "leaf";
    case "opacity":
      set("opacity", clamp(integer(build, values, context, "the opacity"), 0, 100));
      return "leaf";
    case "metadata":
    case "description":
      set(values.lower, flag(build, values, context));
      return "leaf";
    case "icon":
      set("icon", values.tokens[1]);
      ignored(build, values, context, "(icons aren't loaded)");
      return "leaf";
    default:
      ignored(build, values, context, "");
      return "leaf";
  }
}

function isElementStyleProperty(lower: string): boolean {
  return [
    "shape",
    "background",
    "stroke",
    "color",
    "colour",
    "strokewidth",
    "width",
    "height",
    "fontsize",
    "border",
    "opacity",
    "metadata",
    "description",
    "icon",
    "iconposition",
  ].includes(lower);
}

export function relationshipStyleStatement(
  build: Build,
  values: Values,
  context: Context,
): Outcome {
  const record = context.style;
  if (record === undefined) return undefined;
  const set = (name: string, value: unknown) => {
    if (value !== undefined) (record.values as Record<string, unknown>)[name] = value;
  };
  const known = [
    "thickness",
    "color",
    "colour",
    "dashed",
    "opacity",
    "width",
    "fontsize",
    "position",
    "style",
    "routing",
    "jump",
    "metadata",
    "description",
  ];
  if (!known.includes(values.lower)) return undefined;
  build.role(values.statement, "styleProperty");
  if (!checkArity(build, values, context, `${values.keyword} <value>`, 2, 2)) return "leaf";
  switch (values.lower) {
    case "thickness":
      set("thickness", integer(build, values, context, "the thickness"));
      return "leaf";
    case "color":
    case "colour":
      set("color", colour(build, values, context));
      return "leaf";
    case "dashed": {
      const dashed = flag(build, values, context);
      set("style", dashed === undefined ? undefined : dashed ? "dashed" : "solid");
      return "leaf";
    }
    case "style":
      set("style", oneOf(build, values, context, LINE_STYLES));
      return "leaf";
    case "routing": {
      const routing = oneOf(build, values, context, ["Direct", "Orthogonal", "Curved"] as const);
      set("routing", routing?.toLowerCase());
      if (routing !== undefined && routing !== "Direct")
        ignored(build, values, context, `${routing.toLowerCase()} (lines are drawn direct)`);
      return "leaf";
    }
    case "opacity":
    case "position":
      set(values.lower, clamp(integer(build, values, context, `the ${values.lower}`), 0, 100));
      return "leaf";
    case "width":
    case "fontsize":
      set(
        values.lower === "width" ? "width" : "fontSize",
        integer(build, values, context, `the ${values.lower}`),
      );
      ignored(build, values, context, "(labels keep their size)");
      return "leaf";
    case "metadata":
    case "description":
      set(values.lower, flag(build, values, context));
      return "leaf";
    default:
      flag(build, values, context);
      ignored(build, values, context, "(lines don't jump)");
      return "leaf";
  }
}

const TERMS = [
  "person",
  "softwaresystem",
  "container",
  "component",
  "deploymentnode",
  "infrastructurenode",
  "relationship",
];
const SYMBOLS: readonly MetadataSymbols[] = [
  "square",
  "round",
  "curly",
  "angle",
  "double-angle",
  "none",
];

/** `terminology { person "Persona" … metadata round }` */
export function terminologyStatement(build: Build, values: Values, context: Context): Outcome {
  const statement = values.statement;
  if (values.lower === "metadata") {
    build.role(statement, "terminology");
    if (
      checkArity(
        build,
        values,
        context,
        "metadata <square|round|curly|angle|double-angle|none>",
        2,
        2,
      )
    ) {
      const symbols = values.tokens[1]?.toLowerCase();
      const match = SYMBOLS.find((symbol) => symbol === symbols);
      if (match === undefined)
        build.incompatible(
          values,
          context,
          "Structurizr expects square, round, curly, angle, double-angle or none for the metadata symbols.",
          "invalid-statement",
          1,
        );
      else build.terminology.metadataSymbols = match;
    }
    return "leaf";
  }
  if (!TERMS.includes(values.lower)) return undefined;
  build.role(statement, "terminology");
  if (checkArity(build, values, context, `${values.keyword} <term>`, 2, 2)) {
    build.terminology[values.lower] = values.tokens[1] ?? "";
  }
  return "leaf";
}
