<script lang="ts">
import { computed, defineComponent, h } from "vue";
import { usePageData } from "vuepress/client";
import DropTransition from "@theme-hope/components/transitions/DropTransition";
import ArticleList from "@theme-hope/components/blog/ArticleList";
import BlogMainLayout from "@theme-hope/components/blog/BlogMainLayout";
import InfoPanel from "@theme-hope/components/blog/InfoPanel";
import ListHeading from "../components/ListHeading.js";
import { useArticles } from "@theme-hope/composables/blog/useArticles";

export default defineComponent({
  name: "SectionArticles",
  setup() {
    const articles = useArticles();
    const page = usePageData();
    const sectionPath = computed(() => {
      const match = page.value.path.match(/^(\/en)?\/(t|d|f)(?:\/|$)/);
      return match ? `${match[1] ?? ""}/${match[2]}/` : "";
    });
    const items = computed(() =>
      articles.value.items.filter((item) =>
        item.path.startsWith(sectionPath.value) && item.path !== sectionPath.value,
      ),
    );

    return () =>
      h(BlogMainLayout, null, () =>
        h("div", { class: "vp-page vp-blog" },
          h("div", { class: "blog-page-wrapper" }, [
            h("main", { id: "main-content", class: "vp-blog-main" }, [
              h(ListHeading),
              h(ArticleList, { key: page.value.path, items: items.value }),
            ]),
            h(DropTransition, { delay: 0.16 }, () =>
              h(InfoPanel, { key: "blog" }),
            ),
          ]),
        ),
      );
  },
});
</script>
