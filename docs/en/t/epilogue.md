---
lang: en-US
icon: 'line-md:computer-desktop'
title: epilogue — A Desktop AI File Workflow
date: 2026-06-11T00:00:00.000Z
category:
  - 开源项目
tag:
  - AI
  - 桌面应用
  - 文件管理
  - 本地优先
  - 多平台
---

**files, remembered.** No information is collected, and all data stays on your device. {.textkai}

<!-- more -->

## What It Is

epilogue is a desktop AI file workflow app that runs on macOS / Windows / Linux. Its core design philosophy is "local-first": configuration, indexes, and vectors are all stored on your device, and audio/video transcription is done locally by default, so audio never leaves your device.

## What It Can Do

**Clean up**: Periodically scans for stale files that haven't been touched in a long time, and the AI offers filing suggestions based on your natural-language habits, which you confirm item by item before anything is moved. It understands multi-part content (course material series, portable software, TV series) and archives it as a whole, making use of the multi-level structure of the destination folder.

**Find**: "Where did I put last semester's lab report?" Retrieve a file with a single sentence—three modes are available: keyword / similarity / AI Q&A. You can describe an image in words to find it, and relative times such as "last year" or "last week" are understood.

**Assistant**: A built-in conversational agent that can change settings, turn your habits into rules ("from now on, put invoices in Finance/"), and look up files.

**Optional automation** (off by default, can only be enabled manually): Solo mode automatically files things on a schedule without requiring approval; the AI can be allowed to move worthless temporary files to the system recycle bin.

## Multi-Provider AI Failover Architecture

Each AI capability is a **failover list** (drag to reorder, enable per row, one-click test) that is tried in order from top to bottom:

| Capability | Built-in Presets |
| --- | --- |
| Chat / Conversation model | Pollinations (no Key required) → OpenRouter Free → OpenCode Zen Free |
| Embeddings / Text vectors | Local BGE Chinese (offline) |
| Image Embedding / Image vectors | Four CLIP-based options to choose from, running locally |
| Whisper / Transcription | Two local tiers (low / high accuracy, downloaded and enabled separately) |

Supports recognizing archives, Office files, PDFs, plain text, images, and audio/video.

## Lightweight Background Presence

After deep optimization, it uses almost no resources while resident in the tray; the interface and data are loaded only when needed; heavy tasks automatically yield to foreground work; and it slows down automatically when running on battery power. On macOS, the tray state doesn't occupy the Dock.

## License

Dual-licensed under **ALE 1.1 (Anti-Labor-Exploitation License) & GPL-3.0**. GPL rights are conditional on ALE compliance.

GitHub Repository | Releases

This article is original content by its author, Siyu Lei. If you repost it, please credit the source and include a link to the original. (leisiyu.dev)
