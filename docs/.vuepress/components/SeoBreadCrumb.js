import { defineComponent, h } from 'vue'
import { RouteLink, resolveRoute } from 'vuepress/client'
import { useData } from '@theme-hope/composables/useData'
import { getAncestorLinks } from '@theme-hope/utils/getAncestorLinks'
import 'vuepress-theme-hope/styles/base/breadcrumb.scss'

export default defineComponent({
  name: 'BreadCrumb',
  setup() {
    const { frontmatter, page, routeLocale } = useData()
    return () => {
      const items = getAncestorLinks(page.value.path, routeLocale.value)
        .map(({ link, name }) => {
          const { path, meta, notFound } = resolveRoute(link)
          return notFound || meta.breadcrumbExclude ? null : { path, title: meta.shortTitle || meta.title || name }
        })
        .filter(Boolean)
      if (frontmatter.value.breadcrumb === false || items.length < 2) return h('nav', { class: 'vp-breadcrumb disable' })
      return h('nav', { class: 'vp-breadcrumb', 'aria-label': 'Breadcrumb' }, h('ol', items.map((item, index) =>
        h('li', { class: { 'is-active': index === items.length - 1 } }, h(RouteLink, { to: item.path }, () => item.title)),
      )))
    }
  },
})
