---
lang: en-US
icon: 'line-md:email-multiple-filled'
title: Outlook Enhancement Guide
date: 2024-11-27T00:00:00.000Z
category:
  - 技术分享
tag:
  - Outlook
  - Power Automate
  - KeepOutlookRunning
  - KeepOutlookRunningInstaller
---

Keeping the Desktop Version Running in the Background & Disabling the Junk Mail Filter {.textkai}

<!-- more -->

## Keeping the classic version running in the background with a plugin

For some mysterious reason, Microsoft doesn't let Outlook run persistently in the background. Often my phone has already received an email, but I still have to go check manually on my computer.

Currently, the only solutions are two plugins: KeepOutlookRunning (open source and free) and QuickTweaks (paid, $19.95).

The open-source plugin KeepOutlookRunning has a problem where it gets dropped after Office updates, so I built on it to develop KeepOutlookRunningInstaller, which avoids the problem by registering Office and the plugin DLL.

The corresponding installer is available for download.

Just double-click to install. During installation, an internet connection is required to fetch the DLL from GitHub.

QuickTweaks is paid ($19.95), and I don't recommend it.

## Disabling the junk mail filter with Microsoft Power Automate

Microsoft bizarrely forces every personal/work mailbox to use its junk mail filtering system, which has an extremely high false-positive rate, making it necessary to dig through the junk folder. As far as I can tell, this feature does nothing except make me miss notifications. ~~Damn it, how do you even block UofT's own emails~~

There's no option to turn it off, so the only way is to work around it indirectly using Microsoft's own automation.

Log in to Power Automate.

Create - Outlook - When a new email arrives.

Grant access to the relevant mailbox.

For "When a new email arrives," set the folder to Junk Email.

Add the action "Move email" - Message ID (select the ID from the previous step) - Folder (Inbox).

Save, and you're done.

This way, whenever a new email lands in the junk folder, it is automatically moved to the inbox, though a few seconds slower than receiving it directly.

Microsoft Power Automate is also a Microsoft product, so in theory there shouldn't be any security concerns.

This article is original content by the author, Siyu Lei. If you repost it, please credit the source and include a link to the original. (leisiyu.dev)
