<script lang="ts">
import { computed, defineComponent, h } from "vue";
import { usePageData } from "vuepress/client";
import { DropTransition } from "@theme-hope/components/transitions/index";
import ArticleList from "@theme-hope/modules/blog/components/ArticleList";
import BlogWrapper from "@theme-hope/modules/blog/components/BlogWrapper";
import InfoPanel from "@theme-hope/modules/blog/components/InfoPanel";
import { useArticles } from "@theme-hope/modules/blog/composables/index";

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
      h(BlogWrapper, () =>
        h("div", { class: "vp-page vp-blog" },
          h("div", { class: "blog-page-wrapper" }, [
            h("main", { id: "main-content", class: "vp-blog-main" }, [
              h(DropTransition, { appear: true, delay: 0.24 }, () =>
                h(ArticleList, { key: page.value.path, items: items.value }),
              ),
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
