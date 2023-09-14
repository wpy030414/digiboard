<script setup lang="ts">
import { ref } from "vue";
import NumBit from "./NumBit.vue";

const props = defineProps<{
  /** 板长。这亦限制了可显示的数值上限。 */
  length: number;
  /** 十进制数值。受板长限制时会不正常显示。 */
  value: number;
  /** 主题色。必须是形如 `#FF00000` 的字符串。 */
  themeColor?: string;
}>();

/** 动态位数转化 */
const bits = ref(() => {
  const DICTIONARY = new Map([
    ["0", 0b1110111],
    ["1", 0b0010010],
    ["2", 0b1011101],
    ["3", 0b1011011],
    ["4", 0b0111010],
    ["5", 0b1101011],
    ["6", 0b1101111],
    ["7", 0b1010010],
    ["8", 0b1111111],
    ["9", 0b1111011],
  ]);

  const vPower = ((v) => {
    let pow = 0;
    while (10 ** ++pow < v);
    return pow;
  })(props.value);

  const bits: number[] = [];

  for (let i = 0; i < props.length; i++)
    if (vPower <= props.length)
      bits[i] = DICTIONARY.get(
        props.value.toString(10).padStart(props.length, "0")[i],
      ) as number;
    else bits[i] = DICTIONARY.get("9") as number;

  return bits;
});
</script>

<template>
  <div class="ex-board">
    <num-bit v-for="b in bits()" :input="b" :theme-color="themeColor" />
  </div>
</template>

<style scoped></style>
