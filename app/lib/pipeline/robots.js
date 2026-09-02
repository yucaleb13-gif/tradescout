// Deterministic robots.txt guard (RFC 9309 subset). No AI, no guessing:
// - robots.txt unreachable / 404 / 5xx  -> allowed (per RFC: treat as no restrictions) but recorded as 'unknown'
// - explicit Disallow match (longest-match wins, Allow beats Disallow on equal length) -> blocked
import { fetchUrl } from '@/app/lib/connectors/genericWeb'

export const BOT_NAME = 'tradescoutbot'

function parseRobots(text) {
  const groups = [] // { agents: [], rules: [{ type, path }] }
  let cur = null
  let lastWasAgent = false
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const val = line.slice(idx + 1).trim()
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur) }
      cur.agents.push(val.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!cur) continue
    if (key === 'allow' || key === 'disallow') cur.rules.push({ type: key, path: val })
    if (key === 'crawl-delay') { const n = parseFloat(val); if (!isNaN(n)) cur.crawl_delay = n }
  }
  return groups
}

function patternToRegex(p) {
  // '*' wildcard, '$' end anchor; everything else literal
  let re = ''
  for (const ch of p) {
    if (ch === '*') re += '.*'
    else if (ch === '$') re += '$'
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp('^' + re)
}

export function evaluateRobots(robotsText, pathWithQuery, botName = BOT_NAME) {
  const groups = parseRobots(robotsText)
  let group = groups.find((g) => g.agents.some((a) => a !== '*' && (a === botName || botName.startsWith(a))))
  if (!group) group = groups.find((g) => g.agents.includes('*'))
  if (!group) return { allowed: true, matched_rule: null, group: null, crawl_delay: null }
  const crawl_delay = group.crawl_delay ?? null
  let best = null
  for (const r of group.rules) {
    if (r.path === '') continue // "Disallow:" (empty) = no restriction
    if (!patternToRegex(r.path).test(pathWithQuery)) continue
    const len = r.path.length
    if (!best || len > best.len || (len === best.len && r.type === 'allow' && best.type === 'disallow')) {
      best = { type: r.type, path: r.path, len }
    }
  }
  if (!best) return { allowed: true, matched_rule: null, group: group.agents.join(','), crawl_delay }
  return { allowed: best.type === 'allow', matched_rule: `${best.type}: ${best.path}`, group: group.agents.join(','), crawl_delay }
}

// cache: Map<origin, { text|null, status }>. Shared within a pipeline run.
export async function checkRobots(url, cache = new Map()) {
  let u
  try { u = new URL(url) } catch { return { allowed: false, status: 'invalid_url', robots_url: null, matched_rule: null } }
  const robotsUrl = `${u.origin}/robots.txt`
  let entry = cache.get(u.origin)
  if (!entry) {
    const res = await fetchUrl(robotsUrl, { timeout: 6000 })
    if (res.ok && /^\s*[^<]/.test(res.content || '')) entry = { text: res.content, status: 'fetched', http_status: res.http_status }
    else entry = { text: null, status: res.http_status ? `http_${res.http_status}` : 'unreachable', http_status: res.http_status }
    cache.set(u.origin, entry)
  }
  if (entry.text === null) {
    // No usable robots.txt -> no restrictions declared
    return { allowed: true, status: entry.status, robots_url: robotsUrl, matched_rule: null, crawl_delay: null, http_status: entry.http_status }
  }
  const ev = evaluateRobots(entry.text, u.pathname + u.search)
  return { allowed: ev.allowed, status: 'fetched', robots_url: robotsUrl, matched_rule: ev.matched_rule, group: ev.group, crawl_delay: ev.crawl_delay, http_status: entry.http_status }
}

// Politeness: wait out a host's Crawl-delay (capped at 10s) between consecutive fetches in one run.
export async function respectCrawlDelay(url, crawlDelaySec, lastFetchAt = new Map()) {
  let origin
  try { origin = new URL(url).origin } catch { return }
  const delayMs = Math.min(10, Math.max(0, Number(crawlDelaySec) || 0)) * 1000
  const last = lastFetchAt.get(origin)
  if (delayMs > 0 && last) {
    const wait = delayMs - (Date.now() - last)
    if (wait > 0) await new Promise((res) => setTimeout(res, wait))
  }
  lastFetchAt.set(origin, Date.now())
}
