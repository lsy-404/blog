import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createNormalizedCommit, pushNormalizedCommit } from '../scripts/normalize-history.mjs'

const outputRoot = fileURLToPath(new URL('./output/', import.meta.url))
const scriptPath = fileURLToPath(new URL('../scripts/normalize-history.mjs', import.meta.url))
const ref = 'refs/heads/feature/history-test'
const botName = 'github-actions[bot]'
const botEmail = '41898282+github-actions[bot]@users.noreply.github.com'

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.error, undefined, result.error?.message)
  return result
}

function git(cwd, ...args) {
  const env = typeof args.at(-1) === 'object' ? args.pop() : {}
  const result = run('git', ['-c', 'commit.gpgsign=false', ...args], cwd, env)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

async function makeRemote(t, name = 'history-') {
  await mkdir(outputRoot, { recursive: true })
  const root = await mkdtemp(path.join(outputRoot, name))
  t.after(async () => {
    const outputPath = `${path.resolve(outputRoot)}${path.sep}`.toLowerCase()
    const rootPath = path.resolve(root).toLowerCase()
    assert.ok(rootPath.startsWith(outputPath), `temporary Git fixture escaped test/output: ${rootPath}`)
    await rm(root, { recursive: true, force: true })
  })

  const source = path.join(root, 'source')
  const remote = path.join(root, 'origin.git')
  const clone = path.join(root, 'checkout')
  git(root, 'init', '-b', 'main', source)
  git(source, 'config', 'user.name', 'Source Author')
  git(source, 'config', 'user.email', 'source@example.invalid')
  await writeFile(path.join(source, 'article.md'), 'first version\n')
  git(source, 'add', 'article.md')
  git(source, 'commit', '-m', 'first source commit', {
    GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
    GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
  })
  await writeFile(path.join(source, 'article.md'), 'second version\n')
  git(source, 'add', 'article.md')
  git(source, 'commit', '-m', 'second source commit', {
    GIT_AUTHOR_DATE: '2021-02-03T04:05:06Z',
    GIT_COMMITTER_DATE: '2021-02-03T04:05:06Z',
  })
  const oldSha = git(source, 'rev-parse', 'HEAD')
  const oldTree = git(source, 'rev-parse', `${oldSha}^{tree}`)
  git(root, 'clone', '--bare', source, remote)
  git(root, 'clone', remote, clone)
  git(clone, 'config', 'user.name', 'Fixture Author')
  git(clone, 'config', 'user.email', 'fixture@example.invalid')
  git(clone, 'checkout', '-b', 'feature/history-test')
  git(clone, 'push', '--set-upstream', 'origin', 'feature/history-test')

  return { root, source, remote, clone, oldSha, oldTree }
}

test('normalizes real Git history deterministically and preserves the source tree', async (t) => {
  const repo = await makeRemote(t)
  const initialHistory = git(repo.clone, 'rev-list', '--count', 'HEAD')
  assert.equal(initialHistory, '2')

  const normalized = await createNormalizedCommit({ cwd: repo.clone, expectedOldSha: repo.oldSha, ref })
  assert.equal(normalized.ref, ref)
  assert.equal(normalized.expectedOldSha, repo.oldSha)
  assert.equal(normalized.tree, repo.oldTree)
  assert.equal(git(repo.clone, 'rev-parse', `${normalized.candidateSha}^{tree}`), repo.oldTree)
  assert.equal(git(repo.clone, 'rev-list', '--count', normalized.candidateSha), '1')
  assert.equal(git(repo.clone, 'rev-list', '--parents', '-n', '1', normalized.candidateSha).split(' ').length, 1)

  const metadata = git(repo.clone, 'cat-file', '-p', normalized.candidateSha)
  const headers = metadata.split('\n\n', 1)[0].split('\n')
  assert.ok(headers.includes(`author ${botName} <${botEmail}> 0 +0000`))
  assert.ok(headers.includes(`committer ${botName} <${botEmail}> 0 +0000`))
  assert.equal(metadata.split('\n\n').slice(1).join('\n\n'), 'Update blog')

  git(repo.clone, 'checkout', '--detach', normalized.candidateSha)
  const again = await createNormalizedCommit({ cwd: repo.clone, expectedOldSha: normalized.candidateSha, ref })
  assert.equal(again.candidateSha, normalized.candidateSha)
  assert.equal(again.tree, repo.oldTree)
  assert.equal(git(repo.clone, 'rev-parse', 'HEAD'), normalized.candidateSha)
  assert.equal(git(repo.clone, 'status', '--porcelain'), '')
})

test('refuses dirty checkouts without changing their index, files, or branch', async (t) => {
  const repo = await makeRemote(t, 'history-dirty-')
  await writeFile(path.join(repo.clone, 'article.md'), 'staged user edit\n')
  git(repo.clone, 'add', 'article.md')
  await writeFile(path.join(repo.clone, 'article.md'), 'unstaged user edit\n')
  await writeFile(path.join(repo.clone, 'untracked.txt'), 'untracked user file\n')
  const headBefore = git(repo.clone, 'rev-parse', 'HEAD')
  const indexBefore = git(repo.clone, 'diff', '--cached', '--binary')
  const worktreeBefore = git(repo.clone, 'diff', '--binary')
  const statusBefore = git(repo.clone, 'status', '--porcelain=v1', '--untracked-files=all')

  await assert.rejects(
    createNormalizedCommit({ cwd: repo.clone, expectedOldSha: headBefore, ref }),
    /working tree must be clean/,
  )

  assert.equal(git(repo.clone, 'rev-parse', 'HEAD'), headBefore)
  assert.equal(git(repo.clone, 'diff', '--cached', '--binary'), indexBefore)
  assert.equal(git(repo.clone, 'diff', '--binary'), worktreeBefore)
  assert.equal(git(repo.clone, 'status', '--porcelain=v1', '--untracked-files=all'), statusBefore)
  assert.equal(await readFile(path.join(repo.clone, 'untracked.txt'), 'utf8'), 'untracked user file\n')
})

test('force-with-lease rejects a concurrent remote update and preserves its newer commit', async (t) => {
  const repo = await makeRemote(t, 'history-race-')
  const normalized = await createNormalizedCommit({ cwd: repo.clone, expectedOldSha: repo.oldSha, ref })
  const concurrent = path.join(repo.root, 'concurrent')
  git(repo.root, 'clone', repo.remote, concurrent)
  git(concurrent, 'checkout', '-b', 'feature/history-test', '--track', 'origin/feature/history-test')
  git(concurrent, 'config', 'user.name', 'Concurrent Author')
  git(concurrent, 'config', 'user.email', 'concurrent@example.invalid')
  await writeFile(path.join(concurrent, 'article.md'), 'newer concurrent version\n')
  git(concurrent, 'add', 'article.md')
  git(concurrent, 'commit', '-m', 'concurrent update')
  const latestRemoteSha = git(concurrent, 'rev-parse', 'HEAD')
  git(concurrent, 'push', 'origin', 'feature/history-test')

  await assert.rejects(
    pushNormalizedCommit({ cwd: repo.clone, ...normalized }),
    /rejected|stale info|failed to push/i,
  )
  assert.equal(git(repo.root, '--git-dir', repo.remote, 'rev-parse', ref), latestRemoteSha)
  assert.notEqual(latestRemoteSha, normalized.candidateSha)
})

test('pushes a normalized translation commit with a lease against its original remote ancestor', async (t) => {
  const repo = await makeRemote(t, 'history-writeback-')
  const remoteSha = git(repo.root, '--git-dir', repo.remote, 'rev-parse', ref)
  assert.equal(remoteSha, repo.oldSha)

  await writeFile(path.join(repo.clone, 'translation.md'), 'generated translation\n')
  git(repo.clone, 'add', 'translation.md')
  git(repo.clone, 'commit', '-m', 'translation writeback')
  const writebackSha = git(repo.clone, 'rev-parse', 'HEAD')
  const normalized = await createNormalizedCommit({ cwd: repo.clone, expectedOldSha: writebackSha, ref })
  assert.equal(normalized.tree, git(repo.clone, 'rev-parse', `${writebackSha}^{tree}`))

  const pushed = await pushNormalizedCommit({
    cwd: repo.clone,
    ...normalized,
    expectedRemoteSha: remoteSha,
  })
  assert.equal(pushed, normalized.candidateSha)
  assert.equal(git(repo.root, '--git-dir', repo.remote, 'rev-parse', ref), normalized.candidateSha)
})

test('rejects a remote lease SHA that is not an ancestor of the current writeback commit', async (t) => {
  const repo = await makeRemote(t, 'history-unrelated-lease-')
  await writeFile(path.join(repo.clone, 'translation.md'), 'generated translation\n')
  git(repo.clone, 'add', 'translation.md')
  git(repo.clone, 'commit', '-m', 'translation writeback')
  const expectedOldSha = git(repo.clone, 'rev-parse', 'HEAD')
  const normalized = await createNormalizedCommit({ cwd: repo.clone, expectedOldSha, ref })

  await assert.rejects(
    pushNormalizedCommit({ ...normalized, cwd: repo.clone, expectedRemoteSha: normalized.candidateSha }),
    /expected remote SHA must be an ancestor/,
  )
  assert.equal(git(repo.root, '--git-dir', repo.remote, 'rev-parse', ref), repo.oldSha)
})

test('reclaims a remotely normalized event tree and leases the translation tree against that root', async (t) => {
  const repo = await makeRemote(t, 'history-rerun-claim-')
  const eventSha = repo.oldSha
  await writeFile(path.join(repo.clone, 'translation.md'), 'generated translation\n')
  git(repo.clone, 'add', 'translation.md')
  git(repo.clone, 'commit', '-m', 'translation writeback')
  const writebackSha = git(repo.clone, 'rev-parse', 'HEAD')
  const translated = await createNormalizedCommit({ cwd: repo.clone, expectedOldSha: writebackSha, ref })

  const canonicalCheckout = path.join(repo.root, 'canonical-event')
  git(repo.root, 'clone', repo.remote, canonicalCheckout)
  git(canonicalCheckout, 'checkout', '--detach', eventSha)
  const canonicalEvent = await createNormalizedCommit({ cwd: canonicalCheckout, expectedOldSha: eventSha, ref })
  await pushNormalizedCommit({ cwd: canonicalCheckout, ...canonicalEvent, expectedRemoteSha: eventSha })
  assert.equal(git(repo.root, '--git-dir', repo.remote, 'rev-parse', ref), canonicalEvent.candidateSha)

  const pushed = await pushNormalizedCommit({
    cwd: repo.clone,
    ...translated,
    expectedRemoteSha: eventSha,
  })
  assert.equal(pushed, translated.candidateSha)
  assert.equal(git(repo.root, '--git-dir', repo.remote, 'rev-parse', ref), translated.candidateSha)
  assert.equal(git(repo.root, '--git-dir', repo.remote, 'rev-parse', `${ref}^{tree}`), translated.tree)
})

test('refuses a remote canonical root whose tree differs from the triggering event', async (t) => {
  const repo = await makeRemote(t, 'history-rerun-different-root-')
  const eventSha = repo.oldSha
  await writeFile(path.join(repo.clone, 'translation.md'), 'generated translation\n')
  git(repo.clone, 'add', 'translation.md')
  git(repo.clone, 'commit', '-m', 'translation writeback')
  const writebackSha = git(repo.clone, 'rev-parse', 'HEAD')
  const translated = await createNormalizedCommit({ cwd: repo.clone, expectedOldSha: writebackSha, ref })

  const concurrent = path.join(repo.root, 'different-tree')
  git(repo.root, 'clone', repo.remote, concurrent)
  git(concurrent, 'checkout', '-b', 'feature/history-test', '--track', 'origin/feature/history-test')
  git(concurrent, 'config', 'user.name', 'Concurrent Author')
  git(concurrent, 'config', 'user.email', 'concurrent@example.invalid')
  await writeFile(path.join(concurrent, 'article.md'), 'different source tree\n')
  git(concurrent, 'add', 'article.md')
  git(concurrent, 'commit', '-m', 'different event tree')
  const differentSha = git(concurrent, 'rev-parse', 'HEAD')
  const unrelatedRoot = await createNormalizedCommit({ cwd: concurrent, expectedOldSha: differentSha, ref })
  git(concurrent, 'push', '--force', 'origin', `${unrelatedRoot.candidateSha}:${ref}`)
  assert.notEqual(git(repo.root, '--git-dir', repo.remote, 'rev-parse', ref), eventSha)

  await assert.rejects(
    pushNormalizedCommit({ cwd: repo.clone, ...translated, expectedRemoteSha: eventSha }),
    /stale remote ref no longer points to the event commit or its canonical root/,
  )
  assert.equal(git(repo.root, '--git-dir', repo.remote, 'rev-parse', ref), unrelatedRoot.candidateSha)
})

test('rejects shell metacharacters in a branch ref before they can run', async (t) => {
  const repo = await makeRemote(t, 'history-ref-')
  const marker = path.join(repo.root, 'shell-was-run.txt')
  const maliciousRef = process.platform === 'win32'
    ? `refs/heads/topic & echo injected > "${marker}"`
    : `refs/heads/topic; touch '${marker}'`

  await assert.rejects(
    createNormalizedCommit({ cwd: repo.clone, expectedOldSha: repo.oldSha, ref: maliciousRef }),
    /check-ref-format failed/,
  )

  const cli = run(process.execPath, [scriptPath, '--candidate', '--ref', maliciousRef, '--expected', repo.oldSha], repo.clone)
  assert.notEqual(cli.status, 0)
  assert.match(cli.stderr, /check-ref-format failed/)
  await assert.rejects(readFile(marker), { code: 'ENOENT' })
  assert.equal(git(repo.clone, 'rev-parse', 'HEAD'), repo.oldSha)
})

test('accepts a valid Unicode branch ref and rejects malformed Git refs', async (t) => {
  const repo = await makeRemote(t, 'history-unicode-ref-')
  const unicodeRef = 'refs/heads/feature/测试分支'
  const normalized = await createNormalizedCommit({ cwd: repo.clone, expectedOldSha: repo.oldSha, ref: unicodeRef })
  assert.equal(normalized.ref, unicodeRef)
  assert.equal(git(repo.clone, 'rev-parse', `${normalized.candidateSha}^{tree}`), repo.oldTree)

  await assert.rejects(
    createNormalizedCommit({ cwd: repo.clone, expectedOldSha: repo.oldSha, ref: 'refs/heads/../main' }),
    /check-ref-format failed/,
  )
})
