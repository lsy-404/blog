import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import MarkdownIt from 'markdown-it'

export const MODEL = 'claude-sonnet-5-5'
export const PROMPT_VERSION = 'markdown-v1'
const FLAG_NAMES = new Set(['is_draft', 'is_translate'])

export function assertLiveTranslationAllowed(argv = process.argv, env = process.env) {
  const requested = argv.includes('--live') || Boolean(env.CF_ACCOUNT_ID && env.CF_AIG_GATEWAY_ID && env.CF_AIG_TOKEN)
  if (requested && env.GITHUB_ACTIONS !== 'true') {
    throw new Error('Live translation is only permitted in GitHub Actions')
  }
  return requested
}

export function parseDocument(source, filename = '<document>') {
  const parsed = matter(source)
  const flags = new Map()
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!FLAG_NAMES.has(key.toLowerCase())) continue
    const normalizedKey = key.toLowerCase()
    if (flags.has(normalizedKey)) throw new Error(`${filename}: duplicate ${normalizedKey} flags are ambiguous`)
    flags.set(normalizedKey, value)
  }
  for (const [key, value] of flags) {
    if (typeof value !== 'boolean') throw new Error(`${filename}: ${key} must be a YAML boolean`)
  }
  const rawMetadata = Object.entries(parsed.data)
  const protectedKeys = ['private', 'encrypted', 'password', 'encrypt']
  const protectedValues = new Map()
  for (const [key, value] of rawMetadata) {
    const normalizedKey = key.toLowerCase().replace(/^is_/, '')
    if (!protectedKeys.includes(normalizedKey)) continue
    if (protectedValues.has(normalizedKey)) throw new Error(`${filename}: duplicate ${normalizedKey} metadata is ambiguous`)
    protectedValues.set(normalizedKey, value)
  }
  for (const key of ['private', 'encrypted', 'encrypt']) {
    const value = protectedValues.get(key)
    if (value !== undefined && typeof value !== 'boolean') throw new Error(`${filename}: ${key} must be a YAML boolean`)
  }
  const normalized = Object.fromEntries(rawMetadata
    .filter(([key]) => !/^is_/i.test(key) && !['section', 'blogsection'].includes(key.toLowerCase())))
  const draft = flags.get('is_draft') ?? false
  const enabled = flags.get('is_translate') ?? true
  const password = protectedValues.get('password')
  const hasPassword = password !== undefined && password !== null && password !== ''
  const protectedDocument = ['private', 'encrypted', 'encrypt'].some((key) => protectedValues.get(key) === true) || hasPassword
  return { data: normalized, content: parsed.content, draft, enabled: enabled && !protectedDocument, protectedDocument }
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

function protectMarkdown(markdown) {
  const values = []
  const protect = (value) => {
    const token = `⟦KEEP_${values.length}⟧`
    values.push([token, value])
    return token
  }
  const lines = markdown.split(/(?<=\n)/)
  const offsets = [0]
  for (const line of lines) offsets.push(offsets.at(-1) + line.length)
  const tokens = new MarkdownIt().parse(markdown, {})
    .filter((token) => ['fence', 'code_block'].includes(token.type) && token.map)
    .map((token) => [offsets[token.map[0]], offsets[token.map[1]]])
    .sort(([startA], [startB]) => startA - startB)
  let fenced = markdown
  for (const [start, end] of tokens.toReversed()) {
    fenced = `${fenced.slice(0, start)}${protect(markdown.slice(start, end))}${fenced.slice(end)}`
  }
  const protectedText = fenced
    .replace(/(`+)([\s\S]*?)\1/g, protect)
    .replace(/<!--([\s\S]*?)-->|<\/?[A-Za-z][^>]*?>/g, protect)
    .replace(/\]\((?:<[^>]*>|(?:\\.|[^)])*)\)/g, protect)
    .replace(/https?:\/\/[^\s<>)}\]]+/g, protect)
    .replace(/^ {0,3}\[[^\]]+\]:\s+.+$/gm, protect)
  values.sort(([left], [right]) => protectedText.indexOf(left) - protectedText.indexOf(right))
  return { text: protectedText, values }
}

function restoreMarkdown(markdown, values) {
  let output = markdown
  let previousIndex = -1
  for (const [token] of values) {
    if (output.split(token).length - 1 !== 1) throw new Error(`Translation did not preserve protected Markdown token ${token}`)
    const currentIndex = output.indexOf(token)
    if (currentIndex <= previousIndex) throw new Error('Translation changed protected Markdown token order')
    previousIndex = currentIndex
  }
  for (const [token, original] of values) {
    output = output.replace(token, original)
  }
  if (/⟦KEEP_/i.test(output)) throw new Error('Translation introduced an unknown protected Markdown token')
  return output
}

function translationPayload(document, sourceLang, targetLang) {
  const fields = {}
  for (const key of ['title', 'description', 'excerpt']) {
    if (typeof document.data[key] === 'string') fields[key] = document.data[key]
  }
  const markdown = protectMarkdown(document.content)
  return { fields, markdown, sourceLang, targetLang }
}

export function validateTranslationShape(original, translated) {
  if (!translated || typeof translated !== 'object' || typeof translated.markdown !== 'string') {
    throw new Error('Translation response must contain a Markdown string')
  }
  const expectedFields = Object.keys(original.fields).sort()
  if (!translated.fields || typeof translated.fields !== 'object' || Array.isArray(translated.fields)) {
    throw new Error('Translation response must contain a fields object')
  }
  if (Object.keys(translated.fields).sort().join('\0') !== expectedFields.join('\0')) {
    throw new Error('Translation response contains missing or unexpected frontmatter fields')
  }
  const hasProse = original.markdown.text.replace(/⟦KEEP_\d+⟧/g, '').trim().length > 0
  if (hasProse && !translated.markdown.trim()) throw new Error('Translation response omitted Markdown prose')
  for (const key of Object.keys(original.fields)) {
    if (typeof translated.fields?.[key] !== 'string' || !translated.fields[key].trim()) {
      throw new Error(`Translation response is missing the ${key} string`)
    }
  }
  for (const field of Object.keys(original.fields)) {
    if (/<(?:think|analysis)>/i.test(translated.fields[field])) throw new Error('Translation response contains an unfinished reasoning tag')
  }
  if (/<(?:think|analysis)>/i.test(translated.markdown)) throw new Error('Translation response contains an unfinished reasoning tag')
  return translated
}

export async function requestTranslation(payload, env = process.env, fetchImpl = fetch) {
  const { CF_ACCOUNT_ID, CF_AIG_GATEWAY_ID, CF_AIG_TOKEN } = env
  if (!CF_ACCOUNT_ID || !CF_AIG_GATEWAY_ID || !CF_AIG_TOKEN) {
    throw new Error('Set CF_ACCOUNT_ID, CF_AIG_GATEWAY_ID, and CF_AIG_TOKEN for live translations')
  }
  const endpoint = `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(CF_ACCOUNT_ID)}/${encodeURIComponent(CF_AIG_GATEWAY_ID)}/anthropic/v1/messages`
  const system = `Translate the supplied Markdown document from ${payload.sourceLang} to ${payload.targetLang}. Translate every ordinary prose and title/description/excerpt string. Preserve Markdown, code, URLs, image paths, inline code, HTML/Vue component tags, and every ⟦KEEP_...⟧ token exactly and in order. Return only a JSON object: {"fields":{"title":"...","description":"...","excerpt":"..."},"markdown":"..."}. Include only the supplied fields. Do not add, omit, summarize, or invent content.`
  const contextInstruction = payload.context
    ? ' Use the previous source, previous translation, and source diff in the user message to keep terminology and unchanged passages consistent. Translate the current document only; retain unchanged translated passages wherever they still correspond to unchanged source.'
    : ''
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'cf-aig-authorization': `Bearer ${CF_AIG_TOKEN}`,
      'cf-aig-no-wholesale': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 12000,
      system: `${system}${contextInstruction}`,
      messages: [{ role: 'user', content: JSON.stringify({ fields: payload.fields, markdown: payload.markdown.text, ...(payload.context ? { context: Object.fromEntries(Object.entries(payload.context).filter(([key]) => key !== 'cacheKey')) } : {}) }) }],
    }),
  })
  if (!response.ok) throw new Error(`Cloudflare AI Gateway returned HTTP ${response.status}`)
  const envelope = await response.json()
  if (envelope.stop_reason !== 'end_turn') throw new Error(`Translation response stopped unexpectedly (${envelope.stop_reason ?? 'unknown'})`)
  const text = envelope.content?.filter((part) => part.type === 'text').map((part) => part.text).join('')
  if (!text) throw new Error('Cloudflare AI Gateway returned no translation text')
  let result
  try { result = JSON.parse(text) } catch { throw new Error('Cloudflare AI Gateway returned malformed translation JSON') }
  const checked = validateTranslationShape(payload, result)
  return { fields: checked.fields, markdown: checked.markdown }
}

function buildKey(payload) {
  return hash(JSON.stringify({
    model: MODEL,
    prompt: PROMPT_VERSION,
    sourceLang: payload.sourceLang,
    targetLang: payload.targetLang,
    fields: payload.fields,
    markdown: payload.markdown.text,
    protected: payload.markdown.values.map(([, value]) => value),
    ...(payload.context?.previousTranslation ? { context: payload.context.cacheKey ?? payload.context } : {}),
  }))
}

async function readCache(cacheRoot, key) {
  try { return JSON.parse(await readFile(path.join(cacheRoot, `${key}.json`), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

async function writeCache(cacheRoot, key, value) {
  await mkdir(cacheRoot, { recursive: true })
  const filename = path.join(cacheRoot, `${key}.json`)
  const temp = `${filename}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  const { rename } = await import('node:fs/promises')
  await rename(temp, filename)
}

export async function translateDocument({ source, filename, sourceLang, targetLang, cacheRoot, live = false, env, fetchImpl, context }) {
  const document = parseDocument(source, filename)
  if (document.draft || !document.enabled) return { skipped: true, document }
  if (!['zh-CN', 'en-US'].includes(sourceLang) || !['zh-CN', 'en-US'].includes(targetLang) || sourceLang === targetLang) throw new Error(`${filename}: unsupported translation direction`)
  const payload = translationPayload(document, sourceLang, targetLang)
  if (context) payload.context = context
  const key = buildKey(payload)
  const cached = await readCache(cacheRoot, key)
  if (cached) {
    const checked = validateTranslationShape(payload, cached)
    if (/<(?:think|analysis)>/i.test(checked.markdown)) throw new Error('Translation cache contains invalid output')
    return { skipped: false, document, translated: { fields: checked.fields, markdown: restoreMarkdown(checked.markdown, payload.markdown.values) }, cacheHit: true }
  }
  if (!live) return { skipped: false, document, missing: true, key }
  const translated = await requestTranslation(payload, env, fetchImpl)
  const restoredMarkdown = restoreMarkdown(translated.markdown, payload.markdown.values)
  await writeCache(cacheRoot, key, translated)
  return { skipped: false, document, translated: { ...translated, markdown: restoredMarkdown }, cacheHit: false, key }
}

export function serializeDocument(data, content) {
  return matter.stringify(content, data, { language: 'yaml' })
}
