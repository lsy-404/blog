import path from 'node:path'
import { cp, mkdir, stat } from 'node:fs/promises'
import MarkdownIt from 'markdown-it'

const markdownParser = new MarkdownIt()
const assetExtension = /\.(?:avif|bmp|csv|docx?|gif|ico|jpe?g|m4a|m4v|mov|mp3|mp4|ogg|pdf|png|pptx?|rar|svg|tar|txt|wav|webm|webp|woff2?|xlsx?|zip)$/i

const hash = (value) => Buffer.from(value).toString('base64url')

function maskCode(markdown) {
  const values = []
  const put = (value) => {
    const token = `⟦CODE_${values.length}_${hash(value)}⟧`
    values.push([token, value])
    return token
  }
  const lines = markdown.split(/(?<=\n)/)
  const offsets = [0]
  for (const line of lines) offsets.push(offsets.at(-1) + line.length)
  const blocks = markdownParser.parse(markdown, {}).filter((token) => ['fence', 'code_block'].includes(token.type) && token.map)
    .map((token) => [offsets[token.map[0]], offsets[token.map[1]]])
  let text = markdown
  for (const [start, end] of blocks.toReversed()) text = `${text.slice(0, start)}${put(markdown.slice(start, end))}${text.slice(end)}`
  text = text.replace(/(`+)([\s\S]*?)\1/g, put).replace(/<!--([\s\S]*?)-->/g, put)
  return { text, values }
}

function mapTarget(raw, sourceFile, routeMap) {
  const wrapped = raw.startsWith('<') && raw.endsWith('>')
  const value = wrapped ? raw.slice(1, -1) : raw
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(value)) return raw
  const suffixAt = value.search(/[?#]/)
  const pathname = suffixAt < 0 ? value : value.slice(0, suffixAt)
  const suffix = suffixAt < 0 ? '' : value.slice(suffixAt)
  if (!assetExtension.test(pathname)) return raw
  let decodedPath
  try { decodedPath = decodeURIComponent(pathname) } catch { throw new Error(`Invalid encoded local asset path: ${value}`) }
  if (decodedPath.startsWith('/')) {
    const english = decodedPath.startsWith('/en/')
    const assetPath = english ? decodedPath.slice(4) : decodedPath.slice(1)
    const mapped = routeMap[assetPath]
    if (!mapped) return raw
    const destination = english ? `/en/${mapped}` : `/${mapped}`
    const target = `${destination}${suffix}`
    return wrapped ? `<${target}>` : target
  }
  const source = sourceFile.replaceAll('\\', '/')
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), decodedPath))
  if (resolved === '..' || resolved.startsWith('../')) throw new Error(`Relative asset escapes the content root: ${sourceFile} -> ${value}`)
  const mapKey = resolved.startsWith('en/') ? resolved.slice(3) : resolved
  const mapped = routeMap[mapKey] && resolved.startsWith('en/') ? `en/${routeMap[mapKey]}` : routeMap[resolved] ?? resolved
  const absolute = `/${mapped}${suffix}`
  return wrapped ? `<${absolute}>` : absolute
}

export function rewriteRelativeAssets(markdown, sourceFile, routeMap = {}) {
  const masked = maskCode(markdown)
  let output = masked.text
    .replace(/(!?\[[^\]]*\]\()(<[^>]+>|(?:\\.|[^)\s])+)/g, (whole, prefix, target) => prefix + mapTarget(target, sourceFile, routeMap))
    .replace(/^( {0,3}\[[^\]]+\]:\s*)(<[^>]+>|(?:\\.|[^\s])+)/gm, (whole, prefix, target) => prefix + mapTarget(target, sourceFile, routeMap))
    .replace(/\b(src|href)=("([^"]*)"|'([^']*)')/gi, (whole, name, quoted, doubleValue, singleValue) => {
      const value = doubleValue ?? singleValue
      const quote = quoted[0]
      const mapped = mapTarget(value, sourceFile, routeMap)
      return `${name}=${quote}${mapped}${quote}`
    })
  for (const [token, value] of masked.values) output = output.replace(token, value)
  return output
}

function addLocalAssetPath(paths, value) {
  const target = value.trim().replace(/^<|>$/g, '')
  if (!target || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) return
  const pathname = target.split(/[?#]/, 1)[0]
  if (assetExtension.test(pathname)) paths.add(pathname.replace(/^\/+/, ''))
}

export function collectLocalAssetPaths(source) {
  const paths = new Set()
  const add = (value) => addLocalAssetPath(paths, value)
  const collect = (tokens) => {
    for (const token of tokens) {
      for (const [name, value] of token.attrs ?? []) {
        if (!['src', 'href'].includes(name)) continue
        add(value)
      }
      if (token.type === 'html_inline' || token.type === 'html_block') {
        const html = token.content.replace(/<!--[\s\S]*?-->/g, '')
        for (const match of html.matchAll(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi)) {
          add(match[2])
        }
      }
      if (token.type === 'text') {
        const text = token.content.replace(/<!--[\s\S]*?-->/g, '')
        for (const tag of text.matchAll(/<[^>]+>/g)) {
          for (const match of tag[0].matchAll(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi)) add(match[2])
        }
      }
      if (token.children) collect(token.children)
    }
  }
  collect(markdownParser.parse(source, {}))
  return [...paths]
}

export function collectPublishedAssetPaths(sourceDocs, rewrittenContent) {
  const paths = new Set()
  for (const [relative, doc] of sourceDocs) {
    if (doc.draft || doc.protectedDocument) continue
    for (const assetPath of collectLocalAssetPaths(rewrittenContent.get(relative) ?? doc.content)) paths.add(assetPath)
    if (typeof doc.data?.cover === 'string') addLocalAssetPath(paths, doc.data.cover)
  }
  return paths
}

export async function copyReferencedAssets(assetPaths, { contentRoot, publicRoot, routeMap = {} }) {
  for (const publicPath of assetPaths) {
    let decoded
    try { decoded = decodeURIComponent(publicPath) } catch { throw new Error(`Invalid encoded local asset path: ${publicPath}`) }
    const normalized = path.posix.normalize(decoded).replaceAll('\\', '/')
    if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
      throw new Error(`Invalid local asset path: ${publicPath}`)
    }
    const isEnglish = normalized.startsWith('en/')
    const localizedPath = isEnglish ? normalized.slice(3) : normalized
    const originalPath = Object.entries(routeMap).find(([, destination]) => destination === localizedPath)?.[0]
    const sourceCandidates = [
      originalPath && (isEnglish ? `en/${originalPath}` : originalPath),
      isEnglish ? `en/${localizedPath}` : localizedPath,
    ].filter(Boolean)
    const targetPath = path.join(publicRoot, normalized)
    let sourcePath
    for (const candidate of sourceCandidates) {
      const candidatePath = path.join(contentRoot, candidate)
      try {
        if ((await stat(candidatePath)).isFile()) { sourcePath = candidatePath; break }
      } catch {}
    }
    if (!sourcePath) {
      const existingPublicAsset = path.join(contentRoot, '.vuepress', 'public', normalized)
      try { if ((await stat(existingPublicAsset)).isFile()) continue } catch {}
      throw new Error(`Referenced local asset does not exist: ${sourceCandidates.at(-1) ?? normalized}`)
    }
    await mkdir(path.dirname(targetPath), { recursive: true })
    await cp(sourcePath, targetPath)
  }
}
