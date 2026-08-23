import { defineStore } from 'pinia'
import { drawHand, drawStoryCard } from '../utils/draw.js'
import { deckData } from '../data/deck.js'

const FAV_KEY = 'zyj_favorites_v1'
const HIST_KEY = 'zyj_history_v1'

function loadJSON(k, d) {
  try {
    const raw = localStorage.getItem(k)
    if (!raw) return d
    return JSON.parse(raw) || d
  } catch { return d }
}
function saveJSON(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch {}
}

export const useGameStore = defineStore('game', {
  state: () => ({
    // 视图阶段：setup | play | favorites
    view: 'setup',
    // 主题
    theme: 'comedy',
    // 模式
    mode: 'solo',
    // 抽牌数
    count: 5,
    // 当前手牌（模式一/三是完整一副，模式二是按轮次累加）
    hand: [],
    // 模式二：轮次索引（0 起），-1 表示未开始
    storyTurn: -1,
    // 模式二：已抽取的 id 池（单局去重）
    storyDrawn: [],
    // 模式二：玩家造句列表 [{playerName, sentence, cardId}]
    storyLines: [],
    // 单局去重池（模式三同样使用单局抽取，避免重复）
    sessionDrawn: [],
    // 输入的造句文本（模式一支持多个玩家句子？简化：单条整句输入框）
    sentence: '',
    // 模式三：排列后的顺序解释
    explanation: '',
    // 揭晓状态
    revealed: false,
    // 收藏列表
    favorites: loadJSON(FAV_KEY, []),
    // 历史（最近若干轮）
    history: loadJSON(HIST_KEY, [])
  }),
  getters: {
    themeText(state) {
      return { comedy: '喜剧库', literary: '文艺库', mixed: '混搭库' }[state.theme]
    },
    modeText(state) {
      return { solo: '各自造句', story: '故事接龙', rearrange: '排列重组' }[state.mode]
    }
  },
  actions: {
    setView(v) { this.view = v },
    setTheme(t) { this.theme = t },
    setMode(m) { this.mode = m },
    setCount(n) {
      const v = Math.min(8, Math.max(3, Number(n) || 5))
      this.count = v
    },

    // 开始游戏 -> 进入 play，根据模式决定是否先抽牌
    startGame() {
      this.resetSession()
      this.view = 'play'
      if (this.mode === 'story') {
        // 进入后逐张抽
        this.storyTurn = -1
      } else {
        // 立即抽第一副
        this.drawNewHand()
      }
    },

    resetSession() {
      this.hand = []
      this.sessionDrawn = []
      this.storyTurn = -1
      this.storyDrawn = []
      this.storyLines = []
      this.sentence = ''
      this.explanation = ''
      this.revealed = false
      // 接力来源标记（用于 UI 提示）
      this.relayFrom = null
    },

    // 从接力链接恢复整局状态
    loadFromRelay(payload) {
      if (!payload || payload.v !== 1) return false
      this.theme = payload.theme || 'comedy'
      this.mode = payload.mode || 'solo'
      this.count = payload.count || 5
      // 在当前设备 deckData 里按 word+pos 重新匹配完整词条（含 id），保证后续去重可用
      const deck = deckData[this.theme] || []
      const hand = (payload.hand || []).map(c => {
        const found = deck.find(d => d.word === c.word && d.pos === c.pos) || null
        return found ? { ...found } : { id: `relay_${c.word}`, word: c.word, pos: c.pos, theme: this.theme }
      })
      this.hand = hand
      // 重建单局去重池：以 hand 的 id 为基础
      this.sessionDrawn = hand.map(c => c.id)
      this.storyDrawn = hand.map(c => c.id)
      this.storyLines = (payload.storyLines || []).map((l, i) => ({
        turn: l.turn ?? i,
        player: l.player || `玩家${(l.turn ?? i) + 1}`,
        sentence: l.sentence || '',
        cardId: l.cardId || (hand[i] ? hand[i].id : null)
      }))
      this.storyTurn = payload.storyTurn ?? (this.storyLines.length - 1)
      this.sentence = payload.sentence || ''
      this.explanation = payload.explanation || ''
      this.revealed = !!payload.revealed
      this.relayFrom = payload.createdAt || null
      this.view = 'play'
      return true
    },

    // 模式一/三：重新抽一副
    drawNewHand() {
      const forbidden = new Set(this.sessionDrawn)
      const { cards, drawnIds } = drawHand(this.theme, this.mode, this.count, forbidden)
      this.hand = cards
      this.sessionDrawn = drawnIds
      this.sentence = ''
      this.explanation = ''
      this.revealed = false
    },

    // 模式二：进入下一轮 -> 抽一张
    nextStoryTurn(playerName = '') {
      const nextIdx = this.storyTurn + 1
      const card = drawStoryCard(this.theme, this.storyDrawn, nextIdx)
      if (!card) return null
      this.storyTurn = nextIdx
      this.hand.push(card)
      this.storyLines.push({
        turn: nextIdx,
        player: playerName || `玩家${nextIdx + 1}`,
        sentence: '',
        cardId: card.id
      })
      this.revealed = false
      return card
    },
    setStoryLineSentence(turn, sentence) {
      const line = this.storyLines.find(l => l.turn === turn)
      if (line) line.sentence = sentence
    },

    // 揭晓
    reveal() { this.revealed = true },

    // 更新手牌顺序（模式三：拖拽排序）
    reorderHand(newOrder) {
      this.hand = newOrder
    },

    // 保存为收藏
    saveFavorite(extra = {}) {
      const item = {
        id: `fav_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        createdAt: Date.now(),
        theme: this.theme,
        mode: this.mode,
        cards: this.hand.map(c => ({ word: c.word, pos: c.pos })),
        sentence: this.sentence,
        explanation: this.explanation,
        storyLines: this.mode === 'story' ? this.storyLines.slice() : [],
        ...extra
      }
      this.favorites.unshift(item)
      saveJSON(FAV_KEY, this.favorites)
      return item
    },
    removeFavorite(id) {
      this.favorites = this.favorites.filter(x => x.id !== id)
      saveJSON(FAV_KEY, this.favorites)
    },
    pushHistory(item) {
      this.history.unshift(item)
      if (this.history.length > 200) this.history.length = 200
      saveJSON(HIST_KEY, this.history)
    },
    clearHistory() {
      this.history = []
      saveJSON(HIST_KEY, [])
    }
  }
})
