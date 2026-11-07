# Orca listing images

Makes the cover and the screenshot that each Orca plugin's page shows in Orca's plugin directory
([#572](https://github.com/Miragon/modeler-suite/issues/572)):

| File (in `modelers/<modeler>/apps/orca/images/`) | What it shows                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `cover.webp`, 1600×1000                          | the modeler's icon, title and claim on brand blue, next to the editor               |
| `screenshot-orca.webp`, 1919×1199                | the editor in a whole Orca window, with the project sidebar, tabs and the file tree |

`orca-plugin.json` declares `cover.webp` as the cover and as the first screenshot, and
`screenshot-orca.webp` as the second.

```sh
npm run orca:listing-images                                # every modeler in listing.json
npm run orca:listing-images -- --modeler context-maps      # one modeler (repeatable)
npm run orca:listing-images -- --skip-shots                # re-render from the last shots
npm run orca:listing-images -- --orca 1.4.252              # another Orca release
```

- `shoot.mjs` runs in the Orca smoke container (`modeler-shell-orca-docker`, Docker or Podman):
  a fresh Orca with a throwaway profile, a demo folder `/workspace/strategy-workshop` with each
  modeler's example, the editor and the window shot as PNGs in
  `test-results/orca-listing-images/`. So the images hold nothing of this machine.
- `render.mjs` starts that run, then renders `cover.html` with Playwright's Chromium at double
  resolution and encodes both images as WEBP.
- `listing.json` holds each modeler's title, claim and example file. `assets/` holds the
  Miragon wordmark and the modeler icons from the Miragon brand set, unchanged.

Orca's limits: cover at least 800×500 and at most 1024 KB, screenshots at least 1280×800 and at
most 1536 KB, 16:10 recommended. `orca plugin validate` checks them on the built plugin.
