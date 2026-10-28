/*
 * Everything here that is handed to `evaluate` runs in a VS Code document (the webview or the
 * workbench): Playwright serializes the function source, so these functions must not reference
 * anything outside their own body. Probes for the webview take the `<html>` locator's element first,
 * because they run through `locator.evaluate`.
 */

/** What the driver compares before the edit and after the undo, and in the history step after the redo. */
export interface CanvasFacts {
  shapes: number;
  connections: number;
  /** Every shape's translation, rounded to whole pixels and sorted. */
  positions: string[];
}

export interface WebviewThemeFacts {
  theme: string | null;
  kontrast: string | null;
  /** VS Code's theme classes on `<body>`, sorted. */
  bodyClasses: string[];
  /** The shell's one-frame transition stop of a mode switch is still on `<html>`. */
  switching: boolean;
}

export const canvasFactsProbe = (): CanvasFacts => {
  const shapes = [...document.querySelectorAll<SVGGraphicsElement>(".djs-element.djs-shape")];
  const positions = shapes
    .map((shape) => {
      const matrix = shape.transform.baseVal.consolidate()?.matrix;
      return matrix ? `${Math.round(matrix.e)},${Math.round(matrix.f)}` : "0,0";
    })
    .sort();
  return {
    shapes: shapes.length,
    connections: document.querySelectorAll(".djs-element.djs-connection").length,
    positions,
  };
};

export const chromeProbe = (
  _html: Element,
  islands: readonly string[],
): Record<string, boolean> => {
  const presence: Record<string, boolean> = {};
  for (const island of islands) {
    const element = document.querySelector(`[data-chrome="${island}"]`);
    const rect = element?.getBoundingClientRect();
    presence[island] =
      element !== null &&
      rect !== undefined &&
      rect.width > 0 &&
      rect.height > 0 &&
      (typeof element.checkVisibility !== "function" ||
        element.checkVisibility({ visibilityProperty: true }));
  }
  return presence;
};

export const webviewThemeProbe = (
  _html: Element,
  themeClasses: readonly string[],
): WebviewThemeFacts => {
  const html = document.documentElement;
  return {
    theme: html.getAttribute("data-cd-theme"),
    kontrast: html.getAttribute("data-cd-kontrast"),
    bodyClasses: [...document.body.classList].filter((name) => themeClasses.includes(name)).sort(),
    switching: html.classList.contains("cd-shell-no-transition"),
  };
};

export const workbenchClassesProbe = (): string[] => [
  ...(document.querySelector(".monaco-workbench")?.classList ?? []),
];

export const workbenchWebviewsProbe = (): string[] =>
  [...document.querySelectorAll("iframe.webview")].map((frame) => frame.getAttribute("src") ?? "");

/** The active editor is VS Code's text editor (a custom editor shows a webview instead). */
export const activeTextEditorProbe = (): boolean =>
  document.querySelector(".editor-group-container.active .editor-instance .monaco-editor") !== null;

export const activeEditorDirtyProbe = (): boolean =>
  document.querySelector(".tabs-container .tab.active.dirty") !== null;

/** Two frames, then the running finite animations (at most one second); frames time out when throttled. */
export const settleProbe = async (): Promise<void> => {
  const frame = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 100);
      requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  await frame();
  await frame();
  const running = document.getAnimations().filter((animation) => {
    const end = animation.effect?.getComputedTiming().endTime;
    return animation.playState === "running" && typeof end === "number" && Number.isFinite(end);
  });
  if (running.length > 0) {
    await Promise.race([
      Promise.all(running.map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  }
  await frame();
};

/**
 * Focuses the first enabled palette entry that creates something (outside the tools group, not a
 * `-tool`); returns its `data-action`, undefined when there is none.
 */
export const focusCreatingEntryProbe = (): string | undefined => {
  const entries = [
    ...document.querySelectorAll<HTMLElement>(
      '.djs-palette[data-chrome="palette"] .entry[data-action]',
    ),
  ];
  const creating = entries.find((entry) => {
    const action = entry.getAttribute("data-action") ?? "";
    const group = entry.closest(".group")?.getAttribute("data-group");
    return (
      group !== "tools" &&
      !action.endsWith("-tool") &&
      entry.getAttribute("aria-disabled") !== "true"
    );
  });
  if (!creating) return undefined;
  creating.focus();
  return creating.getAttribute("data-action") ?? undefined;
};

export const blurProbe = (): void => {
  const active = document.activeElement;
  if (active instanceof HTMLElement || active instanceof SVGElement) active.blur();
};

/** One `keydown` in the webview, as the recorder of `installKeyRecorderProbe` saw it. */
export interface KeyRecord {
  key: string;
  code: string;
  /** `defaultPrevented` once every listener on `document` ran; `null` when it never got there. */
  handled: boolean | null;
  /** It reached a listener on the webview's `window`, where VS Code forwards it to the workbench. */
  reachedWindow: boolean;
}

/**
 * Records every `keydown` of the webview from now on: whether something on the way handled it, and
 * whether it reached `window`. Added after the shell and the modeler, so its `document` listener runs
 * after theirs and sees the event as they left it. Installs once per document.
 */
export const installKeyRecorderProbe = (): void => {
  const store = globalThis as unknown as { modelerShellSmokeKeys?: KeyRecord[] };
  if (store.modelerShellSmokeKeys) return;
  const records: KeyRecord[] = [];
  store.modelerShellSmokeKeys = records;
  const recordOf = new WeakMap<Event, KeyRecord>();
  window.addEventListener(
    "keydown",
    (event) => {
      const record: KeyRecord = {
        key: event.key,
        code: event.code,
        handled: null,
        reachedWindow: false,
      };
      recordOf.set(event, record);
      records.push(record);
    },
    true,
  );
  document.addEventListener("keydown", (event) => {
    const record = recordOf.get(event);
    if (record) record.handled = event.defaultPrevented;
  });
  window.addEventListener("keydown", (event) => {
    const record = recordOf.get(event);
    if (record) record.reachedWindow = true;
  });
};

export const takeKeyRecordsProbe = (): KeyRecord[] => {
  const store = globalThis as unknown as { modelerShellSmokeKeys?: KeyRecord[] };
  return store.modelerShellSmokeKeys?.splice(0) ?? [];
};

/** Clears the text selection and focuses the canvas `<svg>`; whether it holds the focus then. */
export const focusCanvasProbe = (): boolean => {
  const svg = document.querySelector<SVGSVGElement>(".djs-container > svg");
  if (!svg) return false;
  document.getSelection()?.removeAllRanges();
  svg.focus({ preventScroll: true });
  return document.activeElement === svg;
};

/** The zoom panel's readout ("86%"); null without one. */
export const zoomReadoutProbe = (): string | null =>
  document.querySelector('[data-chrome="zoom"] [data-zoom="actual"]')?.textContent ?? null;

export const selectedElementsProbe = (): number =>
  document.querySelectorAll(".djs-element.selected").length;

export const textSelectionProbe = (): string => document.getSelection()?.toString() ?? "";

/** Where VS Code's focus is: the webview, the side bar or elsewhere. */
export interface WorkbenchFocus {
  /** A webview frame holds the focus. */
  webview: boolean;
  sideBar: boolean;
  /** The focused part's id, or the focused element. */
  where: string;
}

export const workbenchFocusProbe = (): WorkbenchFocus => {
  const active = document.activeElement;
  const part = active?.closest<HTMLElement>(".part");
  const element = active
    ? [active.localName, ...[...active.classList].slice(0, 2)].join(".") +
      (active.id ? `#${active.id}` : "")
    : "nothing";
  return {
    webview: active instanceof HTMLIFrameElement && active.classList.contains("webview"),
    sideBar: part?.classList.contains("sidebar") === true,
    where: part?.id || element,
  };
};

export const devicePixelRatioProbe = (): number => window.devicePixelRatio;

/** The canvas's view and selection, which an undo and a redo have to leave as they are. */
export interface ViewFacts {
  /** diagram-js's zoom, the scale of the viewport's matrix. */
  scale: number;
  /** The viewport's translation in pixels; with the scale it is the viewbox of a container of the same size. */
  translateX: number;
  translateY: number;
  /** `data-element-id` of every element the canvas draws, sorted. */
  elements: string[];
  /** The ids of the selected ones, sorted. */
  selected: string[];
}

export const viewFactsProbe = (): ViewFacts => {
  const viewport = document.querySelector<SVGGraphicsElement>(".djs-container > svg > .viewport");
  const matrix = viewport?.transform.baseVal.consolidate()?.matrix;
  const idsOf = (selector: string): string[] =>
    [...document.querySelectorAll(selector)]
      .map((element) => element.getAttribute("data-element-id") ?? "")
      .filter((id) => id !== "")
      .sort();
  return {
    scale: matrix?.a ?? 1,
    translateX: matrix?.e ?? 0,
    translateY: matrix?.f ?? 0,
    elements: idsOf(".djs-element"),
    selected: idsOf(".djs-element.selected"),
  };
};
