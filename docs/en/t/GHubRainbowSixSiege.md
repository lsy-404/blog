---
lang: en-US
icon: 'line-md:cog-filled-loop'
title: Fix for G Hub Not Switching Profiles in Rainbow Six
date: 2024-12-04T00:00:00.000Z
category:
  - 技术分享
tag:
  - 教程
  - G Hub
  - Rainbow Six Siege
  - 彩虹六号
  - Bug
  - g_hub_not_switching_profiles
  - 不切换配置文件
  - database
---

The first detailed repair tutorial online {.textkai}

<!-- more -->

## 1. Preparation

You need any editor that can edit DB files. If you don't have one, you can download DB Browser for SQLite (choose the no-installer portable version).

This tutorial is written for DB Browser for SQLite; other editors work similarly.

Extract the archive and open `DB Browser for SQLite.exe`

Exit G HUB.

## 2. Open G Hub settings.db

Press `ctrl + O` - type into the address bar: `C:%homepath%\AppData\Local\LGHUB\` and press Enter.

First right-click `settings.db`, copy it, and paste it to any safe location (backup).

Select the file `settings.db` and open it.

## 3. Open the saved configuration

Switch to `浏览数据（B）` and click the cell for the file with id 1 (displayed as `{...`).

The data will be shown in the window on the right. Select that window.

## 4. Remove the erroneous data

Press `ctrl + F` and search for the keyword rainbow.

Delete all rainbow six siege entries under `APPLICATION_NAME_DESKTOP`. In the end it should look like `[]`. If there are other items that are not Rainbow Six, make sure the last entry is not followed by `,`

## 5. Write changes

Click the _date_created cell corresponding to id 1. You will be asked whether to save; click Save.

Then click `写入更改（W）` at the top, and close `DB Browser for SQLite`

## 6. Restart G HUB

Restart G HUB from the Start menu. Normally it won't report data corruption; if it does, let it repair itself, and if it can't be repaired, replace the file with your backup.

If you can't figure it out, look up JSON syntax or ask ChatGPT.

## 7. ENJOY GAME

Thanks to G HUB not switching profiles - Reddit for mentioning the solution of repairing the config database.

However, the original post is too vague and doesn't give detailed repair steps.

~~Which intern at G HUB wrote this damn bug? The GUI is even completely invisible.~~

This article is original content by the author Siyu Lei. When reposting, please credit the source and include a link to the original article. (leisiyu.dev)
