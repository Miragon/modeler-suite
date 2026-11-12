<script setup lang="ts">
import { withBase } from "vitepress";

type Client = { name: string; href: string; icon: keyof typeof icons };

const marketplace = (id: string) => `https://marketplace.visualstudio.com/items?itemName=${id}`;
const orca = (slug: string) => `https://www.onorca.dev/plugins/miragon/orca-modelers/${slug}`;
const npm = (name: string) => `https://www.npmjs.com/package/${name}`;

const icons = {
  web: [
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
    "M2 12h20",
    "M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
  ],
  vscode: ["M16 18l6-6-6-6", "M8 6l-6 6 6 6"],
  orca: [
    "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    "M9 4v16",
    "M13 9l3 3-3 3",
  ],
  npm: [
    "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
  ],
};

const modelers: { name: string; slug: string; clients: Client[] }[] = [
  {
    name: "Business Model Canvas",
    slug: "business-model-canvas",
    clients: [
      { name: "Browser", href: "https://business-model-canvas.modeler.miragon.io", icon: "web" },
      {
        name: "VS Code",
        href: marketplace("miragon-gmbh.business-model-canvas-modeler"),
        icon: "vscode",
      },
      { name: "Orca", href: orca("business-model-canvas-modeler"), icon: "orca" },
    ],
  },
  {
    name: "Value Chain",
    slug: "value-chain",
    clients: [
      { name: "VS Code", href: marketplace("miragon-gmbh.value-chain-modeler"), icon: "vscode" },
      { name: "Orca", href: orca("value-chain-modeler"), icon: "orca" },
      { name: "npm", href: npm("@miragon/value-chain-renderer"), icon: "npm" },
    ],
  },
  {
    name: "Wardley Maps",
    slug: "wardley-maps",
    clients: [
      { name: "Browser", href: "https://wardley-maps.modeler.miragon.io", icon: "web" },
      {
        name: "VS Code",
        href: marketplace("miragon-gmbh.wardley-mapping-modeler"),
        icon: "vscode",
      },
      { name: "Orca", href: orca("wardley-maps-modeler"), icon: "orca" },
      { name: "npm", href: npm("@miragon/wardley-renderer"), icon: "npm" },
    ],
  },
  {
    name: "Event Storming",
    slug: "event-storming",
    clients: [
      { name: "Browser", href: "https://event-storming.modeler.miragon.io", icon: "web" },
      { name: "VS Code", href: marketplace("miragon-gmbh.event-storming-modeler"), icon: "vscode" },
      { name: "Orca", href: orca("event-storming-modeler"), icon: "orca" },
      { name: "npm", href: npm("@miragon/event-storming-renderer"), icon: "npm" },
    ],
  },
  {
    name: "Context Maps",
    slug: "context-maps",
    clients: [
      { name: "Browser", href: "https://context-maps.modeler.miragon.io", icon: "web" },
      { name: "VS Code", href: marketplace("miragon-gmbh.context-maps-modeler"), icon: "vscode" },
      { name: "Orca", href: orca("context-maps-modeler"), icon: "orca" },
      { name: "npm", href: npm("@miragon/context-maps-renderer"), icon: "npm" },
    ],
  },
  {
    name: "Team Topologies",
    slug: "team-topologies",
    clients: [
      { name: "Browser", href: "https://team-topologies.modeler.miragon.io", icon: "web" },
      {
        name: "VS Code",
        href: marketplace("miragon-gmbh.team-topologies-modeler"),
        icon: "vscode",
      },
      { name: "Orca", href: orca("team-topologies-modeler"), icon: "orca" },
      { name: "npm", href: npm("@miragon/team-topologies-renderer"), icon: "npm" },
    ],
  },
  {
    name: "C4 model",
    slug: "c4",
    clients: [
      { name: "Browser", href: "https://c4.modeler.miragon.io", icon: "web" },
      { name: "VS Code", href: marketplace("miragon-gmbh.c4-modeler"), icon: "vscode" },
      { name: "npm", href: npm("@miragon/c4-renderer"), icon: "npm" },
    ],
  },
];

// The strip runs the list twice so it can loop; the copy is hidden from assistive technology
// and the keyboard.
const passes = [false, true];
</script>

<template>
  <div class="landing">
    <section class="hero">
      <h1>Model strategy where your <em>code</em> lives.</h1>
      <p class="slogan">
        Diagrams as plain text, next to your code: readable for your AI, versioned by Git,
        reviewable in a pull request. In your browser, VS Code, Orca or your own app.
      </p>
    </section>

    <section class="rail" aria-label="The modelers">
      <div class="track">
        <template v-for="copy in passes" :key="String(copy)">
          <article
            v-for="modeler in modelers"
            :key="modeler.slug"
            class="card"
            :aria-hidden="copy || undefined"
          >
            <a
              class="shot"
              :href="withBase(`/modelers/${modeler.slug}`)"
              :tabindex="copy ? -1 : undefined"
            >
              <img
                class="thumb"
                :src="withBase(`/shots/${modeler.slug}/editor.png`)"
                :alt="copy ? '' : `The ${modeler.name} modeler`"
                loading="lazy"
              />
              <h3>
                <img :src="withBase(`/icons/${modeler.slug}.svg`)" alt="" />{{ modeler.name }}
              </h3>
            </a>
            <p class="clients">
              <a
                v-for="client in modeler.clients"
                :key="client.name"
                :href="client.href"
                target="_blank"
                rel="noopener"
                :tabindex="copy ? -1 : undefined"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path v-for="d in icons[client.icon]" :key="d" :d="d" />
                </svg>
                {{ client.name }}
              </a>
            </p>
          </article>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing {
  display: grid;
  grid-template-rows: auto auto;
  align-content: center;
  row-gap: clamp(28px, 7vh, 96px);
  min-height: calc(100dvh - var(--vp-nav-height) - 53px);
  padding: 32px 0;
  overflow: hidden;
  border-top: 1px solid var(--cd-ui-linie);
  background:
    radial-gradient(
      ellipse 70% 60% at 50% 110%,
      color-mix(in srgb, var(--cd-blau) 16%, transparent),
      transparent 70%
    ),
    var(--cd-ui-seite);
}

.hero {
  padding: 0 16px;
  text-align: center;
}
h1 {
  max-width: 16ch;
  margin: 0 auto;
  font-size: clamp(38px, min(8vw, 8.4vh), 92px);
  line-height: 0.98;
  font-weight: 700;
  letter-spacing: -0.05em;
  text-wrap: balance;
}
h1 em {
  font-style: normal;
  color: var(--cd-ui-link);
}
.slogan {
  max-width: 44ch;
  margin: 18px auto 0;
  font-size: clamp(16px, 1.45vw, 19px);
  line-height: 1.5;
  color: var(--cd-ui-text-leise);
  text-wrap: balance;
}

/* The modelers drift by; a pointer or the keyboard on a card holds them. */
.rail {
  --fade: 8%;
  min-width: 0;
  padding: 6px 0 8px;
  overflow: hidden;
  mask-image: linear-gradient(
    90deg,
    transparent,
    var(--cd-schwarz) var(--fade),
    var(--cd-schwarz) calc(100% - var(--fade)),
    transparent
  );
}
.track {
  display: flex;
  gap: 24px;
  width: max-content;
  animation: drift 70s linear infinite;
}
.rail:hover .track,
.rail:focus-within .track {
  animation-play-state: paused;
}
@keyframes drift {
  to {
    transform: translateX(calc(-50% - 12px));
  }
}

.card {
  flex: none;
  width: clamp(230px, min(23vw, 36vh), 360px);
}
.shot {
  display: block;
  border-radius: var(--cd-radius-md);
  color: inherit;
  text-decoration: none;
}
.thumb {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  object-position: left 40%;
  border: 1px solid var(--cd-ui-linie);
  border-radius: var(--cd-radius-md);
  background: var(--cd-ui-abschnitt);
  box-shadow: var(--cd-shadow-1);
  transition:
    transform var(--cd-motion-base) var(--cd-ease),
    box-shadow var(--cd-motion-base) var(--cd-ease);
}
.shot:hover .thumb,
.shot:focus-visible .thumb {
  transform: translateY(-4px);
  box-shadow: var(--cd-shadow-2);
}
.shot:focus-visible {
  outline: none;
}
.shot:focus-visible .thumb {
  outline: 2px solid var(--cd-ui-fokus);
  outline-offset: 2px;
}
.shot:hover h3 {
  color: var(--cd-ui-link);
}
h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
h3 img {
  width: 20px;
  height: 20px;
}
.clients {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 6px 0 0 28px;
  font-size: 13px;
}
.clients a {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 500;
  color: var(--cd-ui-text-leise);
  text-decoration: none;
}
.clients a:hover {
  color: var(--cd-ui-link);
}
.clients svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--cd-ui-icon-akzent);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (min-width: 1200px) {
  .rail {
    --fade: 16%;
  }
}
@media (min-width: 1680px) {
  .rail {
    --fade: 22%;
  }
}
@media (min-width: 761px) and (max-height: 760px) {
  h1 {
    font-size: clamp(34px, 7.4vh, 72px);
  }
  .slogan {
    margin-top: 10px;
  }
  .card {
    width: clamp(210px, min(20vw, 31vh), 280px);
  }
}
@media (max-width: 760px) {
  /* The legal row wraps to two lines here. */
  .landing {
    min-height: calc(100dvh - var(--vp-nav-height) - 101px);
  }
  .card {
    width: 70vw;
  }
}
@media (max-height: 520px) {
  .slogan {
    display: none;
  }
  h1 {
    max-width: none;
    font-size: 26px;
  }
  .landing {
    min-height: calc(100dvh - var(--vp-nav-height) - 53px);
    row-gap: 12px;
    padding: 12px 0;
  }
  .card {
    width: 140px;
  }
  h3 {
    margin-top: 6px;
    font-size: 14px;
  }
  .clients {
    gap: 2px 8px;
    margin: 4px 0 0;
    font-size: 12px;
  }
}
@media (max-width: 760px) and (max-height: 700px) {
  .slogan {
    display: none;
  }
  h1 {
    font-size: 32px;
  }
  .landing {
    row-gap: 16px;
  }
  .card {
    width: 52vw;
  }
}
@media (prefers-reduced-motion: reduce) {
  .track {
    animation: none;
  }
  .rail {
    overflow-x: auto;
  }
  .thumb {
    transition: none;
  }
}
</style>
