// Takes the editor screenshot of every modeler's web app with its example open, for the
// modelers' READMEs (modelers/<modeler>/docs/screenshots/editor.png) and the docs landing page
// (docs/public/shots/<modeler>/editor.png). Needs the built web apps: run `npm run build` first,
// then `node docs/shots/modeler-screenshots.mjs [modeler ...]` from the repository root.
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { chromium } from "playwright";

const allModelers = [
  "wardley-maps",
  "event-storming",
  "team-topologies",
  "context-maps",
  "value-chain",
];
const modelers = process.argv.length > 2 ? process.argv.slice(2) : allModelers;

async function startPreview(modeler, port) {
  const preview = spawn(
    "npx",
    ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: `modelers/${modeler}/apps/webapp`, stdio: "ignore", detached: true },
  );
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return preview;
    } catch {
      await wait(200);
    }
  }
  process.kill(-preview.pid);
  throw new Error(`The web app of ${modeler} did not start`);
}

const browser = await chromium.launch();
try {
  for (const [index, modeler] of modelers.entries()) {
    const port = 4780 + index;
    const preview = await startPreview(modeler, port);
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      await page.goto(`http://127.0.0.1:${port}/`);
      await page
        .getByRole("button", { name: /show example/i })
        .first()
        .click();
      await page.waitForLoadState("networkidle");
      await wait(1500);
      await page.mouse.move(0, 0);
      const readmeShot = `modelers/${modeler}/docs/screenshots/editor.png`;
      await page.screenshot({ path: readmeShot });
      mkdirSync(`docs/public/shots/${modeler}`, { recursive: true });
      copyFileSync(readmeShot, `docs/public/shots/${modeler}/editor.png`);
      await page.close();
      console.log(`${modeler}: ${readmeShot}`);
    } finally {
      process.kill(-preview.pid);
    }
  }
} finally {
  await browser.close();
}
