<script setup>
import { computed, onMounted, ref, provide } from 'vue'
import { useGameStore } from './stores/game.js'
import { decodeState } from './utils/shareLink.js'
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

// 启动时检测 URL hash：若有接力数据，自动恢复进入牌局
onMounted(() => {
  const payload = decodeState()
  if (payload) {
    const ok = store.loadFromRelay(payload)
    if (ok) {
      // 清掉 hash，避免刷新重复弹 toast；状态已进 store
      history.replaceState(null, '', location.pathname + location.search)
      showToast('已从接力链接恢复牌局，继续接龙吧～', 2400)
    }
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
