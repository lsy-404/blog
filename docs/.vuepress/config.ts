import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { defineUserConfig } from "vuepress";
import theme from "./theme";
import { path } from 'vuepress/utils'
import { viteBundler } from '@vuepress/bundler-vite';
import { registerComponentsPlugin } from '@vuepress/plugin-register-components'
import { translationPlugin } from '../../scripts/translation-plugin.mjs'

const require = createRequire(import.meta.url);
const themeShared = resolve(
  dirname(require.resolve("vuepress-theme-hope")),
  "../shared/blog.js",
);

export default defineUserConfig({
  locales: {
    "/": {
      lang: "zh-CN",
      title: "雷斯语的博客",
      description: "雷斯语的个人博客，记录技术、日常与同人创作。",
    },
    "/en/": {
      lang: "en-US",
      title: "Siyu Lei's Blog",
      description: "Siyu Lei's personal blog about technology, daily life, and fan works.",
    },
  },
  base: "/",
  shouldPrefetch: false,
  theme,
  bundler: viteBundler({}),
  head: [
    ['link', { rel: 'icon', href: '/logo.svg', type: "image/svg+xml", sizes: "any" }],
    ['link', { rel: 'icon', href: '/logo.png' }],
    ['link', { rel: 'manifest', href: '/manifest.json' }],
    ['meta', { name: 'theme-color', content: '#f7b5c0' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }],
    ['link', { rel: 'apple-touch-icon', href: '/icon/apple-touch-icon-152x152.png' }],
    ['link', { rel: 'mask-icon', href: '/eod.svg', color: '#FFFFFF' }],
    ['meta', { name: 'msapplication-TileImage', content: '/icon/msapplication-icon-144x144.png' }],
    ['meta', { name: 'msapplication-TileColor', content: '#f7b5c0' }],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://unpkg.com/lxgw-wenkai-screen-webfont@1.6.0/style.css",
      }
    ],
  ],

  plugins: [
    translationPlugin(),
    registerComponentsPlugin({
      componentsDir: path.resolve(__dirname, './components'),
    }),
  ],
  alias: {
    "@theme-hope/shared": themeShared,
    '@theme-hope/modules/blog/components/ArticlesInfo': path.resolve(
      __dirname,
      './layouts/SectionArticlesInfo.vue'
    ),
    '@theme-hope/modules/blog/components/BlogHero': path.resolve(
      __dirname,
      './components/MyBlogHero.vue'
    ),
  },
},);
