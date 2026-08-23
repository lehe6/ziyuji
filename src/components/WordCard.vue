<script setup>
import { computed } from 'vue'
import { posLabel } from '../data/deck.js'

const props = defineProps({
  card: { type: Object, required: true },
  theme: { type: String, default: 'comedy' },
  flipped: { type: Boolean, default: true },
  popDelay: { type: Number, default: 0 },
  index: { type: Number, default: 0 }
})
const emit = defineEmits(['click'])
const cls = computed(() => [
  'word-card',
  `theme-${props.theme}`,
  { flipped: props.flipped, 'draw-pop': props.flipped }
])
const style = computed(() => props.flipped && props.popDelay
  ? { animationDelay: `${props.popDelay}ms` }
  : {})
</script>

<template>
  <div :class="cls" :style="style" @click="emit('click', card, index)">
    <div class="face-back"></div>
    <div class="face-front">
      <div class="word">{{ card.word }}</div>
      <div class="pos-tag">{{ posLabel[card.pos] }}</div>
    </div>
  </div>
</template>
