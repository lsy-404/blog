import { defineComponent, h } from 'vue'
import { useFrontmatter } from 'vuepress/client'
import { Blog } from 'vuepress-theme-hope/blog'
import ListHeading from '../components/ListHeading.js'

export default defineComponent({
  name: 'Blog',
  setup(_props, { slots }) {
    const frontmatter = useFrontmatter()
    return () => h(Blog, null, frontmatter.value.blog
      ? { ...slots, articlesBefore: () => [h(ListHeading), slots.articlesBefore?.()] }
      : slots)
  },
})
