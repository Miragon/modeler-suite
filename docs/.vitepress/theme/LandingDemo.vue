<script setup lang="ts">
import { inject, onMounted, ref } from "vue";
import { withBase } from "vitepress";

// The clock of the page (HomeLanding.vue): the install tabs switch while it runs, Pause stops them.
const moving = inject("landing-moving", ref(false));

onMounted(() => {
  moving.value = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
});
</script>

<template>
  <figure class="window" aria-label="The Context Maps modeler editing a context map in VS Code">
    <div class="titlebar">
      <span class="dots" aria-hidden="true"><i /><i /><i /></span>
      <span>shop.cm.json · Context Maps</span>
      <button class="toggle" type="button" :aria-pressed="!moving" @click="moving = !moving">
        {{ moving ? "Pause" : "Play" }}
      </button>
    </div>
    <div class="canvas" data-cd-theme="light">
      <img
        :src="withBase('/shots/context-maps/vscode-editor.png')"
        alt="Bounded contexts coloured by subdomain type, connected by relationship patterns, with the legend open"
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
  background: var(--cd-ui-seite);
}
.canvas img {
  display: block;
  width: 100%;
  height: auto;
}
</style>
