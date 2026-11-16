// Geist and Geist Mono (Miragon's typefaces, SIL OFL), self-hosted: no font CDN (offline, GDPR).
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import { startApp } from "./app.js";
import { memoryStore, resetRequested, type KeyValueStore } from "./storage.js";

const root = document.getElementById("app");
if (!root) throw new Error("index.html has no #app root.");

/** A browser that blocks its storage throws on the read of the property itself. */
function browserStore(): KeyValueStore {
  try {
    return window.localStorage;
  } catch {
    return memoryStore();
  }
}

const { search } = window.location;
const app = startApp(root, {
  storage: browserStore(),
  search,
  komet: `${import.meta.env.BASE_URL}miragon-komet-blau.svg`,
});
// `?reset` has done its work by now: left in the address, the next reload would reset again.
if (resetRequested(search)) {
  const address = new URL(window.location.href);
  address.searchParams.delete("reset");
  window.history.replaceState(null, "", address);
}

/** For the console and the e2e suite: the app with the editor of the open document. */
Object.assign(globalThis as Record<string, unknown>, { __boardApp: app });
