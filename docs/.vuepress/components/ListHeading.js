import { defineComponent, h } from 'vue'
import { usePageData } from 'vuepress/client'
import BreadCrumb from '@theme-hope/components/base/BreadCrumb'

export default defineComponent({
  name: 'ListHeading',
  setup() {
    const page = usePageData()
    return () => h('div', { class: 'vp-list-heading' }, [
      h(BreadCrumb),
      h('h1', { class: 'vp-list-heading-title' }, page.value.title),
    ])
  },
})
