---
lang: zh-CN
icon: line-md:cloud-alt-filled-loop
title: Waline On Worker —— Cloudflare Workers 评论系统
date: 2026-06-05
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

Waline 评论系统的 Cloudflare Workers 实现，免服务器，免费部署。 {.textkai}

<!-- more -->

## 是什么

Waline On Worker 是将开源评论系统 Waline 完整移植到 Cloudflare Workers 平台的后端实现，使用 D1（SQLite）作为数据存储。

相比官方 Vercel 部署方案，它：
- 无需独立服务器，运行在 Cloudflare 边缘网络
- 免费额度充足，适合个人博客
- 完全兼容 `@waline/client` 前端和 `@waline/admin` 管理面板

## 技术栈

| 项目 | 选型 |
| --- | --- |
| 运行时 | Cloudflare Workers |
| 数据库 | Cloudflare D1（SQLite） |
| 框架 | Hono |
| 语言 | TypeScript |

## 已实现功能

- 评论 CRUD（线程化、计数、最近评论）
- 文章浏览量统计
- 评论反应（赞踩）、置顶评论
- 用户注册 / 登录、社交登录 + 账号绑定
- 两步验证（2FA / TOTP）
- Markdown 渲染 + XSS 防护
- Gravatar 头像、UA 解析
- RSS 订阅
- 数据导入导出（兼容 @waline/admin 迁移面板）
- **Akismet 反垃圾评论**（四档：关 / Akismet / LLM / Mix）
- LLM 评论审查（支持自然语言安全策略）
- IP 频率限制（IPQPS）
- 管理面板（@waline/admin CDN + Worker 设置页）

## 注意

本项目代码实现主要由 AI 辅助完成，已经过人工代码审查和测试，但无法保证与原版 Waline Server 所有行为完全一致，生产环境使用前请自行评估风险。

GitHub 仓库 | 文档

本文为作者 Siyu Lei 原创内容，转载请注明出处并附上原文链接。（leisiyu.dev）
