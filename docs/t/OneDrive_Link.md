---
lang: zh-CN
icon: line-md:cloud-alt-tags-twotone-loop
title: OneDrive增强指南
date: 2023-09-18
category:
  - 技术分享
tag:
  - OneDrive
  - 命令行
  - 符号链接
  - mklink
---

同步任意文件夹 {.textkai}

<!-- more -->

首先按下Win+R，输入`cmd`，同时按住shift+ctrl的情况下点击确定，提权打开命令行。（正确情况下会有UAC提示及标题栏中的管理员字样）

按下Win+E，打开资源管理器，右键OneDrive文件夹，点击属性，复制地址栏中的路径。

使用以下指令链接你想要的文件夹到OneDrive文件夹，例如：

``` cmd
mklink /D "{OneDrive文件夹路径}\{OneDrive文件夹中的相对路径}" "{你要链接的文件夹路径}"
```

将{}及其中的内容替换为你的路径。

这是使用Windows的符号链接功能，可以将文件夹链接到其他位置，但是在资源管理器中仍然显示为原文件夹。

可以在不移动文件夹的情况下将文件夹链接到其他位置，例如将将其加入到Onedrive文件夹中，以方便同步。

在命令行中输入`mklink /?`查看更多用法。

本文为作者 Siyu Lei 原创内容，转载请注明出处并附上原文链接。（leisiyu.dev）
