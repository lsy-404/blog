import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertLiveTranslationAllowed, parseDocument, translateDocument } from '../scripts/translation.mjs'
import { collectLocalAssetPaths, collectPublishedAssetPaths, copyReferencedAssets, rewriteRelativeAssets } from '../scripts/content-assets.mjs'

const outputRoot = fileURLToPath(new URL('./output/', import.meta.url))
const source = (title = 'Hello', lang = 'zh-CN') => `---\nlang: ${lang}\ntitle: ${title}\ndescription: A description\n---\n# Hello\n\nBody with \`inline code\` and [a link](https://example.test/path).\n\n\x60\x60\x60js\nconst value = 1\n\x60\x60\x60\n<MyWidget src="/asset.svg" />\n`

async function tempCache(t) {
  await mkdir(outputRoot, { recursive: true })
  const directory = await mkdtemp(path.join(outputRoot, 'translation-'))
  t.after(async () => {
    const outputPath = `${path.resolve(outputRoot)}${path.sep}`.toLowerCase()
    const directoryPath = path.resolve(directory).toLowerCase()
    assert.ok(directoryPath.startsWith(outputPath), `temporary translation fixture escaped test/output: ${directoryPath}`)
    await rm(directory, { recursive: true, force: true })
  })
  return directory
}

function translationFetch(onRequest = () => {}) {
  return async (url, options) => {
    onRequest(url, options)
    const request = JSON.parse(options.body)
    const userContent = JSON.parse(request.messages[0].content)
    const text = JSON.stringify({
      fields: Object.fromEntries(Object.entries(userContent.fields).map(([key, value]) => [key, value === 'Hello' ? 'Bonjour' : `FR ${value}`])),
      markdown: userContent.markdown.replaceAll('Hello', 'Bonjour'),
    })
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }), { status: 200 })
  }
}

test('live translation is restricted to GitHub Actions', () => {
  const credentials = { CF_ACCOUNT_ID: 'account', CF_AIG_GATEWAY_ID: 'main', CF_AIG_TOKEN: 'gateway-token' }
  assert.throws(() => assertLiveTranslationAllowed(['node', 'prepare-content.mjs', '--live'], {}), /only permitted in GitHub Actions/)
  assert.throws(() => assertLiveTranslationAllowed(['node', 'prepare-content.mjs'], credentials), /only permitted in GitHub Actions/)
  assert.equal(assertLiveTranslationAllowed(['node', 'prepare-content.mjs', '--live'], { GITHUB_ACTIONS: 'true' }), true)
  assert.equal(assertLiveTranslationAllowed(['node', 'prepare-content.mjs'], {}), false)
})

test('opt-out is strictly validated and skipped before cache access or network', async (t) => {
  const cache = path.join(await tempCache(t), 'not-a-directory')
  await writeFile(cache, 'cache path must not be read')
  const result = await translateDocument({
    source: '---\nlang: zh-CN\nIS_translate: false\ntitle: Secret title\n---\nSecret body',
    filename: 'private.md', sourceLang: 'zh-CN', targetLang: 'en-US', cacheRoot: cache, live: true,
    fetchImpl: async () => { throw new Error('network must not run') },
  })
  assert.equal(result.skipped, true)
  assert.throws(() => parseDocument('---\nIS_draft: "true"\n---\nsecret', 'draft.md'), /must be a YAML boolean/)
  assert.throws(() => parseDocument('---\nIS_translate: yes\n---\nsecret', 'optout.md'), /must be a YAML boolean/)
  for (const key of ['IS_private', 'IS_encrypted']) {
    const privateDoc = await translateDocument({
      source: `---\n${key}: true\ntitle: Secret title\n---\nSecret body`, filename: 'private.md',
      sourceLang: 'zh-CN', targetLang: 'en-US', cacheRoot: cache, live: true,
      fetchImpl: async () => { throw new Error('network must not run') },
    })
    assert.equal(privateDoc.skipped, true)
  }
  assert.equal(parseDocument('---\npassword: secret\n---\nBody').protectedDocument, true)
  assert.equal(parseDocument('---\nencrypt: true\n---\nBody').protectedDocument, true)
  assert.throws(() => parseDocument('---\nIS_private: "true"\n---\nsecret'), /must be a YAML boolean/)
  const cleaned = parseDocument('---\nIS_draft: false\nIS_translate: false\nIS_future_flag: value\nblogSection: daily\nsection: hidden\ntitle: Visible\n---\nBody')
  assert.deepEqual(cleaned.data, { title: 'Visible' })
})

test('translates in both directions through the fixed Cloudflare Anthropic gateway model', async (t) => {
  const cacheRoot = await tempCache(t)
  const sourceText = source()
  let calls = 0
  const fetchImpl = translationFetch((url, options) => {
    calls += 1
    assert.match(url, /\/v1\/account\/main\/anthropic\/v1\/messages$/)
    assert.equal(options.headers['anthropic-version'], '2023-06-01')
    assert.equal(options.headers['cf-aig-authorization'], 'Bearer gateway-token')
    assert.equal(options.headers['cf-aig-no-wholesale'], 'true')
    assert.equal(JSON.parse(options.body).model, 'claude-sonnet-5-5')
  })
  const env = { CF_ACCOUNT_ID: 'account', CF_AIG_GATEWAY_ID: 'main', CF_AIG_TOKEN: 'gateway-token' }
  const english = await translateDocument({ source: sourceText, filename: 't/example.md', sourceLang: 'zh-CN', targetLang: 'en-US', cacheRoot, live: true, env, fetchImpl })
  assert.equal(english.translated.fields.title, 'Bonjour')
  assert.match(english.translated.markdown, /```js\nconst value = 1\n```/)
  assert.match(english.translated.markdown, /\[a link\]\(https:\/\/example\.test\/path\)/)
  assert.match(english.translated.markdown, /<MyWidget src="\/asset\.svg" \/>/)
  const chinese = await translateDocument({ source: source('Bonjour', 'en-US'), filename: 'en/t/example.md', sourceLang: 'en-US', targetLang: 'zh-CN', cacheRoot, live: true, env, fetchImpl })
  assert.equal(chinese.translated.fields.title, 'FR Bonjour')
  assert.equal(calls, 2)
})

test('persistent cache keys change with source content and avoid duplicate requests', async (t) => {
  const cacheRoot = await tempCache(t)
  const env = { CF_ACCOUNT_ID: 'account', CF_AIG_GATEWAY_ID: 'main', CF_AIG_TOKEN: 'token' }
  let calls = 0
  const fetchImpl = translationFetch(() => calls++)
  const input = { filename: 't/example.md', sourceLang: 'zh-CN', targetLang: 'en-US', cacheRoot, live: true, env, fetchImpl }
  await translateDocument({ ...input, source: source() })
  const second = await translateDocument({ ...input, source: source() })
  assert.equal(second.cacheHit, true)
  assert.equal(calls, 1)
  const changed = await translateDocument({ ...input, source: source('Changed') })
  assert.equal(changed.cacheHit, false)
  assert.equal(calls, 2)
  const entries = await readdir(cacheRoot)
  assert.equal(entries.length, 2)
  assert.ok(JSON.parse(await readFile(path.join(cacheRoot, entries[0]), 'utf8')).markdown)
})

test('markdown-it token maps protect nested fences and indented code', async (t) => {
  const cacheRoot = await tempCache(t)
  const code = '```js\nconst nestedSecret = "keep"\n```\n'
  const indented = '    const indentedSecret = "keep"\n'
  const markdown = ['Ordinary prose', '', '````md', code.trimEnd(), '````', '', indented.trimEnd()].join('\n')
  let transmitted
  const result = await translateDocument({
    source: `---\nlang: zh-CN\ntitle: Hello\n---\n${markdown}`, filename: 't/code.md',
    sourceLang: 'zh-CN', targetLang: 'en-US', cacheRoot, live: true,
    env: { CF_ACCOUNT_ID: 'a', CF_AIG_GATEWAY_ID: 'b', CF_AIG_TOKEN: 'c' },
    fetchImpl: translationFetch((_url, options) => {
      const body = JSON.parse(options.body)
      transmitted = JSON.parse(body.messages[0].content).markdown
    }),
  })
  assert.doesNotMatch(transmitted, /nestedSecret|indentedSecret/)
  assert.match(result.translated.markdown, /const nestedSecret = "keep"/)
  assert.match(result.translated.markdown, /const indentedSecret = "keep"/)
})

test('translation responses and cached tokens reject metadata injection or protected edits', async (t) => {
  const cacheRoot = await tempCache(t)
  const options = { source: source(), filename: 't/example.md', sourceLang: 'zh-CN', targetLang: 'en-US', cacheRoot, live: true, env: { CF_ACCOUNT_ID: 'a', CF_AIG_GATEWAY_ID: 'b', CF_AIG_TOKEN: 'c' } }
  await assert.rejects(translateDocument({ ...options, fetchImpl: async (_url, request) => {
    const input = JSON.parse(JSON.parse(request.body).messages[0].content)
    const fields = Object.fromEntries(Object.entries(input.fields).map(([key, value]) => [key, `Translated ${value}`]))
    fields.IS_draft = true
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ fields, markdown: input.markdown }) }] }))
  } }), /unexpected frontmatter fields/)

  const input = { ...options, fetchImpl: translationFetch() }
  await translateDocument(input)
  const [cacheFile] = await readdir(cacheRoot)
  const cachedPath = path.join(cacheRoot, cacheFile)
  const cached = JSON.parse(await readFile(cachedPath, 'utf8'))
  assert.match(cached.markdown, /⟦KEEP_/)
  cached.markdown = cached.markdown.replace(/⟦KEEP_\d+⟧/, '⟦KEEP_999⟧')
  await writeFile(cachedPath, JSON.stringify(cached))
  await assert.rejects(translateDocument(input), /did not preserve protected Markdown token/)
})

test('translation validation requires supported source and target languages and nonempty prose', async (t) => {
  const options = { source: source(), filename: 't/example.md', sourceLang: 'zh-CN', targetLang: 'fr-FR', cacheRoot: await tempCache(t), live: false }
  await assert.rejects(translateDocument(options), /unsupported translation direction/)
  const cacheRoot = await tempCache(t)
  await assert.rejects(translateDocument({ ...options, targetLang: 'en-US', cacheRoot, live: true,
    env: { CF_ACCOUNT_ID: 'a', CF_AIG_GATEWAY_ID: 'b', CF_AIG_TOKEN: 'c' },
    fetchImpl: async (_url, request) => {
      const input = JSON.parse(JSON.parse(request.body).messages[0].content)
      return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({
        fields: Object.fromEntries(Object.entries(input.fields).map(([key, value]) => [key, `Translated ${value}`])), markdown: '',
      }) }] }))
    } }), /omitted Markdown prose/)
})

test('HTTP errors, truncation, and malformed response bodies fail the build', async (t) => {
  const cacheRoot = await tempCache(t)
  const options = { source: source(), filename: 't/example.md', sourceLang: 'zh-CN', targetLang: 'en-US', cacheRoot, live: true, env: { CF_ACCOUNT_ID: 'a', CF_AIG_GATEWAY_ID: 'b', CF_AIG_TOKEN: 'c' } }
  await assert.rejects(translateDocument({ ...options, fetchImpl: async () => new Response('denied', { status: 401 }) }), /HTTP 401/)
  await assert.rejects(translateDocument({ ...options, fetchImpl: async () => new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [] }), { status: 200 }) }), /stopped unexpectedly/)
  await assert.rejects(translateDocument({ ...options, fetchImpl: async () => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not JSON' }] }), { status: 200 }) }), /malformed translation JSON/)
})

test('relative assets become stable root paths while code examples remain unchanged', () => {
  const markdown = '![image](./img/photo.webp?size=2)\n\n<MediaPlayer src="./audio/demo.mp3" />\n\n<!-- <img src="./comment.png"> -->\n\n````md\n```md\n![example](./keep.png)\n```\n````\n'
  const output = rewriteRelativeAssets(markdown, 't/article.md', { 't/img/photo.webp': 't/assets/photo.webp' })
  assert.match(output, /!\[image\]\(\/t\/assets\/photo\.webp\?size=2\)/)
  assert.match(output, /src="\/t\/audio\/demo\.mp3"/)
  assert.match(output, /````md\n```md\n!\[example\]\(\.\/keep\.png\)\n```\n````/)
  assert.deepEqual(collectLocalAssetPaths(output), ['t/assets/photo.webp', 't/audio/demo.mp3'])
  assert.equal(rewriteRelativeAssets('![mapped](/articles/res/photo.png)', 't/article.md', { 'articles/res/photo.png': 't/res/photo.png' }), '![mapped](/t/res/photo.png)')
  assert.throws(() => rewriteRelativeAssets('![bad](../../secret.png)', 't/article.md'), /escapes the content root/)
})

test('draft and protected pages do not publish their referenced local assets', () => {
  const documents = new Map([
    ['t/public.md', { content: '![public](./public.webp)' }],
    ['t/draft.md', { draft: true, content: '![draft](./draft.webp)' }],
    ['t/private.md', { protectedDocument: true, content: '![private](./private.webp)' }],
  ])
  const rendered = new Map([
    ['t/public.md', '![public](/t/public.webp)'],
    ['t/draft.md', '![draft](/t/draft.webp)'],
    ['t/private.md', '![private](/t/private.webp)'],
  ])
  assert.deepEqual([...collectPublishedAssetPaths(documents, rendered)], ['t/public.webp'])
})

test('referenced assets are emitted at mapped public destinations', async (t) => {
  const root = await tempCache(t)
  const contentRoot = path.join(root, 'docs')
  const publicRoot = path.join(root, 'prepared', '.vuepress', 'public')
  const sourcePath = path.join(contentRoot, 'articles', 'res', 'photo.png')
  await mkdir(path.dirname(sourcePath), { recursive: true })
  await writeFile(sourcePath, Buffer.from('asset-data'))
  await copyReferencedAssets(new Set(['t/res/photo.png']), {
    contentRoot,
    publicRoot,
    routeMap: { 'articles/res/photo.png': 't/res/photo.png' },
  })
  assert.equal(await readFile(path.join(publicRoot, 't', 'res', 'photo.png'), 'utf8'), 'asset-data')
  await assert.rejects(copyReferencedAssets(new Set(['../private.png']), { contentRoot, publicRoot }), /Invalid local asset path/)
})
