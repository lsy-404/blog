import { defineClientConfig } from "vuepress/client";
import LanguageSwitch from "./components/LanguageSwitch.vue";
import SectionArticles from "./layouts/SectionArticles.vue";

export default defineClientConfig({
  layouts: { SectionArticles },
  rootComponents: [LanguageSwitch],
});
