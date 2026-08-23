// 接力链接：把当前牌局状态编码进 URL hash，朋友打开即可恢复并继续
// 纯前端方案，无需后端。状态存于 location.hash，不占服务器。

const KEY = 'zyj'

// 编码：state -> URL hash 片段
export function encodeState(state) {
  const json = JSON.stringify(state)
  return `${KEY}=${encodeURIComponent(json)}`
}

// 解码：当前 location.hash -> state | null
export function decodeState(hash = location.hash) {
  if (!hash || !hash.startsWith(`#${KEY}=`)) return null
  const raw = hash.slice(1 + KEY.length + 1) // 去掉 "#zyj="
  try {
    return JSON.parse(decodeURIComponent(raw))
  } catch (e) {
    console.warn('接力链接解析失败', e)
    return null
  }
}

// 生成完整可分享 URL
export function buildShareUrl(state) {
  const base = `${location.origin}${location.pathname}`
  return `${base}#${encodeState(state)}`
}

// 从当前 hand 提取接力所需的最小数据（不含内部 id，跨设备兼容）
export function buildPayloadFromStore(store) {
  return {
    v: 1,
    theme: store.theme,
    mode: store.mode,
    count: store.count,
    // 只存 word+pos，恢复时在目标设备的 deckData 里重新匹配 id
    hand: store.hand.map(c => ({ word: c.word, pos: c.pos })),
    storyLines: store.mode === 'story' ? store.storyLines.slice() : [],
    sentence: store.sentence,
    explanation: store.explanation,
    storyTurn: store.storyTurn,
    revealed: store.revealed,
    // 接龙玩家预设随链接流转
    usePresetPlayers: store.usePresetPlayers,
    storyPlayers: store.storyPlayers.slice(),
    createdAt: Date.now()
  }
}
