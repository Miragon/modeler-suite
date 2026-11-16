import { fileURLToPath } from "node:url";
import { loadConfigFromFile, type Plugin, type PluginOption, type UserConfig } from "vite";
import { beforeAll, describe, expect, test } from "vitest";

const CONFIG = fileURLToPath(new URL("../vite.config.ts", import.meta.url));
const APP = fileURLToPath(new URL("..", import.meta.url));

const isPlugin = (option: unknown): option is Plugin =>
  typeof option === "object" && option !== null && "name" in option;

/** The plugins of a config without the nesting, the promises and the empty slots Vite allows. */
async function pluginsOf(options: readonly PluginOption[]): Promise<Plugin[]> {
  const plugins: Plugin[] = [];
  for (const option of options) {
    const settled: unknown = await option;
    if (Array.isArray(settled)) plugins.push(...(await pluginsOf(settled as PluginOption[])));
    else if (isPlugin(settled)) plugins.push(settled);
  }
  return plugins;
}

describe("the web app's production build, by its Vite config", () => {
  let config: UserConfig;

  beforeAll(async () => {
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "production" },
      CONFIG,
      APP,
      "silent",
    );
    if (loaded === null) throw new Error(`Vite found no config at ${CONFIG}`);
    config = loaded.config;
  });

  test("writes its third-party notices, and the dev server does not", async () => {
    const plugins = await pluginsOf(config.plugins ?? []);
    const notices = plugins.filter(({ name }) => name === "board-third-party-notices");

    expect(notices).toHaveLength(1);
    expect(notices[0]?.apply).toBe("build");
  });

  // check:build reads the maps for which packages are in the build: without them it has no
  // evidence but the notices themselves, and does not pass.
  test("keeps its source maps, the build check's evidence of what was bundled", () => {
    expect(config.build?.sourcemap).toBe(true);
  });

  test("keeps the legal comments, which name the licence file the notices put beside a script", () => {
    expect(config.build?.rolldownOptions?.output).toMatchObject({ comments: { legal: true } });
  });
});
