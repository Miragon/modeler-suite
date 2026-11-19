import type { CollaborativeModeler } from "../index.js";
import type { CaseOutcome, ConformanceCase, ConformanceHarness } from "./harness.js";
import { nextHostSerial } from "./hosts.js";
import {
  adviseOn,
  exportOrFail,
  fail,
  firstText,
  type Focusable,
  focusOn,
  importOrFail,
  type KeyedInstance,
  mountedCanvas,
  outcomeOf,
  selectionOf,
  settleOf,
  skip,
} from "./support.js";
import { listenForWindowErrors } from "./user-input.js";

interface KeyStroke {
  key: string;
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

const NAMED_CODES: Record<string, string> = {
  " ": "Space",
  "+": "Equal",
  "=": "Equal",
  "-": "Minus",
  "!": "Digit1",
};

const codeOf = (key: string): string => {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return `Digit${key}`;
  return NAMED_CODES[key] ?? key;
};

const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

/**
 * the keys the Miragon canvases and diagram-js's keyboard bind: editing, nudging (Shift: a larger
 * step), Enter, Escape, Space and Tab, the single-key tools of diagram-js and the renderers,
 * Shift+1 (fit), and every shortcut (clipboard, undo, zoom, Ctrl/Meta+Arrow moving the canvas)
 * once with Ctrl and once with Meta, since a renderer may read either
 */
const KEY_STROKES: KeyStroke[] = [
  ...[
    "Backspace",
    "Delete",
    ...ARROWS,
    "Enter",
    "Escape",
    " ",
    "Tab",
    "a",
    "c",
    "e",
    "h",
    "l",
    "n",
    "p",
    "s",
    "u",
  ].map((key) => ({ key, code: codeOf(key) })),
  ...ARROWS.map((key) => ({ key, code: key, shiftKey: true })),
  { key: "!", code: codeOf("!"), shiftKey: true },
  ...[
    { key: "a" },
    { key: "c" },
    { key: "v" },
    { key: "x" },
    { key: "d" },
    { key: "z" },
    { key: "Z", shiftKey: true },
    { key: "y" },
    { key: "+" },
    { key: "=" },
    { key: "-" },
    { key: "0" },
    ...ARROWS.flatMap((key) => [{ key }, { key, shiftKey: true }]),
  ].flatMap((stroke) => [
    { ...stroke, code: codeOf(stroke.key), ctrlKey: true },
    { ...stroke, code: codeOf(stroke.key), metaKey: true },
  ]),
];

const describeStroke = (stroke: KeyStroke): string =>
  [
    stroke.ctrlKey ? "Ctrl" : "",
    stroke.metaKey ? "Meta" : "",
    stroke.shiftKey ? "Shift" : "",
    stroke.key === " " ? "Space" : stroke.key === "!" ? "1" : stroke.key,
  ]
    .filter((part) => part !== "")
    .join("+");

interface KeyTarget {
  what: string;
  element: Element;
  /** moves the focus the way the page does; returns what undoes it */
  enter(): () => void;
}

const blurActive = (doc: Document): void => {
  const active = doc.activeElement;
  if (active !== null && active !== doc.body) (active as Focusable).blur();
};

const stayPut = (): void => undefined;

/**
 * focusable stand-ins for a host's chrome and editors, in a box appended to `parent`: a button, the
 * text fields, a contenteditable, an editor inside a `.monaco-editor` and, where the browser has
 * EditContext (Chromium), an element that types through one, as Monaco 0.55 does there
 */
function hostControls(parent: HTMLElement, where: string): { targets: KeyTarget[]; box: Element } {
  const doc = parent.ownerDocument;
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = "Host button";
  const input = doc.createElement("input");
  input.value = "host text";
  const textarea = doc.createElement("textarea");
  textarea.value = "host text";
  const select = doc.createElement("select");
  for (const label of ["one", "two"]) {
    const option = doc.createElement("option");
    option.textContent = label;
    select.append(option);
  }
  const editable = doc.createElement("div");
  editable.setAttribute("contenteditable", "true");
  editable.textContent = "host text";
  const monaco = doc.createElement("div");
  monaco.className = "monaco-editor";
  const monacoInput = doc.createElement("div");
  monacoInput.className = "native-edit-context";
  monacoInput.setAttribute("role", "textbox");
  monacoInput.tabIndex = 0;
  monaco.append(monacoInput);
  const box = doc.createElement("div");
  box.append(button, input, textarea, select, editable, monaco);
  const controls: Array<[string, HTMLElement]> = [
    ["a host <button>", button],
    ["a host text <input>", input],
    ["a host <textarea>", textarea],
    ["a host <select>", select],
    ["a host contenteditable", editable],
    ["a focusable element in a host .monaco-editor", monacoInput],
  ];
  const EditContextClass = (globalThis as { EditContext?: new () => object }).EditContext;
  if (typeof EditContextClass === "function") {
    const editor = doc.createElement("div");
    editor.tabIndex = 0;
    Object.assign(editor, { editContext: new EditContextClass() });
    box.append(editor);
    controls.push(["a host EditContext editor", editor]);
  }
  parent.append(box);
  const targets = controls.map(([what, element]) => ({
    what: `${what} ${where}`,
    element,
    enter: () => {
      focusOn(element);
      return stayPut;
    },
  }));
  return { targets, box };
}

/**
 * <body> as a key's target: nothing focused, right after the canvas had the focus, and while the
 * host hides the modeler (`display: none`, `visibility: hidden`) or makes it inert
 */
function bodyTargets(doc: Document, canvas: Element, wrapper: HTMLElement): KeyTarget[] {
  const body = doc.body;
  const hideWith = (hide: () => () => void) => (): (() => void) => {
    focusOn(canvas);
    const show = hide();
    // a browser moves the focus off a hidden or inert element only at its next rendering update
    blurActive(doc);
    return show;
  };
  return [
    {
      what: "<body> with nothing focused",
      element: body,
      enter: () => {
        blurActive(doc);
        return stayPut;
      },
    },
    {
      what: "<body> right after the canvas lost the focus",
      element: body,
      enter: () => {
        focusOn(canvas);
        blurActive(doc);
        return stayPut;
      },
    },
    {
      what: "<body> while the host hides the modeler (display: none)",
      element: body,
      enter: hideWith(() => {
        const display = wrapper.style.display;
        wrapper.style.display = "none";
        return () => {
          wrapper.style.display = display;
        };
      }),
    },
    {
      what: "<body> while the host hides the modeler (visibility: hidden)",
      element: body,
      enter: hideWith(() => {
        const visibility = wrapper.style.visibility;
        wrapper.style.visibility = "hidden";
        return () => {
          wrapper.style.visibility = visibility;
        };
      }),
    },
    {
      what: "<body> while the host makes the modeler inert",
      element: body,
      enter: hideWith(() => {
        wrapper.setAttribute("inert", "");
        return () => wrapper.removeAttribute("inert");
      }),
    },
  ];
}

const listed = (parts: string[]): string =>
  parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

interface Keyboard {
  press(
    target: Element,
    stroke: KeyStroke,
  ): { prevented: boolean; stopped: boolean; thrown: string[] };
  thrownBy(dispatch: () => void): string[];
}

function keyboardOn(view: Window & typeof globalThis, cleanups: Array<() => void>): Keyboard {
  const propagated = new WeakSet<Event>();
  const reachedWindow = (event: Event): void => {
    propagated.add(event);
  };
  view.addEventListener("keydown", reachedWindow);
  view.addEventListener("keyup", reachedWindow);
  cleanups.push(() => {
    view.removeEventListener("keydown", reachedWindow);
    view.removeEventListener("keyup", reachedWindow);
  });
  // only while the kit dispatches: an error the modeler throws from a key listener reaches no
  // caller, so the window's error event is the one place to see it
  const thrownBy = (dispatch: () => void): string[] => {
    const errors = listenForWindowErrors(view);
    try {
      dispatch();
    } finally {
      errors.stop();
    }
    return errors.errors;
  };
  const press = (
    target: Element,
    stroke: KeyStroke,
  ): { prevented: boolean; stopped: boolean; thrown: string[] } => {
    const init = { ...stroke, bubbles: true, cancelable: true, composed: true };
    const down = new view.KeyboardEvent("keydown", init);
    const up = new view.KeyboardEvent("keyup", init);
    const thrown = thrownBy(() => {
      target.dispatchEvent(down);
      target.dispatchEvent(up);
    });
    return {
      prevented: down.defaultPrevented || up.defaultPrevented,
      stopped: !propagated.has(down) || !propagated.has(up),
      thrown,
    };
  };
  return { press, thrownBy };
}

/**
 * Delete or Backspace on the focused canvas must remove the revealed element: without that proof
 * the case cannot tell a key the modeler leaves alone from one it never sees
 */
async function deleteOnTheFocusedCanvas(
  modeler: CollaborativeModeler,
  canvas: Element,
  revealed: string | undefined,
  keyboard: Keyboard,
  settle: () => Promise<void>,
): Promise<string | undefined> {
  focusOn(canvas);
  if (revealed === undefined) {
    return "elements.list() reports no element after importing canonicalTexts[0] and one mutate — that Delete on the focused canvas removes a revealed element was not verified, so the case cannot tell a key the modeler leaves alone from one it never sees";
  }
  if (canvas.ownerDocument.activeElement !== canvas) {
    return "the canvas did not take the focus — that a key on the focused canvas acts was not verified, so the case cannot tell a key the modeler leaves alone from one it never sees";
  }
  const before = exportOrFail(modeler, `with '${revealed}' revealed`);
  for (const key of ["Delete", "Backspace"]) {
    keyboard.press(canvas, { key, code: key });
    await settle();
    if (exportOrFail(modeler, `after ${key} on the focused canvas`) !== before) return undefined;
  }
  return `Delete and Backspace on the focused canvas, with '${revealed}' revealed (selected), left the document as it was — the case cannot tell a key the modeler leaves alone from one it never sees`;
}

/** returns why the keys were not (fully) verified, if they were not */
async function aimKeysAt(
  harness: ConformanceHarness,
  instance: KeyedInstance,
  create: () => Promise<CollaborativeModeler>,
  findings: string[],
): Promise<string | undefined> {
  const settle = settleOf(harness);
  const text = firstText(harness);
  const editable = instance === "modeler";
  const found = (finding: string): void => {
    findings.push(editable ? finding : `the viewer: ${finding}`);
  };
  const firstSerial = nextHostSerial();
  const modeler = await create();
  const cleanups: Array<() => void> = [];
  try {
    await importOrFail(
      modeler,
      text,
      editable ? "importText(canonicalTexts[0]) rejected" : "the viewer rejected canonicalTexts[0]",
    );
    const mount = mountedCanvas(harness, modeler, instance, firstSerial);
    if (typeof mount === "string") return mount;
    const { canvas, host, wrapper } = mount;
    const doc = host.ownerDocument;
    const view = doc.defaultView ?? window;

    const keyboard = keyboardOn(view, cleanups);
    const { press, thrownBy } = keyboard;
    let changes = 0;
    cleanups.push(
      modeler.onContentChanged(() => {
        changes += 1;
      }),
    );

    let revealed: string | undefined;
    const setUp = async (): Promise<void> => {
      await importOrFail(modeler, text, "re-importing canonicalTexts[0] rejected");
      // undo history and a selection: what Cmd/Ctrl+Z, Delete and the arrows act on
      if (editable) await harness.mutate(modeler);
      await settle();
      revealed = modeler.elements?.list()[0]?.id;
      if (revealed !== undefined) modeler.elements?.reveal(revealed);
      await settle();
    };
    await setUp();

    // beside the modeler, inside the element the host gave it, and next to the canvas in the
    // element that holds it, where a host's overlays (diagram-js overlays) put their editors
    const placements: Array<[HTMLElement, string]> = [
      [doc.body, "beside the modeler"],
      [host, "inside the modeler's container"],
    ];
    const canvasHolder = canvas.parentElement;
    if (canvasHolder !== null && canvasHolder !== host) {
      placements.push([canvasHolder, "next to the canvas"]);
    }
    const controls = placements.map(([parent, where]) => hostControls(parent, where));
    for (const { box } of controls) cleanups.push(() => box.remove());
    const outside = controls[0]?.targets ?? [];

    const targets = [
      ...controls.flatMap((placed) => placed.targets),
      ...bodyTargets(doc, canvas, wrapper),
    ];
    for (const target of targets) {
      const leave = target.enter();
      let dirty = false;
      try {
        const last = { doc: exportOrFail(modeler, `with the focus on ${target.what}`), changes };
        for (const stroke of KEY_STROKES) {
          const key = `${describeStroke(stroke)} on ${target.what}`;
          const selection = selectionOf(modeler);
          const { prevented, stopped, thrown } = press(target.element, stroke);
          const changed = [
            ...(changes !== last.changes ? ["fired onContentChanged"] : []),
            ...(exportOrFail(modeler, `after ${key}`) !== last.doc ? ["changed the document"] : []),
            ...(selectionOf(modeler) !== selection ? ["changed the selection"] : []),
          ];
          const effects = [
            ...changed,
            ...(prevented ? ["prevented it"] : []),
            ...(stopped ? ["stopped its propagation"] : []),
            ...thrown.map((error) => `threw ${error}`),
          ];
          if (effects.length > 0) found(`${key} ${listed(effects)}`);
          // the keys after it would be judged against a state it changed: one finding per target
          // is enough, and a fresh document per key would take a non-conforming modeler too long
          dirty = changed.length > 0;
          if (dirty) break;
        }
        if (!dirty) {
          await settle();
          if (exportOrFail(modeler, `once the keys on ${target.what} settled`) !== last.doc) {
            found(`a key on ${target.what} changed the document once it settled`);
            dirty = true;
          } else if (changes !== last.changes) {
            found(`a key on ${target.what} fired onContentChanged once it settled`);
            dirty = true;
          }
        }
      } finally {
        leave();
      }
      if (dirty) await setUp();
    }

    const keyless: Array<[string, Element, () => void]> = [
      ["the focused canvas", canvas, () => focusOn(canvas)],
      ["<body> with nothing focused", doc.body, () => blurActive(doc)],
      ...outside
        .slice(0, 2)
        .map((target): [string, Element, () => void] => [
          target.what,
          target.element,
          () => target.enter(),
        ]),
    ];
    for (const [what, element, enter] of keyless) {
      enter();
      for (const type of ["keydown", "keyup"]) {
        const thrown = thrownBy(() =>
          element.dispatchEvent(new view.Event(type, { bubbles: true, cancelable: true })),
        );
        for (const error of thrown) found(`a ${type} without a key on ${what} threw ${error}`);
      }
    }

    if (!editable) return undefined;
    if (!modeler.elements) {
      return "the modeler exposes no elements surface (optional) — that Delete on the focused canvas removes a revealed element was not verified, so the case cannot tell a key the modeler leaves alone from one it never sees";
    }
    await setUp();
    return await deleteOnTheFocusedCanvas(modeler, canvas, revealed, keyboard, settle);
  } finally {
    for (const cleanup of cleanups) cleanup();
    modeler.destroy();
  }
}

/**
 * what the modeler does with the keys is one advisory, since 1.4 only RECOMMENDS leaving them
 * alone; what the case could not verify is one skip
 */
async function keysStayOnTheCanvas(harness: ConformanceHarness): Promise<CaseOutcome> {
  if (typeof document === "undefined") {
    return skip(
      "no DOM — keys need a document to be aimed at (run the kit in a browser, the modeler mounted into attachedHost())",
    );
  }
  const findings: string[] = [];
  const unverified: string[] = [];
  const modelerGap = await aimKeysAt(harness, "modeler", () => harness.create(), findings);
  if (modelerGap !== undefined) unverified.push(modelerGap);
  if (harness.createReadonly) {
    const createViewer = (): Promise<CollaborativeModeler> =>
      harness.createReadonly?.() ?? fail("createReadonly went away during the keys case");
    const viewerGap = await aimKeysAt(harness, "viewer", createViewer, findings);
    if (viewerGap !== undefined) unverified.push(viewerGap);
  }
  return outcomeOf(
    adviseOn(
      findings,
      "keys left the canvas",
      "RECOMMENDED: act on a key only while the canvas holds the focus (its target is the canvas or lies inside it), leave every other key alone (no command, no change of the document or the selection, no preventDefault, no stopPropagation) and ignore a keydown or keyup without a key",
    ),
    unverified,
  );
}

export const keysCase: ConformanceCase = {
  name: "keys (recommended): a key aimed at the host's controls and editors or at <body> is left alone, a keydown or keyup without a key throws nothing, a key on the focused canvas acts",
  run: keysStayOnTheCanvas,
};
