---
lang: zh-CN
icon: line-md:cog-filled-loop
title: G Hub彩虹六号不切换配置文件修复
date: 2024-12-04
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

全网首发详细修复教程 {.textkai}

<!-- more -->

## 1. 准备工作

需要任何可以编辑DB文件的编辑器，如果没有可以下载DB Browser for SQLite（选择no installer便携版本）

以下教程基于DB Browser for SQLite编写，其他编辑器类似

解压压缩包，打开`DB Browser for SQLite.exe`

退出G HUB

## 2. 打开G Hub settings.db

按下 `ctrl + O` - 地址栏输入：`C:%homepath%\AppData\Local\LGHUB\`并回车

先右键`settings.db`，复制，粘贴到任何安全位置（备份）

选择文件`settings.db`并打开

## 3. 打开保存的配置

切换到`浏览数据（B）`点击id为1的对应file的空（显示为`{...`）

在右侧窗口会显示数据，选中窗口

## 4. 移除错误数据

按下`ctrl + F`搜索rainbow关键词

删除所有在`APPLICATION_NAME_DESKTOP`的rainbow six siege文件，最后应该看起来像是`[]`，如果有非rainbow six的其他项目，请确保最后一条后面没有接`,`

## 5. 写入更改

点击id为1的对应_date_created，此时询问是否保存，点击保存

然后点击上面的`写入更改（W）`，关闭`DB Browser for SQLite`

## 6. 重新启动G HUB

从开始菜单中重新启动G HUB，正常情况下不会跳数据损坏，如果跳了让他自己修复，修不了就把备份文件替换回去。

搞不懂可以查Json语法或者问ChatGPT

## 7. ENJOY GAME

感谢G HUB not switching profiles - Reddit提到的修复config数据库的解决方案

但是原文提到的太模糊，没有详细的修复步骤

~~G HUB这TM是哪个实习生写出来的Bug，甚至是GUI界面是完全不可见的~~

本文为作者 Siyu Lei 原创内容，转载请注明出处并附上原文链接。（leisiyu.dev）
