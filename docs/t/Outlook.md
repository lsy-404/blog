---
lang: zh-CN
icon: line-md:email-multiple-filled
title: Outlook增强指南
date: 2024-11-27
category:
  - 技术分享
tag:
  - Outlook
  - Power Automate
  - KeepOutlookRunning
  - KeepOutlookRunningInstaller
---

桌面版后台常驻&禁用垃圾邮件 {.textkai}

<!-- more -->

## classic版本通过插件实现后台常驻，保持后台运行

微软的谜之设定，outlook没法设置成后台常驻，经常出现手机都收到邮件了但是电脑还得手动去看的问题。

目前的解决方法只有KeepOutlookRunning（开源免费）/QuickTweaks（收费，$19.95）两个插件。

开源插件KeepOutlookRunning有在office更新后掉插件的问题，故在此基础上二次开发KeepOutlookRunningInstaller，通过注册office和插件dll来避免问题。

可获取对应安装包。

双击安装即可，安装时需要联网访问Github获取DLL

QuickTweaks收费，$19.95，不建议。

## 通过Microsoft Power Automate禁用垃圾邮件功能

微软很神奇的强制为所有个人/工作邮箱使用它那个误判贼高的垃圾邮件过滤系统，导致翻垃圾文件夹是必要的，那么这个功能除了让我丢通知没有一点作用。~~他妈的你怎么连多大自己的邮件都拦~~

还没有给关闭的选项，只能通过微软自家的自动化变相来实现。

登录 power automate

创建-Outlook-新电子邮件到达时

授予相关邮箱访问授权

选择新电子邮件到达时-文件夹（垃圾邮件）

添加操作移动电子邮件-消息ID（选择上一步的ID）-文件夹（收件箱）

保存即可

这样会在垃圾邮件文件夹有新邮件的时候自动提出到收件箱，当然是比直接收邮件略慢几秒的。

Microsoft Power Automate也是微软自家的功能，理论上不存在说安全问题。

本文为作者 Siyu Lei 原创内容，转载请注明出处并附上原文链接。（leisiyu.dev）
