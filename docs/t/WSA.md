---
lang: zh-CN
icon: line-md:github-loop
title: 自动构建带root与Google Play的安卓子系统
date: 2023-06-06
category:
  - 技术分享
tag:
  - WSA
  - Android
  - Windows
  - 安卓子系统
  - root
---

MagiskOnWSAOnlineBuild {.textkai}

<!-- more -->

## 写在最前

本项目基于Magisk on WSA (with Google Apps)，该仓库~~在古老的年代~~曾经有过通过Github Action来自动部署的功能。

但因为过于火爆和fork仓库过多，该仓库被判定为滥用Github Action而被封禁。

但是对于很多人来说，安装Linux或者WSL自行下载源代码过于困难，我自己构建好拷贝给朋友来说又太麻烦了。

## 使用

直接下载最新的Release即可

## 解决方案

于是我在仔细查看项目结构后通过Github Action来执行build，直接通过预设步骤进行构建并上传到release，方便大多数人使用。

目前而言，通过强制性的要求Github Token的要求应该能避免很多人直接fork了去用，需要自己配置Token和仓库路径。

不过workflow文件中写上了充分的注释，可以轻松的改进。

## 具体步骤：
 - 安装Git
 - 克隆MagiskonWSA
 - 运行依赖安装文件
 - 构建版本
 - 下载Github CLI工具
 - 通过Token登录并发布新版本

本文为作者 Siyu Lei 原创内容，转载请注明出处并附上原文链接。（leisiyu.dev）
