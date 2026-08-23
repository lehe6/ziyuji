// Vercel Edge Function: GET /api/relay/get?id=XXXX
// (Vercel Edge Functions 不支持路径参数 :id 风格的目录路由直接拆，用 query 更稳)
// returns: { payload: <string> }  /  { error: 'NOT_FOUND' } /  { error: 'KV_NOT_AVAILABLE' }

export const config = { runtime: 'edge', regions: ['hnd1', 'iad1'] }
const KV_PREFIX = 'zyj:relay:'

async function kvGet(key) {
  const API = process.env.KV_REST_API_URL
  const TOKEN = process.env.KV_REST_API_TOKEN
  if (API && TOKEN) {
    const url = `${API.replace(/\/$/, '')}/get/${encodeURIComponent(key)}`
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${TOKEN}` }
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`KV REST GET failed: ${res.status} ${text.slice(0, 200)}`)
    }
    // REST /get 返回 { result: <value> } 格式（@vercel/kv rest）
    let data
    try { data = await res.json() } catch {
      const raw = await res.text()
      return raw && raw !== 'null' ? raw : null
    }
    if (data && typeof data === 'object' && 'result' in data) {
      return data.result === null ? null : String(data.result)
    }
    return data
  }
  throw new Error('KV_NOT_AVAILABLE')
}

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Cache-Control': 'public, max-age=60, s-maxage=300'
  }
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: cors })
  }
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }),
      { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  const url = new URL(req.url)
  const id = (url.searchParams.get('id') || '').trim()
  if (!id || id.length < 4 || id.length > 24) {
    return new Response(JSON.stringify({ error: 'BAD_ID' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  // 防路径穿越
  if (/[^a-zA-Z0-9]/.test(id)) {
    return new Response(JSON.stringify({ error: 'BAD_ID' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  try {
    const v = await kvGet(`${KV_PREFIX}${id}`)
    if (!v || (typeof v === 'string' && (!v.length || v === 'null'))) {
      return new Response(JSON.stringify({ error: 'NOT_FOUND' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ payload: String(v) }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    const msg = (e && e.message) || 'KV_ERROR'
    if (msg === 'KV_NOT_AVAILABLE') {
      return new Response(JSON.stringify({ error: 'KV_NOT_AVAILABLE' }),
        { status: 202, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: 'KV_ERROR', detail: msg.slice(0, 200) }),
      { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
}
