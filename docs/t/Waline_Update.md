---
lang: zh-CN
icon: line-md:chevron-small-double-up
title: 通过GH Action自动更新Waline
date: 2024-11-26
category:
  - 技术分享
tag:
  - Waline
  - Vercel
  - Update
---

每次Waline都要跳有更新了，一般也是兼容更新，可能还会有安全修复，跟上肯定属于没坏处那种，故想了个办法可以自动更新。 {.textkai}

## 通过github仓库更新来触发vercel更新

### 1. 确保你的Vercel Project和仓库相连

如果没有相连可以手动创建仓库连接

### 2. Package.json 更改为最新版本

这样可以省去填版本号的麻烦，不用workflow也可以配置一个

在package.json，改为：

``` json
"@waline/vercel": "latest"
```

### 3. Workflow触发

已权限最小化，仅申请contents: write（提交commit必要），不需要额外的token。由于有提交，action会自动保活，不会出现半年自动禁用的问题。

原理是通过有write权限的GITHUB_TOKEN提交一个完全空白的commit，触发vercel自动部署。

默认cron定时为一个月。

新建文件/.github/Auto_update.yml：

``` yml
name: Trigger Vercel Deployment

on:
  schedule:
    - cron: '0 0 1 * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  trigger-vercel:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout repository
      uses: actions/checkout@v3

    - name: Configure Git
      run: |
        git config user.name "github-actions[bot]"
        git config user.email "github-actions[bot]@users.noreply.github.com"

    - name: Create an empty commit
      run: git commit --allow-empty -m "Trigger Vercel deployment"

    - name: Push changes
      run: |
        git remote set-url origin https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/${{ github.repository }}.git
        git push origin HEAD
```

## 另外的思路

这些思路理论上可行，但由于麻烦/权限管理问题没尝试。

 - 通过vercel.json中配置定时任务去触发，由于不太搞得清楚api调用方式没搞。

 - 通过Action直接发送vercel部署命令，由于涉及到额外的token权限管理，加之相比起交白commit好像没啥特别的优势，白白增加配置的复杂度和增加安全隐患（毕竟再怎么说是长期token）。

本文为作者 Siyu Lei 原创内容，转载请注明出处并附上原文链接。（leisiyu.dev）
