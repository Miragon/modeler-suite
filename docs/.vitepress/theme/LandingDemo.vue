<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { withBase } from "vitepress";

const props = defineProps<{
  modelers: { name: string; file: string; shot: string }[];
  active: number;
}>();
const activeModeler = computed(() => props.modelers[props.active]);

// The clock of the page (HomeLanding.vue): the install tabs switch while it runs, Pause stops them.
const moving = inject("landing-moving", ref(false));

onMounted(() => {
  moving.value = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
});
</script>

<template>
  <figure
    class="window"
    :aria-label="`The ${activeModeler.name} modeler editing ${activeModeler.file}`"
  >
    <div class="titlebar">
      <span class="dots" aria-hidden="true"><i /><i /><i /></span>
      <span>{{ activeModeler.file }} · {{ activeModeler.name }}</span>
      <button class="toggle" type="button" :aria-pressed="!moving" @click="moving = !moving">
        {{ moving ? "Pause" : "Play" }}
      </button>
    </div>
    <div class="canvas" data-cd-theme="light">
      <img
        v-for="(modeler, index) in modelers"
        :key="modeler.name"
        :class="{ hidden: index !== active }"
        :src="withBase(modeler.shot)"
        :alt="index === active ? `The ${modeler.name} modeler with its example` : ''"
        :aria-hidden="index !== active"
      />
    </div>
  </figure>
</template>

<style scoped>
.window {
  width: 100%;
  margin: 0;
  border: 1px solid var(--cd-ui-kontur);
  border-radius: var(--cd-radius-md);
  background: var(--cd-ui-seite);
  overflow: hidden;
}
.titlebar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 38px;
  padding: 0 14px;
  border-bottom: 1px solid var(--cd-ui-linie);
  font: 500 13px/1 var(--vp-font-family-mono);
}
.toggle {
  margin-left: auto;
  padding: 4px 8px;
  border-radius: var(--cd-radius-sm);
  font: 500 11px/1 var(--vp-font-family-mono);
  color: var(--cd-ui-text-leise);
}
.toggle:hover {
  background: var(--cd-ui-hover);
  color: var(--cd-ui-text);
}
.dots {
  display: flex;
  gap: 6px;
}
.dots i {
  width: 9px;
  height: 9px;
  border: 1px solid var(--cd-ui-kontur);
  border-radius: 50%;
}
.canvas {
  display: grid;
  aspect-ratio: 1.6;
  background: var(--cd-ui-seite);
}
.canvas img {
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: opacity 0.6s var(--cd-ease);
}
.canvas img.hidden {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .canvas img {
    transition: none;
  }
}
</style>
