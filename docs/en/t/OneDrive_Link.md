---
lang: en-US
icon: 'line-md:cloud-alt-tags-twotone-loop'
title: OneDrive Enhancement Guide
date: 2023-09-18T00:00:00.000Z
category:
  - 技术分享
tag:
  - OneDrive
  - 命令行
  - 符号链接
  - mklink
---

Sync Any Folder {.textkai}

<!-- more -->

First, press Win+R, type `cmd`, and click OK while holding Shift+Ctrl to open a command prompt with elevated privileges. (If done correctly, you will see a UAC prompt and the word "Administrator" in the title bar.)

Press Win+E to open File Explorer, right-click the OneDrive folder, click Properties, and copy the path from the address bar.

Use the following command to link the folder you want to the OneDrive folder, for example:

``` cmd
mklink /D "{OneDrive文件夹路径}\{OneDrive文件夹中的相对路径}" "{你要链接的文件夹路径}"
```

Replace {} and the content inside it with your own path.

This uses the Windows symbolic link feature, which lets you link a folder to another location while it still appears in File Explorer as the original folder.

You can link a folder to another location without moving it, for example adding it to the OneDrive folder for easier syncing.

Type `mklink /?` in the command prompt to see more usage options.

This article is original content by the author Siyu Lei. If you repost it, please credit the source and include a link to the original. (leisiyu.dev)
