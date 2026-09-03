// csv_dataset connector: official downloadable datasets (e.g. CanadaBuys Open Data tender notices).
// Deterministic: every lead field is a cell (or a fixed representation of cells) from one dataset row.
import { fetchUrl, sha256, domainOf } from './genericWeb'
import { tradeMatch, locationMatch, textMatch, dateInRange, detectTradeIn, DEFAULT_LOCATION_ALIASES } from './query'

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()

// ---------------------------------------------------------------- RFC 4180 CSV parser (slice-based, memory-lean)
// keep: optional Set of header names to retain (others are dropped immediately to save memory)
export function parseCsv(text, keep = null) {
  const s = String(text || '')
  const n = s.length
  let i = s.charCodeAt(0) === 0xfeff ? 1 : 0
  const records = []
  let record = []
  while (i <= n) {
    if (i === n) { if (record.length) records.push(record); break }
    let value
    if (s[i] === '"') {
      // quoted field: gather segments split by doubled quotes
      i++
      let parts = null; let start = i
      for (;;) {
        const q = s.indexOf('"', i)
        if (q < 0) { value = s.slice(start); i = n; break }
        if (s[q + 1] === '"') { (parts ||= []).push(s.slice(start, q + 1)); i = q + 2; start = i; continue }
        value = parts ? parts.join('') + s.slice(start, q) : s.slice(start, q)
        i = q + 1
        break
      }
    } else {
      let e = i
      while (e < n && s[e] !== ',' && s[e] !== '\n' && s[e] !== '\r') e++
      value = s.slice(i, e)
      i = e
    }
    record.push(value)
    // delimiter handling
    if (i >= n) { records.push(record); break }
    const c = s[i]
    if (c === ',') { i++; continue }
    if (c === '\r') { i++; if (s[i] === '\n') i++; records.push(record); record = []; continue }
    if (c === '\n') { i++; records.push(record); record = []; continue }
    // malformed: skip to next delimiter
    i++
  }
  if (!records.length) return []
  const header = records[0].map((h) => clean(h))
  const idx = header.map((h, k) => (!keep || keep.has(h)) ? k : -1).filter((k) => k >= 0)
  const out = []
  for (let r = 1; r < records.length; r++) {
    const rec = records[r]
    if (rec.length === 1 && !(rec[0] || '').trim()) continue
    const o = {}
    for (const k of idx) o[header[k]] = rec[k] ?? ''
    out.push(o)
  }
  return out
}

// ---------------------------------------------------------------- dataset mappings
// Column names are exact dataset headers. Everything here is a lookup, never a guess.
export const DATASETS = {
  canadabuys_tender_notices: {
    label: 'CanadaBuys – Open tender notices (Open Government Licence – Canada)',
    columns: {
      title: 'title-titre-eng', description: 'tenderDescription-descriptionAppelOffres-eng',
      reference: 'referenceNumber-numeroReference', solicitation: 'solicitationNumber-numeroSollicitation',
      published: 'publicationDate-datePublication', closing: 'tenderClosingDate-appelOffresDateCloture',
      status: 'tenderStatus-appelOffresStatut-eng', category: 'procurementCategory-categorieApprovisionnement',
      notice_type: 'noticeType-avisType-eng', unspsc_desc: 'unspscDescription-eng', gsin_desc: 'gsinDescription-nibsDescription-eng',
      regions_delivery: 'regionsOfDelivery-regionsLivraison-eng', regions_opportunity: 'regionsOfOpportunity-regionAppelOffres-eng',
      entity: 'contractingEntityName-nomEntitContractante-eng', entity_city: 'contractingEntityAddressCity-entiteContractanteAdresseVille-eng',
      entity_province: 'contractingEntityAddressProvince-entiteContractanteAdresseProvince-eng',
      contact_name: 'contactInfoName-informationsContactNom', contact_email: 'contactInfoEmail-informationsContactCourriel',
      contact_phone: 'contactInfoPhone-contactInfoTelephone', notice_url: 'noticeURL-URLavis-eng',
      attachments: 'attachment-piecesJointes-eng', contract_start: 'expectedContractStartDate-dateDebutContratPrevue', contract_end: 'expectedContractEndDate-dateFinContratPrevue',
    },
    // official CanadaBuys procurement category codes
    category_labels: { CNST: 'Construction', GD: 'Goods', SRV: 'Services', SRVTGD: 'Services related to goods' },
    status_map: { open: 'open', closed: 'closed', expired: 'closed', awarded: 'awarded', cancelled: 'cancelled', canceled: 'cancelled' },
    notice_url_template: 'https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/{reference}',
  },
}

const tokens = (v) => clean(v).split('*').map((x) => clean(x)).filter(Boolean) // CanadaBuys multi-values are '*'-prefixed
const dateOnly = (v) => { const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null }

function rowText(row, cols) {
  return [row[cols.title], row[cols.description], row[cols.unspsc_desc], row[cols.gsin_desc], row[cols.category], row[cols.notice_type]].map(clean).join(' \n ')
}
function rowLocationText(row, cols) {
  return [row[cols.regions_delivery], row[cols.regions_opportunity], row[cols.entity_city], row[cols.entity_province]].map(clean).join(' | ')
}

export const csvDatasetConnector = {
  key: 'csv_dataset',
  label: 'CSV Dataset Connector (official open-data downloads)',

  async retrieve(source) {
    const url = source?.config?.dataset_url || source?.base_url
    if (!url) return { retrieval_status: 'failed', error: 'No dataset_url/base_url on source', source_url: url || null }
    const res = await fetchUrl(url, { timeout: 45000 })
    const content = res.content || ''
    const status = !res.ok ? 'failed' : (content.trim().length === 0 ? 'empty' : 'success')
    return {
      source_url: url, source_domain: domainOf(url), http_status: res.http_status, retrieval_status: status, error: res.error || null,
      content_hash: sha256(content), raw_content: content.slice(0, 500000), byte_size: content.length, _content: content,
    }
  },

  // SEARCH: parse dataset rows, apply the user's deterministic filters, cap to the requested limit.
  search(retrieval, query = {}, source = {}) {
    const ds = DATASETS[source?.config?.dataset] || DATASETS.canadabuys_tender_notices
    const cols = ds.columns
    const rows = parseCsv(retrieval._content || '', new Set(Object.values(cols)))
    const aliases = { ...DEFAULT_LOCATION_ALIASES, ...(source?.config?.location_aliases || {}) }
    const stats = { rows: rows.length, trade: 0, location: 0, project_type: 0, date: 0 }
    const matched = []
    for (const row of rows) {
      const text = rowText(row, cols)
      const tm = tradeMatch(text, query.trade); if (!tm.ok) continue; stats.trade++
      const lm = locationMatch(query.location, { fields: rowLocationText(row, cols), text }, aliases); if (!lm.ok) continue; stats.location++
      const catLabel = tokens(row[cols.category]).map((c) => ds.category_labels[c] || c).join(', ')
      if (!textMatch(query.project_type, `${catLabel} ${text}`)) continue; stats.project_type++
      if (!dateInRange(row[cols.published], query.date_from, query.date_to)) continue; stats.date++
      matched.push({ row, _match: { trade: query.trade || null, trade_hit: tm.hit, location_hits: lm.hits } })
    }
    const limit = query.limit || 20
    const items = matched.slice(0, limit).map(({ row, _match }) => ({
      title: clean(row[cols.title]), row, _match, _ds: ds,
      link: clean(row[cols.notice_url]) || (row[cols.reference] && ds.notice_url_template ? ds.notice_url_template.replace('{reference}', encodeURIComponent(clean(row[cols.reference]))) : retrieval.source_url),
    }))
    return { kind: 'csv', source_title: ds.label, items, stats: { ...stats, matched: matched.length, returned: items.length, truncated: Math.max(0, matched.length - items.length) } }
  },

  // EXTRACT: each field = one dataset cell (evidence snippet = "column: value" from the retrieved dataset)
  extract(item, retrieval) {
    const { row, _ds: ds } = item
    const cols = ds.columns
    const fields = {}; const evidence = []
    const add = (field, value, colKey, extraSnippet) => {
      const raw = clean(row[cols[colKey]])
      if (value === null || value === undefined || String(value).trim() === '' || !raw) return
      fields[field] = value
      evidence.push({ field, value: String(value), snippet: `${cols[colKey]}: ${extraSnippet || raw}`.slice(0, 1000), source_url: retrieval.source_url, method: 'structured_data' })
    }
    add('project_name', clean(row[cols.title]), 'title')
    // description: faithful concatenation of source-stated identifiers + description text
    const ref = clean(row[cols.reference]); const sol = clean(row[cols.solicitation]); const ntype = clean(row[cols.notice_type])
    const descBody = clean(row[cols.description])
    if (descBody || ref) {
      const head = [ref && `Reference: ${ref}`, sol && `Solicitation: ${sol}`, ntype && `Notice type: ${ntype}`].filter(Boolean).join(' · ')
      const desc = [head, descBody].filter(Boolean).join('\n\n').slice(0, 4000)
      fields.project_description = desc
      evidence.push({ field: 'project_description', value: desc.slice(0, 1000), snippet: `${cols.description}: ${descBody.slice(0, 600)}${ref ? ` | ${cols.reference}: ${ref}` : ''}`.slice(0, 1000), source_url: retrieval.source_url, method: 'structured_data' })
    }
    // trade: requested trade's keyword found in source text, else first trade keyword present (deterministic)
    const t = rowText(row, cols)
    const tr = (item._match?.trade && item._match?.trade_hit) ? { trade: item._match.trade, hit: item._match.trade_hit } : detectTradeIn(t)
    if (tr) {
      const i = t.toLowerCase().indexOf(tr.hit)
      fields.trade_category = tr.trade
      evidence.push({ field: 'trade_category', value: tr.trade, snippet: `keyword "${tr.hit}": ${clean(t.slice(Math.max(0, i - 60), i + 80))}`, source_url: retrieval.source_url, method: 'regex' })
    }
    const cats = tokens(row[cols.category]).map((c) => `${ds.category_labels[c] || c} (${c})`).join(', ')
    add('project_type', cats || null, 'category')
    const regions = tokens(row[cols.regions_delivery]); if (regions.length) add('location', regions.join(', '), 'regions_delivery')
    add('company_name', clean(row[cols.entity]) || null, 'entity')
    add('contact_name', clean(row[cols.contact_name]) || null, 'contact_name')
    add('contact_email', clean(row[cols.contact_email]) || null, 'contact_email')
    add('contact_phone', clean(row[cols.contact_phone]) || null, 'contact_phone')
    const closing = dateOnly(row[cols.closing]); if (closing) add('bid_deadline', closing, 'closing')
    const st = clean(row[cols.status]).toLowerCase(); if (st) add('tender_status', ds.status_map[st] || 'unknown', 'status')
    const cs = dateOnly(row[cols.contract_start]); if (cs) add('timeline_start', cs, 'contract_start')
    const ce = dateOnly(row[cols.contract_end]); if (ce) add('timeline_end', ce, 'contract_end')
    const pub = dateOnly(row[cols.published]); const closingRaw = clean(row[cols.closing])
    if (pub || closingRaw) add('timeline_text', [pub && `Published ${pub}`, closingRaw && `Closes ${closingRaw}`].filter(Boolean).join(' · '), pub ? 'published' : 'closing')
    return { fields, evidence, source_url: item.link || retrieval.source_url }
  },

  normalize(extracted) {
    const f = extracted.fields
    const out = { tender_status: f.tender_status || 'unknown' }
    for (const k of ['project_name', 'project_description', 'project_type', 'trade_category', 'location', 'company_name', 'contact_name', 'contact_email', 'contact_phone', 'bid_deadline', 'timeline_start', 'timeline_end', 'timeline_text']) if (f[k]) out[k] = f[k]
    return out
  },
}
