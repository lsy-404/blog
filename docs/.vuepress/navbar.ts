import { navbar } from "vuepress-theme-hope";

export const zhNavbar = navbar([
  "/",
  { text: "技术", icon: "material-symbols:code", link: "/t/" },
  { text: "日常", icon: "material-symbols:calendar-today", link: "/d/" },
  { text: "同人", icon: "material-symbols:palette", link: "/f/" },
  { text: "Tiny Projects", link: "https://tiny.leisiyu.dev/" },
]);

export const enNavbar = navbar([
  { text: "Home", icon: "line-md:home-twotone", link: "/en/" },
  { text: "Technology", icon: "material-symbols:code", link: "/en/t/" },
  { text: "Daily", icon: "material-symbols:calendar-today", link: "/en/d/" },
  { text: "Fan Works", icon: "material-symbols:palette", link: "/en/f/" },
  { text: "Tiny Projects", link: "https://tiny.leisiyu.dev/" },
]);
