import { appendFile } from 'node:fs/promises'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFile = promisify(execFileCallback)
const BOT_NAME = 'github-actions[bot]'
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com'
const BOT_DATE = '@0 +0000'
const MESSAGE = 'Update blog'

async function git(cwd, args, options = {}) {
  try {
    const result = await execFile('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      ...options,
    })
    return result.stdout.trim()
  } catch (error) {
    const detail = error.stderr?.trim() || error.message
    throw new Error(`git ${args[0]} failed: ${detail}`, { cause: error })
  }
}

async function validateRef(cwd, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('refs/heads/') || ref.length === 'refs/heads/'.length) {
    throw new Error('ref must be a complete refs/heads/* name')
  }
  await git(cwd, ['check-ref-format', ref])
  return ref
}

function validateSha(sha) {
  if (typeof sha !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha)) {
    throw new Error('expectedOldSha must be a full lowercase Git object ID')
  }
  return sha
}

async function canonicalCommit(cwd, tree) {
  const candidateSha = await git(cwd, ['-c', 'commit.gpgsign=false', 'commit-tree', tree, '-m', MESSAGE], {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: BOT_NAME,
      GIT_AUTHOR_EMAIL: BOT_EMAIL,
      GIT_AUTHOR_DATE: BOT_DATE,
      GIT_COMMITTER_NAME: BOT_NAME,
      GIT_COMMITTER_EMAIL: BOT_EMAIL,
      GIT_COMMITTER_DATE: BOT_DATE,
    },
  })
  const commit = await git(cwd, ['cat-file', '-p', candidateSha])
  const header = commit.split('\n\n', 1)[0].split('\n')
  if (header.filter((line) => line.startsWith('tree ')).length !== 1 || !header.includes(`tree ${tree}`)) {
    throw new Error('generated commit does not point to the source tree')
  }
  if (header.some((line) => line.startsWith('parent '))) throw new Error('generated commit unexpectedly has a parent')
  if (!header.includes(`author ${BOT_NAME} <${BOT_EMAIL}> 0 +0000`) || !header.includes(`committer ${BOT_NAME} <${BOT_EMAIL}> 0 +0000`)) {
    throw new Error('generated commit identity or timestamp is not canonical')
  }
  if (commit.split('\n\n').slice(1).join('\n\n') !== MESSAGE) throw new Error('generated commit message is not canonical')
  return candidateSha
}

export async function createNormalizedCommit({ cwd = process.cwd(), expectedOldSha, ref }) {
  await validateRef(cwd, ref)
  validateSha(expectedOldSha)

  const head = await git(cwd, ['rev-parse', '--verify', 'HEAD^{commit}'])
  if (head !== expectedOldSha) throw new Error(`checked-out HEAD ${head} does not match expected ${expectedOldSha}`)
  const status = await git(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])
  if (status) throw new Error('working tree must be clean before history normalization')

  const tree = await git(cwd, ['rev-parse', `${expectedOldSha}^{tree}`])
  const candidateSha = await canonicalCommit(cwd, tree)

  return { ref, expectedOldSha, tree, candidateSha }
}

export async function pushNormalizedCommit({ cwd = process.cwd(), ref, expectedOldSha, expectedRemoteSha = expectedOldSha, candidateSha }) {
  await validateRef(cwd, ref)
  validateSha(expectedOldSha)
  validateSha(expectedRemoteSha)
  validateSha(candidateSha)
  const expected = await createNormalizedCommit({ cwd, expectedOldSha, ref })
  if (expected.candidateSha !== candidateSha) throw new Error('candidate SHA does not match the normalized source tree')
  try {
    await git(cwd, ['merge-base', '--is-ancestor', expectedRemoteSha, expectedOldSha])
  } catch {
    throw new Error('expected remote SHA must be an ancestor of checked-out HEAD')
  }

  const originalTree = await git(cwd, ['rev-parse', `${expectedRemoteSha}^{tree}`])
  const canonicalRemoteSha = await canonicalCommit(cwd, originalTree)
  const remoteLine = await git(cwd, ['ls-remote', '--heads', 'origin', ref])
  const remoteSha = remoteLine ? remoteLine.split('\t', 1)[0] : ''
  let leaseSha
  if (remoteSha === expectedRemoteSha) leaseSha = expectedRemoteSha
  else if (remoteSha === canonicalRemoteSha) leaseSha = canonicalRemoteSha
  else throw new Error('failed to push: stale remote ref no longer points to the event commit or its canonical root')

  await git(cwd, ['push', `--force-with-lease=${ref}:${leaseSha}`, 'origin', `${candidateSha}:${ref}`])
  return candidateSha
}

async function runCli(argv, env = process.env) {
  const mode = argv[2]
  const cwd = process.cwd()
  let ref
  let expectedOldSha
  let expectedRemoteSha

  if (mode === '--candidate') {
    const refIndex = argv.indexOf('--ref')
    const expectedIndex = argv.indexOf('--expected')
    ref = argv[refIndex + 1]
    expectedOldSha = argv[expectedIndex + 1]
    if (refIndex < 0 || expectedIndex < 0 || !ref || !expectedOldSha) {
      throw new Error('usage: normalize-history.mjs --candidate --ref refs/heads/<branch> --expected <full-sha>')
    }
  } else if (mode === '--push' && (argv.length === 3 || (argv.length === 5 && argv[3] === '--expected-remote'))) {
    ref = env.GITHUB_REF
    if (!env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required in --push mode')
    if (argv.length === 5) expectedRemoteSha = argv[4]
    await validateRef(cwd, ref)
    expectedOldSha = await git(cwd, ['rev-parse', '--verify', 'HEAD^{commit}'])
  } else {
    throw new Error('usage: normalize-history.mjs --candidate --ref refs/heads/<branch> --expected <full-sha> | --push [--expected-remote <full-sha>]')
  }

  const candidate = await createNormalizedCommit({ cwd, expectedOldSha, ref })
  if (mode === '--push') {
    await pushNormalizedCommit({ cwd, ...candidate, expectedRemoteSha })
    await appendFile(env.GITHUB_OUTPUT, `normalized_sha=${candidate.candidateSha}\n`, 'utf8')
  }
  process.stdout.write(`${JSON.stringify(candidate)}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli(process.argv).catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
