---
lang: en-US
icon: 'line-md:chevron-small-double-up'
title: Automatically Update Waline with a GitHub Action
date: 2024-11-26T00:00:00.000Z
category:
  - 技术分享
tag:
  - Waline
  - Vercel
  - Update
---

Every time Waline shows a notice that an update is available, it's usually a compatible update, and it may also include security fixes. Staying current can only help, so I came up with a way to update automatically. {.textkai}

## Trigger a Vercel update through a GitHub repository update

### 1. Make sure your Vercel Project is connected to the repository

If it isn't connected, you can create the repository connection manually.

### 2. Change Package.json to the latest version

This saves you the trouble of filling in a version number. You can also set this up without a workflow.

In package.json, change it to:

``` json
"@waline/vercel": "latest"
```

### 3. Workflow trigger

Permissions are minimized: it only requests contents: write (required for committing), and no additional token is needed. Because it makes commits, the action is automatically kept alive, so it won't be disabled automatically after six months of inactivity.

The principle is to use the GITHUB_TOKEN, which has write permission, to push a completely empty commit, which triggers an automatic Vercel deployment.

The default cron schedule is once a month.

Create a new file /.github/Auto_update.yml:

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

## Other approaches

These approaches should work in theory, but I haven't tried them because of the hassle or permission management issues.

 - Configure a scheduled task in vercel.json to trigger it. I didn't pursue this because I couldn't quite figure out how to call the API.

 - Send the Vercel deployment command directly from the Action. This involves extra token permission management, and compared with pushing an empty commit it doesn't seem to offer any particular advantage. It would only add configuration complexity and security risk (after all, it would be a long-lived token).

This article is original content by the author, Siyu Lei. When republishing, please credit the source and include a link to the original. (leisiyu.dev)
