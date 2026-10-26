<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, provide, ref, watch } from "vue";
import { withBase } from "vitepress";
import LandingDemo from "./LandingDemo.vue";

const installs = [
  {
    name: "VS Code",
    prompt: "$",
    lines: ["code --install-extension miragon-gmbh.miragon-modeler-collection"],
    note: "The Miragon Modeler Collection, with BPMN and Domain Storytelling. Each modeler also installs on its own, see its page.",
  },
  {
    name: "Web app",
    prompt: "$",
    lines: ["open https://context-maps.modeler.miragon.io"],
    note: "Every modeler has its own web app, linked on its page.",
  },
  {
    name: "npm",
    prompt: "$",
    lines: ["npm install @miragon/context-maps-renderer"],
    note: "One renderer package per modeler, named on its page.",
  },
];
const modelers = [
  {
    name: "Wardley Maps",
    file: "tea.owm",
    shot: "/shots/wardley-maps/editor.png",
    link: "/modelers/wardley-maps",
    files: ".wmap .owm",
    effect: "Components on the value chain, evolved by drag.",
  },
  {
    name: "Event Storming",
    file: "order-checkout.storm",
    shot: "/shots/event-storming/editor.png",
    link: "/modelers/event-storming",
    files: ".storm",
    effect: "Stickies on a timeline, one per line of text.",
  },
  {
    name: "Team Topologies",
    file: "sample.tt",
    shot: "/shots/team-topologies/editor.png",
    link: "/modelers/team-topologies",
    files: ".tt .ttm.json",
    effect: "Four team types and three interaction modes.",
  },
  {
    name: "Context Maps",
    file: "sample.cm",
    shot: "/shots/context-maps/editor.png",
    link: "/modelers/context-maps",
    files: ".cm .cml",
    effect: "Bounded contexts and their relationship patterns.",
  },
  {
    name: "Value Chain",
    file: "porter.vc.json",
    shot: "/shots/value-chain/editor.png",
    link: "/modelers/value-chain",
    files: ".vc",
    effect: "Steps and the organizational units behind them.",
  },
];
const next = { text: "Pick a modeler and open its example", link: "/getting-started#the-modelers" };
const stage = "raster";

const selected = ref(0);
const copied = ref(false);

// One clock per page (landingpage.md, Bewegung): the demo's Pause button stops it. Only the
// modelers on the rail switch, every 6 s, and hold while the visitor hovers or focuses one; the
// install tabs stand still.
const moving = ref(false);
provide("landing-moving", moving);
const activeModeler = ref(0);
const railHeld = ref(false);
const cycling = computed(() => moving.value && !railHeld.value);
let tick: ReturnType<typeof setInterval> | undefined;
watch(cycling, (on) => {
  clearInterval(tick);
  if (on) tick = setInterval(showNextModeler, 6000);
});
onBeforeUnmount(() => clearInterval(tick));

function showNextModeler() {
  activeModeler.value = (activeModeler.value + 1) % modelers.length;
}

function showModeler(index: number) {
  activeModeler.value = index;
}

function step(offset: number) {
  selected.value = (selected.value + offset + installs.length) % installs.length;
}

function choose(index: number) {
  selected.value = index;
}

// Arrow keys move the selection and the focus together (ARIA tabs pattern).
const tabButtons = ref([] as HTMLButtonElement[]);
async function selectBy(offset: number) {
  step(offset);
  await nextTick();
  tabButtons.value[selected.value]?.focus();
}

async function copyInstall() {
  await navigator.clipboard.writeText(installs[selected.value].lines.join("\n"));
  copied.value = true;
  setTimeout(() => (copied.value = false), 1600);
}
</script>

<template>
  <div class="landing">
    <section class="hero">
      <div class="frame hero-frame">
        <div class="pitch">
          <h1>Model strategy where your <em>code</em> lives.</h1>
          <p class="slogan">Draw on a canvas, commit plain text.</p>
          <p class="lede">
            Wardley Maps, Event Storming, Team Topologies, Context Maps and Value Chains as text
            files, edited on a canvas in VS Code, in the browser or in your own app.
          </p>

          <div class="install">
            <div
              class="tabs"
              role="tablist"
              aria-label="Install"
              @keydown.right.prevent="selectBy(1)"
              @keydown.left.prevent="selectBy(-1)"
            >
              <button
                v-for="(install, index) in installs"
                :key="install.name"
                ref="tabButtons"
                class="tab"
                role="tab"
                :aria-selected="index === selected"
                :tabindex="index === selected ? 0 : -1"
                @click="choose(index)"
              >
                {{ install.name }}
              </button>
            </div>
            <div class="command" role="tabpanel">
              <div class="channels">
                <pre
                  v-for="(install, index) in installs"
                  :key="install.name"
                  :class="{ hidden: index !== selected }"
                  :aria-hidden="index !== selected"
                ><template v-for="line in install.lines" :key="line"><span class="prompt">{{ install.prompt }} </span>{{ line }}
</template></pre>
              </div>
              <button class="copy" type="button" @click="copyInstall">
                {{ copied ? "Copied" : "Copy" }}
              </button>
            </div>
          </div>
          <div class="install-notes">
            <p
              v-for="(install, index) in installs"
              :key="install.name"
              :class="{ hidden: index !== selected }"
              :aria-hidden="index !== selected"
            >
              {{ install.note }}
            </p>
          </div>
          <a class="start" :href="withBase(next.link)"
            >{{ next.text }} <span aria-hidden="true">→</span></a
          >
        </div>

        <div class="stage" :class="stage" :data-cd-theme="stage === 'schwarz' ? 'dark' : undefined">
          <LandingDemo :modelers="modelers" :active="activeModeler" />
        </div>
      </div>
    </section>

    <section class="loop" aria-label="The modelers">
      <div class="frame">
        <ol
          class="steps"
          :class="{ cycling }"
          :style="{ '--steps': modelers.length }"
          @mouseenter="railHeld = true"
          @mouseleave="railHeld = false"
          @focusin="railHeld = true"
          @focusout="railHeld = false"
        >
          <li
            v-for="(modeler, index) in modelers"
            :key="modeler.name"
            class="step"
            :class="{ active: index === activeModeler }"
            @mouseenter="showModeler(index)"
            @focusin="showModeler(index)"
          >
            <div class="rail" />
            <h3>
              <a :href="withBase(modeler.link)"
                >{{ modeler.name }} <span class="go" aria-hidden="true">→</span></a
              >
            </h3>
            <code>{{ modeler.files }}</code>
            <p>{{ modeler.effect }}</p>
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing {
  --gutter: 32px;
  --line: 1px solid var(--cd-ui-linie);
  display: flex;
  flex-direction: column;
  border-top: var(--line);
}

/* The frame lines up with the navigation bar above it. */
.frame {
  width: 100%;
  max-width: var(--vp-layout-max-width);
  margin: 0 auto;
}
@media (min-width: 1441px) {
  .frame {
    border-right: var(--line);
    border-left: var(--line);
  }
}

/* Hero: name and install on the left, the demo on the right, split 50/50. */
.hero {
  flex: 1;
  display: flex;
  min-height: 0;
}
.hero-frame {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
.pitch {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 48px var(--gutter);
  border-bottom: var(--line);
}
h1 {
  margin: 0;
  font-size: clamp(56px, 8.4vh, 80px);
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.045em;
}
h1 em {
  font-style: normal;
  color: var(--cd-ui-link);
}
.slogan {
  margin: 14px 0 0;
  font-size: 24px;
  line-height: 1.3;
  font-weight: 500;
  letter-spacing: -0.015em;
  text-wrap: balance;
}
.lede {
  max-width: 46ch;
  margin: 14px 0 0;
  color: var(--cd-ui-text-leise);
  line-height: 1.55;
}

.install {
  margin-top: 28px;
  border: var(--line);
  border-radius: var(--cd-radius-sm);
  background: var(--cd-ui-abschnitt);
}
.tabs {
  display: flex;
  border-bottom: var(--line);
}
.tab {
  position: relative;
  padding: 11px 14px;
  border-right: var(--line);
  font: 500 13px/1 var(--vp-font-family-mono);
  color: var(--cd-ui-text-leise);
}
.tab:first-child {
  border-top-left-radius: var(--cd-radius-sm);
}
.tab[aria-selected="true"] {
  color: var(--cd-ui-text);
  background: var(--cd-ui-seite);
}
.tab[aria-selected="true"]::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: var(--cd-ui-interaktion);
  transform-origin: left;
}
/* While the tabs switch on their own, the line under the active tab fills in the 6 s. */
/* While the modelers switch on their own, the rail above the active one fills in the 6 s. */
.cycling .step.active .rail::after {
  animation: fill 6s linear;
}
@keyframes fill-down {
  from {
    transform: scaleY(0);
  }
}
@keyframes fill {
  from {
    transform: scaleX(0);
  }
}
.command {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 12px 12px 16px;
}
.channels {
  display: grid;
  flex: 1;
  min-width: 0;
}
.command pre {
  grid-area: 1 / 1;
  margin: 0;
  font: 400 14px/1.7 var(--vp-font-family-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.command pre.hidden {
  visibility: hidden;
}
.command .prompt {
  color: var(--cd-ui-text-leise);
  user-select: none;
}
.copy {
  flex: none;
  height: 32px;
  padding: 0 10px;
  border: var(--line);
  border-radius: var(--cd-radius-sm);
  font: 500 12px/1 var(--vp-font-family-mono);
  color: var(--cd-ui-text);
}
.copy:hover {
  background: var(--cd-ui-hover);
}

.install-notes {
  display: grid;
  margin-top: 10px;
}
.install-notes p {
  grid-area: 1 / 1;
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--cd-ui-text-leise);
}
.install-notes p.hidden {
  visibility: hidden;
}
.start {
  align-self: flex-start;
  margin-top: 24px;
  font-weight: 600;
  color: var(--cd-ui-link);
  text-decoration: none;
}
.start:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}

/* The demo stands on a quiet grid, the drawing surface of a modeler. */
.stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 32px var(--gutter);
}
.stage.raster {
  background-image:
    linear-gradient(var(--cd-ui-linie) 1px, transparent 1px),
    linear-gradient(90deg, var(--cd-ui-linie) 1px, transparent 1px);
  background-size: 32px 32px;
  background-position: -1px -1px;
}
.stage.grau {
  background: var(--cd-ui-abschnitt);
}
.stage.frei :deep(.window) {
  border-color: var(--cd-ui-kontur);
}
.stage.schwarz {
  background: var(--cd-ui-seite);
  color: var(--cd-ui-text);
}

/* The five modelers on one rail, each linking to its page. */
.loop {
  flex: none;
  border-top: var(--line);
}
.steps {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  margin: 0;
  padding: 0;
  list-style: none;
}
.step {
  padding: 0 var(--gutter) 24px;
}
.rail {
  position: relative;
  display: flex;
  align-items: center;
  height: 56px;
}
.rail::before {
  content: "";
  position: absolute;
  top: 50%;
  right: calc(-1 * var(--gutter));
  left: calc(-1 * var(--gutter));
  height: 2px;
  margin-top: -1px;
  background: var(--cd-ui-linie);
}
.step.active .rail::after {
  content: "";
  position: absolute;
  top: 50%;
  right: calc(-1 * var(--gutter));
  left: calc(-1 * var(--gutter));
  height: 2px;
  margin-top: -1px;
  background: var(--cd-ui-interaktion);
  transform-origin: left;
}
.step.active h3 a {
  color: var(--cd-ui-link);
}
.step h3 {
  margin: 2px 0 10px;
  font-size: 26px;
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: -0.03em;
}
.step h3 a {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  color: inherit;
  text-decoration: none;
}
.step h3 a:hover {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-decoration-color: var(--cd-ui-interaktion);
  text-underline-offset: 5px;
}
.go {
  font: 500 18px/1 var(--vp-font-family-mono);
  color: var(--cd-ui-text-leise);
  transition:
    transform var(--cd-motion-fast) var(--cd-ease),
    color var(--cd-motion-fast) var(--cd-ease);
}
.step h3 a:hover .go {
  color: var(--cd-ui-link);
  transform: translateX(3px);
}
.step code {
  display: block;
  padding: 6px 10px;
  border: var(--line);
  border-radius: 4px;
  background: var(--cd-ui-abschnitt);
  font: 400 14px/1.5 var(--vp-font-family-mono);
}
.step p {
  margin: 10px 0 0;
  font-size: 15px;
  color: var(--cd-ui-text-leise);
}

@media (min-width: 960px) {
  .hero-frame {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .pitch {
    border-right: var(--line);
    border-bottom: 0;
  }
  .steps {
    grid-template-columns: repeat(var(--steps), minmax(0, 1fr));
  }
  .step {
    border-right: var(--line);
  }
  .step:last-child {
    border-right: 0;
  }
}

/* One screen on desktop: navigation, hero, loop and the legal row (53px) fill the viewport; on a
   short screen the page grows and scrolls instead of squeezing the hero. */
@media (min-width: 960px) and (min-height: 700px) {
  .landing {
    min-height: calc(100dvh - var(--vp-nav-height) - 53px);
  }
  .pitch {
    padding-top: 20px;
    padding-bottom: 20px;
  }
  h1 {
    font-size: clamp(48px, 7vh, 72px);
  }
  .slogan,
  .lede {
    margin-top: 10px;
  }
  .install {
    margin-top: 20px;
  }
  .start {
    margin-top: 16px;
  }
  .stage {
    container-type: size;
  }
  /* Fits the window into the stage height: 64px stage padding, 40px titlebar, 1.6 the width-to-height
     ratio of the screenshot. */
  .stage :deep(.window) {
    width: min(100%, calc((100cqh - 64px - 40px) * 1.6));
  }
}

@media (max-width: 640px) {
  .landing {
    --gutter: 20px;
  }
  .step.active .rail::after {
    top: 0;
    right: auto;
    bottom: 0;
    left: 50%;
    width: 2px;
    height: auto;
    margin: 0 0 0 -1px;
    transform-origin: top;
  }
  .cycling .step.active .rail::after {
    animation-name: fill-down;
  }
  .pitch {
    padding: 44px var(--gutter) 40px;
  }
  h1 {
    font-size: clamp(36px, 11.5vw, 56px);
  }
  .slogan {
    font-size: 21px;
  }
  .stage {
    padding: 24px 12px;
  }
  .command {
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }
  .command pre {
    width: 100%;
    font-size: 12px;
  }
  .copy {
    align-self: flex-end;
  }
  .step {
    display: grid;
    grid-template-columns: 34px 1fr;
    column-gap: 16px;
    padding: 0 var(--gutter);
  }
  .rail {
    grid-row: 1 / span 3;
    flex-direction: column;
    align-items: center;
    height: auto;
    padding-top: 22px;
  }
  .rail::before {
    top: 0;
    right: auto;
    bottom: 0;
    left: 50%;
    width: 2px;
    height: auto;
    margin: 0 0 0 -1px;
  }
  .step h3 {
    margin: 20px 0 10px;
    font-size: 24px;
  }
  .step p {
    padding-bottom: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .go {
    transition: none;
  }
}
</style>
