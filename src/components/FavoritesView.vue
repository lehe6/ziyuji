<script setup>
import { computed, inject, nextTick, ref } from 'vue'
import { useGameStore } from '../stores/game.js'
import { themeLabel } from '../data/deck.js'
import { modeLabel } from '../utils/draw.js'
import html2canvas from 'html2canvas'

const store = useGameStore()
const toast = inject('toast')

const favs = computed(() => store.favorites)
const exportRefs = ref({})
const exporting = ref({})

function remove(id) {
  store.removeFavorite(id)
  toast('已删除一条收藏')
}

function timeStr(ts) {
  const d = new Date(ts)
  const pad = n => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function exportAll() {
  const text = JSON.stringify(store.favorites, null, 2)
  const blob = new Blob([text], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `字遇记_收藏备份_${Date.now()}.json`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  toast('已导出收藏备份 JSON')
}

function copyItem(it) {
  const words = it.cards.map(c => c.word).join(' · ')
  const body = it.fullText
    || it.sentence
    || it.storyLines?.map((l, i) => `${i + 1}. ${l.player}：${l.sentence}`).join('\n')
    || ''
  const line = `【${themeLabel[it.theme]} · ${modeLabel[it.mode]}】\n牌组：${words}\n${body}`
  navigator.clipboard?.writeText(line).then(
    () => toast('已复制到剪贴板 📋'),
    () => toast('复制失败，请手动选择')
  )
}

// 继续编辑：载入该条回到牌局
function resume(it) {
  const ok = store.resumeFavorite(it)
  if (ok) {
    toast('已载入牌局，继续接龙/编辑吧', 1800)
  } else {
    toast('载入失败')
  }
}

// 单条保存图片
async function saveImage(it) {
  const el = exportRefs.value[it.id]
  if (!el) { toast('卡片生成中，稍候'); return }
  exporting.value[it.id] = true
  await nextTick()
  try {
    const canvas = await html2canvas(el, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false
    })
    const dataURL = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = dataURL
    a.download = `字遇记_${themeLabel[it.theme]}_${it.id}.png`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    toast('图片已保存 🖼️')
  } catch (e) {
    console.error(e)
    toast('生成图片失败')
  } finally {
    exporting.value[it.id] = false
  }
}

// 单条卡片可见文本
function cardBody(it) {
  if (it.fullText) return it.fullText
  if (it.sentence) return it.sentence
  if (it.storyLines?.length) {
    return it.storyLines
      .filter(l => l.sentence)
      .map((l, i) => `${i + 1}. ${l.player}：${l.sentence}`)
      .join('\n')
  }
  if (it.mode === 'rearrange') return `排列：${it.cards.map(c => c.word).join(' → ')}`
  return ''
}
</script>

<template>
  <div>
    <div class="row gap-s mb-m" style="align-items: center;">
      <button class="btn small ghost" @click="store.setView('setup')">← 返回主页</button>
    </div>
    <h1 class="title">我的收藏</h1>
    <p class="sub">保存的句子/故事永久存放在本地浏览器。可一键复制文本或导出备份。</p>

    <div class="row gap-s mt-m">
      <div class="sp"></div>
      <button class="btn small ghost" @click="exportAll">📦 导出备份 JSON</button>
      <button v-if="favs.length" class="btn small ghost" @click="() => { if(confirm('确认清空所有收藏？')){ store.favorites=[]; localStorage.setItem('zyj_favorites_v1','[]'); toast('已清空收藏');} }">🗑️ 清空</button>
    </div>

    <div class="mt-m" style="display: flex; flex-direction: column; gap: 12px;">
      <template v-if="favs.length === 0">
        <div class="card" style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 42px;">🃏</div>
          <p class="sub mt-m" style="font-weight: 700; color: var(--text);">还没有收藏过任何句子</p>
          <p class="sub mt-s">去开局抽一副牌，保存第一句脑洞吧～</p>
          <button class="btn primary mt-m" @click="store.setView('setup')">马上开局</button>
        </div>
      </template>

      <div v-for="it in favs" :key="it.id" class="fav-item">
        <div class="fav-head">
          <div class="fav-tags">
            <span class="tag" :class="it.theme">{{ themeLabel[it.theme] }}</span>
            <span class="tag">{{ modeLabel[it.mode] }}</span>
            <span class="tag" style="background: rgba(148,163,184,0.14); color: #cbd5e1;">{{ timeStr(it.createdAt) }}</span>
          </div>
          <div class="row gap-s">
            <button class="btn small ghost" @click="copyItem(it)">📋 复制</button>
            <button class="btn small ghost" @click="remove(it.id)">删除</button>
          </div>
        </div>
        <div class="fav-words">
          <span v-for="(w, i) in it.cards" :key="i">{{ w.word }}</span>
        </div>
        <div v-if="cardBody(it)" class="fav-sentence" style="white-space: pre-line;">
          {{ cardBody(it) }}
        </div>
        <div v-if="it.mode === 'rearrange' && it.explanation" class="fav-sentence mt-s">
          💡 解释：{{ it.explanation }}
        </div>
        <!-- 操作按钮：继续编辑 + 保存图片 -->
        <div class="row gap-s mt-m wrap">
          <button class="btn small primary" @click="resume(it)">
            ✏️ {{ it.mode === 'story' ? '继续接龙' : '继续编辑' }}
          </button>
          <button
            class="btn small"
            :disabled="exporting[it.id]"
            @click="saveImage(it)"
          >{{ exporting[it.id] ? '生成中…' : '🖼️ 保存图片' }}</button>
        </div>

        <!-- 隐藏的单条导出卡片 -->
        <div class="hidden-export">
          <div :ref="el => { if (el) exportRefs[it.id] = el }" class="share-card">
            <div class="sc-brand">字 遇 记 · ZIYUJI</div>
            <div class="sc-title">{{ modeLabel[it.mode] }}</div>
            <div class="sc-sub">主题：{{ themeLabel[it.theme] }} · 共 {{ it.cards.length }} 张词牌</div>
            <div class="sc-words">
              <span v-for="(w, i) in it.cards" :key="i">{{ w.word }}</span>
            </div>
            <div class="sc-lines">
              <div v-for="(line, i) in (cardBody(it) || '抽一张牌，开一段奇遇').split('\n').slice(0,6)" :key="i">{{ line }}</div>
            </div>
            <div class="sc-foot">
              <div>© 字遇记 · 一张牌的奇遇</div>
              <div class="sc-qr">字遇<br/>记</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
