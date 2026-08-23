<script setup>
defineProps({ show: Boolean, text: String })
</script>

<template>
  <div class="toast" :class="{ show }">{{ text }}</div>
</template>
