import { readFile } from 'node:fs/promises'
import path from 'node:path'

export function translationPlugin() {
  return {
    name: 'blog-translation-data',
    async onInitialized(app) {
      const manifestPath = app.dir.source('.vuepress/translation-manifest.json')
      let pages
      try { pages = JSON.parse(await readFile(manifestPath, 'utf8')).pages }
      catch (error) { if (error.code === 'ENOENT') return; throw error }
      for (const page of app.pages) {
        if (!page.filePath) continue
        const relative = path.relative(app.dir.source(), page.filePath).replaceAll('\\', '/')
        const data = pages[relative]
        if (data) Object.assign(page.data, data)
        else page.data.translationDisabled = true
      }
    },
  }
}
