/**
 * The client and the server together, on a memory backend: one path with more than one reader,
 * and what each of them hears of a write, of the outside, of a file that goes and of a move.
 */
import { describe, expect, test } from "vitest";
import {
  createFilesClient,
  serveFiles,
  WriteRefusal,
  type BoardFiles,
  type TextSession,
} from "../src/index.js";
import {
  createCountingBackend,
  createWire,
  deferred,
  RULE,
  settled,
  type CountingBackend,
  type Wire,
} from "./support/wire.js";

const TEA = "title Tea\ncomponent Cup [0.8, 0.7]\n";
const PATH = "models/tea.owm";

interface Bench {
  wire: Wire;
  backend: CountingBackend;
  files: BoardFiles;
}

async function bench(): Promise<Bench> {
  const wire = createWire();
  const backend = createCountingBackend({
    [PATH]: TEA,
    "models/sample.tt": "{}",
    "assets/logo.png": { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" },
  });
  serveFiles(wire.host, backend, RULE);
  const files = createFilesClient(wire.page);
  await settled();
  return { wire, backend, files };
}

/** what one session heard, in order */
function ears(session: TextSession): string[] {
  const heard: string[] = [];
  session.onReplace((text) => heard.push(`replace ${text}`));
  session.onAvailable((available) => heard.push(available ? "back" : "gone"));
  return heard;
}

/** why the writes of a session were dropped, in order */
function drops(session: TextSession): string[] {
  const heard: string[] = [];
  session.onDropped?.((reason) => heard.push(reason));
  return heard;
}

const posted = (wire: Wire, type: string): number =>
  wire.log.filter((line) => line === type).length;

describe("the list", () => {
  test("is the backend's after the hello, and the same array until it changes", async () => {
    const { backend, files } = await bench();
    const first = files.paths();
    expect(first).toEqual(["assets/logo.png", "models/sample.tt", PATH]);
    let told = 0;
    files.onPaths(() => void (told += 1));
    backend.outside(PATH, "title Changed\n");
    await settled();
    expect(files.paths()).toBe(first);
    expect(told).toBe(0);
    backend.outside("models/new.owm", TEA);
    await settled();
    expect(files.paths()).not.toBe(first);
    expect(files.paths()).toContain("models/new.owm");
    expect(told).toBe(1);
  });
});

describe("one path, two readers", () => {
  test("is opened once at the host, and both read the same text", async () => {
    const { wire, backend, files } = await bench();
    const [one, two] = await Promise.all([files.openText(PATH), files.openText(PATH)]);
    const three = await files.openText(PATH);
    expect(one).not.toBe(two);
    expect([one.text(), two.text(), three.text()]).toEqual([TEA, TEA, TEA]);
    expect(posted(wire, "page> board.text.open")).toBe(1);
    expect(backend.calls.openText).toEqual([PATH]);
    expect(backend.openTexts()).toBe(1);
  });

  test("a write is the other reader's at once, the backend's one message later, and never the writer's", async () => {
    const { wire, backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const heardByOne = ears(one);
    const heardByTwo = ears(two);
    const messages = wire.fromHost.length;

    one.write("title Coffee\n");
    // at once: before anything crossed the channel
    expect(heardByTwo).toEqual(["replace title Coffee\n"]);
    expect(two.text()).toBe("title Coffee\n");
    expect(one.text()).toBe("title Coffee\n");
    expect(backend.writes).toEqual([]);

    await settled();
    expect(backend.writes).toEqual([{ path: PATH, text: "title Coffee\n" }]);
    expect(posted(wire, "page> board.text.edit")).toBe(1);
    // the echo that never comes back: the host posted nothing, the writer heard nothing
    expect(wire.fromHost).toHaveLength(messages);
    expect(heardByOne).toEqual([]);
    expect(heardByTwo).toEqual(["replace title Coffee\n"]);
  });

  test("a write of the text the path has is none", async () => {
    const { wire, backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const heardByTwo = ears(two);
    one.write(TEA);
    two.write("title Coffee\n");
    one.write("title Coffee\n");
    await settled();
    expect(posted(wire, "page> board.text.edit")).toBe(1);
    expect(backend.writes).toHaveLength(1);
    expect(heardByTwo).toEqual([]);
  });

  test("a change from outside is every reader's, and nobody writes it back", async () => {
    const { wire, backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const heardByOne = ears(one);
    const heardByTwo = ears(two);
    backend.outside(PATH, "title Outside\n");
    await settled();
    expect(heardByOne).toEqual(["replace title Outside\n"]);
    expect(heardByTwo).toEqual(["replace title Outside\n"]);
    expect(one.text()).toBe("title Outside\n");
    expect(backend.writes).toEqual([]);
    expect(posted(wire, "page> board.text.edit")).toBe(0);
    expect(posted(wire, "host> board.text.update")).toBe(1);
  });

  test("a write the backend refused comes back to every reader, the writer too", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const heardByOne = ears(one);
    const heardByTwo = ears(two);
    backend.onWrite = async () => false;
    one.write("title Refused\n");
    await settled();
    expect(heardByOne).toEqual([`replace ${TEA}`]);
    expect(heardByTwo).toEqual(["replace title Refused\n", `replace ${TEA}`]);
    expect([one.text(), two.text()]).toEqual([TEA, TEA]);
    expect(backend.textOf(PATH)).toBe(TEA);
  });

  test("a reader that answers a write with one of its own leaves the host with the page's text", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    two.onReplace((text) => {
      if (!text.endsWith("# seen\n")) two.write(`${text}# seen\n`);
    });
    one.write("title Coffee\n");
    await settled();
    expect(one.text()).toBe("title Coffee\n# seen\n");
    expect(two.text()).toBe("title Coffee\n# seen\n");
    expect(backend.writes.map((write) => write.text)).toEqual([
      "title Coffee\n",
      "title Coffee\n# seen\n",
    ]);
    expect(backend.textOf(PATH)).toBe(one.text());
  });

  test("a reader that closed, or stopped listening, hears nothing more", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const three = await files.openText(PATH);
    const heardByTwo = ears(two);
    const heardByThree: string[] = [];
    const off = three.onReplace((text) => heardByThree.push(text));
    one.write("title One\n");
    two.close();
    off();
    one.write("title Two\n");
    backend.outside(PATH, "title Outside\n");
    backend.remove(PATH);
    await settled();
    expect(heardByTwo).toEqual(["replace title One\n"]);
    expect(heardByThree).toEqual(["title One\n"]);
  });

  test("a reader that closes while the others are told is not told after it closed", async () => {
    const { files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const three = await files.openText(PATH);
    const heardByThree = ears(three);
    two.onReplace(() => three.close());
    one.write("title One\n");
    expect(heardByThree).toEqual([]);
  });

  test("the host hears of a close once, after the last reader", async () => {
    const { wire, backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const heardByTwo = ears(two);
    one.close();
    one.close();
    // a closed session writes nothing, though its path is still open for the other
    one.write("title Closed\n");
    await settled();
    expect(posted(wire, "page> board.text.close")).toBe(0);
    expect(posted(wire, "page> board.text.edit")).toBe(0);
    expect(heardByTwo).toEqual([]);
    expect(two.text()).toBe(TEA);
    expect(backend.openTexts()).toBe(1);
    // the one that is left still reads and writes
    two.write("title Still\n");
    await settled();
    expect(backend.textOf(PATH)).toBe("title Still\n");
    two.close();
    two.close();
    await settled();
    expect(posted(wire, "page> board.text.close")).toBe(1);
    expect(backend.openTexts()).toBe(0);
    // a closed session writes nothing
    two.write("title Closed\n");
    await settled();
    expect(backend.textOf(PATH)).toBe("title Still\n");
    // and the next reader asks the host anew
    const again = await files.openText(PATH);
    expect(again.text()).toBe("title Still\n");
    expect(posted(wire, "page> board.text.open")).toBe(2);
    expect(backend.openTexts()).toBe(1);
  });

  test("a reader that closes while another was asked for does not close the path under it", async () => {
    const { wire, backend, files } = await bench();
    const first = await files.openText(PATH);
    // asked for and not there yet, in the task in which the only reader closes
    const second = files.openText(PATH);
    first.close();
    const session = await second;
    const heard = ears(session);
    await settled();
    expect(posted(wire, "page> board.text.close")).toBe(0);
    expect(posted(wire, "page> board.text.open")).toBe(1);
    expect(backend.openTexts()).toBe(1);
    backend.outside(PATH, "title Outside\n");
    await settled();
    expect(heard).toEqual(["replace title Outside\n"]);
    session.write("title Mine\n");
    await settled();
    expect(backend.textOf(PATH)).toBe("title Mine\n");
    session.close();
    await settled();
    expect(posted(wire, "page> board.text.close")).toBe(1);
    expect(backend.openTexts()).toBe(0);
  });

  test("of two readers asked for at once, one may close in the moment it is there", async () => {
    const { wire, backend, files } = await bench();
    const first = files.openText(PATH).then((session) => session.close());
    const second = files.openText(PATH);
    await first;
    const session = await second;
    await settled();
    expect(posted(wire, "page> board.text.close")).toBe(0);
    session.write("title Mine\n");
    await settled();
    expect(backend.textOf(PATH)).toBe("title Mine\n");
  });

  test("two paths are two texts: a write of one is not the other's", async () => {
    const { backend, files } = await bench();
    const tea = await files.openText(PATH);
    const teams = await files.openText("models/sample.tt");
    const heardByTeams = ears(teams);
    tea.write("title Coffee\n");
    await settled();
    expect(heardByTeams).toEqual([]);
    expect(backend.textOf("models/sample.tt")).toBe("{}");
    expect(backend.openTexts()).toBe(2);
  });
});

describe("an edit and a change from outside that cross", () => {
  test("a write made before the page heard of the outside's change is not the file's: both end with the outside's text", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const heardByOne = ears(one);
    backend.outside(PATH, "title Outside\n");
    // the host's word of it is on its way to the page, which writes meanwhile
    one.write("title Mine\n");
    await settled();
    expect(backend.textOf(PATH)).toBe("title Outside\n");
    expect([one.text(), two.text()]).toEqual(["title Outside\n", "title Outside\n"]);
    // the writer is told the text that took its edit's place
    expect(heardByOne).toEqual(["replace title Outside\n"]);
    expect(backend.writes).toEqual([]);
  });

  test("a write that is on its way to the host when the outside changes the file is not the file's either", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const heard = ears(one);
    one.write("title Mine\n");
    backend.outside(PATH, "title Outside\n");
    await settled();
    expect(backend.textOf(PATH)).toBe("title Outside\n");
    expect(one.text()).toBe("title Outside\n");
    expect(heard).toEqual(["replace title Outside\n"]);
    expect(backend.writes).toEqual([]);
  });

  test("every write of the page that crossed is dropped, and the first one made after it heard is the file's", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    one.write("title One\n");
    backend.outside(PATH, "title Outside\n");
    one.write("title Two\n");
    await settled();
    expect(one.text()).toBe("title Outside\n");
    expect(backend.textOf(PATH)).toBe("title Outside\n");
    one.write("title Outside\ncomponent Mine [0.5, 0.5]\n");
    await settled();
    expect(backend.textOf(PATH)).toBe(one.text());
    // not one of the two that crossed, whichever side of the outside's change it was posted on
    expect(backend.writes.map((write) => write.text)).toEqual([
      "title Outside\ncomponent Mine [0.5, 0.5]\n",
    ]);
  });

  test("two changes from outside that cross one write leave page and file on the last of them", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const heard = ears(one);
    backend.outside(PATH, "title First\n");
    one.write("title Mine\n");
    backend.outside(PATH, "title Second\n");
    await settled();
    expect(one.text()).toBe("title Second\n");
    expect(backend.textOf(PATH)).toBe("title Second\n");
    expect(heard).toEqual(["replace title First\n", "replace title Second\n"]);
  });

  test("a write the host refused and a write behind it that crossed the answer: both readers end with the file's text", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    backend.onWrite = async () => false;
    one.write("title Refused\n");
    await settled();
    // the answer is at the page; a write the page had posted before it would be on an old version
    expect([one.text(), two.text()]).toEqual([TEA, TEA]);
    backend.onWrite = undefined;
    two.write("title Taken\n");
    await settled();
    expect(backend.textOf(PATH)).toBe("title Taken\n");
    expect([one.text(), two.text()]).toEqual(["title Taken\n", "title Taken\n"]);
  });

  test("a reader that writes on a text it was told to replace loses that write, not the text", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const heardByTwo = ears(two);
    // what a binding holds while a gesture is held: the text from before the outside's change
    const before = one.text();
    backend.outside(PATH, "title Outside\n");
    await settled();
    heardByTwo.length = 0;
    one.write("title Made on the old text\n", before);
    await settled();
    expect(one.text()).toBe("title Outside\n");
    expect(backend.textOf(PATH)).toBe("title Outside\n");
    expect(heardByTwo).toEqual([]);
    expect(backend.writes).toEqual([]);
    // and on the text it has, the same write is taken
    one.write("title Made on the new text\n", one.text());
    await settled();
    expect(backend.textOf(PATH)).toBe("title Made on the new text\n");
    expect(heardByTwo).toEqual(["replace title Made on the new text\n"]);
  });
});

describe("the words for an edit that is not in the file", () => {
  test("a write that crossed a change from outside is said to its writer once, and not to the other reader", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const [byOne, byTwo] = [drops(one), drops(two)];
    backend.outside(PATH, "title Outside\n");
    one.write("title Mine\n");
    one.write("title Mine again\n");
    await settled();
    expect(one.text()).toBe("title Outside\n");
    expect(byOne).toEqual(["crossed"]);
    expect(byTwo).toEqual([]);
  });

  test("a write the place calls too large is said so, and the writer has the file's text again", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const byOne = drops(one);
    const heard = ears(one);
    backend.onWrite = () => Promise.reject(new WriteRefusal("too-large"));
    one.write("title Far too long\n");
    await settled();
    expect(byOne).toEqual(["too-large"]);
    // the text first, then the word: whoever says it shows the file by then
    expect(heard).toEqual([`replace ${TEA}`]);
    expect(one.text()).toBe(TEA);
    expect(backend.textOf(PATH)).toBe(TEA);
  });

  test("a write that is taken is no word, and neither is a change from outside", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const byOne = drops(one);
    one.write("title Mine\n");
    await settled();
    backend.outside(PATH, "title Outside\n");
    await settled();
    expect(byOne).toEqual([]);
  });

  test("the reader that wrote last hears it, whoever wrote before", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const [byOne, byTwo] = [drops(one), drops(two)];
    backend.onWrite = async () => false;
    one.write("title One\n");
    two.write("title Two\n");
    await settled();
    expect([byOne, byTwo]).toEqual([[], ["crossed"]]);
    expect([one.text(), two.text()]).toEqual([TEA, TEA]);
  });
});

describe("waiting for the writes that are on their way", () => {
  test("settled resolves once the file has the write, however long the place takes", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const gate = deferred<void>();
    backend.onWrite = async (_path, text, base, write) => {
      await gate.promise;
      return write(text, base);
    };
    one.write("title Slow\n");
    let done = false;
    const waited = files.settled().then(() => void (done = true));
    await settled();
    expect(done).toBe(false);
    expect(backend.textOf(PATH)).toBe(TEA);
    gate.resolve();
    await waited;
    expect(backend.textOf(PATH)).toBe("title Slow\n");
  });

  test("the last write of a session that closed, and of a page that goes right after, is in the file", async () => {
    const wire = createWire();
    const backend = createCountingBackend({ [PATH]: TEA });
    const server = serveFiles(wire.host, backend, RULE);
    const files = createFilesClient(wire.page);
    const one = await files.openText(PATH);
    const gate = deferred<void>();
    backend.onWrite = async (_path, text, base, write) => {
      await gate.promise;
      return write(text, base);
    };
    one.write("title Last\n");
    one.close();
    const waited = files.settled();
    await settled();
    // the edit reached the host: what happens to the page now does not take it back
    files.dispose();
    server.dispose();
    await expect(waited).rejects.toThrow("the files were closed");
    expect(backend.openTexts()).toBe(1);
    gate.resolve();
    await settled();
    expect(backend.textOf(PATH)).toBe("title Last\n");
    expect(backend.openTexts()).toBe(0);
  });

  test("a write the page posts in the task in which its channel ends never reaches the file", async () => {
    const wire = createWire();
    const backend = createCountingBackend({ [PATH]: TEA });
    const server = serveFiles(wire.host, backend, RULE);
    const files = createFilesClient(wire.page);
    const one = await files.openText(PATH);
    one.write("title Too late\n");
    // a webview that is closed in the task of its last edit: the host stops listening first
    server.dispose();
    await settled();
    expect(backend.textOf(PATH)).toBe(TEA);
    expect(backend.openTexts()).toBe(0);
  });

  test("settled is answered though a write was refused or dropped", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    backend.onWrite = async () => false;
    one.write("title Refused\n");
    await files.settled();
    // the answer to the refusal is behind the page's ear before settled resolves
    expect(one.text()).toBe(TEA);
    backend.onWrite = undefined;
    backend.outside(PATH, "title Outside\n");
    one.write("title Crossed\n");
    await files.settled();
    expect(one.text()).toBe("title Outside\n");
    expect(backend.textOf(PATH)).toBe("title Outside\n");
  });
});

describe("a file that goes", () => {
  test("is gone for every reader, takes no write, and is back with its new text", async () => {
    const { wire, backend, files } = await bench();
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const heardByOne = ears(one);
    const heardByTwo = ears(two);
    backend.remove(PATH);
    await settled();
    expect(heardByOne).toEqual(["gone"]);
    expect(heardByTwo).toEqual(["gone"]);
    expect(files.paths()).not.toContain(PATH);
    // the text the canvas shows stays
    expect(one.text()).toBe(TEA);

    one.write("title Into the void\n");
    await settled();
    expect(posted(wire, "page> board.text.edit")).toBe(0);
    expect(heardByTwo).toEqual(["gone"]);
    expect(one.text()).toBe(TEA);

    backend.outside(PATH, "title Back\n");
    await settled();
    expect(heardByOne).toEqual(["gone", "back", "replace title Back\n"]);
    expect(heardByTwo).toEqual(["gone", "back", "replace title Back\n"]);
    expect(files.paths()).toContain(PATH);
    two.write("title Written again\n");
    await settled();
    expect(backend.textOf(PATH)).toBe("title Written again\n");
  });

  test("an edit that crossed the removal does not bring the file back", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    const heard = ears(one);
    // written before the page heard that the file went
    backend.remove(PATH);
    one.write("title Too late\n");
    await settled();
    expect(heard).toEqual(["gone"]);
    expect(backend.list()).not.toContain(PATH);
    expect(backend.writes).toEqual([]);
  });

  test("is refused to a reader that comes later, as the host refuses a file that is not there", async () => {
    const { backend, files } = await bench();
    const one = await files.openText(PATH);
    backend.remove(PATH);
    await settled();
    await expect(files.openText(PATH)).rejects.toThrow("models/tea.owm is gone");
    one.close();
    await settled();
    await expect(files.openText(PATH)).rejects.toThrow(
      "models/tea.owm is no text file of this repository",
    );
    // back again, it opens for whoever asks then
    backend.outside(PATH, "title Back\n");
    await settled();
    const later = await files.openText(PATH);
    expect(later.text()).toBe("title Back\n");
  });

  test("an open the host refused is asked anew by the next reader", async () => {
    const { wire, backend, files } = await bench();
    const both = await Promise.allSettled([
      files.openText("models/missing.owm"),
      files.openText("models/missing.owm"),
    ]);
    expect(both.map((one) => one.status)).toEqual(["rejected", "rejected"]);
    expect(posted(wire, "page> board.text.open")).toBe(1);
    backend.outside("models/missing.owm", TEA);
    await settled();
    const session = await files.openText("models/missing.owm");
    expect(session.text()).toBe(TEA);
    expect(posted(wire, "page> board.text.open")).toBe(2);
  });
});

describe("a move", () => {
  test("is told with both paths, after the list has the new one", async () => {
    const { backend, files } = await bench();
    const heard: string[] = [];
    files.onPaths(() => heard.push(`paths ${files.paths().join(" ")}`));
    files.onMoved((moves) => {
      heard.push(...moves.map((move) => `moved ${move.from} > ${move.to}`));
      // whoever follows the move finds the new path listed
      heard.push(`listed ${files.paths().includes("drinks/tea.owm")}`);
    });
    backend.move(PATH, "drinks/tea.owm");
    await settled();
    expect(heard).toEqual([
      "paths assets/logo.png drinks/tea.owm models/sample.tt",
      "moved models/tea.owm > drinks/tea.owm",
      "listed true",
    ]);
  });

  test("a reader that follows it reads the same text at the new path and writes there", async () => {
    const { wire, backend, files } = await bench();
    const old = await files.openText(PATH);
    const heardByOld = ears(old);
    let followed: Promise<TextSession> | undefined;
    files.onMoved((moves) => {
      for (const move of moves) {
        if (move.from !== old.path) continue;
        old.close();
        followed = files.openText(move.to);
      }
    });
    backend.move(PATH, "drinks/tea.owm");
    await settled();
    const session = await followed;
    expect(session?.path).toBe("drinks/tea.owm");
    expect(session?.text()).toBe(TEA);
    // it closed before the host's word of the old path reached it
    expect(heardByOld).toEqual([]);
    session?.write("title Moved\n");
    await settled();
    expect(backend.textOf("drinks/tea.owm")).toBe("title Moved\n");
    expect(backend.textOf(PATH)).toBeUndefined();
    expect(posted(wire, "page> board.text.close")).toBe(1);
    expect(backend.openTexts()).toBe(1);
  });

  test("a reader that stays hears that its file is gone, and that it is back when it moves back", async () => {
    const { backend, files } = await bench();
    const stayed = await files.openText(PATH);
    const heard = ears(stayed);
    backend.move(PATH, "drinks/tea.owm");
    await settled();
    expect(heard).toEqual(["gone"]);
    backend.outside("drinks/tea.owm", "title Elsewhere\n");
    backend.move("drinks/tea.owm", PATH);
    await settled();
    expect(heard).toEqual(["gone", "back", "replace title Elsewhere\n"]);
  });

  test("a listener that was taken off is not told", async () => {
    const { backend, files } = await bench();
    let told = 0;
    const off = files.onMoved(() => void (told += 1));
    off();
    backend.move(PATH, "drinks/tea.owm");
    await settled();
    expect(told).toBe(0);
  });
});

describe("bytes and new files", () => {
  test("reads a file as a blob of its type, and no blob for a file that is not there", async () => {
    const { files } = await bench();
    const blob = await files.readBytes("assets/logo.png");
    expect(blob?.type).toBe("image/png");
    expect([...new Uint8Array((await blob?.arrayBuffer()) ?? new ArrayBuffer(0))]).toEqual([
      1, 2, 3,
    ]);
    expect(await files.readBytes("assets/missing.png")).toBeUndefined();
  });

  test("stores a new file: it is listed, its bytes are told, and it reads back", async () => {
    const { backend, files } = await bench();
    const heard: string[] = [];
    files.onPaths(() => heard.push("paths"));
    files.onBytesChanged((paths) => heard.push(`bytes ${paths.join(" ")}`));
    await files.createFile?.(
      "assets/new.png",
      new Blob([new Uint8Array([9, 8, 7])], { type: "image/png" }),
    );
    // the list and the bytes were told before the create resolved
    expect(heard).toEqual(["paths", "bytes assets/new.png"]);
    expect(files.paths()).toContain("assets/new.png");
    const stored = await backend.readBytes("assets/new.png");
    expect([...(stored?.bytes ?? [])]).toEqual([9, 8, 7]);
    expect(stored?.mime).toBe("image/png");
    const blob = await files.readBytes("assets/new.png");
    expect(blob?.size).toBe(3);
  });

  test.each([
    ["a file that exists", "assets/logo.png", "assets/logo.png exists already"],
    ["a path out of the repository", "../x.png", "this path is outside the repository"],
    ["a path that is no asset", "models/tea.owm", "a new file goes into assets/"],
    ["a folder below assets", "assets/icons/x.png", "a new file goes into assets/"],
  ])("refuses to store %s and leaves the files as they were", async (_what, path, message) => {
    const { backend, files } = await bench();
    const before = [...backend.list()];
    await expect(files.createFile?.(path, new Blob([new Uint8Array([9])]))).rejects.toThrow(
      message,
    );
    expect(backend.list()).toEqual(before);
    expect(backend.textOf(PATH)).toBe(TEA);
    expect([...((await backend.readBytes("assets/logo.png"))?.bytes ?? [])]).toEqual([1, 2, 3]);
  });

  test.each([
    ["an absolute path", "/etc/passwd"],
    ["a scheme", "file:///etc/passwd"],
    ["two dots", "../outside/secret.owm"],
    ["a backslash", "models\\tea.owm"],
  ])("refuses to open and to read %s, and the backend never sees it", async (_what, path) => {
    const { backend, files } = await bench();
    await expect(files.openText(path)).rejects.toThrow("this path is outside the repository");
    await expect(files.readBytes(path)).rejects.toThrow("this path is outside the repository");
    expect(backend.calls).toEqual({ openText: [], readBytes: [], createFile: [] });
  });

  test("refuses a dot folder and whatever the host's rule does not let a board reach, each with its own word", async () => {
    const { backend, files } = await bench();
    backend.outside(".git/config", "[core]");
    backend.outside("notes/readme.md", "# no model");
    await settled();
    const hidden = "a board reaches no dot file and no file in a dot folder";
    await expect(files.openText(".git/config")).rejects.toThrow(hidden);
    await expect(files.readBytes(".git/config")).rejects.toThrow(hidden);
    await expect(files.openText("notes/readme.md")).rejects.toThrow(
      "notes/readme.md is no model a board shows here",
    );
    await expect(files.openText("assets/logo.png")).rejects.toThrow(
      "assets/logo.png is no model a board shows here",
    );
    await expect(files.readBytes(PATH)).rejects.toThrow(
      "models/tea.owm is no picture a board shows here",
    );
    await expect(
      files.createFile?.("assets/notes.txt", new Blob([new Uint8Array([9])])),
    ).rejects.toThrow("assets/notes.txt is no picture a board shows here");
    expect(backend.calls).toEqual({ openText: [], readBytes: [], createFile: [] });
    // and the page was never told that those files are there
    expect(files.paths()).toEqual(["assets/logo.png", "models/sample.tt", PATH]);
  });
});

describe("a read-only file", () => {
  test("is said to be one, and a write to it is none: not for the host, not for the other reader", async () => {
    const { wire, backend, files } = await bench();
    backend.readOnly = true;
    const one = await files.openText(PATH);
    const two = await files.openText(PATH);
    const heardByTwo = ears(two);
    expect([one.readOnly, two.readOnly]).toEqual([true, true]);
    one.write("title Not allowed\n");
    await settled();
    expect(posted(wire, "page> board.text.edit")).toBe(0);
    expect(heardByTwo).toEqual([]);
    expect(one.text()).toBe(TEA);
    // it still follows the outside
    backend.outside(PATH, "title Outside\n");
    await settled();
    expect(heardByTwo).toEqual(["replace title Outside\n"]);
  });
});

describe("the end", () => {
  test("a disposed client and a disposed server leave nothing open at the backend", async () => {
    const wire = createWire();
    const backend = createCountingBackend({ [PATH]: TEA });
    const server = serveFiles(wire.host, backend, RULE);
    const files = createFilesClient(wire.page);
    const session = await files.openText(PATH);
    const heard = ears(session);
    files.dispose();
    server.dispose();
    expect(backend.openTexts()).toBe(0);
    expect(backend.subscriptions()).toBe(0);
    backend.outside(PATH, "title Outside\n");
    await settled();
    expect(heard).toEqual([]);
  });

  test("a reader that was asked for in the task of the dispose gets no session", async () => {
    const { files } = await bench();
    await files.openText(PATH);
    // the path is open already: this one waits for nothing but its turn
    const late = files.openText(PATH);
    files.dispose();
    await expect(late).rejects.toThrow("the files were closed");
  });
});
