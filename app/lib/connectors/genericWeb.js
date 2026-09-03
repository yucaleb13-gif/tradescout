import crypto from 'crypto'
import { XMLParser } from 'fast-xml-parser'
import { detectTradeIn } from './query'

// ---------------------------------------------------------------- utilities
export const sha256 = (s) => crypto.createHash('sha256').update(s || '').digest('hex')
export const domainOf = (u) => { try { return new URL(u).hostname } catch { return null } }
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const stripHtml = (s) => clean(String(s || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'))

export async function fetchUrl(url, { timeout = 15000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'TradeScoutBot/1.0 (+https://tradescout.app; verification pipeline)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    const content = await res.text()
    return { ok: res.ok, http_status: res.status, content, error: res.ok ? null : `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, http_status: null, content: '', error: e.name === 'AbortError' ? 'Timeout' : e.message }
  } finally { clearTimeout(timer) }
}

// ---------------------------------------------------------------- parsing
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true, textNodeName: '#text' })
const arr = (x) => Array.isArray(x) ? x : (x === undefined || x === null ? [] : [x])
const txt = (v) => { if (v === null || v === undefined) return ''; if (typeof v === 'object') return clean(v['#text'] || v['@_href'] || ''); return clean(String(v)) }
const rssLink = (l) => { if (!l) return ''; if (typeof l === 'string') return clean(l); return txt(l) }
const atomLink = (l) => { const list = arr(l); const alt = list.find((x) => x?.['@_rel'] === 'alternate') || list[0]; return alt?.['@_href'] || txt(alt) }
const htmlTitle = (c) => { const m = String(c || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? clean(stripHtml(m[1])) : null }
const metaDesc = (c) => { const m = String(c || '').match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i); return m ? clean(m[1]) : null }

function parseSource(content, sourceUrl) {
  let obj
  try { obj = xml.parse(content) } catch { obj = null }
  if (obj?.rss?.channel) {
    const ch = obj.rss.channel
    const items = arr(ch.item).map((it) => ({
      title: txt(it.title), link: rssLink(it.link) || txt(it.guid),
      description: txt(it['content:encoded']) || txt(it.description),
      pubDate: txt(it.pubDate), categories: arr(it.category).map(txt).filter(Boolean),
    }))
    return { kind: 'rss', title: txt(ch.title), items }
  }
  if (obj?.feed) {
    const f = obj.feed
    const items = arr(f.entry).map((e) => ({
      title: txt(e.title), link: atomLink(e.link) || txt(e.id),
      description: txt(e.summary) || txt(e.content),
      pubDate: txt(e.updated) || txt(e.published), categories: arr(e.category).map((c) => c?.['@_term']).filter(Boolean),
    }))
    return { kind: 'atom', title: txt(f.title), items }
  }
  // Fallback: treat the page itself as a single item (title + meta description only)
  const title = htmlTitle(content)
  const items = title ? [{ title, link: sourceUrl, description: metaDesc(content) || '', pubDate: '', categories: [] }] : []
  return { kind: 'html', title, items }
}

// -------------------------------------------------- deterministic extractors
function detectTrade(text) {
  const r = detectTradeIn(text)
  return r ? { trade: r.trade, snippet: snippetAround(text, r.hit) } : null
}
function snippetAround(text, needle) {
  const t = String(text || ''); const i = t.toLowerCase().indexOf(String(needle).toLowerCase())
  if (i < 0) return needle
  return clean(t.slice(Math.max(0, i - 40), i + needle.length + 40))
}

const STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|BC|AB|ON|QC|NS|NB|MB|SK|PE|NL|YT|NT|NU'
const LOC_RE = new RegExp(`\\b([A-Z][A-Za-z.'-]+(?:\\s[A-Z][A-Za-z.'-]+){0,2}),\\s?(${STATES})\\b`)
const MONEY_RE = /(?:\$|USD|CAD)\s?([\d,]+(?:\.\d+)?)\s?(million|billion|bn|m|k)?/i
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const PHONE_RE = /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/

function matchLocation(text) { const m = String(text || '').match(LOC_RE); return m ? { value: `${clean(m[1])}, ${m[2]}`, snippet: clean(m[0]) } : null }
function matchMoney(text) { const m = String(text || '').match(MONEY_RE); return m ? { raw: clean(m[0]), snippet: snippetAround(text, m[0]) } : null }
function moneyToNumber(raw) {
  const m = String(raw).match(MONEY_RE); if (!m) return null
  let n = parseFloat(m[1].replace(/,/g, '')); if (isNaN(n)) return null
  const u = (m[2] || '').toLowerCase()
  if (u === 'k') n *= 1e3; else if (u === 'm' || u === 'million') n *= 1e6; else if (u === 'bn' || u === 'billion') n *= 1e9
  return Math.round(n)
}
function matchEmail(text) { const m = String(text || '').match(EMAIL_RE); return m ? m[0] : null }
function matchPhone(text) { const m = String(text || '').match(PHONE_RE); return m ? clean(m[0]) : null }
const toIsoDate = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) }
function matchDeadline(text) {
  const t = String(text || '')
  if (!/(deadline|closing|close date|closes|due date|submission|bid due|tender clos)/i.test(t)) return null
  const monthName = t.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}\b/i)
  const iso = t.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/)
  let d = null, snippet = null
  if (monthName) { d = new Date(monthName[0]); snippet = monthName[0] }
  else if (iso) { d = new Date(`${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`); snippet = iso[0] }
  if (d && !isNaN(d.getTime())) return { iso: d.toISOString().slice(0, 10), snippet: clean(snippet) }
  return null
}

// --------------------------------------------------------------- connector
// Contract: search / retrieve / extract / normalize / validate
export const genericWebConnector = {
  key: 'generic_web',
  label: 'Generic Web / RSS Connector',

  // RETRIEVE the source document once (feed or page)
  async retrieve(source) {
    const url = source?.config?.feed_url || source?.base_url
    if (!url) return { retrieval_status: 'failed', error: 'No base_url/feed_url on source', source_url: url || null }
    const res = await fetchUrl(url)
    const content = res.content || ''
    const status = !res.ok ? 'failed' : (content.trim().length === 0 ? 'empty' : 'success')
    return {
      source_url: url, source_domain: domainOf(url), http_status: res.http_status,
      retrieval_status: status, error: res.error || null,
      content_hash: sha256(content), raw_content: content.slice(0, 500000), byte_size: content.length,
      _content: content,
    }
  },

  // SEARCH: derive candidate items from retrieved content
  search(retrieval) {
    const parsed = parseSource(retrieval._content || '', retrieval.source_url)
    return { kind: parsed.kind, source_title: parsed.title, items: parsed.items }
  },

  // EXTRACT: only fields explicitly supported by content; each gets evidence
  extract(item, retrieval) {
    const url = item.link || retrieval.source_url
    const fields = {}; const evidence = []
    const add = (field, value, snippet, method = 'regex') => {
      if (value === null || value === undefined || String(value).trim() === '') return
      fields[field] = value
      evidence.push({ field, value: String(value), snippet: clean(snippet || String(value)).slice(0, 1000), source_url: url, method })
    }
    if (item.title) add('project_name', clean(item.title), item.title, 'structured_data')
    const desc = stripHtml(item.description)
    if (desc) add('project_description', desc.slice(0, 2000), desc.slice(0, 300), 'structured_data')
    const hay = `${item.title || ''}. ${desc}. ${(item.categories || []).join(', ')}`
    const tr = detectTrade(hay); if (tr) add('trade_category', tr.trade, tr.snippet)
    const loc = matchLocation(hay); if (loc) add('location', loc.value, loc.snippet)
    const money = matchMoney(hay); if (money) add('project_value', money.raw, money.snippet)
    const dl = matchDeadline(hay); if (dl) add('bid_deadline', dl.iso, dl.snippet)
    const email = matchEmail(hay); if (email) add('contact_email', email, email)
    const phone = matchPhone(hay); if (phone) add('contact_phone', phone, phone)
    const pub = toIsoDate(item.pubDate); if (pub) fields.published_at = pub
    return { fields, evidence, source_url: url }
  },

  // DETAIL FETCH (optional, per source config.fetch_details): retrieve the item's own page and
  // extract ONLY fields not already evidenced from the feed. Every value maps to a snippet on that page.
  async retrieveDetail(url) {
    const res = await fetchUrl(url, { timeout: 8000 })
    const content = res.content || ''
    const isHtml = /<html|<body|<head/i.test(content.slice(0, 5000))
    const status = !res.ok ? 'failed' : (!content.trim() ? 'empty' : (!isHtml ? 'unsupported' : 'success'))
    return {
      source_url: url, source_domain: domainOf(url), http_status: res.http_status, retrieval_status: status,
      error: res.error || (status === 'unsupported' ? 'Not an HTML document' : null),
      content_hash: sha256(content), raw_content: content.slice(0, 200000), byte_size: content.length, _content: content,
    }
  },
  extractDetail(extracted, detailRetrieval) {
    const html = detailRetrieval._content || ''
    const text = stripHtml(html).slice(0, 60000)
    const url = detailRetrieval.source_url
    const have = new Set(extracted.evidence.map((e) => e.field))
    const fields = {}; const evidence = []
    const add = (field, value, snippet) => {
      if (have.has(field) || value === null || value === undefined || String(value).trim() === '') return
      fields[field] = value
      evidence.push({ field, value: String(value), snippet: clean(snippet || String(value)).slice(0, 1000), source_url: url, method: 'regex' })
    }
    const md = metaDesc(html); if (md) add('project_description', md.slice(0, 2000), md.slice(0, 300))
    const tr = detectTrade(text); if (tr) add('trade_category', tr.trade, tr.snippet)
    const loc = matchLocation(text); if (loc) add('location', loc.value, loc.snippet)
    const money = matchMoney(text); if (money) add('project_value', money.raw, money.snippet)
    const dl = matchDeadline(text); if (dl) add('bid_deadline', dl.iso, dl.snippet)
    const email = matchEmail(text); if (email) add('contact_email', email, email)
    const phone = matchPhone(text); if (phone) add('contact_phone', phone, phone)
    return { fields, evidence }
  },

  // NORMALIZE: shape into lead columns (no invented data)
  normalize(extracted) {
    const f = extracted.fields
    const out = { tender_status: 'unknown' }
    if (f.project_name) out.project_name = f.project_name
    if (f.project_description) out.project_description = f.project_description
    if (f.trade_category) out.trade_category = f.trade_category
    if (f.location) out.location = f.location
    if (f.contact_email) out.contact_email = f.contact_email
    if (f.contact_phone) out.contact_phone = f.contact_phone
    if (f.bid_deadline) out.bid_deadline = f.bid_deadline
    if (f.published_at) out.published_at = f.published_at
    if (f.project_value) { const n = moneyToNumber(f.project_value); if (n != null) { out.source_stated_value = n; out.source_stated_value_currency = 'USD' } }
    return out
  },
}
