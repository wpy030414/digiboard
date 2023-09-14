<script setup lang="ts">
import { ref } from "vue";
import NumsQueue from "./components/NumsQueue.vue";

const userLength = ref(4);
const userValue = ref(2023);
const userThemeColor = ref("#000000");
</script>

<template>
  <table>
    <tr>
      <label>板长：</label>
      <input type="number" v-model="userLength" min="0" />
    </tr>
    <tr>
      <label>值：</label>
      <input type="number" v-model="userValue" min="0" />
    </tr>
    <tr>
      <label>主题色：</label>
      <input type="color" v-model="userThemeColor" />
    </tr>
  </table>
  <nums-queue
    :length="userLength"
    :value="userValue"
    :theme-color="userThemeColor"
  />
</template>

<style scoped></style>
