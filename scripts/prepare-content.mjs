import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDocument, serializeDocument } from './translation.mjs'
import { collectPublishedAssetPaths, copyReferencedAssets, rewriteRelativeAssets } from './content-assets.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docs = path.join(root, 'docs')
const prepared = path.join(root, '.prepared')
const strict = process.argv.includes('--strict')
const sectionNames = { t: 'technology', d: 'daily', f: 'fandom' }

const cleanFlag = (data) => Object.fromEntries(Object.entries(data).filter(([key]) => !/^is_/i.test(key) && !['section', 'blogsection'].includes(key.toLowerCase())))
const hidden = (relative) => relative.split(/[\\/]/).some((part) => part.startsWith('.') || part.startsWith('_'))
const isMarkdown = (name) => name.toLowerCase().endsWith('.md')
const routeFor = (relative) => {
  let normalized = relative.replaceAll('\\', '/')
  if (normalized.startsWith('en/')) normalized = normalized.slice(3)
  if (routeMap[normalized]) normalized = routeMap[normalized]
  const langPrefix = relative.replaceAll('\\', '/').startsWith('en/') ? '/en' : ''
  return path.posix.basename(normalized).toLowerCase() === 'readme.md'
    ? `${langPrefix}${path.posix.dirname(normalized) === '.' ? '' : `/${path.posix.dirname(normalized)}`}/`
    : `${langPrefix}/${normalized.replace(/\.md$/i, '.html')}`
}

async function walk(dir, parent = '') {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = path.posix.join(parent, entry.name)
    if (relative === '.vuepress/.translated' || relative.startsWith('.vuepress/.translated/') || relative === '.vuepress/.temp' || relative.startsWith('.vuepress/.temp/') || relative.startsWith('.vuepress/dist/')) continue
    if (entry.isDirectory()) {
      if ((entry.name.startsWith('.') && entry.name !== '.vuepress') || entry.name.startsWith('_') || entry.name === 'node_modules') continue
      out.push(...await walk(path.join(dir, entry.name), relative))
    } else if (entry.isFile()) out.push({ relative, filename: path.join(dir, entry.name) })
  }
  return out
}

const routesPath = path.join(docs, '.vuepress', 'content-routes.json')
let routeMap = {}
try { routeMap = JSON.parse(await readFile(routesPath, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
const rewriteModule = await import('./content-routing.mjs')
const rewriteInternalLinks = rewriteModule.rewriteInternalLinks
if (typeof rewriteInternalLinks !== 'function') throw new Error('content-routing.mjs must export rewriteInternalLinks')
const rewrittenContent = new Map()

const files = await walk(docs)
const sources = new Map()
const published = new Map()
const sourceDocs = new Map()
for (const file of files.filter((item) => isMarkdown(item.relative) && !item.relative.startsWith('.vuepress/'))) {
  const source = await readFile(file.filename, 'utf8')
  const parsed = parseDocument(source, file.relative)
  sourceDocs.set(file.relative, { ...file, source, ...parsed })
  if (parsed.draft) continue
  const withAbsoluteAssets = rewriteRelativeAssets(parsed.content, file.relative, routeMap)
  rewrittenContent.set(file.relative, rewriteInternalLinks(withAbsoluteAssets, routeMap, file.relative))
  const lang = parsed.data.lang ?? (file.relative.startsWith('en/') ? 'en-US' : undefined)
  if (lang && !['zh-CN', 'en-US'].includes(lang)) throw new Error(`${file.relative}: lang must be zh-CN or en-US`)
  const section = file.relative.replace(/^en\//, '').split('/')[0]
  if (strict && ['t', 'd', 'f'].includes(section) && !lang) throw new Error(`${file.relative}: lang must be set to zh-CN or en-US`)
  if (lang && lang !== (file.relative.startsWith('en/') ? 'en-US' : 'zh-CN')) {
    throw new Error(`${file.relative}: ${lang} pages must use ${lang === 'en-US' ? 'en/' : 'the root'} source paths`)
  }
  if (!lang || hidden(file.relative)) continue
  const value = { ...file, source, ...parsed, lang }
  published.set(file.relative, value)
  if (parsed.enabled) sources.set(file.relative, value)
}

const logicalPath = (relative) => {
  const unprefixed = relative.startsWith('en/') ? relative.slice(3) : relative
  return routeMap[unprefixed] ?? unprefixed
}
const byLogical = new Map()
for (const [relative, doc] of published) {
  const key = logicalPath(relative)
  const group = byLogical.get(key) ?? new Map()
  if (group.has(doc.lang)) throw new Error(`More than one ${doc.lang} source maps to ${key}`)
  group.set(doc.lang, { relative, doc })
  byLogical.set(key, group)
}

const pairs = new Map()
const missing = []
for (const [logical, group] of byLogical) {
  const zh = group.get('zh-CN')
  const en = group.get('en-US')
  if (zh && en) {
    pairs.set(zh.relative, en.relative)
    pairs.set(en.relative, zh.relative)
    continue
  }
  const source = zh ?? en
  if (!source) continue
  if (!sources.has(source.relative)) continue
  missing.push(source.relative)
}

if (strict && missing.length) throw new Error(`Missing committed translation counterparts for: ${missing.join(', ')}`)

await rm(prepared, { recursive: true, force: true })
await mkdir(prepared, { recursive: true })
const stagedRoutes = new Set()
for (const file of files) {
  if (file.relative.split('/').some((part) => part.startsWith('.') && part !== '.vuepress' || part.startsWith('_'))) continue
  if (file.relative === '.vuepress/translation-state.json') continue
  if (file.relative.startsWith('.vuepress/public/')) {
    const destination = path.join(prepared, file.relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await cp(file.filename, destination)
    continue
  }
  if (isMarkdown(file.relative)) {
    const doc = sourceDocs.get(file.relative)
    if (!doc || doc.draft) continue
    const mapped = routeMap[file.relative.startsWith('en/') ? file.relative.slice(3) : file.relative]
    const targetRel = file.relative.startsWith('en/')
      ? `en/${mapped ?? file.relative.slice(3)}`
      : mapped ?? file.relative
    const routeKey = targetRel.toLowerCase()
    if (stagedRoutes.has(routeKey)) throw new Error(`Two source pages map to ${targetRel}`)
    stagedRoutes.add(routeKey)
    const cleaned = cleanFlag(doc.data)
    delete cleaned.icon
    const section = targetRel.replace(/^en\//, '').split('/')[0]
    if (['t', 'd', 'f'].includes(section) && targetRel.replace(/^en\//, '') === `${section}/README.md`) cleaned.index = false
    const rewritten = rewrittenContent.get(file.relative) ?? doc.content
    await mkdir(path.dirname(path.join(prepared, targetRel)), { recursive: true })
    await writeFile(path.join(prepared, targetRel), serializeDocument(cleaned, rewritten), 'utf8')
  } else {
    if (file.relative.startsWith('.vuepress/')) {
      const destination = path.join(prepared, file.relative)
      await mkdir(path.dirname(destination), { recursive: true })
      await cp(file.filename, destination)
    }
  }
}

const publicAssetPaths = collectPublishedAssetPaths(sourceDocs, rewrittenContent)
await copyReferencedAssets(publicAssetPaths, { contentRoot: docs, publicRoot: path.join(prepared, '.vuepress', 'public'), routeMap })

const manifest = { pages: {} }
for (const [relative, doc] of sourceDocs) {
  if (doc.draft) continue
  const language = doc.data.lang ?? (relative.startsWith('en/') ? 'en-US' : undefined)
  const logical = logicalPath(relative)
  const stagedRel = relative.startsWith('en/') ? `en/${logical}` : logical
  const counterpart = pairs.get(relative)
  const sectionPath = logical.split('/')[0]
  const pageData = {
    lang: language,
    blogSection: sectionNames[sectionPath],
    translationEnabled: doc.enabled && Boolean(language),
    translationPath: counterpart ? routeFor(counterpart) : null,
    translationSource: counterpart ? (language === 'zh-CN' ? 'en-US' : 'zh-CN') : null,
    translationDisabled: !counterpart,
  }
  manifest.pages[stagedRel] = pageData
}

const manifestDir = path.join(prepared, '.vuepress')
await mkdir(manifestDir, { recursive: true })
await writeFile(path.join(manifestDir, 'translation-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
if (typeof rewriteModule.createRedirects === 'function') {
  const routes = new Set()
  for (const file of files.filter((item) => isMarkdown(item.relative) && !item.relative.startsWith('.vuepress/'))) {
    const doc = sourceDocs.get(file.relative)
    if (!doc || doc.draft) continue
    const mapped = routeMap[file.relative.startsWith('en/') ? file.relative.slice(3) : file.relative]
    const stagedRel = file.relative.startsWith('en/') ? `en/${mapped ?? file.relative.slice(3)}` : mapped ?? file.relative
    routes.add(routeFor(stagedRel))
  }
  for (const file of files.filter((item) => item.relative.startsWith('.vuepress/public/'))) {
    routes.add(`/${file.relative.slice('.vuepress/public/'.length)}`)
  }
  for (const assetPath of publicAssetPaths) routes.add(`/${decodeURIComponent(assetPath)}`)
  const redirects = rewriteModule.createRedirects(routeMap, routes)
  if (redirects) {
    const publicDir = path.join(manifestDir, 'public')
    await mkdir(publicDir, { recursive: true })
    await writeFile(path.join(publicDir, '_redirects'), redirects, 'utf8')
  }
}
if (strict && missing.length) throw new Error(`Translation incomplete for: ${missing.join(', ')}`)
console.log(`Prepared ${Object.keys(manifest.pages).length} pages; missing committed translations ${missing.length}.`)
