import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { writebackTranslations } from '../scripts/translation-writeback.mjs'
import { parseDocument, serializeDocument, translateDocument } from '../scripts/translation.mjs'

const outputRoot = fileURLToPath(new URL('./output/', import.meta.url))
const statePath = 'docs/.vuepress/translation-state.json'
const liveEnv = {
  GITHUB_ACTIONS: 'true',
  CF_ACCOUNT_ID: 'test-account',
  CF_AIG_GATEWAY_ID: 'test-gateway',
  CF_AIG_TOKEN: 'test-token',
}

function runGit(cwd, args) {
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function git(cwd, ...args) {
  return runGit(cwd, args)
}

async function fixture(t, name = 'writeback-') {
  await mkdir(outputRoot, { recursive: true })
  const cwd = await mkdtemp(path.join(outputRoot, name))
  t.after(async () => {
    const outputPath = `${path.resolve(outputRoot)}${path.sep}`.toLowerCase()
    const fixturePath = path.resolve(cwd).toLowerCase()
    assert.ok(fixturePath.startsWith(outputPath), `temporary Git fixture escaped test/output: ${fixturePath}`)
    await rm(cwd, { recursive: true, force: true })
  })

  git(cwd, 'init', '-b', 'main')
  git(cwd, 'config', 'user.name', 'Fixture Author')
  git(cwd, 'config', 'user.email', 'fixture@example.invalid')
  await writeFile(path.join(cwd, '.gitignore'), '/translations/\n')
  await mkdir(path.join(cwd, 'docs', '.vuepress'), { recursive: true })
  await writeFile(path.join(cwd, 'fixture.txt'), 'tracked fixture root\n')
  git(cwd, 'add', '-f', '.gitignore')
  const baseSha = commit(cwd, 'fixture base')
  return { cwd, baseSha }
}

async function put(cwd, relative, contents) {
  const filename = path.join(cwd, relative)
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, contents, 'utf8')
}

function commit(cwd, message) {
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-m', message)
  return git(cwd, 'rev-parse', 'HEAD')
}

function document({ lang = 'zh-CN', title, description = 'Source description', excerpt = 'Source excerpt', body, flags = '' }) {
  return [
    '---',
    `lang: ${lang}`,
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    `excerpt: ${JSON.stringify(excerpt)}`,
    flags,
    '---',
    body,
    '',
  ].filter((line) => line !== '').join('\n')
}

function response(payload, transform = (value) => `EN: ${value}`) {
  const translated = {
    fields: Object.fromEntries(Object.entries(payload.fields).map(([key, value]) => [key, transform(value, key)])),
    markdown: transform(payload.markdown, 'markdown'),
  }
  return new Response(JSON.stringify({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(translated) }],
  }), { status: 200 })
}

function mockFetch(calls, answer = (payload) => response(payload)) {
  return async (url, options) => {
    const request = JSON.parse(options.body)
    const payload = JSON.parse(request.messages[0].content)
    calls.push({ url, request, payload })
    return answer(payload, calls.length)
  }
}

async function callWriteback(cwd, beforeSha, afterSha, fetchImpl, options = {}) {
  return writebackTranslations({
    cwd,
    beforeSha,
    afterSha,
    live: options.live ?? true,
    env: options.env ?? liveEnv,
    fetchImpl,
  })
}

async function text(cwd, relative) {
  return readFile(path.join(cwd, relative), 'utf8')
}

const hash = (value) => createHash('sha256').update(value).digest('hex')

test('uses an existing translation cache on an initial writeback without making a model request', async (t) => {
  const { cwd } = await fixture(t, 'writeback-cache-')
  const source = document({ title: 'Cached source', body: 'Cached paragraph.' })
  await put(cwd, 'docs/t/cached.md', source)
  const afterSha = commit(cwd, 'add source for cache bootstrap')
  const parsed = parseDocument(source, 'docs/t/cached.md')
  await translateDocument({
    source: serializeDocument(parsed.data, parsed.content),
    filename: 'docs/t/cached.md',
    sourceLang: 'zh-CN',
    targetLang: 'en-US',
    cacheRoot: path.join(cwd, 'translations'),
    live: true,
    env: liveEnv,
    fetchImpl: mockFetch([]),
  })

  const calls = []
  const result = await callWriteback(cwd, undefined, afterSha, mockFetch(calls), { live: false, env: {} })
  assert.equal(calls.length, 0)
  assert.deepEqual(result.changedPaths, [statePath, 'docs/en/t/cached.md'])
})

test('creates targets and state, sends real source diffs, preserves unchanged bytes, and avoids repeat requests', async (t) => {
  const { cwd, baseSha } = await fixture(t)
  await put(cwd, 'docs/t/alpha.md', document({ title: 'Alpha title', body: 'Alpha source paragraph.' }))
  await put(cwd, 'docs/t/beta.md', document({ title: 'Beta title', body: 'Beta source paragraph.' }))
  const sourceASha = commit(cwd, 'add two source articles')
  const calls = []
  const initial = await callWriteback(cwd, baseSha, sourceASha, mockFetch(calls))
  assert.deepEqual(initial.changedPaths, [
    'docs/.vuepress/translation-state.json',
    'docs/en/t/alpha.md',
    'docs/en/t/beta.md',
  ])
  assert.equal(calls.length, 2)

  const state = JSON.parse(await text(cwd, statePath))
  const alphaEntry = state.entries['docs/t/alpha.md']
  assert.equal(alphaEntry.targetPath, 'docs/en/t/alpha.md')
  assert.equal(alphaEntry.sourceLang, 'zh-CN')
  assert.equal(alphaEntry.targetLang, 'en-US')
  assert.equal(alphaEntry.sourceHash, hash(await text(cwd, 'docs/t/alpha.md')))
  assert.equal(alphaEntry.targetHash, hash(await text(cwd, alphaEntry.targetPath)))
  assert.match(alphaEntry.sourceSnapshot, /Alpha source paragraph\./)
  const betaTargetBefore = await text(cwd, 'docs/en/t/beta.md')
  const generationSha = commit(cwd, 'record initial translations')

  const noOpCalls = []
  const noOp = await callWriteback(cwd, generationSha, generationSha, mockFetch(noOpCalls))
  assert.deepEqual(noOp.changedPaths, [])
  assert.equal(noOpCalls.length, 0)
  assert.equal(await text(cwd, 'docs/en/t/beta.md'), betaTargetBefore)

  await put(cwd, 'docs/t/alpha.md', document({
    title: 'Alpha title',
    description: 'Source description',
    excerpt: 'Source excerpt',
    body: 'Beta source paragraph.',
  }))
  const sourceBSha = commit(cwd, 'change alpha source body')
  const updateCalls = []
  const updated = await callWriteback(cwd, generationSha, sourceBSha, mockFetch(updateCalls, (payload) => {
    assert.equal(payload.context.previousSource.fields.title, 'Alpha title')
    assert.equal(payload.context.previousSource.markdown.trim(), 'Alpha source paragraph.')
    assert.equal(payload.context.previousTranslation.fields.title.source, 'Alpha title')
    assert.equal(payload.context.previousTranslation.fields.title.translation, 'EN: Alpha title')
    assert.match(payload.context.previousTranslation.markdown, /EN: Alpha source paragraph\./)
    assert.match(payload.context.sourceDiff, /Cumulative baseline diff:/)
    assert.match(payload.context.sourceDiff, /Event commit diff:/)
    assert.match(payload.context.sourceDiff, /-Alpha source paragraph\./)
    assert.match(payload.context.sourceDiff, /\+Beta source paragraph\./)
    return response(payload, () => 'Untrusted replacement')
  }))
  assert.equal(updateCalls.length, 1)
  assert.deepEqual(updated.changedPaths, [statePath, 'docs/en/t/alpha.md'])

  const translatedAlpha = matter(await text(cwd, 'docs/en/t/alpha.md'))
  assert.equal(translatedAlpha.data.title, 'EN: Alpha title')
  assert.equal(translatedAlpha.data.description, 'EN: Source description')
  assert.equal(translatedAlpha.data.excerpt, 'EN: Source excerpt')
  assert.equal(translatedAlpha.content.trim(), 'Untrusted replacement')
  assert.equal(await text(cwd, 'docs/en/t/beta.md'), betaTargetBefore)
})

test('updates changed translated fields, keeps unchanged prose, and syncs nontranslated metadata without a request', async (t) => {
  const { cwd, baseSha } = await fixture(t, 'writeback-fields-')
  await put(cwd, 'docs/t/article.md', document({ title: 'Original title', body: 'Unchanged article body.' }))
  const sourceSha = commit(cwd, 'add article')
  await callWriteback(cwd, baseSha, sourceSha, mockFetch([]))
  const generatedSha = commit(cwd, 'record initial translation')
  const initialTarget = matter(await text(cwd, 'docs/en/t/article.md'))

  await put(cwd, 'docs/t/article.md', document({ title: 'Revised title', body: 'Unchanged article body.' }))
  const titleSha = commit(cwd, 'change article title')
  const titleCalls = []
  await callWriteback(cwd, generatedSha, titleSha, mockFetch(titleCalls, (payload) => response(payload, (value, key) => (
    key === 'title' ? 'Translated revised title' : key === 'markdown' ? 'A rewritten paragraph that must not replace unchanged prose.' : `EN: ${value}`
  ))))
  assert.equal(titleCalls.length, 1)
  const titleTarget = matter(await text(cwd, 'docs/en/t/article.md'))
  assert.equal(titleTarget.data.title, 'Translated revised title')
  assert.equal(titleTarget.content, initialTarget.content)
  const translatedTitleSha = commit(cwd, 'record translated title')

  await put(cwd, 'docs/t/article.md', document({ title: 'Revised title', excerpt: 'Updated excerpt', body: 'Unchanged article body.' }))
  const excerptSha = commit(cwd, 'change translated excerpt')
  const excerptCalls = []
  await callWriteback(cwd, translatedTitleSha, excerptSha, mockFetch(excerptCalls, (payload) => response(payload, (value, key) => (
    key === 'excerpt' ? 'Translated updated excerpt' : key === 'markdown' ? 'A rewritten paragraph that must not replace unchanged prose.' : `EN: ${value}`
  ))))
  assert.equal(excerptCalls.length, 1)
  const excerptTarget = matter(await text(cwd, 'docs/en/t/article.md'))
  assert.equal(excerptTarget.data.excerpt, 'Translated updated excerpt')
  assert.equal(excerptTarget.content, initialTarget.content)
  const translatedExcerptSha = commit(cwd, 'record translated excerpt')

  await put(cwd, 'docs/t/article.md', document({ title: 'Revised title', excerpt: 'Updated excerpt', body: 'Unchanged article body.' }).replace('lang: zh-CN', 'lang: zh-CN\ndate: 2026-10-14'))
  const metadataSha = commit(cwd, 'change date metadata only')
  const metadataCalls = []
  const metadataResult = await callWriteback(cwd, translatedExcerptSha, metadataSha, mockFetch(metadataCalls))
  assert.equal(metadataCalls.length, 0)
  assert.equal(matter(await text(cwd, 'docs/en/t/article.md')).content, initialTarget.content)
  assert.ok(metadataResult.changedPaths.includes(statePath))
})

test('failed translation leaves all targets and state untouched and retries from the canonical snapshot', async (t) => {
  const { cwd, baseSha } = await fixture(t, 'writeback-retry-')
  await put(cwd, 'docs/t/alpha.md', document({ title: 'Alpha', body: 'Version A body.' }))
  await put(cwd, 'docs/t/unrelated.md', document({ title: 'Unrelated', body: 'Unrelated version A.' }))
  const sourceASha = commit(cwd, 'add alpha')
  const initialCalls = []
  await callWriteback(cwd, baseSha, sourceASha, mockFetch(initialCalls))
  const stateASha = commit(cwd, 'record alpha translation')
  const targetA = await text(cwd, 'docs/en/t/alpha.md')
  const stateA = await text(cwd, statePath)

  await put(cwd, 'docs/t/alpha.md', document({ title: 'Alpha', body: 'Version B body.' }))
  const sourceBSha = commit(cwd, 'update alpha to B')
  const failedCalls = []
  await assert.rejects(
    callWriteback(cwd, stateASha, sourceBSha, mockFetch(failedCalls, () => new Response('unavailable', { status: 503 }))),
    /HTTP 503/,
  )
  assert.equal(failedCalls.length, 1)
  assert.equal(await text(cwd, 'docs/en/t/alpha.md'), targetA)
  assert.equal(await text(cwd, statePath), stateA)
  assert.equal(git(cwd, 'status', '--porcelain'), '')

  await put(cwd, 'docs/t/unrelated.md', document({ title: 'Unrelated', body: 'Unrelated version B.' }))
  const unrelatedSha = commit(cwd, 'change only another article')
  const retryCalls = []
  await callWriteback(cwd, sourceBSha, unrelatedSha, mockFetch(retryCalls, (payload) => {
    if (payload.context.previousSource.markdown.includes('Version A body.')) {
      assert.match(payload.context.previousTranslation.markdown, /EN: Version A body\./)
      assert.match(payload.context.sourceDiff, /Version A body\./)
      assert.match(payload.context.sourceDiff, /Version B body\./)
    }
    return response(payload, (value, key) => key === 'markdown' ? 'EN: Version B body.' : `EN: ${value}`)
  }))
  assert.equal(retryCalls.length, 2)
  assert.ok(retryCalls.some(({ payload }) => payload.context.previousSource.markdown.includes('Version A body.')))
  assert.match(await text(cwd, 'docs/en/t/alpha.md'), /EN: Version B body\./)
  const stateB = JSON.parse(await text(cwd, statePath))
  assert.match(stateB.entries['docs/t/alpha.md'].sourceSnapshot, /Version B body\./)
})

test('does not translate drafts or opt-outs, and never replaces hand-authored counterparts', async (t) => {
  const { cwd, baseSha } = await fixture(t, 'writeback-exclusions-')
  await put(cwd, 'docs/t/draft.md', document({ title: 'Draft', body: 'Not for publication.', flags: 'IS_draft: true\n' }))
  await put(cwd, 'docs/t/opt-out.md', document({ title: 'Opt out', body: 'Keep source only.', flags: 'IS_translate: false\n' }))
  await put(cwd, 'docs/t/manual.md', document({ title: 'Manual Chinese', body: 'Chinese source.' }))
  const handAuthored = document({ lang: 'en-US', title: 'Hand-authored English', body: 'Carefully edited English text.' })
  await put(cwd, 'docs/en/t/manual.md', handAuthored)
  await put(cwd, 'docs/en/t/guide.md', document({ lang: 'en-US', title: 'English guide', body: 'Source is written in English.' }))
  const afterSha = commit(cwd, 'add excluded and bilingual pages')
  const calls = []
  const result = await callWriteback(cwd, baseSha, afterSha, mockFetch(calls))

  assert.equal(calls.length, 1)
  assert.equal(calls[0].payload.fields.title, 'English guide')
  assert.deepEqual(result.changedPaths, [statePath, 'docs/t/guide.md'])
  assert.equal(await text(cwd, 'docs/en/t/manual.md'), handAuthored)
  await assert.rejects(readFile(path.join(cwd, 'docs/en/t/draft.md')), { code: 'ENOENT' })
  await assert.rejects(readFile(path.join(cwd, 'docs/en/t/opt-out.md')), { code: 'ENOENT' })
  const entries = JSON.parse(await text(cwd, statePath)).entries
  assert.deepEqual(Object.keys(entries), ['docs/en/t/guide.md'])
  assert.equal(entries['docs/en/t/guide.md'].sourceLang, 'en-US')
  assert.equal(entries['docs/en/t/guide.md'].targetLang, 'zh-CN')

  await put(cwd, 'docs/t/draft.md', document({ title: 'Draft', body: 'Now published draft text.' }))
  await put(cwd, 'docs/t/opt-out.md', document({ title: 'Opt out', body: 'Now enabled text.' }))
  const enabledSha = commit(cwd, 'publish previously excluded pages')
  const enabledCalls = []
  await callWriteback(cwd, afterSha, enabledSha, mockFetch(enabledCalls))
  assert.equal(enabledCalls.length, 2)
  for (const { request } of enabledCalls) {
    assert.doesNotMatch(request.messages[0].content, /Not for publication|Keep source only/)
  }
  assert.match(await text(cwd, 'docs/en/t/draft.md'), /EN: Now published draft text\./)
  assert.match(await text(cwd, 'docs/en/t/opt-out.md'), /EN: Now enabled text\./)

  const skippedRepo = await fixture(t, 'writeback-skip-early-')
  await put(skippedRepo.cwd, 'docs/t/draft.md', document({ title: 'Draft', body: 'No cache reads.', flags: 'IS_draft: true\n' }))
  await put(skippedRepo.cwd, 'docs/t/opt-out.md', document({ title: 'Opt out', body: 'No cache reads.', flags: 'IS_translate: false\n' }))
  const skippedSha = commit(skippedRepo.cwd, 'add pages which must skip translation')
  const skippedCalls = []
  await callWriteback(skippedRepo.cwd, skippedRepo.baseSha, skippedSha, mockFetch(skippedCalls), { live: false })
  assert.equal(skippedCalls.length, 0)
})

test('removes an owned translation when its source becomes a draft or opts out', async (t) => {
  const { cwd, baseSha } = await fixture(t, 'writeback-disable-owned-')
  await put(cwd, 'docs/t/article.md', document({ title: 'Article', body: 'Published source.' }))
  const sourceSha = commit(cwd, 'add published source')
  await callWriteback(cwd, baseSha, sourceSha, mockFetch([]))
  const generatedSha = commit(cwd, 'record generated translation')
  assert.match(await text(cwd, 'docs/en/t/article.md'), /EN: Published source\./)

  await put(cwd, 'docs/en/t/article.md', `${await text(cwd, 'docs/en/t/article.md')}Manual target edit.\n`)
  const editedTargetSha = commit(cwd, 'edit owned translation')
  await put(cwd, 'docs/t/article.md', document({ title: 'Article', body: 'Published source.', flags: 'IS_draft: true\n' }))
  const draftSha = commit(cwd, 'mark source draft')
  const calls = []
  const result = await callWriteback(cwd, editedTargetSha, draftSha, mockFetch(calls))
  assert.equal(calls.length, 0)
  assert.ok(result.changedPaths.includes('docs/en/t/article.md'))
  await assert.rejects(readFile(path.join(cwd, 'docs/en/t/article.md')), { code: 'ENOENT' })
  assert.deepEqual(JSON.parse(await text(cwd, statePath)).entries, {})
})

test('preserves manual target edits as context, follows source renames, and removes owned targets on deletion', async (t) => {
  const { cwd, baseSha } = await fixture(t, 'writeback-rename-')
  await put(cwd, 'docs/t/article.md', document({ title: 'Original title', body: 'Original source body.' }))
  const sourceASha = commit(cwd, 'add article source')
  const firstCalls = []
  await callWriteback(cwd, baseSha, sourceASha, mockFetch(firstCalls))
  const firstGeneratedSha = commit(cwd, 'record article translation')

  const editedTarget = `${await text(cwd, 'docs/en/t/article.md')}Manual editorial note.\n`
  await put(cwd, 'docs/en/t/article.md', editedTarget)
  const editSha = commit(cwd, 'edit generated translation')
  const editCalls = []
  const sync = await callWriteback(cwd, firstGeneratedSha, editSha, mockFetch(editCalls))
  assert.equal(editCalls.length, 0)
  assert.deepEqual(sync.changedPaths, [statePath])
  const syncedEditSha = commit(cwd, 'record manual target edit')

  await put(cwd, 'docs/t/article.md', document({ title: 'Updated title', body: 'Updated source body.' }))
  const sourceBSha = commit(cwd, 'update article source')
  const updateCalls = []
  await callWriteback(cwd, syncedEditSha, sourceBSha, mockFetch(updateCalls, (payload) => {
    assert.match(payload.context.previousTranslation.markdown, /Manual editorial note\./)
    return response(payload, (_value, key) => key === 'markdown'
      ? `${payload.context.previousTranslation.markdown}\nUpdated translation body.`
      : `EN: ${payload.fields[key]}`)
  }))
  assert.match(await text(cwd, 'docs/en/t/article.md'), /Manual editorial note\./)
  const updateSha = commit(cwd, 'record updated translation')

  git(cwd, 'mv', 'docs/t/article.md', 'docs/t/renamed.md')
  const renameSha = commit(cwd, 'rename source article')
  const renameCalls = []
  const targetBeforeRename = await text(cwd, 'docs/en/t/article.md')
  const renamed = await callWriteback(cwd, updateSha, renameSha, mockFetch(renameCalls))
  assert.equal(renameCalls.length, 0)
  assert.equal(await text(cwd, 'docs/en/t/renamed.md'), targetBeforeRename)
  await assert.rejects(readFile(path.join(cwd, 'docs/en/t/article.md')), { code: 'ENOENT' })
  assert.ok(renamed.changedPaths.includes('docs/en/t/article.md'))
  const renameState = JSON.parse(await text(cwd, statePath))
  assert.equal(renameState.entries['docs/t/article.md'], undefined)
  assert.ok(renameState.entries['docs/t/renamed.md'])
  const renamedSha = commit(cwd, 'record renamed target')

  await put(cwd, 'docs/t/renamed.md', document({ title: 'Updated title', body: 'Changed after rename.' }))
  const renamedBodySha = commit(cwd, 'edit renamed source body')
  const renamedBodyCalls = []
  await callWriteback(cwd, renamedSha, renamedBodySha, mockFetch(renamedBodyCalls, (payload) => {
    assert.match(payload.context.previousSource.markdown, /Updated source body\./)
    assert.match(payload.context.previousTranslation.markdown, /Manual editorial note\./)
    assert.match(payload.context.previousTranslation.markdown, /Updated translation body\./)
    assert.match(payload.context.sourceDiff, /Changed after rename\./)
    return response(payload, (value, key) => key === 'markdown' ? 'Translation based on renamed history.' : `EN: ${value}`)
  }))
  assert.equal(renamedBodyCalls.length, 1)
  const renamedBodyTranslatedSha = commit(cwd, 'record renamed body translation')

  git(cwd, 'rm', 'docs/t/renamed.md')
  const deleteSha = commit(cwd, 'delete source article')
  const deletion = await callWriteback(cwd, renamedBodyTranslatedSha, deleteSha, mockFetch([]))
  assert.ok(deletion.changedPaths.includes('docs/en/t/renamed.md'))
  assert.equal(JSON.parse(await text(cwd, statePath)).entries['docs/t/renamed.md'], undefined)
  await assert.rejects(readFile(path.join(cwd, 'docs/en/t/renamed.md')), { code: 'ENOENT' })
})

test('rejects invalid or missing source provenance before writing targets', async (t) => {
  const { cwd, baseSha } = await fixture(t, 'writeback-provenance-')
  await put(cwd, 'docs/t/article.md', document({ title: 'Original', body: 'Baseline body.' }))
  const sourceSha = commit(cwd, 'add source')
  await callWriteback(cwd, baseSha, sourceSha, mockFetch([]))
  const generatedSha = commit(cwd, 'record generated files')
  const targetBefore = await text(cwd, 'docs/en/t/article.md')

  const state = JSON.parse(await text(cwd, statePath))
  delete state.entries['docs/t/article.md'].sourceSnapshot
  await put(cwd, statePath, `${JSON.stringify(state, null, 2)}\n`)
  const invalidStateSha = commit(cwd, 'remove translation baseline')
  const statusBefore = git(cwd, 'status', '--porcelain')
  await assert.rejects(
    callWriteback(cwd, generatedSha, invalidStateSha, mockFetch([])),
    /baseline.*missing|entry is invalid/i,
  )
  assert.equal(await text(cwd, 'docs/en/t/article.md'), targetBefore)
  assert.equal(git(cwd, 'status', '--porcelain'), statusBefore)
})

test('writes nothing when one of several changed articles fails translation', async (t) => {
  const { cwd, baseSha } = await fixture(t, 'writeback-atomic-')
  await put(cwd, 'docs/t/a.md', document({ title: 'Article A', body: 'Source A.' }))
  await put(cwd, 'docs/t/b.md', document({ title: 'Article B', body: 'Source B.' }))
  const afterSha = commit(cwd, 'add two articles')
  const calls = []
  await assert.rejects(
    callWriteback(cwd, baseSha, afterSha, mockFetch(calls, (payload, count) => count === 1
      ? response(payload)
      : new Response('temporary failure', { status: 503 }))),
    /HTTP 503/,
  )
  assert.equal(calls.length, 2)
  assert.equal(git(cwd, 'status', '--porcelain'), '')
  await assert.rejects(readFile(path.join(cwd, statePath)), { code: 'ENOENT' })
  await assert.rejects(readFile(path.join(cwd, 'docs/en/t/a.md')), { code: 'ENOENT' })
  await assert.rejects(readFile(path.join(cwd, 'docs/en/t/b.md')), { code: 'ENOENT' })

  const retryCalls = []
  const retried = await callWriteback(cwd, undefined, afterSha, mockFetch(retryCalls))
  assert.equal(retryCalls.length, 1)
  assert.equal(retryCalls[0].payload.fields.title, 'Article B')
  assert.deepEqual(retried.changedPaths, [statePath, 'docs/en/t/a.md', 'docs/en/t/b.md'])
  assert.match(await text(cwd, 'docs/en/t/a.md'), /EN: Source A\./)
  assert.match(await text(cwd, 'docs/en/t/b.md'), /EN: Source B\./)
})
