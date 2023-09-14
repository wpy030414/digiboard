<script setup lang="ts">
defineProps<{
  /** 输入信号。必须是形如 `0b0000000` 的二进制数。 */
  input: number;
  /** 主题色。必须是形如 `#FF00000` 的字符串。 */
  themeColor?: string;
}>();

/**
 * 获取二进制数的左起指定位数的值。
 *
 * @param bin 二进制数
 * @param length 二进制数期望长度
 * @param bit 左起位数（从 1 开始）
 */
function getBit(bin: number, length: number, bit: number) {
  return Number(bin.toString(2).padStart(length, "0")[bit - 1] || 0);
}
</script>

<template>
  <div class="board">
    <div class="unit">
      <div v-for="i in 7" class="slot">
        <div
          v-if="getBit(input, 7, i)"
          :style="themeColor ? `background: ${themeColor};` : ''"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board {
  display: inline-block;
  padding: 10px;
  background: #eee;
}

.unit {
  position: relative;
  --slot-length: 50px;
  --slot-width: 10px;
  width: calc(var(--slot-length) + var(--slot-width) * 2);
  height: calc(var(--slot-length) * 2 + var(--slot-width) * 3);
  transform: skew(-5deg);
}

.slot {
  position: absolute;
  width: var(--slot-width);
  height: var(--slot-length);
  background: #e0e0e0;
}

.slot:nth-child(3n + 1) {
  width: var(--slot-length);
  height: var(--slot-width);
}

.slot:nth-child(1) {
  top: 0;
  left: var(--slot-width);
}

.slot:nth-child(2) {
  top: var(--slot-width);
  left: 0;
}

.slot:nth-child(3) {
  top: var(--slot-width);
  right: 0;
}

.slot:nth-child(4) {
  top: calc(var(--slot-length) + var(--slot-width));
  left: var(--slot-width);
}

.slot:nth-child(5) {
  bottom: var(--slot-width);
  left: 0;
}

.slot:nth-child(6) {
  bottom: var(--slot-width);
  right: 0;
}

.slot:nth-child(7) {
  bottom: 0;
  left: var(--slot-width);
}

.slot > div {
  width: 100%;
  height: 100%;
  background: #000;
  transition: all 0.5s;
}
</style>
