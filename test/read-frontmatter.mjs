import { readFile } from 'node:fs/promises'
import matter from 'gray-matter'

const files = JSON.parse(await new Promise((resolve, reject) => {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => { input += chunk })
  process.stdin.on('end', () => resolve(input))
  process.stdin.on('error', reject)
}))

const entries = await Promise.all(files.map(async ({ id, path }) => {
  const source = await readFile(path, 'utf8')
  return [id, matter(source).data]
}))
process.stdout.write(JSON.stringify(Object.fromEntries(entries)))
