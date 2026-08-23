// 核心抽取算法：多维标签权重 + 词性配比 + 调性调配 + 防死局
// 词性配比由牌数决定，调性由主题决定，二者正交组合

import { deckData, themeToneWeights, posRatioByCount } from '../data/deck.js'

export const modeLabel = {
  solo: '各自造句',
  story: '故事接龙',
  rearrange: '排列重组'
}

// ---- 工具函数 ----
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 按权重随机选一个 key
function weightedPick(weights) {
  const r = Math.random()
  let acc = 0
  for (const key of Object.keys(weights)) {
    acc += weights[key]
    if (r <= acc) return key
  }
  return Object.keys(weights)[0]
}

// 按调性权重选一组筛选条件
function pickToneRule(theme) {
  const rules = themeToneWeights[theme] || themeToneWeights.comedy
  const r = Math.random()
  let acc = 0
  for (const rule of rules) {
    acc += rule.weight
    if (r <= acc) return rule
  }
  return rules[rules.length - 1]
}

// 从词库中按 pos + 调性规则 筛选候选池
function filterPool(pos, rule, drawnIds) {
  return deckData.filter(c => {
    if (c.pos !== pos) return false
    if (drawnIds.has(c.id)) return false
    if (rule.tone !== '*' && !c.tone.includes(rule.tone)) return false
    if (rule.physical && c.physical !== rule.physical) return false
    return true
  })
}

// 核心抽牌函数：按 pos + 主题调性 抽一张，逐级降级防死局
function pickCard(pos, theme, drawnIds) {
  const rule = pickToneRule(theme)
  // 第一级：pos + tone + physical
  let pool = filterPool(pos, rule, drawnIds)
  if (pool.length) return pool[Math.floor(Math.random() * pool.length)]

  // 第二级：放宽 physical
  if (rule.physical) {
    const relaxed = { ...rule, physical: undefined }
    pool = filterPool(pos, relaxed, drawnIds)
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)]
  }

  // 第三级：放宽 tone（只按 pos）
  pool = deckData.filter(c => c.pos === pos && !drawnIds.has(c.id))
  if (pool.length) return pool[Math.floor(Math.random() * pool.length)]

  // 第四级：该词性枯竭，返回 null 让上层兜底
  return null
}

// 虚词上限
function cCapForCount(count) {
  const ratio = (posRatioByCount[count] || posRatioByCount[5]).C
  return Math.ceil(count * ratio)
}

/**
 * 抽取一整副手牌（模式一/三：一次性抽出 count 张）
 * @param {string} theme   - comedy | mixed | literary
 * @param {string} mode    - solo | story | rearrange（新架构下 mode 不再影响词性配比，保留参数兼容）
 * @param {number} count   - 3 ~ 8
 * @param {Set<string>} [forbiddenIds] - 已抽过的（外部维护单局去重池）
 */
export function drawHand(theme, mode, count, forbiddenIds = null) {
  const posRatio = posRatioByCount[count] || posRatioByCount[5]
  const drawnIds = new Set(forbiddenIds || [])
  const result = []
  const cCap = cCapForCount(count)

  // Step 1: 强制保底 1 - 名词
  const n1 = pickCard('N', theme, drawnIds)
  if (n1) { result.push(n1); drawnIds.add(n1.id) }

  // Step 2: 强制保底 2 - 动词
  const v1 = pickCard('V', theme, drawnIds)
  if (v1) { result.push(v1); drawnIds.add(v1.id) }

  // Step 3: 剩余按词性配比权重抽取
  const remain = Math.max(0, count - result.length)
  let guard = 0
  let loopCount = remain * 40
  while (guard < remain && loopCount-- > 0) {
    const pos = weightedPick(posRatio)
    // 虚词上限检测
    if (pos === 'C') {
      const cCount = result.filter(c => c.pos === 'C').length
      if (cCount >= cCap) continue
    }
    const card = pickCard(pos, theme, drawnIds)
    if (!card) continue
    result.push(card)
    drawnIds.add(card.id)
    guard++
  }

  // 兜底：若权重抽取后仍不足，按 N → V → A → C 顺序补足
  let fallback = 0
  while (result.length < count && fallback++ < 80) {
    for (const p of ['N', 'V', 'A', 'C']) {
      if (p === 'C' && result.filter(c => c.pos === 'C').length >= cCap) continue
      const card = pickCard(p, theme, drawnIds)
      if (card) {
        result.push(card)
        drawnIds.add(card.id)
        break
      }
    }
  }

  // 虚词安全阀：若仍超上限，替换为其他词性
  const cCards = result.filter(c => c.pos === 'C')
  if (cCards.length > cCap) {
    for (let i = cCap; i < cCards.length; i++) {
      const rm = cCards[i]
      const idx = result.findIndex(c => c.id === rm.id)
      drawnIds.delete(rm.id)
      const repl = pickCard('A', theme, drawnIds)
        || pickCard('N', theme, drawnIds)
        || pickCard('V', theme, drawnIds)
      if (repl) {
        result[idx] = repl
        drawnIds.add(repl.id)
      }
    }
  }

  return { cards: shuffle(result), drawnIds: Array.from(drawnIds) }
}

/**
 * 故事接龙：每次抽 1 张
 * 前 2 张按刚性保底（第一人名、第二人动），之后按 count 对应的词性配比
 * @param {string} theme
 * @param {string[]} drawnArr - 已抽 id 池
 * @param {number} turnIndex - 当前轮次（0 起）
 * @param {number} count - 总牌数（用于计算词性配比）
 */
export function drawStoryCard(theme, drawnArr, turnIndex, count = 5) {
  const drawnIds = new Set(drawnArr)
  const posRatio = posRatioByCount[count] || posRatioByCount[5]
  const cCap = cCapForCount(count)
  let card = null

  if (turnIndex === 0) {
    card = pickCard('N', theme, drawnIds)
  } else if (turnIndex === 1) {
    card = pickCard('V', theme, drawnIds)
  }

  if (!card) {
    let loop = 80
    while (loop-- > 0) {
      const pos = weightedPick(posRatio)
      // 虚词上限
      if (pos === 'C') {
        const cCount = drawnArr.filter(id => {
          const w = deckData.find(d => d.id === id)
          return w && w.pos === 'C'
        }).length
        if (cCount >= cCap) continue
      }
      card = pickCard(pos, theme, drawnIds)
      if (card) break
    }
  }

  if (!card) {
    // 最终兜底
    card = pickCard('N', theme, drawnIds)
      || pickCard('V', theme, drawnIds)
      || pickCard('A', theme, drawnIds)
  }

  if (card) drawnArr.push(card.id)
  return card
}

/** 合法性校验：0 次废牌（验收测试用） */
export function validateHand(cards, count) {
  if (!cards || cards.length !== count) return false
  const hasN = cards.some(c => c.pos === 'N')
  const hasV = cards.some(c => c.pos === 'V')
  const cCount = cards.filter(c => c.pos === 'C').length
  const cCap = cCapForCount(count)
  const unique = new Set(cards.map(c => c.id)).size === cards.length
  return hasN && hasV && cCount <= cCap && unique
}
