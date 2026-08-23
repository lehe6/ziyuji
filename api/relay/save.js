// Vercel Edge Function: POST /api/relay/save
// body: { payload: <string> }
// returns: { id: <6~8位短码>, url: <分享URL> }
// 依赖: Vercel KV (环境变量需绑定:
//       KV_REST_API_URL / KV_REST_API_TOKEN 或 process.env.KV)
//
// 本地开发：若没有 KV 环境变量，返回 { error: "KV_NOT_AVAILABLE", mockId: ... }
//          给前端降级为旧版长链接路径

// 生成 URL-safe 短码 id（默认 8 位）
function genId(len = 8) {
  const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const arr = new Uint8Array(len)
  try {
    (globalThis.crypto || require('crypto').webcrypto).getRandomValues(arr)
  } catch {
    for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  let s = ''
  for (let i = 0; i < len; i++) s += ALPHA[arr[i] % ALPHA.length]
  return s
}

export const config = { runtime: 'edge', regions: ['hnd1', 'iad1'] }

// 30 天 TTL（秒）
const TTL_SEC = 60 * 60 * 24 * 30
const KV_PREFIX = 'zyj:relay:'

// 简易 KV 客户端：优先读 process.env 里 KV REST 接口
async function kvPut(key, value, ttlSec) {
  // 1. 优先使用 @vercel/kv 的 rest 风格（KV_REST_API_URL / KV_REST_API_TOKEN）
  //    实际部署时 Vercel 注入这两个环境变量，无需安装 SDK
  const API = process.env.KV_REST_API_URL
  const TOKEN = process.env.KV_REST_API_TOKEN
  if (API && TOKEN) {
    const url = `${API.replace(/\/$/, '')}/set/${encodeURIComponent(key)}?EX=${ttlSec}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'text/plain' },
      body: String(value)
    })
    if (res.ok) return true
    const text = await res.text().catch(() => '')
    throw new Error(`KV REST PUT failed: ${res.status} ${text.slice(0, 200)}`)
  }
  throw new Error('KV_NOT_AVAILABLE')
}

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Cache-Control': 'no-store'
  }
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: cors })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }),
      { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  let payload = ''
  try {
    const body = await req.json()
    payload = body?.payload
    if (typeof payload !== 'string' || !payload) throw new Error('BAD_PAYLOAD')
    if (payload.length > 120_000) throw new Error('PAYLOAD_TOO_LARGE')
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'BAD_REQUEST' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // 生成本地兜底 mock（KV 不可用时返回）
  const mockId = genId(6)
  const shortId = genId(8)
  const key = `${KV_PREFIX}${shortId}`

  try {
    await kvPut(key, payload, TTL_SEC)
  } catch (e) {
    // 本地开发 / KV 未绑定：降级返回错误 + 占位 id
    const msg = (e && e.message) || 'KV_ERROR'
    if (msg === 'KV_NOT_AVAILABLE') {
      return new Response(JSON.stringify({
        error: 'KV_NOT_AVAILABLE',
        mockId,
        ttl: TTL_SEC,
        note: '本地或KV未绑定环境，前端请降级使用旧版长链接'
      }), { status: 202, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: 'KV_ERROR', detail: msg.slice(0, 200) }),
      { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({
    id: shortId,
    ttl: TTL_SEC
  }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
}
