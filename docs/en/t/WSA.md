---
lang: en-US
icon: 'line-md:github-loop'
title: Automatically Building Windows Subsystem for Android with Root and Google Play
date: 2023-06-06T00:00:00.000Z
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

## Preface

This project is based on Magisk on WSA (with Google Apps). That repository ~~in ancient times~~ once offered automated deployment through GitHub Actions.

However, because it became so popular and had so many forks, the repository was flagged for abusing GitHub Actions and was banned.

For many people, though, installing Linux or WSL and downloading the source code themselves is too difficult, and building it myself and copying it to friends is too much trouble.

## Usage

Just download the latest Release.

## Solution

So, after carefully reviewing the project structure, I used GitHub Actions to run the build, building through preset steps and uploading the result directly to a release, making it convenient for most people.

For now, requiring a GitHub Token should keep many people from simply forking it and using it directly, since you need to configure your own Token and repository path.

The workflow file also contains thorough comments, so it can be easily improved.

## Specific steps:
 - Install Git
 - Clone MagiskonWSA
 - Run the dependency installation script
 - Build the release
 - Download the GitHub CLI tool
 - Log in with the Token and publish a new release

This article is original content by the author, Siyu Lei. When reposting, please credit the source and include a link to the original article. (leisiyu.dev)
