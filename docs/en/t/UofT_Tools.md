---
lang: en-US
icon: 'line-md:school-twotone'
title: UofT-Tools — A Toolkit for University of Toronto Students
date: 2026-04-03T00:00:00.000Z
category:
  - 开源项目
tag:
  - UofT
  - 学生工具
  - Vue
  - Cloudflare
  - 日历
---

An unofficial open-source project: a collection of practical tools for UofT students. {.textkai}

<!-- more -->

## What Is It

UofT-Tools is an open-source toolkit for students at the University of Toronto, deployed at uoft&#46;voidcarve&#46;com.

**Disclaimer**: This is an independent student project and is not affiliated with the University of Toronto in any way. For important information, please refer to the university's official website.

## Included Tools

- **Course Calendar**: Automatically syncs term course and exam schedules, with support for importing into iCal / Google Calendar
- **Term Planner**: A tool to help with course selection and time planning

## Technical Architecture

| Layer | Choice |
| --- | --- |
| Frontend | Vue 3 + Vite multi-page app |
| Backend / Data scraping | Python (Playwright + BeautifulSoup) |
| Deployment | Cloudflare Workers (static assets) |
| Data updates | GitHub Actions, synced automatically every 24 hours |

Data (`.ics` / JSON) is scraped on a schedule by GitHub Actions and bundled into the static deployment artifacts, so no additional API calls are needed when visiting the site.

GitHub Repository | Site

This article is original content by the author, Siyu Lei. If you repost it, please credit the source and include a link to the original. (leisiyu.dev)
