import { describe, expect, it } from "vitest";
import {
  LINK_WRITE_INTERVAL_MS,
  createLinkWriter,
  decodeDocument,
  encodeDocument,
  holdsLink,
  linkHash,
  readLink,
  shareUrl,
  type AddressBar,
  type LinkWriterClock,
} from "../src/link.js";
import { EXAMPLE } from "../src/example.js";

describe("encodeDocument / decodeDocument", () => {
  it("round-trips the workspace text, umlauts and CRLF included", async () => {
    const text = EXAMPLE.replace('"Bookshop"', '"Buchhandlung Größe"').replace(/\n/g, "\r\n");
    expect(await decodeDocument(await encodeDocument(text))).toBe(text);
  });

  it("writes only URL-safe characters and shrinks the text", async () => {
    const encoded = await encodeDocument(EXAMPLE);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThan(EXAMPLE.length / 3);
  });

  it("keeps the wire format of the other Miragon web apps: deflate-raw in URL-safe Base64", async () => {
    expect(await encodeDocument("{}")).toBe("q64FAA");
    expect(await decodeDocument("q64FAA")).toBe("{}");
  });
});

describe("linkHash / readLink", () => {
  it("carries the workspace and the view it shows", async () => {
    const hash = await linkHash(EXAMPLE, "Containers-bookshop");
    expect(hash).toMatch(/^#mz=[A-Za-z0-9_-]+&v=Containers-bookshop$/);
    expect(await readLink(hash)).toEqual({ text: EXAMPLE, view: "Containers-bookshop" });
  });

  it("encodes a view key that is not URL-safe", async () => {
    const hash = await linkHash("workspace {\n}\n", "Ä view & more");
    expect(hash).not.toContain(" ");
    expect((await readLink(hash))?.view).toBe("Ä view & more");
  });

  it("names no view when none is given, so the default view opens", async () => {
    const hash = await linkHash(EXAMPLE);
    expect(hash).not.toContain("&v=");
    expect(await readLink(hash)).toEqual({ text: EXAMPLE, view: undefined });
  });

  it("reads nothing from another hash or from a link cut off when copied", async () => {
    expect(await readLink("")).toBeUndefined();
    expect(await readLink("#section-2")).toBeUndefined();
    expect(await readLink("#mz=")).toBeUndefined();
    expect(await readLink("#mz=not-valid-deflate-data")).toBeUndefined();
    const whole = await linkHash(EXAMPLE);
    expect(await readLink(whole.slice(0, whole.length / 2))).toBeUndefined();
  });
});

describe("holdsLink", () => {
  it("tells a workspace link, readable or not, from any other hash", () => {
    expect(holdsLink("#mz=cut-off")).toBe(true);
    expect(holdsLink("#section-2")).toBe(false);
    expect(holdsLink("")).toBe(false);
  });
});

describe("shareUrl", () => {
  it("is origin, path and the hash of the workspace and its view", async () => {
    const url = await shareUrl(
      { origin: "https://c4.example", pathname: "/editor" },
      EXAMPLE,
      "SystemLandscape",
    );
    expect(url.startsWith("https://c4.example/editor#mz=")).toBe(true);
    expect(await readLink(url.slice(url.indexOf("#")))).toEqual({
      text: EXAMPLE,
      view: "SystemLandscape",
    });
  });

  it("keeps the page's query, so it is the URL the address bar holds", async () => {
    const { bar } = fakeAddressBar("/editor?lang=en");
    await createLinkWriter(bar).show({ text: EXAMPLE, view: "SystemLandscape" });
    const url = await shareUrl(
      { origin: "https://c4.example", pathname: "/editor", search: "?lang=en" },
      EXAMPLE,
      "SystemLandscape",
    );
    expect(url).toBe(
      `https://c4.example${bar.location.pathname}${bar.location.search}${bar.location.hash}`,
    );
  });
});

/**
 * An address bar that records what the app wrote into it, as `history.replaceState` does. While
 * `refusals` is above 0 it refuses a write the way WebKit refuses a burst of them.
 */
function fakeAddressBar(url = "/editor?lang=en") {
  const writes: string[] = [];
  const parsed = new URL(url, "https://c4.example");
  const browser = { refusals: 0 };
  const bar = {
    location: { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash },
    history: {
      state: { kept: true } as unknown,
      replaceState(data: unknown, _unused: string, next: string) {
        expect(data).toEqual({ kept: true });
        if (browser.refusals > 0) {
          browser.refusals -= 1;
          throw new DOMException(
            "Attempt to use history.replaceState() more than 100 times per 10 seconds",
            "SecurityError",
          );
        }
        const at = new URL(next, "https://c4.example");
        bar.location = { pathname: at.pathname, search: at.search, hash: at.hash };
        writes.push(next);
      },
    },
  } satisfies AddressBar & { location: AddressBar["location"] };
  return { bar, writes, browser };
}

/** A clock that moves only when the test advances it, and runs the timers that fall due. */
function manualClock(): LinkWriterClock & { advance(milliseconds: number): void } {
  let time = 0;
  let nextHandle = 1;
  const timers = new Map<number, { readonly at: number; readonly run: () => void }>();
  return {
    now: () => time,
    setTimeout(run, delay) {
      const handle = nextHandle++;
      timers.set(handle, { at: time + delay, run });
      return handle;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    advance(milliseconds) {
      const until = time + milliseconds;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= until);
        if (due.length === 0) break;
        const [handle, timer] = due.reduce((first, entry) =>
          entry[1].at < first[1].at ? entry : first,
        );
        timers.delete(handle);
        time = timer.at;
        timer.run();
      }
      time = until;
    },
  };
}

describe("createLinkWriter", () => {
  it("writes the workspace and its view into the address bar, keeping path and query", async () => {
    const { bar, writes } = fakeAddressBar();
    const writer = createLinkWriter(bar);

    await writer.show({ text: EXAMPLE, view: "Containers-bookshop" });

    expect(writes).toEqual([`/editor?lang=en${await linkHash(EXAMPLE, "Containers-bookshop")}`]);
    expect(await readLink(bar.location.hash)).toEqual({
      text: EXAMPLE,
      view: "Containers-bookshop",
    });
  });

  it("writes nothing when the address bar holds that link already", async () => {
    const { bar, writes } = fakeAddressBar(`/editor${await linkHash(EXAMPLE, "SystemLandscape")}`);

    await createLinkWriter(bar).show({ text: EXAMPLE, view: "SystemLandscape" });

    expect(writes).toEqual([]);
  });

  it("drops a write that a later change overtook while it was compressed", async () => {
    const { bar, writes } = fakeAddressBar();
    const writer = createLinkWriter(bar);

    const first = writer.show({ text: EXAMPLE, view: "SystemLandscape" });
    const second = writer.show({ text: EXAMPLE, view: "Components-api" });
    await Promise.all([first, second]);

    expect(writes).toEqual([`/editor?lang=en${await linkHash(EXAMPLE, "Components-api")}`]);
  });

  it("drops the hash for an empty workspace, and a pending write with it", async () => {
    const { bar, writes } = fakeAddressBar(`/editor?lang=en${await linkHash(EXAMPLE)}`);
    const writer = createLinkWriter(bar);

    const pending = writer.show({ text: EXAMPLE, view: "Components-api" });
    writer.clear();
    await pending;
    writer.clear();

    expect(writes).toEqual(["/editor?lang=en"]);
    expect(bar.location.hash).toBe("");
  });

  it("lets a pasted link overtake a pending write", async () => {
    const { bar, writes } = fakeAddressBar();
    const writer = createLinkWriter(bar);

    const overtaken = writer.show({ text: EXAMPLE, view: undefined });
    writer.cancel();
    await overtaken;

    expect(writes).toEqual([]);
  });

  it("writes nothing once stopped, not even a pending write", async () => {
    const { bar, writes } = fakeAddressBar(`/editor${await linkHash(EXAMPLE)}`);
    const writer = createLinkWriter(bar);

    const pending = writer.show({ text: EXAMPLE, view: "Components-api" });
    writer.stop();
    await pending;
    await writer.show({ text: EXAMPLE, view: "Components-api" });
    writer.clear();

    expect(writes).toEqual([]);
  });

  it("writes a change at once, and a burst after it as one write once the interval is over", async () => {
    // A held arrow key moves the selection 30 times a second; WebKit refuses the 101st history
    // write within 10 seconds.
    const { bar, writes } = fakeAddressBar();
    const clock = manualClock();
    const writer = createLinkWriter(bar, clock);
    const views = ["SystemLandscape", "Containers-bookshop", "Components-api"];

    await writer.show({ text: EXAMPLE, view: views[0] });
    clock.advance(30);
    const second = writer.show({ text: EXAMPLE, view: views[1] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    clock.advance(30);
    const third = writer.show({ text: EXAMPLE, view: views[2] });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(writes).toEqual([`/editor?lang=en${await linkHash(EXAMPLE, views[0])}`]);
    clock.advance(LINK_WRITE_INTERVAL_MS);
    await Promise.all([second, third]);
    expect(writes).toEqual([
      `/editor?lang=en${await linkHash(EXAMPLE, views[0])}`,
      `/editor?lang=en${await linkHash(EXAMPLE, views[2])}`,
    ]);
  });

  it("tries a write the browser refused again, and never throws", async () => {
    const { bar, writes, browser } = fakeAddressBar();
    const clock = manualClock();
    const writer = createLinkWriter(bar, clock);
    browser.refusals = 2;

    await expect(writer.show({ text: EXAMPLE, view: "SystemLandscape" })).resolves.toBeUndefined();
    expect(writes).toEqual([]);
    clock.advance(1000);
    expect(writes).toEqual([]);
    clock.advance(1000);

    expect(writes).toEqual([`/editor?lang=en${await linkHash(EXAMPLE, "SystemLandscape")}`]);
  });

  it("drops a write still waiting for its turn when a pasted link overtakes it", async () => {
    const { bar, writes } = fakeAddressBar();
    const clock = manualClock();
    const writer = createLinkWriter(bar, clock);

    await writer.show({ text: EXAMPLE, view: "SystemLandscape" });
    const waiting = writer.show({ text: EXAMPLE, view: "Components-api" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    writer.cancel();
    await waiting;
    clock.advance(LINK_WRITE_INTERVAL_MS * 4);

    expect(writes).toEqual([`/editor?lang=en${await linkHash(EXAMPLE, "SystemLandscape")}`]);
  });

  it("lets an empty workspace's clean URL overtake a write waiting for its turn", async () => {
    const { bar, writes } = fakeAddressBar();
    const clock = manualClock();
    const writer = createLinkWriter(bar, clock);

    await writer.show({ text: EXAMPLE, view: "SystemLandscape" });
    const waiting = writer.show({ text: EXAMPLE, view: "Components-api" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    writer.clear();
    clock.advance(LINK_WRITE_INTERVAL_MS);
    await waiting;

    expect(writes).toEqual([
      `/editor?lang=en${await linkHash(EXAMPLE, "SystemLandscape")}`,
      "/editor?lang=en",
    ]);
    expect(bar.location.hash).toBe("");
  });
});
