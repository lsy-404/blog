import { getDate } from "@vuepress/helper/client";
import { useBlogType } from "@vuepress/plugin-blog/client";
import { computed, inject, provide } from "vue";
import { useLang } from "vuepress/client";
import { formatBlogDate, getBlogYear } from "../utils/blog-date.mjs";

export const timelineSymbol = Symbol(__VUEPRESS_DEV__ ? "timeline" : "");

export const useTimeline = () => {
  const timeline = inject(timelineSymbol);
  if (!timeline) throw new Error("useTimeline() is called without provider.");
  return timeline;
};

export const setupTimeline = () => {
  const timeline = useBlogType("timeline");
  const pageLang = useLang();
  const timelineItems = computed(() => {
    const results = [];

    timeline.value.items.forEach(({ info, path }) => {
      const date = getDate(info.date);
      if (!date) return;

      const year = getBlogYear(date);
      if (results[0]?.year !== year) results.unshift({ year, items: [] });
      results[0].items.push({
        date: formatBlogDate(date, pageLang.value, {
          month: "numeric",
          day: "numeric",
        }),
        info,
        path,
      });
    });

    return {
      ...timeline.value,
      config: results.reverse(),
    };
  });

  provide(timelineSymbol, timelineItems);
};
