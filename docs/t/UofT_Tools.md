---
lang: zh-CN
icon: line-md:school-twotone
title: UofT-Tools —— 多伦多大学学生工具集
date: 2026-04-03
category:
  - 开源项目
tag:
  - UofT
  - 学生工具
  - Vue
  - Cloudflare
  - 日历
---

非官方开源项目，为多大学生提供的实用工具合集。 {.textkai}

<!-- more -->

## 是什么

UofT-Tools 是为多伦多大学（University of Toronto）学生提供的开源工具集，部署于 uoft&#46;voidcarve&#46;com。

**声明**：本项目为独立学生项目，与多伦多大学官方无任何关联，重要信息请以大学官方网站为准。

## 包含工具

- **课程日历**：自动同步学期课程与考试时间表，支持导入到 iCal / Google Calendar
- **学期规划器**：课程选择与时间规划辅助工具

## 技术架构

| 层级 | 选型 |
| --- | --- |
| 前端 | Vue 3 + Vite 多页面应用 |
| 后端 / 数据抓取 | Python（Playwright + BeautifulSoup） |
| 部署 | Cloudflare Workers（静态资源） |
| 数据更新 | GitHub Actions 每 24 小时自动同步 |

数据（`.ics` / JSON）通过 GitHub Actions 定时抓取，打包进静态部署产物，访问无需额外 API 调用。

GitHub 仓库 | 站点

本文为作者 Siyu Lei 原创内容，转载请注明出处并附上原文链接。（leisiyu.dev）
