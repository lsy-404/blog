import { defineComponent, h } from "vue";
import { useLang } from "vuepress/client";
import { CalendarIcon } from "@theme-hope/components/info/icons";
import { useMetaLocale } from "@theme-hope/composables/info/useMetaLocale";
import { usePure } from "@theme-hope/composables/usePure";
import { formatBlogDate } from "../utils/blog-date.mjs";

export default defineComponent({
  name: "DateInfo",
  inheritAttrs: false,
  props: {
    date: Object,
  },
  setup(props) {
    const lang = useLang();
    const metaLocale = useMetaLocale();
    const isPure = usePure();

    return () => {
      if (!props.date) return null;

      const formattedDate = formatBlogDate(props.date, lang.value, {
        dateStyle: "short",
      });

      return h("span", {
        class: "page-date-info",
        "aria-label": `${metaLocale.value.date}${isPure.value ? "" : "📅"}`,
        ...(isPure.value ? {} : { "data-balloon-pos": "up" }),
      }, [
        h(CalendarIcon),
        h("span", { "data-allow-mismatch": "text" }, formattedDate),
        h("meta", {
          property: "datePublished",
          content: props.date.toISOString() || "",
        }),
      ]);
    };
  },
});
