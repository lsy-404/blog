import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const verifier = fileURLToPath(new URL('./verify-publish.py', import.meta.url))
const python = process.platform === 'win32' ? 'python' : 'python3'

async function put(root, relative, contents) {
  const filename = path.join(root, relative)
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, contents)
}

test('published output verifier allows first-party HTTPS links, requires bilingual navigation, and rejects offsite anchors, redirects, and drafts', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'blog-publish-check-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const docs = path.join(root, 'docs')
  const prepared = path.join(root, '.prepared')
  const dist = path.join(docs, '.vuepress', 'dist')
  await put(docs, '.vuepress/content-routes.json', JSON.stringify({ 'articles/pub.md': 't/pub.md' }))
  await put(docs, 'articles/pub.md', '---\ntitle: 中文验收页\n---\nBody')
  await put(docs, 'd/draft.md', "---\n'IS_draft': true # must be parsed as YAML boolean\ntitle: Draft\n---\nDraft body")
  await put(prepared, 't/pub.md', '---\ntitle: 中文验收页\nlang: zh-CN\n---\nCode example: `IS_draft: true`')
  await put(prepared, '.vuepress/translation-manifest.json', JSON.stringify({ pages: { 't/pub.md': { lang: 'zh-CN', translationEnabled: true } } }))
  await put(dist, 't/pub.html', '<html><a href="/t/pub.html">local</a><a href="https://leisiyu.dev/">site</a><a href="https://sub.leisiyu.dev/path">subdomain</a><code>IS_draft: true</code></html>')
  await put(dist, 'index.html', '<html><nav><a href="https://tiny.leisiyu.dev/">Tiny Projects</a></nav></html>')
  await put(dist, 'en/index.html', '<html><nav><a href="https://tiny.leisiyu.dev/">Tiny Projects</a></nav></html>')
  await put(dist, '_redirects', '/articles/pub.html /t/pub.html 301\n')

  const args = [verifier, '--docs', docs, '--prepared', prepared, '--dist', dist]
  const expectFailure = (message) => {
    const failed = spawnSync(python, args, { encoding: 'utf8' })
    assert.notEqual(failed.status, 0)
    assert.match(failed.stderr, message)
  }
  const result = spawnSync(python, args, { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /3 HTML files, 1 existing redirect targets, 1 draft sources excluded/)

  await put(dist, 'en/index.html', '<html><nav><a href="/en/">Home</a></nav></html>')
  expectFailure(/Missing Tiny Projects navigation link on en\/index\.html/)
  await put(dist, 'en/index.html', '<html><nav><a href="https://tiny.leisiyu.dev/">Tiny Projects</a></nav></html>')

  await put(docs, 'd/string-flag.md', '---\n"IS_draft": "true" # a string is not a boolean\n---\nDraft body')
  expectFailure(/Frontmatter is_draft must be a YAML boolean/)
  await rm(path.join(docs, 'd/string-flag.md'))

  await put(dist, 't/pub.html', '<html><a href="https://example.org">external</a></html>')
  expectFailure(/offsite anchors/)

  for (const href of [
    'http://leisiyu.dev/',
    'ftp://leisiyu.dev/',
    '//leisiyu.dev/',
    'mailto:hello@leisiyu.dev',
    'javascript:alert(1)',
    'https://leisiyu.dev.evil/',
    'https://leisiyu.devil/',
    'https://evilleisiyu.dev/',
    'https://tiny.leisiyu.dev.evil/',
    'https://user:pass@leisiyu.dev/',
    'https://evil.example@leisiyu.dev/',
    'https://leisiyu.dev:999999/',
  ]) {
    await put(dist, 't/pub.html', `<html><a href="${href}">offsite</a></html>`)
    expectFailure(/offsite anchors/)
  }

  await put(dist, 't/pub.html', '<html><a href="/t/pub.html">local</a></html>')
  await put(dist, '_redirects', '/articles/pub.html /missing.html 301\n')
  expectFailure(/Redirect target does not exist/)

  await put(dist, '_redirects', '/articles/pub.html /t/pub.html 301\n')
  await put(prepared, 'd/draft.md', '---\nIS_draft: true\n---\nDraft body')
  await put(prepared, '.vuepress/translation-manifest.json', JSON.stringify({ pages: {
    't/pub.md': { lang: 'zh-CN', translationEnabled: true },
    'd/draft.md': { lang: 'zh-CN', translationEnabled: true },
  } }))
  await put(dist, 'd/draft.html', '<html>Draft</html>')
  expectFailure(/Custom frontmatter key leaked/)
})
