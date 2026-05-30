#!/usr/bin/env node
// .github/scripts/await-preview-url.mjs
//
// LED-49 (Approach B): resolve the Vercel Preview deployment URL for a PR's
// head SHA, so the Preview-stage smoke test can run the SAME post-deploy
// smoke script against the live preview before merge.
//
// The `pull_request` event fires BEFORE Vercel registers the preview
// deployment for the SHA, so this polls the GitHub Deployments API on a
// bounded loop and fails LOUDLY on timeout (never silently passes — a silent
// timeout would read as a pass-skip).
//
// Reads:
//   GITHUB_TOKEN        — built-in token (needs `deployments: read`)
//   GITHUB_REPOSITORY   — "owner/repo"
//   PR_HEAD_SHA         — the PR head commit SHA to find a deployment for
//   POLL_TIMEOUT_MS     — optional, default 600000 (10 min)
//   POLL_INTERVAL_MS    — optional, default 15000 (15 s)
//
// On success: appends `deploy_url=<url>` to $GITHUB_OUTPUT and exits 0.
// On timeout/missing inputs: prints a `::error::` annotation and exits 1.

import { appendFileSync } from 'node:fs'

const GITHUB_API = 'https://api.github.com'

// A Vercel deployment's `environment` is "Preview" for PR branches and
// "Production" for prod. Match loosely (case-insensitive substring) because
// Vercel sometimes decorates it (e.g. "Preview – physio-os-web").
export function isPreviewEnvironment(env) {
  return typeof env === 'string' && /preview/i.test(env)
}

// GitHub returns deployment statuses newest-first. Return the deploy URL of the
// most recent `success` status, preferring environment_url over target_url.
export function successUrlFromStatuses(statuses) {
  if (!Array.isArray(statuses)) return null
  for (const s of statuses) {
    if (s && s.state === 'success') {
      return s.environment_url || s.target_url || null
    }
  }
  return null
}

// Poll until a successful Preview deployment URL is found or the timeout is hit.
// deps: { listDeployments(sha), listDeploymentStatuses(id), sleep(ms), now() }
// Returns { url, deploymentId, attempt } on success, or { url: null,
// timedOut: true, attempt } on timeout. At least one pass always runs.
export async function pollForPreviewUrl({ sha, deps, timeoutMs = 600_000, intervalMs = 15_000 }) {
  const start = deps.now()
  let attempt = 0
  for (;;) {
    attempt++
    const deployments = (await deps.listDeployments(sha)) || []
    const previews = deployments.filter((d) => isPreviewEnvironment(d.environment))
    for (const d of previews) {
      const url = successUrlFromStatuses(await deps.listDeploymentStatuses(d.id))
      if (url) return { url, deploymentId: d.id, attempt }
    }
    if (deps.now() - start >= timeoutMs) return { url: null, timedOut: true, attempt }
    await deps.sleep(intervalMs)
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const sha = process.env.PR_HEAD_SHA
  const timeoutMs = Number(process.env.POLL_TIMEOUT_MS || 600_000)
  const intervalMs = Number(process.env.POLL_INTERVAL_MS || 15_000)

  const missing = []
  if (!token) missing.push('GITHUB_TOKEN')
  if (!repo) missing.push('GITHUB_REPOSITORY')
  if (!sha) missing.push('PR_HEAD_SHA')
  if (missing.length > 0) {
    console.error(`::error::await-preview-url missing required env: ${missing.join(', ')}`)
    process.exit(1)
  }

  const ghGet = async (path) => {
    const res = await fetch(`${GITHUB_API}/repos/${repo}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!res.ok) {
      throw new Error(`GitHub API GET ${path} -> ${res.status} ${await res.text()}`)
    }
    return res.json()
  }

  const deps = {
    listDeployments: (s) => ghGet(`/deployments?sha=${encodeURIComponent(s)}&per_page=100`),
    listDeploymentStatuses: (id) => ghGet(`/deployments/${id}/statuses?per_page=100`),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  }

  console.log(
    `[await-preview] Waiting for a successful Vercel Preview deployment of ${sha} ` +
      `(timeout ${Math.round(timeoutMs / 1000)}s, interval ${Math.round(intervalMs / 1000)}s)...`,
  )

  const result = await pollForPreviewUrl({ sha, deps, timeoutMs, intervalMs })

  if (!result.url) {
    console.error(
      `::error::No successful Vercel Preview deployment found for ${sha} within ` +
        `${Math.round(timeoutMs / 1000)}s. The preview never deployed, or Vercel is not ` +
        `wired to this repo — check the Vercel GitHub integration.`,
    )
    process.exit(1)
  }

  console.log(
    `[await-preview] Found Preview URL ${result.url} ` +
      `(deployment ${result.deploymentId}, attempt ${result.attempt}).`,
  )

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `deploy_url=${result.url}\n`)
  }
}

// Run main() only when executed directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[await-preview] Unhandled error:', err)
    process.exit(1)
  })
}
