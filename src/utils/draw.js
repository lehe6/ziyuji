// 核心抽取算法：刚性保底 + 动态权重 + 虚词上限 + 全局去重
// 模式：
//  1. solo       - 各自造句
//  2. story      - 故事接龙
//  3. rearrange  - 排列重组

import { deckData } from '../data/deck.js'

// 模式权重配置（名词/动词/形容词/虚词）
export const modeWeights = {
  solo:      { noun: 0.40, verb: 0.30, adj: 0.20, function_word: 0.10 },
  story:     { noun: 0.20, verb: 0.50, adj: 0.15, function_word: 0.15 },
  rearrange: { noun: 0.60, verb: 0.10, adj: 0.30, function_word: 0.00 }
}

export const modeLabel = {
  solo: '各自造句',
  story: '故事接龙',
  rearrange: '排列重组'
}

// Fisher-Yates 洗牌
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function weightedPickPos(weights) {
  const r = Math.random()
  let acc = 0
  for (const pos of ['noun', 'verb', 'adj', 'function_word']) {
    acc += weights[pos]
    if (r <= acc) return pos
  }
  return 'noun'
}

// 按 POS 从"候选池中"随机抽一个；候选池 = 该主题所有该词性且未被 drawn 占用的词
function pickByPos(theme, pos, drawnIds, fallbackAdjAsFunction = true) {
  const pool = deckData[theme].filter(c => c.pos === pos && !drawnIds.has(c.id))
  if (pool.length === 0) {
    // 若该词性枯竭（主要针对 literary 的 function_word），fallback 到 adj
    if (pos === 'function_word' && fallbackAdjAsFunction) {
      return pickByPos(theme, 'adj', drawnIds, false)
    }
    return null
  }
  const idx = Math.floor(Math.random() * pool.length)
  return pool[idx]
}

/**
 * 抽取一整副手牌（模式一/三：一次性抽出 count 张）
 * @param {string} theme   - comedy | literary | mixed
 * @param {string} mode    - solo | story | rearrange
 * @param {number} count   - 3 ~ 8
 * @param {Set<string>} [forbiddenIds] - 已抽过的（外部维护单局去重池，用于多轮场景）
 */
export function drawHand(theme, mode, count, forbiddenIds = null) {
  const weights = modeWeights[mode]
  const drawnIds = new Set(forbiddenIds || [])
  const result = []

  // Step 1: 强制保底 1 - 名词
  const n1 = pickByPos(theme, 'noun', drawnIds)
  if (n1) {
    result.push(n1)
    drawnIds.add(n1.id)
  }
  // Step 2: 强制保底 2 - 动词
  const v1 = pickByPos(theme, 'verb', drawnIds)
  if (v1) {
    result.push(v1)
    drawnIds.add(v1.id)
  }

  // Step 3: 剩余 N-2 按权重抽取
  const remain = Math.max(0, count - result.length)
  let guard = 0
  let loopCount = remain * 30 // 防死循环
  while (guard < remain && loopCount-- > 0) {
    const pos = weightedPickPos(weights)
    const card = pickByPos(theme, pos, drawnIds)
    if (!card) continue
    // 虚词上限检测
    if (card.pos === 'function_word') {
      const fCount = result.filter(c => c.pos === 'function_word').length
      if (fCount >= 1) continue
    }
    result.push(card)
    drawnIds.add(card.id)
    guard++
  }

  // 若权重抽取后仍不足（罕见），兜底：按 adj/名词/动词补足
  let fallback = 0
  while (result.length < count && fallback++ < 50) {
    const order = ['adj', 'noun', 'verb']
    let picked = null
    for (const p of order) {
      picked = pickByPos(theme, p, drawnIds, false)
      if (picked) break
    }
    if (!picked) break
    result.push(picked)
    drawnIds.add(picked.id)
  }

  // 再次做虚词安全阀：若仍有 >=2 虚词，将多余的换成 adj/noun/verb
  const fCards = result.filter(c => c.pos === 'function_word')
  if (fCards.length >= 2) {
    for (let i = 1; i < fCards.length; i++) {
      const rm = fCards[i]
      const idx = result.findIndex(c => c.id === rm.id)
      drawnIds.delete(rm.id)
      const repl = pickByPos(theme, 'adj', drawnIds, false)
              || pickByPos(theme, 'noun', drawnIds, false)
              || pickByPos(theme, 'verb', drawnIds, false)
      if (repl) {
        result[idx] = repl
        drawnIds.add(repl.id)
      }
    }
  }

  return { cards: shuffle(result), drawnIds: Array.from(drawnIds) }
}

/**
 * 故事接龙：每次抽 1 张，按模式权重，但受单局全局去重池约束；
 * 前 2 张按刚性保底（第一人名、第二人动），之后按 story 权重。
 * @param {number} turnIndex - 当前轮次索引（0 起）
 */
export function drawStoryCard(theme, drawnArr, turnIndex) {
  const drawnIds = new Set(drawnArr)
  let card = null
  if (turnIndex === 0) {
    card = pickByPos(theme, 'noun', drawnIds)
  } else if (turnIndex === 1) {
    card = pickByPos(theme, 'verb', drawnIds)
  }
  if (!card) {
    let loop = 60
    while (loop-- > 0) {
      const pos = weightedPickPos(modeWeights.story)
      const c = pickByPos(theme, pos, drawnIds)
      if (!c) continue
      if (c.pos === 'function_word') {
        const fCount = drawnArr.filter(id => {
          const exist = deckData[theme].find(d => d.id === id)
          return exist && exist.pos === 'function_word'
        }).length
        if (fCount >= 1) continue
      }
      card = c
      break
    }
  }
  if (!card) {
    // 兜底
    card = pickByPos(theme, 'adj', drawnIds, false)
        || pickByPos(theme, 'noun', drawnIds, false)
        || pickByPos(theme, 'verb', drawnIds, false)
  }
  if (card) drawnArr.push(card.id)
  return card
}

/** 合法性校验：0 次废牌（验收测试用） */
export function validateHand(cards, count) {
  if (!cards || cards.length !== count) return false
  const hasNoun = cards.some(c => c.pos === 'noun')
  const hasVerb = cards.some(c => c.pos === 'verb')
  const fCount = cards.filter(c => c.pos === 'function_word').length
  const unique = new Set(cards.map(c => c.id)).size === cards.length
  return hasNoun && hasVerb && fCount <= 1 && unique
}
