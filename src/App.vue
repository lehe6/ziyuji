<script setup>
import { computed, onMounted, ref, provide } from 'vue'
import { useGameStore } from './stores/game.js'
import { resolveCurrentState } from './utils/shareLink.js'
import SetupView from './components/SetupView.vue'
import PlayView from './components/PlayView.vue'
import FavoritesView from './components/FavoritesView.vue'
import Toast from './components/Toast.vue'

const store = useGameStore()
const view = computed(() => store.view)

const toastText = ref('')
const toastShow = ref(false)
let toastTimer = null
function showToast(text, dur = 1800) {
  toastText.value = text
  toastShow.value = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastShow.value = false }, dur)
}
provide('toast', showToast)

// 启动时检测 URL：短链 ?r= 优先，再 fallback 旧版 #zyj= 长链
onMounted(async () => {
  try {
    const r = await resolveCurrentState()
    if (r.state) {
      const ok = store.loadFromRelay(r.state)
      if (ok) {
        // 清理链接里的接力参数，刷新不重复触发
        history.replaceState(null, '', location.pathname)
        if (r.source === 'short') {
          showToast('已从短链接力恢复牌局，继续接龙吧～', 2400)
        } else {
          showToast('已从接力链接恢复牌局，继续接龙吧～', 2400)
        }
        return
      }
    }
    // 短链解析失败（NOT_FOUND / KV_NOT_AVAILABLE 等）给个提示
    if (r.source === 'short' && r.error) {
      if (r.error === 'NOT_FOUND') {
        showToast('🔗 接力链接已失效或过期，重新开局吧～', 3000)
      } else if (r.error === 'KV_NOT_AVAILABLE') {
        showToast('⚠️ 后端短链服务未就绪，请联系管理员绑定 KV', 3000)
      } else {
        showToast(`链接解析失败：${r.error}`, 3000)
      }
      // 清掉失效的 ?r=，刷新不再提示
      history.replaceState(null, '', location.pathname)
    }
  } catch (e) {
    console.warn('接力链接恢复失败', e)
  }
})
</script>

<template>
  <div class="container">
    <div class="topbar">
      <div class="brand">字遇记 · ZIYUJI</div>
      <div class="sp"></div>
      <div class="right">
        <button
          v-if="view !== 'setup'"
          class="btn small ghost"
          @click="store.setView('setup')"
        >开局</button>
        <button
          v-if="view !== 'favorites'"
          class="btn small ghost"
          @click="store.setView('favorites')"
        >收藏({{ store.favorites.length }})</button>
        <button v-else class="btn small ghost" @click="store.setView('setup')">返回</button>
      </div>
    </div>

    <SetupView v-if="view === 'setup'" />
    <PlayView v-else-if="view === 'play'" />
    <FavoritesView v-else-if="view === 'favorites'" />
  </div>

  <Toast :show="toastShow" :text="toastText" />
</template>
