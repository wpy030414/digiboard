<script setup lang="ts">
import { ref } from 'vue'
import NumsQueue from './components/NumsQueue.vue'

const userLength = ref(4)
const userValue = ref(2077)
const userThemeColor = ref('#000000')
</script>

<template>
  <div>
    <label for="userLength">板长：</label>
    <input type="number" id="userLength" v-model="userLength" min="0" />
  </div>

  <div>
    <label for="userValue">值：</label>
    <input type="number" id="userValue" v-model="userValue" min="0" />
  </div>

  <div>
    <label for="userThemeColor">主题色：</label>
    <input type="color" id="userThemeColor" v-model="userThemeColor" />
  </div>

  <nums-queue :length="userLength" :value="userValue" :theme-color="userThemeColor" />
</template>

<style scoped></style>
