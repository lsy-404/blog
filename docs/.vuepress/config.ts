import { defineUserConfig } from "vuepress";
import theme from "./theme";
import { path } from 'vuepress/utils'
import { viteBundler } from '@vuepress/bundler-vite';
import { registerComponentsPlugin } from '@vuepress/plugin-register-components'
import { translationPlugin } from '../../scripts/translation-plugin.mjs'
import { seoPlugin } from '../../scripts/seo-plugin.mjs'

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
  bundler: viteBundler({
    viteOptions: { resolve: { alias: [{ find: '@theme-hope/components/transitions/DropTransition', replacement: path.resolve(__dirname, './components/transitions.js') }] } },
  }),
  head: [
    ['link', { rel: 'icon', href: '/favicon.png', type: 'image/png', sizes: '64x64' }],
    ['link', { rel: 'manifest', href: '/manifest.json' }],
    ['meta', { name: 'theme-color', content: '#f7b5c0' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }],
    ['link', { rel: 'apple-touch-icon', href: '/icon/apple-touch-icon-152x152.png' }],
    ['link', { rel: 'mask-icon', href: '/eod.svg', color: '#FFFFFF' }],
    ['meta', { name: 'msapplication-TileImage', content: '/icon/msapplication-icon-144x144.png' }],
    ['meta', { name: 'msapplication-TileColor', content: '#f7b5c0' }],
    // Attached after window load so the web font downloads cannot hold the first paint.
    ['script', {}, "addEventListener('load',()=>{const l=document.createElement('link');l.rel='stylesheet';l.href='https://unpkg.com/lxgw-wenkai-screen-webfont@1.6.0/lxgwwenkaiscreenr.css';document.head.append(l)})"],
  ],

  plugins: [
    translationPlugin(),
    seoPlugin(),
    registerComponentsPlugin({
      componentsDir: path.resolve(__dirname, './components'),
    }),
  ],
  alias: {
    '@theme-hope/components/info/DateInfo': path.resolve(__dirname, './components/CalendarDateInfo.js'),
    '@theme-hope/composables/blog/useTimeline': path.resolve(__dirname, './composables/useTimeline.js'),
    '@theme-hope/components/blog/InfoList': path.resolve(__dirname, './components/TimelineDefaultInfoList.js'),
    '@theme-hope/components/blog/ArticlesInfo': path.resolve(
      __dirname,
      './layouts/SectionArticlesInfo.vue'
    ),
    '@theme-hope/components/base/BreadCrumb': path.resolve(__dirname, './components/SeoBreadCrumb.js'),
    '@theme-hope/components/blog/BlogHero': path.resolve(
      __dirname,
      './components/MyBlogHero.vue'
    ),
  },
},);
