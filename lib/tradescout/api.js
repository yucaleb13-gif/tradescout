export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  let data = {}
  try { data = await res.json() } catch { /* empty */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}
