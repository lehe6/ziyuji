<script setup>
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
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

const mode = computed(() => store.mode)
const theme = computed(() => store.theme)
const hand = computed(() => store.hand)
const revealed = computed(() => store.revealed)

const handCards = computed(() => hand.value) // 用于 vuedraggable 的可写代理
const sortedHand = ref([])

watch(() => hand.value.slice(), (nv) => {
  sortedHand.value = nv.slice()
}, { immediate: true })

watch(sortedHand, (nv) => {
  if (mode.value === 'rearrange') {
    store.reorderHand(nv.slice())
  }
}, { deep: true })

// 抽牌动画（popDelay 依次错峰）
const popFor = (i) => i * 90 + 40

// ========= 模式二：故事接龙 =========
function takeNextTurn() {
  const name = storyPlayerName.value.trim() || `玩家${store.storyTurn + 2}`
  const card = store.nextStoryTurn(name)
  if (!card) {
    toast('牌库抽完了，本回合结束～')
    storyInputTurn.value = -2
    return
  }
  storyInputTurn.value = store.storyTurn
  storySentenceInput.value = ''
}
function submitStorySentence() {
  const t = storyInputTurn.value
  if (t < 0) return
  store.setStoryLineSentence(t, storySentenceInput.value.trim())
  toast('已记录，点下一张抽下一位')
  storyInputTurn.value = -1
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

// ========= 接力链接（免后端多人协作） =========
function genRelayUrl() {
  const payload = buildPayloadFromStore(store)
  const url = buildShareUrl(payload)
  relayUrl.value = url
  // 尝试复制到剪贴板
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(
      () => toast('接力链接已复制，发给下一位吧 📋', 2400),
      () => toast('链接已生成在下方，长按复制', 3000)
    )
  } else {
    toast('链接已生成在下方，长按复制', 3000)
  }
  return url
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

onMounted(() => {
  // 保证进入后 sortedHand 同步
  sortedHand.value = hand.value.slice()
})
</script>

<template>
  <div>
    <div class="card">
      <div class="section-title">
        <span>当前牌局</span>
        <span>{{ themeLabel[theme] }} · {{ modeLabel[mode] }}</span>
      </div>

      <!-- ============ 模式一 / 三：完整手牌 ============ -->
      <template v-if="mode !== 'story'">
        <div v-if="mode === 'rearrange'">
          <draggable
            v-model="sortedHand"
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
            v-for="(c, i) in handCards"
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
              <label class="label">当前玩家</label>
              <input v-model="storyPlayerName" type="text" placeholder="玩家昵称（可留空）" />
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
      <button class="btn" @click="handleShare" :disabled="isExporting">
        {{ isExporting ? '生成中…' : '🖼️ 分享卡片' }}
      </button>
    </div>

    <!-- ============ 接力链接（多人接力接龙） ============ -->
    <div class="card mt-m" style="background: linear-gradient(160deg, rgba(244,114,182,0.08), rgba(167,139,250,0.08)); border: 1px dashed #a78bfa;">
      <div class="section-title"><span>接力链接</span><span>RELAY · 免后端</span></div>
      <p class="sub" style="font-size: 13px; line-height: 1.6;">
        🔄 把当前牌局（含已接的句子）打包成一个链接。发给下一位，他打开就能看到这局，继续抽牌接龙，再发下一位。
        <br/>· 故事接龙推荐此方式：传花式协作，无需登录、无需服务器。
        <br/>· 注意：这是「接力」非「实时」，对方看不到你实时打字。
      </p>
      <div class="mt-m row gap-s wrap">
        <button class="btn primary" @click="genRelayUrl">🔗 生成接力链接</button>
        <button v-if="relayUrl" class="btn ghost" @click="genRelayUrl">刷新链接</button>
      </div>
      <div v-if="relayUrl" class="mt-m">
        <label class="label">长按或点击下方框复制链接，发给朋友</label>
        <input
          type="text"
          :value="relayUrl"
          readonly
          @focus="$event.target.select()"
          style="font-size: 12px; word-break: break-all;"
        />
      </div>
      <div v-if="store.relayFrom" class="mt-s" style="font-size: 12px; color: #6ee7b7;">
        ✅ 当前这局来自接力链接（由上一位发来），可继续接龙。
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
