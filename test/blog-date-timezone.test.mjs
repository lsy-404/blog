import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const formatterUrl = pathToFileURL(fileURLToPath(new URL('../docs/.vuepress/utils/blog-date.mjs', import.meta.url))).href
const source = `
  import { formatBlogDate, getBlogYear } from ${JSON.stringify(formatterUrl)};
  const date = new Date("2026-07-05T00:00:00.000Z");
  console.log(JSON.stringify({
    date: formatBlogDate(date, "en-US", { month: "numeric", day: "numeric" }),
    year: getBlogYear(date),
    localDay: date.getDate(),
    iso: date.toISOString(),
  }));
`

function formatInTimezone(timezone) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, TZ: timezone },
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

test('calendar dates stay on their authored day across timezones without changing ISO metadata', () => {
  const toronto = formatInTimezone('America/Toronto')
  const kiritimati = formatInTimezone('Pacific/Kiritimati')

  assert.equal(toronto.localDay, 4)
  assert.equal(kiritimati.localDay, 5)
  for (const result of [toronto, kiritimati]) {
    assert.equal(result.date, '7/5')
    assert.equal(result.year, 2026)
    assert.equal(result.iso, '2026-07-05T00:00:00.000Z')
  }
})
