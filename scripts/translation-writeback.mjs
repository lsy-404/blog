import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import { MODEL, PROMPT_VERSION, assertLiveTranslationAllowed, parseDocument, serializeDocument, translateDocument } from './translation.mjs'
import { rewriteRelativeAssets } from './content-assets.mjs'
import { rewriteInternalLinks } from './content-routing.mjs'

const STATE_PATH = 'docs/.vuepress/translation-state.json'
const cacheRoot = (cwd) => path.join(cwd, 'translations')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const git = (cwd, args, options = {}) => execFileSync('git', args, { cwd, encoding: null, maxBuffer: 64 * 1024 * 1024, ...options })

function gitText(cwd, args) {
  return git(cwd, args).toString('utf8')
}

function gitShow(cwd, revision, relative, required = false) {
  try { return git(cwd, ['show', `${revision}:${relative}`]) }
  catch (error) {
    if (!required && error.status === 128) return null
    throw new Error(`Cannot read ${relative} at ${revision}: ${error.stderr?.toString('utf8').trim() || error.message}`)
  }
}

function treeFiles(cwd, revision) {
  return git(cwd, ['ls-tree', '-r', '-z', '--name-only', revision, '--', 'docs'])
    .toString('utf8').split('\0').filter(Boolean)
}

function changedFiles(cwd, beforeSha, afterSha) {
  const tokens = git(cwd, ['diff', '--name-status', '-z', '--find-renames', beforeSha, afterSha, '--', 'docs'])
    .toString('utf8').split('\0').filter(Boolean)
  const changed = new Set()
  const renamed = new Map()
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++]
    if (/^R\d+$/.test(status) || /^C\d+$/.test(status)) {
      const oldPath = tokens[index++]
      const newPath = tokens[index++]
      changed.add(oldPath)
      changed.add(newPath)
      if (status[0] === 'R') renamed.set(newPath, oldPath)
    } else {
      changed.add(tokens[index++])
    }
  }
  return { changed, renamed }
}

function sourceTargetPath(sourcePath) {
  return sourcePath.startsWith('docs/en/')
    ? `docs/${sourcePath.slice('docs/en/'.length)}`
    : `docs/en/${sourcePath.slice('docs/'.length)}`
}

function validContentPath(value) {
  return typeof value === 'string' && value.startsWith('docs/') && value.endsWith('.md')
    && !value.includes('\\') && !value.split('/').some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))
    && !value.startsWith('docs/.vuepress/')
}

function normalizeState(value) {
  if (!value) return { version: 1, entries: {} }
  let state
  try { state = JSON.parse(value.toString('utf8')) } catch { throw new Error('Translation state is malformed JSON') }
  if (state?.version !== 1 || !state.entries || typeof state.entries !== 'object' || Array.isArray(state.entries)) {
    throw new Error('Translation state has an unsupported shape')
  }
  const entries = {}
  for (const [sourcePath, entry] of Object.entries(state.entries)) {
    if (!validContentPath(sourcePath) || !entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Translation state entry is invalid: ${sourcePath}`)
    }
    if (typeof entry.sourceSnapshot !== 'string') throw new Error(`Translation state baseline is missing: ${sourcePath}`)
    const snapshotDocument = parseDocument(entry.sourceSnapshot, `${sourcePath} translation baseline`)
    const snapshotLang = languageFor(sourcePath, snapshotDocument)
    if (entry.targetPath !== sourceTargetPath(sourcePath)
      || !validContentPath(entry.targetPath)
      || !/^[a-f0-9]{64}$/.test(entry.sourceHash ?? '')
      || !/^[a-f0-9]{64}$/.test(entry.targetHash ?? '')
      || !['zh-CN', 'en-US'].includes(entry.sourceLang)
      || !['zh-CN', 'en-US'].includes(entry.targetLang)
      || entry.sourceLang === entry.targetLang
      || snapshotLang !== entry.sourceLang
      || snapshotDocument.draft || !snapshotDocument.enabled || snapshotDocument.protectedDocument) {
      throw new Error(`Translation state entry is invalid: ${sourcePath}`)
    }
    entries[sourcePath] = entry
  }
  return { version: 1, entries }
}

function isContentFile(filename) {
  const parts = filename.slice('docs/'.length).split('/')
  return filename.startsWith('docs/') && filename.toLowerCase().endsWith('.md')
    && !parts.some((part) => part.startsWith('.') || part.startsWith('_'))
    && !filename.startsWith('docs/.vuepress/')
}

function languageFor(sourcePath, document) {
  const prefix = sourcePath.startsWith('docs/en/')
  const language = document.data.lang ?? (prefix ? 'en-US' : undefined)
  if (!language) return null
  if (!['zh-CN', 'en-US'].includes(language) || prefix !== (language === 'en-US')) {
    throw new Error(`${sourcePath}: lang must match its source path`)
  }
  return language
}

function stateFileContent(state) {
  const entries = Object.fromEntries(Object.entries(state.entries).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
  return `${JSON.stringify({ version: 1, entries }, null, 2)}\n`
}

function translationHash(snapshot) {
  const document = matter(snapshot)
  const fields = Object.fromEntries(['title', 'description', 'excerpt']
    .filter((key) => typeof document.data[key] === 'string')
    .map((key) => [key, document.data[key]]))
  return sha256(JSON.stringify({ fields, markdown: document.content }))
}

function metadataHash(snapshot) {
  const data = { ...matter(snapshot).data }
  for (const key of ['title', 'description', 'excerpt', 'lang']) delete data[key]
  return sha256(JSON.stringify(data))
}

function snapshotFor(sourcePath, sourceBytes, routeMap) {
  const source = sourceBytes.toString('utf8')
  const document = parseDocument(source, sourcePath)
  if (document.draft || !document.enabled) return { document, sourceLang: null, canonical: null }
  const sourceLang = languageFor(sourcePath, document)
  if (!sourceLang) return { document, sourceLang: null, canonical: null }
  const withAssets = rewriteRelativeAssets(document.content, sourcePath.slice('docs/'.length), routeMap)
  const rewritten = rewriteInternalLinks(withAssets, routeMap, sourcePath.slice('docs/'.length))
  return {
    document,
    sourceLang,
    canonical: serializeDocument(document.data, rewritten),
  }
}

function translationContext(sourceSnapshot, targetBytes, sourceDiff, cacheDiff = sourceDiff) {
  const oldSource = matter(sourceSnapshot).data
  const oldBody = matter(sourceSnapshot).content
  const translated = targetBytes ? matter(targetBytes.toString('utf8')) : null
  const previousFields = {}
  for (const key of ['title', 'description', 'excerpt']) {
    if (typeof oldSource[key] === 'string' && typeof translated?.data[key] === 'string') {
      previousFields[key] = { source: oldSource[key], translation: translated.data[key] }
    }
  }
  const result = {
    previousSource: { fields: Object.fromEntries(Object.entries(oldSource).filter(([key, value]) => ['title', 'description', 'excerpt'].includes(key) && typeof value === 'string')), markdown: oldBody },
    previousTranslation: translated ? { fields: previousFields, markdown: translated.content } : null,
    sourceDiff,
  }
  result.cacheKey = { previousSource: result.previousSource, previousTranslation: result.previousTranslation, sourceDiff: cacheDiff }
  return result
}

function retainUnchangedTranslatedFields(fields, currentSnapshot, previousSnapshot, previousTarget) {
  if (!previousSnapshot || !previousTarget) return fields
  const currentSource = matter(currentSnapshot).data
  const previousSource = matter(previousSnapshot).data
  const previousTranslation = matter(previousTarget.toString('utf8')).data
  const merged = { ...fields }
  for (const key of ['title', 'description', 'excerpt']) {
    if (typeof currentSource[key] === 'string' && currentSource[key] === previousSource[key]
      && typeof previousTranslation[key] === 'string') merged[key] = previousTranslation[key]
  }
  return merged
}

async function snapshotDiff(root, oldSnapshot, currentSnapshot) {
  const scratch = await import('node:fs/promises')
  const outputRoot = path.join(root, 'test', 'output')
  await mkdir(outputRoot, { recursive: true })
  const trustedOutput = await scratch.realpath(outputRoot)
  const tempRoot = await scratch.mkdtemp(path.join(trustedOutput, 'translation-diff-'))
  const beforeFile = path.join(tempRoot, 'before.md')
  const afterFile = path.join(tempRoot, 'after.md')
  try {
    await writeFile(beforeFile, oldSnapshot, 'utf8')
    await writeFile(afterFile, currentSnapshot, 'utf8')
    try {
      return gitText(tempRoot, ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--no-color', '--unified=3', '--', 'before.md', 'after.md'])
    } catch (error) {
      if (error.status === 1) return error.stdout?.toString('utf8') ?? ''
      throw error
    }
  } finally {
    const trustedTemp = await scratch.realpath(tempRoot)
    const relative = path.relative(trustedOutput, trustedTemp)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Temporary translation diff escaped its output directory')
    await rm(trustedTemp, { recursive: true, force: true })
  }
}

function eventDiff(cwd, beforeSha, afterSha, sourcePath, oldPath) {
  const args = ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--unified=3', beforeSha, afterSha, '--']
  if (oldPath && oldPath !== sourcePath) args.push(`:(literal)${oldPath}`)
  args.push(`:(literal)${sourcePath}`)
  return gitText(cwd, args)
}

function prepareCurrent(sourcePath, sourceBytes, routeMap) {
  const snapshot = snapshotFor(sourcePath, sourceBytes, routeMap)
  return { ...snapshot, rawHash: sha256(sourceBytes) }
}

export async function writebackTranslations({ cwd, beforeSha, afterSha, live = false, env = process.env, fetchImpl = globalThis.fetch }) {
  if (!cwd) throw new Error('cwd is required')
  const root = path.resolve(cwd)
  const selectedAfter = afterSha ?? env.GITHUB_SHA
  if (!selectedAfter) throw new Error('afterSha is required')
  const actualLive = live || Boolean(env.CF_ACCOUNT_ID && env.CF_AIG_GATEWAY_ID && env.CF_AIG_TOKEN)
  if (actualLive) assertLiveTranslationAllowed(['--live'], env)
  const baselineSha = beforeSha && !/^0+$/.test(beforeSha) ? beforeSha : undefined
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(selectedAfter)) throw new Error('afterSha must be a full Git commit SHA')
  if (baselineSha && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(baselineSha)) throw new Error('beforeSha must be a full Git commit SHA or an all-zero sentinel')
  if (baselineSha) git(root, ['cat-file', '-e', `${baselineSha}^{commit}`])
  git(root, ['cat-file', '-e', `${selectedAfter}^{commit}`])
  if (gitText(root, ['rev-parse', 'HEAD']).trim() !== gitText(root, ['rev-parse', selectedAfter]).trim()) {
    throw new Error('The checked-out commit must equal afterSha before translation writeback')
  }
  if (git(root, ['status', '--porcelain', '-z', '--untracked-files=all']).length) {
    throw new Error('Translation writeback requires a clean checkout')
  }
  const baselinePaths = baselineSha ? new Set(treeFiles(root, baselineSha)) : new Set()
  const changedInfo = baselineSha ? changedFiles(root, baselineSha, selectedAfter) : { changed: new Set(), renamed: new Map() }
  const afterPaths = new Set(treeFiles(root, selectedAfter))
  const names = [...afterPaths].filter(isContentFile)
  const sourceBlobs = new Map()
  for (const sourcePath of names) sourceBlobs.set(sourcePath, gitShow(root, selectedAfter, sourcePath, true))
  let routeMap = {}
  const routeBytes = afterPaths.has('docs/.vuepress/content-routes.json')
    ? gitShow(root, selectedAfter, 'docs/.vuepress/content-routes.json', true)
    : null
  if (routeBytes) {
    try { routeMap = JSON.parse(routeBytes.toString('utf8')) } catch { throw new Error('content-routes.json is malformed') }
  }
  const state = normalizeState(afterPaths.has(STATE_PATH) ? gitShow(root, selectedAfter, STATE_PATH, true) : null)
  const current = new Map()
  for (const [sourcePath, bytes] of sourceBlobs) current.set(sourcePath, prepareCurrent(sourcePath, bytes, routeMap))
  const targetBytes = new Map()
  const existsInAfter = afterPaths
  const readTarget = (targetPath) => {
    if (!existsInAfter.has(targetPath)) return null
    if (!targetBytes.has(targetPath)) targetBytes.set(targetPath, gitShow(root, selectedAfter, targetPath, true))
    return targetBytes.get(targetPath)
  }
  const pendingWrites = new Map()
  const pendingDeletes = new Set()
  const nextEntries = {}
  const ownerBySource = state.entries
  const ownedTargets = new Set(Object.values(state.entries).map((entry) => entry.targetPath))

  for (const [sourcePath, entry] of Object.entries(state.entries)) {
    const source = current.get(sourcePath)
    const target = readTarget(entry.targetPath)
    const targetEdited = Boolean(target && sha256(target) !== entry.targetHash)
    if (!source || !source.sourceLang || source.document.draft || !source.document.enabled) {
      if (target) pendingDeletes.add(entry.targetPath)
      continue
    }
    const lang = source.sourceLang
    const expectedTarget = sourceTargetPath(sourcePath)
    if (entry.targetPath !== expectedTarget || entry.sourceLang !== lang || entry.targetLang !== (lang === 'zh-CN' ? 'en-US' : 'zh-CN')) {
      throw new Error(`Translation ownership no longer matches ${sourcePath}`)
    }
    const sourceChanged = translationHash(source.canonical) !== translationHash(entry.sourceSnapshot)
    const targetChangedInEvent = baselineSha && changedInfo.changed.has(entry.targetPath)
    if (target && targetChangedInEvent && targetEdited && !sourceChanged) {
      nextEntries[sourcePath] = { ...entry, sourceHash: source.rawHash, sourceSnapshot: source.canonical, targetHash: sha256(target) }
      continue
    }
    if (!sourceChanged && target) {
      if (targetEdited) {
        nextEntries[sourcePath] = { ...entry, sourceHash: source.rawHash, sourceSnapshot: source.canonical, targetHash: sha256(target) }
      } else if (metadataHash(source.canonical) === metadataHash(entry.sourceSnapshot)) {
        nextEntries[sourcePath] = { ...entry, sourceHash: source.rawHash, sourceSnapshot: source.canonical }
      } else {
        const targetDocument = matter(target.toString('utf8'))
        const translatedFields = Object.fromEntries(['title', 'description', 'excerpt']
          .filter((key) => typeof targetDocument.data[key] === 'string')
          .map((key) => [key, targetDocument.data[key]]))
        const synced = serializeDocument({ ...source.document.data, ...translatedFields, lang: entry.targetLang }, targetDocument.content)
        if (synced !== target.toString('utf8')) pendingWrites.set(entry.targetPath, synced)
        nextEntries[sourcePath] = { ...entry, sourceHash: source.rawHash, sourceSnapshot: source.canonical, targetHash: sha256(synced) }
      }
      continue
    }
    if (!target && !sourceChanged) {
      const translated = await translateDocument({
        source: source.canonical,
        filename: sourcePath,
        sourceLang: lang,
        targetLang: lang === 'zh-CN' ? 'en-US' : 'zh-CN',
        cacheRoot: cacheRoot(root),
        live: actualLive,
        env,
        fetchImpl,
      })
      if (translated.missing) throw new Error(`Translation cache is missing for ${sourcePath}; refusing to regenerate unchanged content without a baseline diff`)
      if (translated.skipped) continue
      const data = { ...translated.document.data, ...translated.translated.fields, lang: lang === 'zh-CN' ? 'en-US' : 'zh-CN' }
      const output = serializeDocument(data, translated.translated.markdown)
      pendingWrites.set(entry.targetPath, output)
      nextEntries[sourcePath] = { ...entry, sourceHash: source.rawHash, sourceSnapshot: source.canonical, targetHash: sha256(output) }
      continue
    }
    const targetLang = lang === 'zh-CN' ? 'en-US' : 'zh-CN'
    let context
    const renamedFrom = changedInfo.renamed.get(sourcePath)
    if (sourceChanged) {
      let oldSnapshot = entry.sourceSnapshot
      let previousPath = sourcePath
      if (renamedFrom && ownerBySource[renamedFrom]) {
        const oldEntry = ownerBySource[renamedFrom]
        oldSnapshot = oldEntry.sourceSnapshot
        previousPath = renamedFrom
      }
      const patch = await snapshotDiff(root, oldSnapshot, source.canonical)
      const actualPatch = baselineSha ? eventDiff(root, baselineSha, selectedAfter, sourcePath, previousPath) : ''
      const diff = translationHash(oldSnapshot) === translationHash(source.canonical) ? '' : patch
      context = translationContext(oldSnapshot, target, `Cumulative baseline diff:\n${diff}${actualPatch ? `\nEvent commit diff:\n${actualPatch}` : ''}`, diff)
    }
    const translated = await translateDocument({
      source: source.canonical,
      filename: sourcePath,
      sourceLang: lang,
      targetLang,
      cacheRoot: cacheRoot(root),
      live: Boolean(sourceChanged && actualLive && entry.sourceSnapshot),
      env,
      fetchImpl,
      context,
    })
    if (translated.missing) {
      if (sourceChanged && baselineSha) throw new Error(`No cached translation for changed article ${sourcePath}; live translation is required`)
      throw new Error(`Translation cache is missing for ${sourcePath}`)
    }
    if (translated.skipped) continue
    const retainedFields = retainUnchangedTranslatedFields(translated.translated.fields, source.canonical, entry.sourceSnapshot, target)
    const data = { ...translated.document.data, ...retainedFields, lang: targetLang }
    const unchangedBody = matter(entry.sourceSnapshot).content === matter(source.canonical).content
    const outputBody = target && unchangedBody ? matter(target.toString('utf8')).content : translated.translated.markdown
    const output = serializeDocument(data, outputBody)
    if (target) pendingWrites.set(expectedTarget, output)
    else pendingWrites.set(expectedTarget, output)
    if (renamedFrom && renamedFrom !== sourcePath) {
      const oldEntry = ownerBySource[renamedFrom]
      if (oldEntry?.targetPath !== expectedTarget) {
        const oldTarget = readTarget(oldEntry?.targetPath)
        if (oldTarget && sha256(oldTarget) === oldEntry.targetHash) pendingDeletes.add(oldEntry.targetPath)
      }
      delete nextEntries[renamedFrom]
    }
    nextEntries[sourcePath] = {
      targetPath: expectedTarget,
      sourceHash: source.rawHash,
      targetHash: sha256(output),
      sourceSnapshot: source.canonical,
      sourceLang: lang,
      targetLang,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
    }
  }

  for (const [sourcePath, source] of current) {
    if (ownerBySource[sourcePath] || ownedTargets.has(sourcePath) || !source.sourceLang || source.document.draft || !source.document.enabled) continue
    const targetPath = sourceTargetPath(sourcePath)
    if (existsInAfter.has(targetPath)) continue
    const renamedFrom = changedInfo.renamed.get(sourcePath)
    const prior = renamedFrom ? ownerBySource[renamedFrom] : undefined
    const contextBaseline = prior?.sourceSnapshot
    if (prior && contextBaseline && prior.sourceLang === source.sourceLang
      && translationHash(source.canonical) === translationHash(contextBaseline)) {
      const oldTarget = readTarget(prior.targetPath)
      if (oldTarget && !existsInAfter.has(targetPath)) {
        let translatedTarget = oldTarget
        if (metadataHash(source.canonical) !== metadataHash(contextBaseline)) {
          const oldDocument = matter(oldTarget.toString('utf8'))
          const translatedFields = Object.fromEntries(['title', 'description', 'excerpt']
            .filter((key) => typeof oldDocument.data[key] === 'string')
            .map((key) => [key, oldDocument.data[key]]))
          translatedTarget = serializeDocument({ ...source.document.data, ...translatedFields, lang: prior.targetLang }, oldDocument.content)
        }
        pendingWrites.set(targetPath, translatedTarget)
        if (prior.targetPath !== targetPath) pendingDeletes.add(prior.targetPath)
        nextEntries[sourcePath] = {
          ...prior,
          targetPath,
          sourceHash: source.rawHash,
          targetHash: sha256(translatedTarget),
          sourceSnapshot: source.canonical,
        }
        continue
      }
    }
    let context
    if (prior && contextBaseline) {
      const oldTarget = readTarget(prior.targetPath)
      if (oldTarget) {
        const patch = await snapshotDiff(root, contextBaseline, source.canonical)
        const actualPatch = baselineSha ? eventDiff(root, baselineSha, selectedAfter, sourcePath, renamedFrom) : ''
        context = translationContext(contextBaseline, oldTarget, `Cumulative baseline diff:\n${patch}${actualPatch ? `\nEvent commit diff:\n${actualPatch}` : ''}`, patch)
      }
    }
    const targetLang = source.sourceLang === 'zh-CN' ? 'en-US' : 'zh-CN'
    let translated
    if (prior && contextBaseline) {
      translated = await translateDocument({
        source: source.canonical,
        filename: sourcePath,
        sourceLang: source.sourceLang,
        targetLang,
        cacheRoot: cacheRoot(root),
        live: actualLive,
        env,
        fetchImpl,
        context,
      })
    } else {
      translated = await translateDocument({
        source: source.canonical,
        filename: sourcePath,
        sourceLang: source.sourceLang,
        targetLang,
        cacheRoot: cacheRoot(root),
        live: false,
        env,
        fetchImpl,
      })
    }
    let excludedBaseline = false
    if (!prior && translated?.missing && !context && baselineSha && baselinePaths.has(sourcePath)) {
      const oldBytes = gitShow(root, baselineSha, sourcePath, true)
      const oldSnapshot = snapshotFor(sourcePath, oldBytes, routeMap).canonical
      if (oldSnapshot) {
        const patch = await snapshotDiff(root, oldSnapshot, source.canonical)
        const actualPatch = eventDiff(root, baselineSha, selectedAfter, sourcePath)
        context = translationContext(oldSnapshot, null, `Cumulative baseline diff:\n${patch}${actualPatch ? `\nEvent commit diff:\n${actualPatch}` : ''}`, patch)
      } else excludedBaseline = true
    }
    if (!prior && translated?.missing && !context && baselineSha && !baselinePaths.has(sourcePath)) {
      const patch = eventDiff(root, baselineSha, selectedAfter, sourcePath)
      context = translationContext('---\n---\n', null, `Event commit diff:\n${patch}`, patch)
    }
    if (!prior && translated?.missing) translated = null
    if (!prior && !translated) translated = await translateDocument({
      source: source.canonical,
      filename: sourcePath,
      sourceLang: source.sourceLang,
      targetLang,
      cacheRoot: cacheRoot(root),
      live: actualLive,
      env,
      fetchImpl,
      context: excludedBaseline ? undefined : context,
    })
    const cachedOnly = !actualLive
    if (translated.missing) {
      throw new Error(cachedOnly
        ? `Translation cache is missing for ${sourcePath}; bootstrap cannot make live requests without a baseline`
        : `No cached translation for changed article ${sourcePath}; live translation is required`)
    }
    if (translated.skipped) continue
    const retainedFields = retainUnchangedTranslatedFields(translated.translated.fields, source.canonical, contextBaseline, prior ? readTarget(prior.targetPath) : null)
    const data = { ...translated.document.data, ...retainedFields, lang: targetLang }
    const priorTarget = prior ? readTarget(prior.targetPath) : null
    const unchangedBody = contextBaseline && matter(contextBaseline).content === matter(source.canonical).content
    const body = priorTarget && unchangedBody ? matter(priorTarget.toString('utf8')).content : translated.translated.markdown
    const output = serializeDocument(data, body)
    pendingWrites.set(targetPath, output)
    if (renamedFrom && prior) {
      const oldTarget = readTarget(prior.targetPath)
      if (oldTarget && prior.targetPath !== targetPath) pendingDeletes.add(prior.targetPath)
    }
    nextEntries[sourcePath] = {
      targetPath,
      sourceHash: source.rawHash,
      targetHash: sha256(output),
      sourceSnapshot: source.canonical,
      sourceLang: source.sourceLang,
      targetLang,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
    }
  }

  for (const [sourcePath, entry] of Object.entries(state.entries)) {
    if (current.has(sourcePath) || Object.hasOwn(nextEntries, sourcePath)) continue
    const target = readTarget(entry.targetPath)
    if (target) pendingDeletes.add(entry.targetPath)
  }
  for (const deleted of pendingDeletes) pendingWrites.delete(deleted)

  const nextState = stateFileContent({ version: 1, entries: nextEntries })
  const oldState = afterPaths.has(STATE_PATH) ? gitShow(root, selectedAfter, STATE_PATH, true) : null
  const stateChanged = !oldState || oldState.toString('utf8') !== nextState
  const changedPaths = []
  const writes = new Map(pendingWrites)
  if (stateChanged) writes.set(STATE_PATH, nextState)
  for (const [relative, contents] of writes) {
    const absolute = path.join(root, relative)
    await mkdir(path.dirname(absolute), { recursive: true })
    const temp = `${absolute}.${process.pid}.tmp`
    await writeFile(temp, contents, 'utf8')
    await rename(temp, absolute)
    changedPaths.push(relative)
  }
  for (const relative of pendingDeletes) {
    await rm(path.join(root, relative), { force: true })
    changedPaths.push(relative)
  }
  return { changedPaths: [...new Set(changedPaths)].sort(), statePath: STATE_PATH }
}

function parseArguments(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === '--live') { args.live = true; continue }
    if (key === '--before' || key === '--after') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${key} requires a commit SHA`)
      args[key.slice(2) + 'Sha'] = value
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${key}`)
  }
  return args
}

async function runCli() {
  const args = parseArguments(process.argv.slice(2))
  const result = await writebackTranslations({ cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), ...args })
  if (process.env.GITHUB_OUTPUT) {
    const output = `changed_paths<<EOF\n${result.changedPaths.join('\n')}\nEOF\nchanged_paths_json=${JSON.stringify(result.changedPaths)}\n`
    await writeFile(process.env.GITHUB_OUTPUT, output, { flag: 'a' })
  }
  console.log(`Updated ${result.changedPaths.length} translation-owned paths.`)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
