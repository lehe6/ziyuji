<script setup>
import { computed, inject, nextTick, ref } from 'vue'
import { useGameStore } from '../stores/game.js'
import WordCard from './WordCard.vue'
import { modeLabel } from '../utils/draw.js'
import { themeLabel } from '../data/deck.js'
import { buildShareUrl, buildPayloadFromStore } from '../utils/shareLink.js'
import draggable from 'vuedraggable'
import html2canvas from 'html2canvas'

const store = useGameStore()
const toast = inject('toast')

const storyPlayerName = ref('')
const storySentenceInput = ref('')
const storyInputTurn = ref(-1) // 正在输入的轮次 (-1 表示准备下一张)

// 分享卡片隐藏 DOM 引用
const shareRef = ref(null)
const isExporting = ref(false)
const relayUrl = ref('')
const relayLoading = ref(false)
const relayMeta = ref(null) // { type: 'short'|'long', id, ttl }

const mode = computed(() => store.mode)
const theme = computed(() => store.theme)
const hand = computed(() => store.hand)
const revealed = computed(() => store.revealed)

// rearrange 模式直接绑 store.hand（可写数组），避免 sortedHand 中间层造成 watch 循环
// hand 是 computed，vuedraggable 需要可写数组 → 用 getter/setter 代理
const dragHand = computed({
  get: () => store.hand,
  set: (v) => { store.reorderHand(v) }
})

// 抽牌动画（popDelay 依次错峰）
const popFor = (i) => i * 90 + 40

// ========= 模式二：故事接龙 =========
// 启用预设时，名字按 turn 自动取，不需手填
const presetOn = computed(() => store.usePresetPlayers && store.storyPlayers.length > 0)
function takeNextTurn() {
  const card = store.nextStoryTurn('') // 名字在 store 内按预设/占位处理
  if (!card) {
    toast('牌库抽完了，本回合结束～')
    storyInputTurn.value = -2
    return
  }
  storyInputTurn.value = store.storyTurn
  storySentenceInput.value = ''
  // 预设模式：显示自动名且只读；否则清空让玩家自填
  storyPlayerName.value = presetOn.value ? (store.storyLines[store.storyTurn]?.player || '') : ''
}
function submitStorySentence() {
  const t = storyInputTurn.value
  if (t < 0) return
  const name = presetOn.value
    ? (store.storyLines[t]?.player || '')
    : storyPlayerName.value.trim()
  const sen = storySentenceInput.value.trim()
  if (!sen) {
    toast('先写一句再提交～')
    return
  }
  store.setStoryLineSentence(t, sen, name)
  toast('已记录，点下一张抽下一位')
  storyInputTurn.value = -1
  storyPlayerName.value = ''
  storySentenceInput.value = ''
}
const storyFullSentence = computed(() => {
  return store.storyLines
    .filter(l => l.sentence)
    .map((l, i) => `${i + 1}. ${l.player}：${l.sentence}`)
    .join('\n')
})

// ========= 揭晓/重置/收藏 =========
function handleReveal() {
  store.reveal()
}
function handleNextRound() {
  if (mode.value === 'story') {
    // 新一轮：清空 sessionDrawn, hand, lines
    store.resetSession()
  } else {
    store.drawNewHand()
  }
}

function handleSave() {
  // 保存为收藏：根据模式生成完整文本
  let fullText = store.sentence
  if (mode.value === 'story') {
    fullText = storyFullSentence.value
    if (!fullText) {
      toast('还没有接龙内容，先写两句再收藏吧')
      return
    }
  }
  if (mode.value === 'rearrange') {
    const exp = store.explanation ? `\n【解释】${store.explanation}` : ''
    fullText = (store.sentence ? store.sentence : `排列顺序：${hand.value.map(c => c.word).join(' → ')}`) + exp
  }
  if (!fullText) {
    toast('先写下造句或解释，再收藏更有味道～')
  }
  const item = store.saveFavorite({ fullText })
  store.pushHistory({ type: 'round', ...item })
  toast('已保存到我的收藏 ✨')
}

// ========= 接力链接（短链优先，失败降级长链） =========
async function genRelayUrl() {
  if (relayLoading.value) return
  relayLoading.value = true
  try {
    const payload = buildPayloadFromStore(store)
    const { url, type, id, ttl } = await buildShareUrl(payload)
    relayUrl.value = url
    relayMeta.value = { type, id, ttl }
    const days = ttl ? Math.round(ttl / 86400) : null
    const tag = type === 'short'
      ? `短链(${days ? days + '天有效' : '永久'})`
      : '长链接(含全部数据)'
    // 复制到剪贴板
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        toast(`${tag} · 已复制，发给朋友吧 📋`, 2600)
      } catch {
        toast(`${tag} · 已生成在下方，长按复制`, 3000)
      }
    } else {
      toast(`${tag} · 已生成在下方，长按复制`, 3000)
    }
    return url
  } finally {
    relayLoading.value = false
  }
}

// ========= 分享卡片 =========
const shareLines = computed(() => {
  const lines = []
  if (mode.value === 'story') {
    lines.push(...store.storyLines.filter(l => l.sentence).map(l => `${l.player}：${l.sentence}`))
  } else if (mode.value === 'solo') {
    lines.push(store.sentence || `手气牌：${hand.value.map(c => c.word).join(' · ')}`)
    lines.push(`【主题】${themeLabel[theme.value]} · ${modeLabel[mode.value]}`)
    lines.push('—— 字遇记')
  } else {
    lines.push(`排列：${hand.value.map(c => c.word).join(' → ')}`)
    if (store.explanation) lines.push(`解释：${store.explanation}`)
  }
  if (lines.length < 3) {
    lines.push('（快来写下你的脑洞句子吧）')
    lines.push('抽一张牌，开一段奇遇')
  }
  return lines.slice(0, 6)
})

async function handleShare() {
  if (!shareRef.value) return
  isExporting.value = true
  await nextTick()
  try {
    const canvas = await html2canvas(shareRef.value, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false
    })
    const dataURL = canvas.toDataURL('image/png')
    // 下载到本地
    const a = document.createElement('a')
    a.href = dataURL
    a.download = `字遇记_${themeLabel[theme.value]}_${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast('分享卡片已保存到本地 🖼️')
  } catch (e) {
    console.error(e)
    toast('生成卡片失败，重试一下～')
  } finally {
    isExporting.value = false
  }
}

</script>

<template>
  <div>
    <!-- 返回主页 + 当前局信息 -->
    <div class="row gap-s mb-m" style="align-items: center;">
      <button class="btn small ghost" @click="store.setView('setup')">← 返回主页</button>
      <div class="sp"></div>
      <span class="tag" style="font-size:12px;">{{ themeLabel[theme] }} · {{ modeLabel[mode] }}</span>
    </div>

    <div class="card">
      <div class="section-title">
        <span>当前牌局</span>
        <span>{{ themeLabel[theme] }} · {{ modeLabel[mode] }}</span>
      </div>

      <!-- ============ 模式一 / 三：完整手牌 ============ -->
      <template v-if="mode !== 'story'">
        <div v-if="mode === 'rearrange'">
          <draggable
            v-model="dragHand"
            item-key="id"
            class="cards-grid rearrange-list"
            :animation="260"
            ghost-class="drag-ghost"
            chosen-class="drag-chosen"
          >
            <template #item="{ element, index }">
              <WordCard
                :card="element"
                :theme="theme"
                :pop-delay="popFor(index)"
                :index="index"
              />
            </template>
          </draggable>
          <p class="sub mt-s" style="font-size:12px;">
            💡 长按或拖动卡片可重新排序；排序后在下方解释含义。
          </p>
        </div>

        <div v-else class="cards-grid">
          <WordCard
            v-for="(c, i) in hand"
            :key="c.id"
            :card="c"
            :theme="theme"
            :pop-delay="popFor(i)"
            :index="i"
          />
        </div>

        <!-- 句子输入 -->
        <div v-if="mode === 'solo'" class="mt-l">
          <label class="label">各自造句 · 输入你用手牌写出的句子</label>
          <textarea
            v-model="store.sentence"
            rows="3"
            placeholder="例如：甲方 跑路 留下 满桌 大饼。"
          ></textarea>
        </div>
        <div v-if="mode === 'rearrange'" class="mt-l">
          <label class="label">排列重组 · 解释你的排列逻辑（或写一句）</label>
          <textarea
            v-model="store.explanation"
            rows="3"
            placeholder="从左到右讲了什么离谱/诗意故事？"
          ></textarea>
        </div>

        <!-- 揭晓展示（仅当有句子才显示） -->
        <div v-if="revealed && (store.sentence || store.explanation)" class="mt-m fav-sentence">
          <div v-if="mode === 'solo'">{{ store.sentence }}</div>
          <div v-else>
            <div>🪄 {{ hand.map(c => c.word).join(' → ') }}</div>
            <div class="mt-s">{{ store.explanation }}</div>
          </div>
        </div>
      </template>

      <!-- ============ 模式二：故事接龙 ============ -->
      <template v-else>
        <div v-if="storyInputTurn >= 0 && hand[storyInputTurn]" class="row gap-m">
          <div style="width: 40%; max-width: 180px;">
            <WordCard
              :card="hand[storyInputTurn]"
              :theme="theme"
              :pop-delay="40"
              :index="storyInputTurn"
            />
          </div>
          <div style="flex:1; display: flex; flex-direction: column; gap: 10px;">
            <div>
              <label class="label">当前玩家{{ presetOn ? '（已自动记名）' : '' }}</label>
              <input
                v-model="storyPlayerName"
                type="text"
                :placeholder="presetOn ? '系统按轮次自动填名' : '玩家昵称（可留空）'"
                :readonly="presetOn"
              />
            </div>
            <div>
              <label class="label">请用抽到的词造句，接续故事</label>
              <textarea
                v-model="storySentenceInput"
                rows="3"
                placeholder="例如：前任在晚高峰的地铁里突然秃头……"
              ></textarea>
            </div>
            <button class="btn ok" @click="submitStorySentence">提交这一句</button>
          </div>
        </div>

        <div v-else-if="store.storyTurn === -1" class="card" style="background: rgba(244,114,182,0.08); border: 1px dashed #f472b6;">
          <p class="sub">📖 故事接龙模式：<br/>· 第 1 人抽到名词，第 2 人抽到动词，之后随机按剧情权重。<br/>· 每人造句承接剧情，共同完成故事。</p>
          <div class="mt-m row gap-s">
            <button class="btn primary block" @click="takeNextTurn">抽第一张牌（名词）</button>
          </div>
        </div>

        <div v-else class="card" style="background: rgba(167,139,250,0.08); border: 1px dashed #a78bfa;">
          <p class="sub">🎲 点下面按钮抽下一位的手牌</p>
          <div class="mt-m row gap-s">
            <button class="btn primary block" @click="takeNextTurn">
              抽下一张（第 {{ store.storyTurn + 2 }} 位）
            </button>
          </div>
        </div>

        <!-- 时间线 -->
        <div v-if="store.storyLines.length" class="mt-l">
          <div class="section-title"><span>故事时间线</span><span>{{ store.storyLines.length }} 段</span></div>
          <div class="timeline">
            <div v-for="l in store.storyLines" :key="l.turn" class="turn">
              <div class="badge">#{{ l.turn + 1 }}</div>
              <div>
                <div class="who">
                  {{ l.player }}
                  <span v-if="hand[l.turn]" class="word-mini">{{ hand[l.turn].word }}</span>
                </div>
                <div class="sen">{{ l.sentence || '（尚未造句）' }}</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- ============ 操作按钮 ============ -->
    <div class="mt-m row gap-s wrap">
      <template v-if="mode !== 'story'">
        <button class="btn primary" @click="handleReveal">揭晓</button>
        <button class="btn warn" @click="handleNextRound">下一轮 · 重抽</button>
      </template>
      <template v-else>
        <button class="btn warn" @click="handleNextRound">重开一局</button>
        <button class="btn ghost" @click="handleReveal">展示整段故事</button>
      </template>
      <div class="sp"></div>
      <button class="btn ok" @click="handleSave">💾 保存到收藏</button>
    </div>

    <!-- ============ 成果导出/接力 分区 ============ -->
    <div class="card mt-m">
      <div class="section-title"><span>导出与分享</span><span>EXPORT</span></div>
      <!-- 保存图片（原分享卡片） -->
      <div class="row gap-s wrap">
        <button class="btn" @click="handleShare" :disabled="isExporting">
          {{ isExporting ? '生成中…' : '🖼️ 保存图片' }}
        </button>
        <button
          class="btn primary"
          @click="genRelayUrl"
          :disabled="relayLoading"
        >{{ relayLoading ? '生成中…' : '🔗 生成接力链接' }}</button>
      </div>
      <p class="sub mt-s" style="font-size: 12px; line-height: 1.6;">
        · <b>保存图片</b>：把当前牌局+句子导出成 PNG，存本地相册。<br/>
        · <b>接力链接</b>：优先生成 40 字左右的短链（30 天有效）；后端未绑定时自动降级长链接。
        <br/>接龙模式：对方打开继续抽牌接下一句。其他模式：对方打开看到你的牌，再创作。
      </p>
      <div v-if="relayUrl" class="mt-m">
        <div class="row gap-s" style="margin-bottom: 6px;">
          <span
            class="tag"
            :style="relayMeta?.type === 'short' ? 'background: rgba(101,163,13,0.15); color: #65a30d;' : 'background: rgba(180,83,9,0.15); color: #b45309;'"
          >{{ relayMeta?.type === 'short' ? `短链 · ${Math.round(relayMeta.ttl/86400)}天有效` : '长链接 · 含全部数据' }}</span>
        </div>
        <label class="label">长按或点击下方框复制链接，发给朋友</label>
        <input
          type="text"
          :value="relayUrl"
          readonly
          @focus="$event.target.select()"
          style="font-size: 12px; word-break: break-all;"
        />
        <div class="mt-s row gap-s">
          <button class="btn small ghost" @click="genRelayUrl" :disabled="relayLoading">刷新链接</button>
          <button
            class="btn small ghost"
            v-if="relayMeta?.type === 'long'"
            @click="async () => { const c = confirm('后端短链接口未绑定或无 KV，要不要现在手动去 Vercel 绑定？\\n（绑完自动生短链）'); if(c) open('https://vercel.com/' + (location.hostname.startsWith('localhost') ? '' : ''), '_blank'); }"
          >⚠️ 如何升级到短链？</button>
        </div>
      </div>
      <div v-if="store.relayFrom" class="mt-s" style="font-size: 12px; color: var(--ok, #10b981);">
        ✅ 当前这局来自接力链接（由上一位发来），可继续。
      </div>
    </div>

    <!-- ============ 揭晓全屏覆盖（完整故事） ============ -->
    <div
      v-if="revealed && mode === 'story' && store.storyLines.length"
      class="card mt-m"
    >
      <div class="section-title"><span>完整故事</span><span>FINAL</span></div>
      <div class="fav-sentence" style="white-space: pre-line;">{{ storyFullSentence }}</div>
    </div>

    <!-- ============ 隐藏的分享卡片模版 ============ -->
    <div class="hidden-export">
      <div ref="shareRef" class="share-card">
        <div class="sc-brand">字 遇 记 · ZIYUJI</div>
        <div class="sc-title">脑洞抽牌 · {{ modeLabel[mode] }}</div>
        <div class="sc-sub">主题：{{ themeLabel[theme] }} · 共 {{ hand.length }} 张词牌</div>
        <div class="sc-words">
          <span v-for="c in hand" :key="c.id">{{ c.word }}</span>
        </div>
        <div class="sc-lines">
          <div v-for="(line, i) in shareLines" :key="i">{{ line }}</div>
        </div>
        <div class="sc-foot">
          <div>© 字遇记 · 一张牌的奇遇</div>
          <div class="sc-qr">字遇<br/>记</div>
        </div>
      </div>
    </div>
  </div>
</template>
