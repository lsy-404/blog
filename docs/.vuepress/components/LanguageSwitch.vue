<script setup lang="ts">
import { computed } from "vue";
import { usePageData, useRouteLocale } from "vuepress/client";

const pageData = usePageData();
const routeLocale = useRouteLocale();
const metadata = computed(() => pageData.value as unknown as Record<string, unknown>);
const translationPath = computed(() =>
  typeof metadata.value.translationPath === "string" ? metadata.value.translationPath : "",
);
const translationDisabled = computed(() => metadata.value.translationDisabled === true);
const isEnglish = computed(() => routeLocale.value === "/en/" || metadata.value.lang === "en-US");
const hasCounterpart = computed(() => !!translationPath.value);
const languageName = computed(() => (isEnglish.value ? "中文" : "English"));
const unavailableMessage = computed(() =>
  isEnglish.value ? "This page has no translated counterpart." : "此页面未提供其他语言版本。",
);
</script>

<template>
  <aside v-if="hasCounterpart || translationDisabled" class="language-switch">
    <RouterLink v-if="hasCounterpart" :to="translationPath" :aria-label="`Switch language to ${languageName}`">
      {{ languageName }}
    </RouterLink>
    <span v-else>{{ unavailableMessage }}</span>
  </aside>
</template>

<style scoped>
.language-switch {
  position: fixed;
  z-index: 30;
  top: calc(var(--navbar-height, 3.6rem) + 0.6rem);
  right: 1rem;
  max-width: min(18rem, calc(100vw - 2rem));
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  background: var(--vp-c-bg);
  box-shadow: 0 2px 10px rgb(0 0 0 / 10%);
  font-size: 0.85rem;
}

.language-switch a {
  color: var(--vp-c-accent);
  text-decoration: none;
}

.language-switch span {
  color: var(--vp-c-text-mute);
}
</style>
