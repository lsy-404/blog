import { existsSync, readFileSync } from 'node:fs'
import { imageSize } from 'image-size'

const SITE = 'https://leisiyu.dev'

const listDescriptions = {
  'zh-CN': {
    article: '全部文章列表，按发布时间排序。',
    star: '收藏的文章。',
    timeline: '按年份排列的文章时间线。',
    category: '文章分类列表。',
    tag: '文章标签列表。',
    categoryItem: (name) => `「${name}」分类下的文章。`,
    tagItem: (name) => `带有「${name}」标签的文章。`,
  },
  'en-US': {
    article: 'All articles, newest first.',
    star: 'Starred articles.',
    timeline: 'Articles arranged by year.',
    category: 'List of article categories.',
    tag: 'List of article tags.',
    categoryItem: (name) => `Articles in the “${name}” category.`,
    tagItem: (name) => `Articles tagged “${name}”.`,
  },
}

const isHome = (page) => page.frontmatter.home === true

function listDescription(page) {
  const blog = page.frontmatter.blog
  if (!blog || page.frontmatter.description) return null
  const text = listDescriptions[page.lang] ?? listDescriptions['en-US']
  if (blog.type === 'category') {
    if (blog.key === 'category') return blog.name ? text.categoryItem(blog.name) : text.category
    if (blog.key === 'tag') return blog.name ? text.tagItem(blog.name) : text.tag
  }
  if (blog.type === 'type' && text[blog.key]) return text[blog.key]
  return null
}

function ancestors(page, app) {
  const base = page.pathLocale
  const parts = page.path.slice(base.length).split('/').filter(Boolean)
  const trail = [{ path: base }]
  let current = base
  parts.forEach((part, index) => {
    current += index === parts.length - 1 && !page.path.endsWith('/') ? part : `${part}/`
    trail.push({ path: current })
  })
  return trail.map(({ path }) => {
    const found = app.pages.find((item) => item.path === path)
    return found ? { name: found.frontmatter.shortTitle || found.title, url: `${SITE}${path}` } : null
  }).filter(Boolean)
}

const isPost = (page) => /^(\/en)?\/(t|d|f)\/[^/]+\.html$/.test(page.path) && page.frontmatter.date

export function articleJsonLd(jsonLd, page, app) {
  const url = `${SITE}${page.path}`
  if (isHome(page)) {
    const name = app.siteData.locales[page.pathLocale]?.title ?? app.siteData.title
    return { '@context': 'https://schema.org', '@type': 'WebSite', name, url, inLanguage: page.lang }
  }
  if (jsonLd['@type'] !== 'Article') return jsonLd
  if (!isPost(page)) return { '@context': 'https://schema.org', '@type': 'WebPage', name: page.title, description: page.frontmatter.description, inLanguage: page.lang }
  return {
    ...jsonLd,
    '@type': 'BlogPosting',
    description: page.frontmatter.description,
    dateModified: jsonLd.dateModified ?? jsonLd.datePublished,
    inLanguage: page.lang,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

export function breadcrumbHead(head, page, app) {
  if (isHome(page)) return
  const items = ancestors(page, app)
  if (items.length < 2) return
  head.unshift(['script', { type: 'application/ld+json' }, JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })),
  })])
}

function sizeOf(app, src) {
  const decoded = decodeURI(src.split(/[?#]/)[0])
  const file = [app.dir.source(decoded.slice(1)), app.dir.public(decoded.slice(1))].find(existsSync)
  if (!file) return null
  try { return imageSize(readFileSync(file)) } catch { return null }
}

function imageAttributes(md, app) {
  md.core.ruler.push('seo_images', (state) => {
    const title = state.env.frontmatter?.title
    const images = []
    for (const block of state.tokens) {
      for (const token of block.children ?? []) if (token.type === 'image') images.push(token)
    }
    images.forEach((token, index) => {
      const src = token.attrGet('src') ?? ''
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(src)) return
      if (!token.content && title) {
        const alt = images.length > 1 ? `${title} (${index + 1}/${images.length})` : title
        const text = new state.Token('text', '', 0)
        text.content = alt
        token.children = [text]
        token.content = alt
      }
      token.attrSet('loading', 'lazy')
      token.attrSet('decoding', 'async')
      const size = src.startsWith('/') ? sizeOf(app, src) : null
      if (size?.width && size.height) {
        token.attrSet('width', String(size.width))
        token.attrSet('height', String(size.height))
      }
    })
  })
}

export const seoPlugin = () => ({
  name: 'site-seo',
  extendsPage: (page) => {
    const description = listDescription(page)
    if (description) page.frontmatter.description = description
  },
  onInitialized: (app) => {
    for (const page of app.pages) {
      if (!page.frontmatter.description && !isHome(page) && page.title) {
        const section = app.pages.find((item) => item.path === page.path.replace(/[^/]*$/, ''))?.title
        page.frontmatter.description = section && section !== page.title ? `${section}: ${page.title}` : page.title
      }
      const description = page.frontmatter.description
      if (typeof description === 'string' && description.length > 160) page.frontmatter.description = `${description.slice(0, 157)}...`
    }
  },
  extendsMarkdown: (md, app) => imageAttributes(md, app),
})
