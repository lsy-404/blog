import { navbar } from "vuepress-theme-hope";

export const zhNavbar = navbar([
  { text: "首页", icon: "home", link: "/" },
  { text: "技术", icon: "code", link: "/t/" },
  { text: "日常", icon: "calendar-days", link: "/d/" },
  { text: "同人", icon: "palette", link: "/f/" },
  {
    text: "服务",
    icon: "server",
    children: [
      { text: "统一登录", icon: "fingerprint", link: "https://id.leisiyu.dev/" },
      { text: "Tiny Projects", icon: "code", link: "https://tiny.leisiyu.dev/" },
    ],
  },
]);

export const enNavbar = navbar([
  { text: "Home", icon: "home", link: "/en/" },
  { text: "Technology", icon: "code", link: "/en/t/" },
  { text: "Daily", icon: "calendar-days", link: "/en/d/" },
  { text: "Fan Works", icon: "palette", link: "/en/f/" },
  {
    text: "Services",
    icon: "server",
    children: [
      { text: "Single Sign-On", icon: "fingerprint", link: "https://id.leisiyu.dev/" },
      { text: "Tiny Projects", icon: "code", link: "https://tiny.leisiyu.dev/" },
    ],
  },
]);
