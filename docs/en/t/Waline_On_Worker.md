---
lang: en-US
icon: 'line-md:cloud-alt-filled-loop'
title: Waline On Worker — A Cloudflare Workers Comment System
date: 2026-06-05T00:00:00.000Z
category:
  - 开源项目
tag:
  - Cloudflare
  - Workers
  - Waline
  - 评论系统
  - TypeScript
  - D1
---

A Cloudflare Workers implementation of the Waline comment system. Serverless and free to deploy. {.textkai}

<!-- more -->

## What Is It

Waline On Worker is a backend implementation that fully ports the open-source comment system Waline to the Cloudflare Workers platform, using D1 (SQLite) for data storage.

Compared with the official Vercel deployment, it:
- Requires no standalone server and runs on Cloudflare's edge network
- Offers a generous free tier, which suits personal blogs
- Is fully compatible with the `@waline/client` frontend and the `@waline/admin` admin panel

## Tech Stack

| Item | Choice |
| --- | --- |
| Runtime | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Framework | Hono |
| Language | TypeScript |

## Implemented Features

- Comment CRUD (threaded comments, counts, recent comments)
- Article page view statistics
- Comment reactions (likes/dislikes) and pinned comments
- User registration / login, social login + account binding
- Two-factor authentication (2FA / TOTP)
- Markdown rendering + XSS protection
- Gravatar avatars, UA parsing
- RSS feed
- Data import and export (compatible with the @waline/admin migration panel)
- **Akismet anti-spam comments** (four modes: Off / Akismet / LLM / Mix)
- LLM comment moderation (supports natural-language safety policies)
- IP rate limiting (IPQPS)
- Admin panel (@waline/admin CDN + Worker settings page)

## Notice

The code for this project was written mainly with AI assistance. It has been through human code review and testing, but there is no guarantee that it behaves exactly the same as the original Waline Server in every respect. Please assess the risks yourself before using it in production.

GitHub Repository | Documentation

This article is original content by the author, Siyu Lei. If you republish it, please credit the source and include a link to the original. (leisiyu.dev)
