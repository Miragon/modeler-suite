// Geist and Geist Mono (Miragon's typefaces, SIL OFL), self-hosted: no font CDN (offline, GDPR).
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import { startApp } from "./app.js";
import { memoryStore, resetRequested, type KeyValueStore } from "./storage.js";

const app = document.getElementById("app");
if (!app) throw new Error("index.html has no #app root.");

/** A browser that blocks its storage throws on the read of the property itself. */
function browserStore(): KeyValueStore {
  try {
    return window.localStorage;
  } catch {
    return memoryStore();
  }
}

const { search } = window.location;
startApp(app, { storage: browserStore(), search });
// `?reset` has done its work by now: left in the address, the next reload would reset again.
if (resetRequested(search)) {
  const address = new URL(window.location.href);
  address.searchParams.delete("reset");
  window.history.replaceState(null, "", address);
}
