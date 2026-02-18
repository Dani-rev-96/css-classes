<template>
  <div class="container">
    <header :class="{ 'header': true, 'header--sticky': isSticky }">
      <nav class="nav" :class="[navClass, isVertical ? 'nav--vertical' : '']">
        <a
          v-for="item in items"
          :class="{ 'nav__item': true, 'nav__item--active': item.active }"
          :href="item.href"
        >
          {{ item.label }}
        </a>
      </nav>
    </header>
    <main :class="'card card--featured'">
      <div class="card__header">
        <h1 class="text-center">{{ title }}</h1>
      </div>
      <div class="card__body">
        <slot />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const isSticky = ref(false);
const isVertical = ref(false);
const navClass = ref('nav--primary');
const items = ref([
  { label: 'Home', href: '/', active: true },
  { label: 'About', href: '/about', active: false },
]);
const title = ref('Hello World');
</script>

<style lang="scss" scoped>
.container {
  max-width: 1200px;
}

.header {
  &--sticky {
    position: sticky;
    top: 0;
  }
}
</style>
