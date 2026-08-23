// 接力链接：
//   短链版（推荐）：POST /api/relay/save 存后端 KV，返回 8 位短码 id → URL 用 ?r=<id>，永远 ~40 字
//   长链版（兜底）：整局状态直接编码进 #zyj= hash，URL 随局数变长
// 前端自动走短链版，若后端未绑定 KV（返回 KV_NOT_AVAILABLE），自动降级长链版。

const KEY = 'zyj'
const SHORT_PARAM = 'r'
const SAVE_ENDPOINT = '/api/relay/save'
const GET_ENDPOINT = '/api/relay/get'

// ========= 长链版编码（兜底用，不推荐但保证可用） =========
function encodeStateHash(state) {
  const json = JSON.stringify(state)
  return `${KEY}=${encodeURIComponent(json)}`
}
function decodeStateHash(hash) {
  if (!hash || !hash.startsWith(`#${KEY}=`)) return null
  const raw = hash.slice(1 + KEY.length + 1)
  try { return JSON.parse(decodeURIComponent(raw)) }
  catch (e) { console.warn('长链接解析失败', e); return null }
}
export function buildLongShareUrl(state) {
  const base = `${location.origin}${location.pathname}`
  return `${base}#${encodeStateHash(state)}`
}

// ========= 短链版：调用后端 save/get 接口 =========
async function postShort(state) {
  const json = JSON.stringify(state)
  const res = await fetch(SAVE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: json })
  })
  const data = await res.json().catch(() => ({}))
  // 202 = KV_NOT_AVAILABLE（本地或未绑定），前端降级
  if ((res.status === 202 && data?.error === 'KV_NOT_AVAILABLE') || !data?.id) {
    return { ok: false, error: data?.error || 'NO_ID', data }
  }
  if (res.ok && data?.id) return { ok: true, id: data.id, ttl: data.ttl }
  return { ok: false, error: data?.error || `HTTP_${res.status}`, data }
}
export async function fetchPayloadByShortId(id) {
  if (!id) return null
  const url = `${GET_ENDPOINT}?id=${encodeURIComponent(id)}`
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (res.ok && typeof data?.payload === 'string') {
    try { return JSON.parse(data.payload) } catch { return null }
  }
  // 202 = KV_NOT_AVAILABLE
  return { __linkError: data?.error || `HTTP_${res.status}` }
}

// ========= 统一对外：生成链接（短链优先，失败降级长链） =========
export async function buildShareUrl(state) {
  try {
    const r = await postShort(state)
    if (r.ok) {
      const u = new URL(`${location.origin}${location.pathname}`)
      u.searchParams.set(SHORT_PARAM, r.id)
      u.hash = ''
      return { url: u.toString(), type: 'short', id: r.id, ttl: r.ttl }
    }
  } catch (e) {
    console.warn('短链生成失败，降级长链', e)
  }
  return { url: buildLongShareUrl(state), type: 'long', id: null, ttl: null }
}

// ========= 解码：从当前 URL 取 state（短链 ?r= 优先，再 fallback 旧 #zyj=） =========
export async function resolveCurrentState() {
  // 1. 短链 ?r=
  const search = new URLSearchParams(location.search)
  const r = search.get(SHORT_PARAM)
  if (r) {
    const state = await fetchPayloadByShortId(r)
    if (state && !state.__linkError) {
      return { source: 'short', id: r, state }
    }
    return { source: 'short', id: r, state: null, error: state?.__linkError || 'NOT_FOUND' }
  }
  // 2. 旧版长链 #zyj=
  const state = decodeStateHash(location.hash)
  if (state) return { source: 'long', id: null, state }
  return { source: 'none', id: null, state: null }
}

// 兼容旧接口
export { decodeStateHash as decodeState }

// ========= Payload 构造（不存内部 id，跨设备按 word+pos 匹配） =========
export function buildPayloadFromStore(store) {
  return {
    v: 1,
    theme: store.theme,
    mode: store.mode,
    count: store.count,
    hand: store.hand.map(c => ({ word: c.word, pos: c.pos })),
    storyLines: store.mode === 'story' ? store.storyLines.slice() : [],
    sentence: store.sentence,
    explanation: store.explanation,
    storyTurn: store.storyTurn,
    revealed: store.revealed,
    usePresetPlayers: store.usePresetPlayers,
    storyPlayers: store.storyPlayers.slice(),
    createdAt: Date.now()
  }
}
