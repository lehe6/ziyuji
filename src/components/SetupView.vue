<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/game.js'
import { modeLabel } from '../utils/draw.js'

const store = useGameStore()

const themes = [
  { key: 'comedy', label: '喜剧库', desc: '打工人 · 瓜田 · 破防日常', emoji: '🤡' },
  { key: 'literary', label: '文艺库', desc: '废墟 · 深海 · 宿命呢喃', emoji: '🌌' },
  { key: 'mixed', label: '混搭库', desc: '工业 · 公文 · 代码碰撞', emoji: '🧪' }
]

const modes = [
  { key: 'solo', label: '各自造句', desc: '同组手牌，各写各的，最后投票' },
  { key: 'story', label: '故事接龙', desc: '轮流抽牌，一句接一句编故事' },
  { key: 'rearrange', label: '排列重组', desc: '拖拽排序，看谁的排列最荒诞合理' }
]

function startQuick100() {
  // 快速验收：跑 100 次抽牌，验证 0 废牌
  import('../utils/draw.js').then(m => {
    let fail = 0
    for (const t of ['comedy','literary','mixed']) {
      for (const md of ['solo','story','rearrange']) {
        for (let n = 3; n <= 8; n++) {
          for (let i = 0; i < 6; i++) {
            const { cards } = m.drawHand(t, md, n)
            if (!m.validateHand(cards, n)) fail++
          }
        }
      }
    }
    const total = 3 * 3 * 6 * 6
    alert(`快速自检：抽牌 ${total} 次，废牌 ${fail} 次（验收标准 0 次）`)
  })
}

// ========= 接龙玩家预设（演示用，试完可撤） =========
const playerCount = computed({
  get: () => store.storyPlayers.length || 2,
  set: (v) => {
    const n = Math.min(8, Math.max(2, Number(v) || 2))
    // 调整列表长度，保留已填内容
    const arr = store.storyPlayers.slice(0, n)
    while (arr.length < n) arr.push(`玩家${arr.length + 1}`)
    store.setStoryPlayers(arr)
  }
})
function setPlayerName(i, name) {
  const arr = store.storyPlayers.slice()
  arr[i] = name || `玩家${i + 1}`
  store.setStoryPlayers(arr)
}
const usePlayerPreset = computed({
  get: () => store.usePresetPlayers,
  set: (v) => { store.usePresetPlayers = v }
})
</script>

<template>
  <div>
    <h1 class="title">字遇记 · 汉字随机牌组</h1>
    <p class="sub">抽出 3~8 张汉字牌，用三种模式碰撞脑洞。聚会破冰，独处解压，产出诗意或笑料。</p>

    <div class="card mt-l">
      <div class="section-title"><span>第一步 · 主题牌库</span><span>Theme</span></div>
      <div class="cards-grid" style="grid-template-columns: repeat(3, minmax(0,1fr));">
        <div
          v-for="t in themes"
          :key="t.key"
          class="chip"
          :class="[t.key, { active: store.theme === t.key }]"
          style="flex-direction: column; border-radius: 16px; padding: 14px 10px; align-items: center; text-align: center; gap: 6px;"
          @click="store.setTheme(t.key)"
        >
          <div style="font-size: 24px;">{{ t.emoji }}</div>
          <div style="font-weight: 800;">{{ t.label }}</div>
          <div style="font-size: 11px; opacity: 0.9; line-height: 1.5;">{{ t.desc }}</div>
        </div>
      </div>
    </div>

    <div class="card mt-m">
      <div class="section-title"><span>第二步 · 抽取数量</span><span>{{ store.count }} 张</span></div>
      <div class="row gap-m">
        <div class="count-badge">{{ store.count }}</div>
        <div style="flex:1;">
          <input
            class="slider"
            type="range"
            min="3"
            max="8"
            :value="store.count"
            @input="store.setCount(($event.target.value))"
          />
          <div class="row" style="justify-content: space-between; margin-top: 6px; color: var(--text-dim); font-size: 12px;">
            <span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card mt-m">
      <div class="section-title"><span>第三步 · 玩法模式</span><span>Mode</span></div>
      <div class="row wrap gap-s">
        <div
          v-for="md in modes"
          :key="md.key"
          class="chip"
          :class="{ active: store.mode === md.key }"
          @click="store.setMode(md.key)"
        >
          {{ modeLabel[md.key] }}
        </div>
      </div>
      <p class="sub mt-s" style="font-size: 13px;">
        {{ modes.find(m => m.key === store.mode).desc }}
      </p>
    </div>

    <!-- 接龙玩家预设（仅 story 模式，演示） -->
    <div v-if="store.mode === 'story'" class="card mt-m" style="border: 1px dashed #a78bfa;">
      <div class="section-title"><span>参玩玩家（接龙预设）</span><span>DEMO</span></div>
      <label class="row gap-s" style="cursor:pointer;">
        <input type="checkbox" v-model="usePlayerPreset" />
        <span class="sub" style="font-size:13px;">启用玩家预设：开局填好昵称，轮到谁自动记名、只需输入句子</span>
      </label>
      <div v-if="usePlayerPreset" class="mt-m">
        <div class="row gap-m">
          <label class="label" style="margin:0;">人数</label>
          <input class="slider" type="range" min="2" max="8" v-model.number="playerCount" style="flex:1;" />
          <span class="count-badge" style="width:42px;height:42px;font-size:18px;border-radius:12px;">{{ playerCount }}</span>
        </div>
        <div class="mt-m" style="display:flex; flex-direction:column; gap:8px;">
          <div v-for="(p, i) in store.storyPlayers" :key="i" class="row gap-s">
            <span class="tag" style="min-width:34px; text-align:center;">P{{ i + 1 }}</span>
            <input type="text" :value="p" @input="setPlayerName(i, $event.target.value)" placeholder="昵称" />
          </div>
        </div>
        <p class="sub mt-s" style="font-size:12px;">💡 试完不喜欢可在顶部关闭开关，不影响其他模式。</p>
      </div>
    </div>

    <div class="mt-l row gap-s">
      <button class="btn block primary" @click="store.startGame()">开始游戏 · 抽牌</button>
    </div>
    <div class="mt-s row gap-s">
      <button class="btn small ghost" @click="startQuick100">🔬 核心算法自检（100+抽牌）</button>
      <div class="sp"></div>
      <button class="btn small ghost" @click="store.setView('favorites')">我的收藏 ({{ store.favorites.length }})</button>
    </div>

    <p class="sub mt-l" style="font-size: 12px; color: var(--text-dim);">
      · 无需登录，收藏自动存在本地浏览器。<br/>
      · 单局自动去重、虚词≤1、强制保底名+动，杜绝死局。
    </p>
  </div>
</template>
