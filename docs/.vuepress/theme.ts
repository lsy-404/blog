import { Page } from "vuepress";
import { hopeTheme } from "vuepress-theme-hope";
import { zhNavbar, enNavbar } from "./navbar";
import { articleJsonLd, breadcrumbHead } from "../../scripts/seo-plugin.mjs";

const zhSidebar = [
  "",
  {
    text: "技术",
    icon: "code",
    prefix: "t/",
    collapsible: true,
    children: "structure",
  },
  {
    text: "日常",
    icon: "calendar",
    prefix: "d/",
    collapsible: true,
    children: "structure",
  },
  {
    text: "同人",
    icon: "palette",
    prefix: "f/",
    collapsible: true,
    children: "structure",
  },
  {
    text: "公告",
    icon: "calendar-days",
    prefix: "system/",
    collapsible: true,
    children: "structure",
  },
  "statement",
];

const enSidebar = [
  { text: "Home", link: "/en/" },
  {
    text: "Technology",
    icon: "code",
    prefix: "t/",
    collapsible: true,
    children: "structure",
  },
  {
    text: "Daily",
    icon: "calendar",
    prefix: "d/",
    collapsible: true,
    children: "structure",
  },
  {
    text: "Fan Works",
    icon: "palette",
    prefix: "f/",
    collapsible: true,
    children: "structure",
  },
  { text: "Announcements", icon: "calendar-days", prefix: "system/", collapsible: true, children: "structure" },
];

export default hopeTheme(
  {
    hostname: "https://leisiyu.dev",

    author: {
      name: "Siyu Lei",
    },

    logo: "/avatar.webp",
    print: false,
    fullscreen: true,
    lastUpdated: false,
    contributors: false,
    editLink: false,
    docsDir: "docs",

    markdown: {
      attrs: true,
      sub: true,
      sup: true,
      footnote: true,
      align: true,
    },

    navbarLayout: {
      start: ["Brand"],
      center: ["Links"],
      end: ["Language", "Outlook", "Search"],
    },

    sidebar: {
      "/": zhSidebar,
    },
    navbar: zhNavbar,

    locales: {
      "/": {
        author: { name: "雷斯语" },
        navbar: zhNavbar,
        sidebar: { "/": zhSidebar },
        blog: { description: "雷斯语的个人博客，记录技术、日常与同人创作。" },
        footer: `<a href="/statement.html">网站用户协议</a>`,
        copyright: "Copyright © 2023–Now All rights reserved.",
      },
      "/en/": {
        author: { name: "Siyu Lei" },
        navbar: enNavbar,
        sidebar: { "/en/": enSidebar },
        blog: {
          description: "Siyu Lei's personal blog about technology, daily life, and fan works.",
        },
          blogLocales: { empty: "No articles are available in English yet." },
        footer: `<a href="/en/statement.html">Website Terms</a>`,
        copyright: "Copyright © 2023–Now All rights reserved.",
      },
    },

    displayFooter: true,

    pageInfo: ["Author", "Original", "Date", "Category", "Tag", "Word", "ReadingTime"],

    blog: {
      articlePerPage: 20,
      articleInfo: ["Author", "Original", "Date", "ReadingTime", "Category", "Tag"],
    },

    encrypt: {
      config: {},
    },

    plugins: {
      catalog: true,
      icon: { assets: "fontawesome", offline: true },
      slimsearch: true,
      seo: {
        canonical: "https://leisiyu.dev",
        fallBackImage: "https://leisiyu.dev/hero.webp",
        jsonLd: articleJsonLd,
        customHead: breadcrumbHead,
      },
      blog: {
        excerptLength: 0,
      },
      comment: {
        provider: "Waline",
        serverURL: "https://bc.voidcarve.com/",
        pageview: false,
        requiredMeta: ["nick"],
        wordLimit: [5, 200],
        commentSorting: "hottest",
        emoji: ["https://unpkg.com/@waline/emojis@1.0.1/tw-emoji", "https://unpkg.com/@waline/emojis@1.0.1/bilibili"],
      },
      feed: {
        atom: true,
        json: true,
        rss: true,
        devServer: true,
        sorter: pageSorter,
      },
    },
  },
  { custom: true },
);

function pageSorter(pageA: Page, pageB: Page): number {
  const dateA = Date.parse(pageA.date);
  const dateB = Date.parse(pageB.date);

  if (dateA > dateB) return -1;
  if (dateA < dateB) return 1;
  return 0;
}
