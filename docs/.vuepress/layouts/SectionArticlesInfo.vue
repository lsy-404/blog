<script setup lang="ts">
import { computed } from "vue";
import { PageInfo } from "@theme-hope/shared";
import { RouteLink, useRouteLocale } from "vuepress/client";
import { DropTransition } from "@theme-hope/components/transitions/index";
import { useNavigate } from "@theme-hope/composables/index";
import { ArticleIcon } from "@theme-hope/modules/blog/components/icons";
import {
  useArticles,
  useBlogLocaleData,
} from "@theme-hope/modules/blog/composables/index";

const articles = useArticles();
const blogLocale = useBlogLocaleData();
const navigate = useNavigate();
const routeLocale = useRouteLocale();

const items = computed(() =>
  articles.value.items.filter(({ path }) =>
    routeLocale.value === "/"
      ? !path.startsWith("/en/")
      : path.startsWith(routeLocale.value),
  ),
);
</script>

<template>
  <DropTransition>
    <div class="vp-star-article-wrapper">
      <div class="title" @click="navigate(articles.path)">
        <ArticleIcon />
        <span class="num">{{ items.length }}</span>
        {{ blogLocale.article }}
      </div>
      <hr />
      <ul v-if="items.length" class="vp-star-articles">
        <li v-for="({ info, path }, index) in items" :key="path" class="vp-star-article">
          <DropTransition :appear="true" :delay="0.08 * (index + 1)">
            <RouteLink :to="path">{{ info[PageInfo.title] }}</RouteLink>
          </DropTransition>
        </li>
      </ul>
      <div v-else class="vp-star-article-empty">
        {{ blogLocale.empty }}
      </div>
    </div>
  </DropTransition>
</template>
