import { defineClientConfig } from "vuepress/client";
import SectionArticles from "./layouts/SectionArticles.vue";
import Blog from "./layouts/SeoBlog.js";

export default defineClientConfig({
  layouts: { Blog, SectionArticles },
});
